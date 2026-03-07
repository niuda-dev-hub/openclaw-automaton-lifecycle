#!/usr/bin/env node
/**
 * patch-openclaw-config.js
 * 安装脚本调用此工具，自动将 automaton-lifecycle 插件注册到 openclaw.json
 * 用法：node scripts/patch-openclaw-config.js <openclaw.json 路径>
 */
import fs from 'fs';

const PLUGIN_ID = 'automaton-lifecycle';
const configPath = process.argv[2];

if (!configPath) {
    console.error('用法：node scripts/patch-openclaw-config.js <openclaw.json 路径>');
    process.exit(1);
}

if (!fs.existsSync(configPath)) {
    console.error(`❌ 找不到配置文件：${configPath}`);
    process.exit(1);
}

let config;
try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
} catch (e) {
    console.error(`❌ 解析 JSON 失败：${e.message}`);
    process.exit(1);
}

// 初始化 plugins 结构（若不存在）
config.plugins = config.plugins ?? {};
config.plugins.allow = config.plugins.allow ?? [];
config.plugins.entries = config.plugins.entries ?? {};

// 添加白名单（幂等：已存在则跳过）
if (!config.plugins.allow.includes(PLUGIN_ID)) {
    config.plugins.allow.push(PLUGIN_ID);
    console.log(`✅ 已将 ${PLUGIN_ID} 加入 plugins.allow 白名单`);
} else {
    console.log(`ℹ️  ${PLUGIN_ID} 已在 plugins.allow 白名单中，跳过`);
}

// 添加插件 entry（幂等：已存在则跳过）
if (!config.plugins.entries[PLUGIN_ID]) {
    config.plugins.entries[PLUGIN_ID] = { enabled: true };
    console.log(`✅ 已在 plugins.entries 中注册 ${PLUGIN_ID}`);
} else {
    console.log(`ℹ️  ${PLUGIN_ID} 已在 plugins.entries 中，跳过`);
}

// 写回文件
fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
console.log(`💾 配置已保存：${configPath}`);
