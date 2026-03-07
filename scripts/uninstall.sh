#!/usr/bin/env bash
# =============================================================
# automaton-lifecycle 插件移除脚本（Linux / macOS）
# 用法：bash scripts/uninstall.sh
# 警告：此操作将永久删除插件目录及所有配置！
# =============================================================
set -euo pipefail

PLUGIN_NAME="automaton-lifecycle"

# 自动推断 OpenClaw 相关目录
OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
EXTENSIONS_DIR="$OPENCLAW_HOME/workspace/.openclaw/extensions"
PLUGIN_DIR="$EXTENSIONS_DIR/$PLUGIN_NAME"
OPENCLAW_JSON="$OPENCLAW_HOME/openclaw.json"

echo "========================================"
echo " OpenClaw 插件移除：$PLUGIN_NAME"
echo "========================================"

# 1. 确认插件目录存在
if [ ! -d "$PLUGIN_DIR" ]; then
    echo "⚠️  未找到插件目录：$PLUGIN_DIR"
    echo "   可能已经删除或从未安装。"
    exit 0
fi

# 2. 从 openclaw.json 注销插件（在删除目录前，脚本还在）
if [ -f "$OPENCLAW_JSON" ]; then
    echo "▶ 从 $OPENCLAW_JSON 注销插件…"
    node "$PLUGIN_DIR/scripts/unpatch-openclaw-config.js" "$OPENCLAW_JSON"
else
    echo "⚠️  未找到 openclaw.json，跳过注销步骤"
fi

# 3. 二次确认删除
echo ""
echo "⚠️  即将永久删除以下目录（含 .env 和所有数据）："
echo "    $PLUGIN_DIR"
echo ""
read -rp "确认删除？输入 yes 继续：" CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "已取消，未做任何改动。"
    exit 0
fi

# 4. 删除插件目录
echo "▶ 删除插件目录…"
rm -rf "$PLUGIN_DIR"

echo ""
echo "✅ 插件已完整移除。重启 Gateway 生效："
echo "   openclaw gateway restart"
