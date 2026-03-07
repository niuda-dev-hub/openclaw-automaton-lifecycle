#!/usr/bin/env bash
# =============================================================
# automaton-lifecycle 插件移除脚本（Linux / macOS）
# 用法：bash scripts/uninstall.sh
# 警告：此操作将永久删除插件目录及所有配置！
# =============================================================
set -euo pipefail

PLUGIN_NAME="automaton-lifecycle"

# 自动推断 OpenClaw 的 extensions 目录
OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
EXTENSIONS_DIR="$OPENCLAW_HOME/workspace/.openclaw/extensions"
PLUGIN_DIR="$EXTENSIONS_DIR/$PLUGIN_NAME"

echo "========================================"
echo " OpenClaw 插件移除：$PLUGIN_NAME"
echo "========================================"

# 1. 确认插件目录存在
if [ ! -d "$PLUGIN_DIR" ]; then
    echo "⚠️  未找到插件目录：$PLUGIN_DIR"
    echo "   可能已经删除或从未安装。"
    exit 0
fi

# 2. 二次确认
echo ""
echo "⚠️  即将永久删除以下目录："
echo "    $PLUGIN_DIR"
echo ""
read -rp "确认删除？输入 yes 继续：" CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "已取消，未做任何改动。"
    exit 0
fi

# 3. 删除插件目录
echo "▶ 删除插件目录…"
rm -rf "$PLUGIN_DIR"

echo ""
echo "✅ 插件目录已删除。"
echo ""
echo "后续步骤："
echo "  1. 如需彻底清除配置，从 openclaw.json 中删除 automaton-lifecycle 相关条目（若有）"
echo "  2. 重启 OpenClaw Gateway：openclaw gateway restart"
