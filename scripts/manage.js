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
function ok(msg) { console.log(`\x1b[32m✅ ${msg}\x1b[0m`); }
function warn(msg) { console.log(`\x1b[33m⚠️  ${msg}\x1b[0m`); }
function err(msg) { console.log(`\x1b[31m❌ ${msg}\x1b[0m`); }
function info(msg) { console.log(`\x1b[36mℹ️  ${msg}\x1b[0m`); }
function step(msg) { console.log(`\x1b[34m▶  ${msg}\x1b[0m`); }

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

// ─── 路径解析 ─────────────────────────────────────────────────

async function resolvePaths() {
    let home = process.env.OPENCLAW_HOME;

    // 默认候选路径
    const candidates = [
        home,
        path.join(os.homedir(), '.openclaw'),
        path.join('D:\\', 'OpenClaw', '.openclaw'),
        path.join('C:\\', 'OpenClaw', '.openclaw'),
        path.join('D:\\', 'OpenClaw'), // 用户实际遇到的情况
    ].filter(Boolean);

    // 自动探测
    let found = false;
    for (const cand of candidates) {
        if (fs.existsSync(path.join(cand, 'openclaw.json'))) {
            home = cand;
            found = true;
            break;
        }
    }

    // 交互式询问
    if (!found) {
        warn('未能在标准位置找到 OpenClaw (未发现 openclaw.json)。');
        while (true) {
            const input = await prompt('请输入 OpenClaw 安装路径 (包含 openclaw.json 的目录，可拖拽文件夹到此处): ');
            if (!input) {
                err('路径不能为空，请重新输入或按 Ctrl+C 退出。');
                continue;
            }
            // 处理 Windows 路径可能带引号的情况，并处理 ~
            const cleanInput = input.trim().replace(/^["']|["']$/g, '');
            const fullPath = path.resolve(cleanInput.replace(/^~/, os.homedir()));

            if (fs.existsSync(path.join(fullPath, 'openclaw.json'))) {
                home = fullPath;
                break;
            } else {
                err(`路径无效: 在 "${fullPath}" 下未找到 openclaw.json`);
            }
        }
    }

    // 导出所有相关路径
    const extensionsDir = path.join(home, 'extensions');
    const pluginDir = path.join(extensionsDir, PLUGIN_NAME);
    const openclawJson = path.join(home, 'openclaw.json');

    return { home, extensionsDir, pluginDir, openclawJson };
}

function printPathInfo(paths) {
    log('\n─── 路径信息确认 ────────────────────────');
    info(`  OpenClaw 主目录:  ${paths.home}`);
    info(`  配置文件路径:      ${paths.openclawJson}`);
    info(`  插件安装目标:      ${paths.pluginDir}`);
    log('────────────────────────────────────────\n');
}

// ─── 安装逻辑 ─────────────────────────────────────────────────

async function install() {
    log('\n========================================');
    log(` OpenClaw 插件安装：${PLUGIN_NAME}`);
    log(`  系统: ${IS_WINDOWS ? 'Windows' : os.type()}`);
    log('========================================\n');

    // 1. 检测安装位置
    step('正在检测 OpenClaw 安装位置…');
    const paths = await resolvePaths();
    const { extensionsDir, pluginDir, openclawJson } = paths;

    // 2. 确认安装目录
    printPathInfo(paths);
    const confirm = await prompt('确认以上路径并开始安装？(Y/n): ');
    if (confirm.toLowerCase() === 'n') {
        info('用户取消安装。');
        return;
    }

    // 1. 确定代码来源
    const isRunningInTarget = path.resolve(PLUGIN_ROOT) === path.resolve(pluginDir);

    // 2. 准备插件目录
    if (!isRunningInTarget) {
        step(`正在将代码复制到安装目录…`);
        fs.mkdirSync(extensionsDir, { recursive: true });

        // 使用 fs.cpSync (Node 16.7+) 进行高效递归复制
        // 排除 node_modules 和 .git 避免臃肿，如果没法排除就直接复制
        try {
            fs.cpSync(PLUGIN_ROOT, pluginDir, {
                recursive: true,
                force: true,
                filter: (src) => !src.includes('node_modules') && !src.includes('.git')
            });
            ok('代码复制完成');
        } catch (e) {
            warn(`标准复制失败，尝试回退到 Git 模式: ${e.message}`);
            if (fs.existsSync(path.join(pluginDir, '.git'))) {
                run(`git -C "${pluginDir}" pull --ff-only`);
            } else {
                run(`git clone "${REPO_REMOTE}" "${pluginDir}"`);
            }
        }
    } else {
        info('当前就在安装目录中，跳过代码复制步骤。');
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
        warn(`配置文件已创建：${envFile}`);
        info('  请根据需要修改以下内容：');
        info('  - AGENT_HUB_URL: 你的 Agent Hub 地址');
        info('  - AGENT_ID: 如果你有现有的 ID 可以在此填入，否则留空自动注册');
        info('  详情参考: https://github.com/niudakok-kok/openclaw-automaton-lifecycle');
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
    log('\n========================================');
    log(` OpenClaw 插件移除：${PLUGIN_NAME}`);
    log('========================================\n');

    // 1. 检测位置
    step('正在检测 OpenClaw 位置…');
    const paths = await resolvePaths();
    const { pluginDir, openclawJson } = paths;

    printPathInfo(paths);

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
    if (IS_WINDOWS) {
        try { execSync('chcp 65001 > nul'); } catch (e) { }
    }
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
