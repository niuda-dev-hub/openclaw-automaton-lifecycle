#!/usr/bin/env node
/**
 * manage.js — OpenClaw automaton-lifecycle 插件统一管理脚本
 * 支持：Windows / macOS / Linux 全平台
 *
 * 用法：
 *   node scripts/manage.js            # 交互模式（推荐）
 *   node scripts/manage.js install    # 直接安装
 *   node scripts/manage.js uninstall  # 直接卸载
 */

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.join(__dirname, '..');
const PLUGIN_NAME = 'automaton-lifecycle';
const REPO_REMOTE = 'https://github.com/niudakok-kok/openclaw-automaton-lifecycle.git';
const IS_WINDOWS = process.platform === 'win32';

// ─── 工具函数 ─────────────────────────────────────────────────

function log(msg) { console.log(msg); }
function ok(msg) { console.log(`✅ ${msg}`); }
function warn(msg) { console.log(`⚠️  ${msg}`); }
function info(msg) { console.log(`ℹ️  ${msg}`); }
function step(msg) { console.log(`▶  ${msg}`); }

function run(cmd, cwd = process.cwd()) {
    try {
        execSync(cmd, { stdio: 'inherit', cwd });
    } catch {
        process.exit(1);
    }
}

function prompt(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

// ─── 路径检测 ─────────────────────────────────────────────────

function getOpenClawHome() {
    const fromEnv = process.env.OPENCLAW_HOME;
    if (fromEnv) return fromEnv;
    // OpenClaw 默认安装到用户 home 目录下的 .openclaw 文件夹
    return path.join(os.homedir(), '.openclaw');
}

function getPaths() {
    const home = getOpenClawHome();
    // 官方标准路径：{OPENCLAW_HOME}/extensions/<plugin-id>
    // Linux/macOS: ~/.openclaw/extensions/
    // Windows:     C:\Users\<name>\.openclaw\extensions\
    const extensionsDir = path.join(home, 'extensions');
    const pluginDir = path.join(extensionsDir, PLUGIN_NAME);
    const openclawJson = path.join(home, 'openclaw.json');
    return { home, extensionsDir, pluginDir, openclawJson };
}

// ─── 安装逻辑 ─────────────────────────────────────────────────

async function install() {
    const { extensionsDir, pluginDir, openclawJson } = getPaths();

    log('\n========================================');
    log(` OpenClaw 插件安装：${PLUGIN_NAME}`);
    log(`  系统: ${IS_WINDOWS ? 'Windows' : os.type()}`);
    log('========================================\n');

    // 1. 创建 extensions 目录
    fs.mkdirSync(extensionsDir, { recursive: true });

    // 2. 克隆或更新
    if (fs.existsSync(path.join(pluginDir, '.git'))) {
        step('已存在插件目录，拉取最新代码…');
        run(`git -C "${pluginDir}" pull --ff-only`);
    } else {
        step(`克隆插件代码到 ${pluginDir} …`);
        run(`git clone "${REPO_REMOTE}" "${pluginDir}"`);
    }

    // 3. 安装依赖
    step('安装 npm 依赖…');
    run('npm install', pluginDir);

    // 4. 创建 .env
    const envFile = path.join(pluginDir, '.env');
    const envExample = path.join(pluginDir, '.env.example');
    if (!fs.existsSync(envFile)) {
        step('创建默认配置文件 .env …');
        fs.copyFileSync(envExample, envFile);
        warn(`请编辑 ${envFile}`);
        warn('  - AGENT_HUB_URL：Agent Hub 地址（默认 http://127.0.0.1:8000）');
        warn('  - AGENT_ID：留空则首次调用时自动注册');
    } else {
        info('.env 文件已存在，跳过创建');
    }

    // 5. 修改 openclaw.json
    if (fs.existsSync(openclawJson)) {
        step(`注册插件到 ${openclawJson} …`);
        run(`node "${path.join(pluginDir, 'scripts', 'patch-openclaw-config.js')}" "${openclawJson}"`);
    } else {
        warn(`未找到 openclaw.json（${openclawJson}），跳过自动注册`);
    }

    log('');
    ok('安装完成！');
    log('');
    log('最后一步 → 重启 OpenClaw Gateway：');
    log(IS_WINDOWS
        ? '   openclaw gateway stop; openclaw gateway start'
        : '   openclaw gateway restart');
}

// ─── 卸载逻辑 ─────────────────────────────────────────────────

async function uninstall() {
    const { pluginDir, openclawJson } = getPaths();

    log('\n========================================');
    log(` OpenClaw 插件移除：${PLUGIN_NAME}`);
    log('========================================\n');

    if (!fs.existsSync(pluginDir)) {
        warn(`未找到插件目录：${pluginDir}`);
        info('可能已删除或从未安装，退出。');
        return;
    }

    // 1. 从 openclaw.json 移除（在删除目录之前，脚本还存在）
    if (fs.existsSync(openclawJson)) {
        step(`从 ${openclawJson} 注销插件…`);
        run(`node "${path.join(pluginDir, 'scripts', 'unpatch-openclaw-config.js')}" "${openclawJson}"`);
    } else {
        warn(`未找到 openclaw.json，跳过注销步骤`);
    }

    // 2. 二次确认
    log('');
    warn(`即将永久删除（含 .env 和所有数据）：`);
    warn(`  ${pluginDir}`);
    const ans = await prompt('\n确认删除？输入 yes 继续：');
    if (ans !== 'yes') {
        info('已取消，未做任何改动。');
        return;
    }

    // 3. 删除目录
    step('删除插件目录…');
    fs.rmSync(pluginDir, { recursive: true, force: true });

    log('');
    ok('插件已完整移除。重启 Gateway 生效：');
    log(IS_WINDOWS
        ? '   openclaw gateway stop; openclaw gateway start'
        : '   openclaw gateway restart');
}

// ─── 入口 ─────────────────────────────────────────────────────

async function main() {
    let action = process.argv[2]?.toLowerCase();

    if (!action) {
        log('');
        log('╔══════════════════════════════════════╗');
        log('║  automaton-lifecycle 插件管理工具    ║');
        log('╠══════════════════════════════════════╣');
        log('║  1. 安装插件                         ║');
        log('║  2. 移除插件                         ║');
        log('╚══════════════════════════════════════╝');
        log('');
        const choice = await prompt('请输入选项 [1/2]：');
        if (choice === '1') action = 'install';
        else if (choice === '2') action = 'uninstall';
        else {
            warn('无效选项，退出。');
            process.exit(1);
        }
    }

    if (action === 'install') {
        await install();
    } else if (action === 'uninstall') {
        await uninstall();
    } else {
        warn(`未知命令：${action}`);
        log('用法：node scripts/manage.js [install|uninstall]');
        process.exit(1);
    }
}

main().catch(err => {
    console.error('发生错误：', err.message);
    process.exit(1);
});
