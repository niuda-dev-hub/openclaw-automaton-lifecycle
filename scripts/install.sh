#!/usr/bin/env bash
# =============================================================
# automaton-lifecycle 插件安装脚本（Linux / macOS）
# 用法：bash scripts/install.sh
# =============================================================
set -euo pipefail

PLUGIN_NAME="automaton-lifecycle"
REPO_REMOTE="https://github.com/niudakok-kok/openclaw-automaton-lifecycle.git"

# 自动推断 OpenClaw 相关目录
OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
EXTENSIONS_DIR="$OPENCLAW_HOME/workspace/.openclaw/extensions"
PLUGIN_DIR="$EXTENSIONS_DIR/$PLUGIN_NAME"
OPENCLAW_JSON="$OPENCLAW_HOME/openclaw.json"

echo "========================================"
echo " OpenClaw 插件安装：$PLUGIN_NAME"
echo "========================================"

# 1. 确认 extensions 目录存在
mkdir -p "$EXTENSIONS_DIR"

# 2. 克隆或更新插件代码
if [ -d "$PLUGIN_DIR/.git" ]; then
    echo "▶ 已存在插件目录，正在拉取最新代码…"
    git -C "$PLUGIN_DIR" pull --ff-only
else
    echo "▶ 克隆插件代码到 $PLUGIN_DIR …"
    git clone "$REPO_REMOTE" "$PLUGIN_DIR"
fi

cd "$PLUGIN_DIR"

# 3. 安装 Node.js 依赖
echo "▶ 安装 npm 依赖…"
npm install

# 4. 创建 .env 配置文件
if [ ! -f ".env" ]; then
    echo "▶ 创建默认配置文件 .env …"
    cp .env.example .env
    echo ""
    echo "⚠️  请编辑 $PLUGIN_DIR/.env 填入你的参数（AGENT_HUB_URL、AGENT_ID）"
else
    echo "▶ .env 文件已存在，跳过创建"
fi

# 5. 自动注册插件到 openclaw.json
if [ -f "$OPENCLAW_JSON" ]; then
    echo "▶ 自动将插件注册到 $OPENCLAW_JSON …"
    node "$PLUGIN_DIR/scripts/patch-openclaw-config.js" "$OPENCLAW_JSON"
else
    echo "⚠️  未找到 openclaw.json（路径：$OPENCLAW_JSON），跳过自动注册"
    echo "   请手动在 openclaw.json 中添加："
    echo '   "plugins": { "allow": ["automaton-lifecycle"], "entries": { "automaton-lifecycle": { "enabled": true } } }'
fi

echo ""
echo "✅ 安装完成！"
echo ""
echo "最后一步：重启 OpenClaw Gateway"
echo "   openclaw gateway restart"
