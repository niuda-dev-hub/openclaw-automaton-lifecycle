/**
 * DB 初始化与工具函数
 *
 * 创建 SQLite 数据库，供 spend-tracker、memory-journal 等模块共享。
 * 数据库默认位置：~/.openclaw/automaton-lifecycle.db
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let _db: Database.Database | null = null;

export function getDb(dbPath?: string): Database.Database {
  if (_db) return _db;

  // 解析路径：优先使用传入路径，否则默认 ~/.openclaw/
  const resolvedPath = dbPath
    ? dbPath.replace(/^~/, os.homedir())
    : path.join(os.homedir(), ".openclaw", "automaton-lifecycle.db");

  // 确保父目录存在
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  _db = new Database(resolvedPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // 初始化表结构
  _db.exec(`
    -- 每日花费记录（按 model 分组）
    CREATE TABLE IF NOT EXISTS daily_spend (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date_key    TEXT    NOT NULL,          -- YYYY-MM-DD
      model       TEXT    NOT NULL,
      input_tokens  INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd    REAL    NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_spend_date_model
      ON daily_spend(date_key, model);

    -- 情节记忆日志
    CREATE TABLE IF NOT EXISTS episodic_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT    NOT NULL,
      importance  INTEGER NOT NULL DEFAULT 3,  -- 1-5，5 最重要
      category    TEXT    NOT NULL DEFAULT 'general',
      summary     TEXT    NOT NULL,
      detail      TEXT,
      tags        TEXT,                        -- JSON 数组 ["tag1","tag2"]
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_episodic_session
      ON episodic_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_episodic_category
      ON episodic_events(category);

    -- 流程 SOP（标准操作规程）记忆库
    CREATE TABLE IF NOT EXISTS procedural_sop (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      description TEXT    NOT NULL,
      steps       TEXT    NOT NULL,  -- JSON 数组
      success_count INTEGER NOT NULL DEFAULT 0,
      fail_count    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- 自适应心跳状态
    CREATE TABLE IF NOT EXISTS heartbeat_state (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- SOUL.md 版本历史
    CREATE TABLE IF NOT EXISTS soul_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      content     TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      source      TEXT NOT NULL DEFAULT 'reflection',  -- reflection | manual
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Agent 虚拟钱包 (计费系统方案 A)
    CREATE TABLE IF NOT EXISTS agent_wallets (
      id            TEXT PRIMARY KEY,              -- Agent ID (保留扩展性，默认使用 'default')
      balance_usd   REAL NOT NULL DEFAULT 0.0,     -- 当前资金余额
      lifetime_spent REAL NOT NULL DEFAULT 0.0,    -- 历史总开销
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 如果 default 钱包不存在，则初始化一笔体验金 (暂定 $10.00)
  _db.exec(`
    INSERT OR IGNORE INTO agent_wallets (id, balance_usd, lifetime_spent)
    VALUES ('default', 10.0, 0.0);
  `);

  return _db;
}

/** 获取今日的 date_key（YYYY-MM-DD，UTC）*/
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
