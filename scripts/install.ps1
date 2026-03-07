# =============================================================
# automaton-lifecycle 插件安装脚本（Windows PowerShell）
# 用法：.\scripts\install.ps1
# =============================================================
$ErrorActionPreference = "Stop"

$PLUGIN_NAME = "automaton-lifecycle"
$REPO_REMOTE = "https://github.com/niudakok-kok/openclaw-automaton-lifecycle.git"

# 自动推断 OpenClaw 相关目录
$OPENCLAW_HOME = if ($env:OPENCLAW_HOME) { $env:OPENCLAW_HOME } else { "$HOME\.openclaw" }
$EXTENSIONS_DIR = Join-Path $OPENCLAW_HOME "workspace\.openclaw\extensions"
$PLUGIN_DIR = Join-Path $EXTENSIONS_DIR $PLUGIN_NAME
$OPENCLAW_JSON = Join-Path $OPENCLAW_HOME "openclaw.json"

Write-Host "========================================"
Write-Host " OpenClaw 插件安装：$PLUGIN_NAME"
Write-Host "========================================"

# 1. 确认 extensions 目录存在
New-Item -ItemType Directory -Force -Path $EXTENSIONS_DIR | Out-Null

# 2. 克隆或更新插件代码
if (Test-Path (Join-Path $PLUGIN_DIR ".git")) {
    Write-Host "▶ 已存在插件目录，正在拉取最新代码…"
    git -C $PLUGIN_DIR pull --ff-only
}
else {
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
    Write-Host "⚠️  请编辑 $EnvFile 填入你的参数（AGENT_HUB_URL、AGENT_ID）"
}
else {
    Write-Host "▶ .env 文件已存在，跳过创建"
}

# 5. 自动注册插件到 openclaw.json
if (Test-Path $OPENCLAW_JSON) {
    Write-Host "▶ 自动将插件注册到 $OPENCLAW_JSON …"
    node "$PLUGIN_DIR\scripts\patch-openclaw-config.js" $OPENCLAW_JSON
}
else {
    Write-Host "⚠️  未找到 openclaw.json（路径：$OPENCLAW_JSON），跳过自动注册"
    Write-Host "   请手动在 openclaw.json 中添加："
    Write-Host '   "plugins": { "allow": ["automaton-lifecycle"], "entries": { "automaton-lifecycle": { "enabled": true } } }'
}

Write-Host ""
Write-Host "✅ 安装完成！"
Write-Host ""
Write-Host "最后一步：重启 OpenClaw Gateway"
Write-Host "   openclaw gateway stop; openclaw gateway start"
