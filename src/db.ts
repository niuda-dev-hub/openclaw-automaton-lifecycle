/**
 * 数据存储层（JSON 文件版）
 *
 * 使用 Node.js 内置 fs 模块读写 JSON 文件，零外部依赖。
 * 数据默认存储在：~/.openclaw/automaton-lifecycle/data.json
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ---------- 数据结构定义 ----------

export interface DailySpendRow {
  model: string;
  date_key: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface EpisodicEvent {
  id: number;
  session_id: string;
  importance: number;
  category: string;
  summary: string;
  detail?: string;
  tags?: string[];
  created_at: string;
}

export interface SopRecord {
  name: string;
  description: string;
  steps: string[];
  success_count: number;
  fail_count: number;
  updated_at: string;
}

export interface WalletRecord {
  balance_usd: number;
  lifetime_spent: number;
  updated_at: string;
}

export interface DbStore {
  daily_spend: DailySpendRow[];
  episodic_events: EpisodicEvent[];
  procedural_sop: SopRecord[];
  heartbeat_state: Record<string, string>;
  soul_history: Array<{ content: string; content_hash: string; source: string; created_at: string }>;
  wallet: WalletRecord;
}

function defaultStore(): DbStore {
  return {
    daily_spend: [],
    episodic_events: [],
    procedural_sop: [],
    heartbeat_state: {},
    soul_history: [],
    // 初始化时给 $10 体验金
    wallet: { balance_usd: 10.0, lifetime_spent: 0.0, updated_at: new Date().toISOString() },
  };
}

// ---------- 单例读写 ----------

let _store: DbStore | null = null;
let _storePath: string | null = null;

export function getStorePath(dbPath?: string): string {
  if (dbPath) return dbPath.replace(/^~/, os.homedir());
  return path.join(os.homedir(), ".openclaw", "automaton-lifecycle", "data.json");
}

export function loadStore(dbPath?: string): DbStore {
  const p = getStorePath(dbPath);
  if (_store && _storePath === p) return _store;

  fs.mkdirSync(path.dirname(p), { recursive: true });

  if (fs.existsSync(p)) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
      // 向后兼容：如果没有 wallet 字段则补充
      if (!raw.wallet) raw.wallet = defaultStore().wallet;
      _store = raw as DbStore;
    } catch {
      _store = defaultStore();
    }
  } else {
    _store = defaultStore();
  }

  _storePath = p;
  return _store;
}

export function saveStore(dbPath?: string): void {
  const p = getStorePath(dbPath);
  if (!_store) return;
  fs.writeFileSync(p, JSON.stringify(_store, null, 2), "utf-8");
}

/** 获取今日的 date_key（YYYY-MM-DD）*/
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
