#!/usr/bin/env node
/**
 * unpatch-openclaw-config.js
 * 卸载脚本调用此工具，从 openclaw.json 中移除 automaton-lifecycle 插件注册
 * 用法：node scripts/unpatch-openclaw-config.js <openclaw.json 路径>
 */
import fs from 'fs';

const PLUGIN_ID = 'automaton-lifecycle';
const configPath = process.argv[2];

if (!configPath) {
    console.error('用法：node scripts/unpatch-openclaw-config.js <openclaw.json 路径>');
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

let changed = false;

// 从白名单中移除
if (config?.plugins?.allow?.includes(PLUGIN_ID)) {
    config.plugins.allow = config.plugins.allow.filter(id => id !== PLUGIN_ID);
    console.log(`✅ 已从 plugins.allow 白名单移除 ${PLUGIN_ID}`);
    changed = true;
} else {
    console.log(`ℹ️  ${PLUGIN_ID} 不在白名单中，跳过`);
}

// 从 entries 中移除
if (config?.plugins?.entries?.[PLUGIN_ID]) {
    delete config.plugins.entries[PLUGIN_ID];
    console.log(`✅ 已从 plugins.entries 中注销 ${PLUGIN_ID}`);
    changed = true;
} else {
    console.log(`ℹ️  ${PLUGIN_ID} 不在 plugins.entries 中，跳过`);
}

if (changed) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`💾 配置已保存：${configPath}`);
}
