# =============================================================
# automaton-lifecycle 插件安装脚本（Windows PowerShell）
# 用法：.\scripts\install.ps1
# =============================================================
$ErrorActionPreference = "Stop"

$PLUGIN_NAME = "automaton-lifecycle"
$REPO_REMOTE = "https://github.com/niudakok-kok/openclaw-automaton-lifecycle.git"

# 自动推断 OpenClaw 的 extensions 目录
$OPENCLAW_HOME = if ($env:OPENCLAW_HOME) { $env:OPENCLAW_HOME } else { "$HOME\.openclaw" }
$EXTENSIONS_DIR = Join-Path $OPENCLAW_HOME "workspace\.openclaw\extensions"
$PLUGIN_DIR = Join-Path $EXTENSIONS_DIR $PLUGIN_NAME

Write-Host "========================================"
Write-Host " OpenClaw 插件安装：$PLUGIN_NAME"
Write-Host "========================================"

# 1. 确认 extensions 目录存在
New-Item -ItemType Directory -Force -Path $EXTENSIONS_DIR | Out-Null

# 2. 克隆或更新插件代码
if (Test-Path (Join-Path $PLUGIN_DIR ".git")) {
    Write-Host "▶ 已存在插件目录，正在拉取最新代码…"
    git -C $PLUGIN_DIR pull --ff-only
} else {
    Write-Host "▶ 克隆插件代码到 $PLUGIN_DIR …"
    git clone $REPO_REMOTE $PLUGIN_DIR
}

Set-Location $PLUGIN_DIR

# 3. 安装 Node.js 依赖
Write-Host "▶ 安装 npm 依赖…"
npm install

# 4. 创建 .env 配置文件
$EnvFile = Join-Path $PLUGIN_DIR ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Host "▶ 创建默认配置文件 .env …"
    Copy-Item ".env.example" ".env"
    Write-Host ""
    Write-Host "⚠️  请编辑 $EnvFile 填入你的参数："
    Write-Host "    - AGENT_HUB_URL：你的 Agent Hub 地址"
    Write-Host "    - AGENT_ID：你的 Agent UUID（可稍后自动注册）"
} else {
    Write-Host "▶ .env 文件已存在，跳过创建"
}

Write-Host ""
Write-Host "✅ 安装完成！"
Write-Host ""
Write-Host "后续步骤："
Write-Host "  1. 确认 .env 中的 AGENT_HUB_URL 和 AGENT_ID 已正确填写"
Write-Host "  2. 重启 OpenClaw Gateway：openclaw gateway stop; openclaw gateway start"
Write-Host "  3. 验证加载：openclaw status（应看到 $PLUGIN_NAME 已加载）"
