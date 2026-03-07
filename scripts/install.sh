#!/usr/bin/env bash
# =============================================================
# automaton-lifecycle 插件安装脚本（Linux / macOS）
# 用法：bash scripts/install.sh
# =============================================================
set -euo pipefail

PLUGIN_NAME="automaton-lifecycle"
REPO_REMOTE="https://github.com/niudakok-kok/openclaw-automaton-lifecycle.git"

# 自动推断 OpenClaw 的 extensions 目录
OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
EXTENSIONS_DIR="$OPENCLAW_HOME/workspace/.openclaw/extensions"
PLUGIN_DIR="$EXTENSIONS_DIR/$PLUGIN_NAME"

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
    echo "⚠️  请编辑 $PLUGIN_DIR/.env 填入你的参数："
    echo "    - AGENT_HUB_URL：你的 Agent Hub 地址"
    echo "    - AGENT_ID：你的 Agent UUID（可稍后自动注册）"
else
    echo "▶ .env 文件已存在，跳过创建"
fi

echo ""
echo "✅ 安装完成！"
echo ""
echo "后续步骤："
echo "  1. 确认 .env 中的 AGENT_HUB_URL 和 AGENT_ID 已正确填写"
echo "  2. 重启 OpenClaw Gateway：openclaw gateway restart"
echo "  3. 验证加载：openclaw status（应看到 $PLUGIN_NAME 已加载）"
