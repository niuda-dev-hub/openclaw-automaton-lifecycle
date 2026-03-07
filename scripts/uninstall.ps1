# =============================================================
# automaton-lifecycle 插件移除脚本（Windows PowerShell）
# 用法：.\scripts\uninstall.ps1
# 警告：此操作将永久删除插件目录及所有配置！
# =============================================================
$ErrorActionPreference = "Stop"

$PLUGIN_NAME = "automaton-lifecycle"

# 自动推断 OpenClaw 相关目录
$OPENCLAW_HOME = if ($env:OPENCLAW_HOME) { $env:OPENCLAW_HOME } else { "$HOME\.openclaw" }
$EXTENSIONS_DIR = Join-Path $OPENCLAW_HOME "workspace\.openclaw\extensions"
$PLUGIN_DIR = Join-Path $EXTENSIONS_DIR $PLUGIN_NAME
$OPENCLAW_JSON = Join-Path $OPENCLAW_HOME "openclaw.json"

Write-Host "========================================"
Write-Host " OpenClaw 插件移除：$PLUGIN_NAME"
Write-Host "========================================"

# 1. 确认插件目录存在
if (-not (Test-Path $PLUGIN_DIR)) {
    Write-Host "⚠️  未找到插件目录：$PLUGIN_DIR"
    Write-Host "   可能已经删除或从未安装。"
    exit 0
}

# 2. 从 openclaw.json 注销插件（在删除目录前，脚本还在）
if (Test-Path $OPENCLAW_JSON) {
    Write-Host "▶ 从 $OPENCLAW_JSON 注销插件…"
    node "$PLUGIN_DIR\scripts\unpatch-openclaw-config.js" $OPENCLAW_JSON
}
else {
    Write-Host "⚠️  未找到 openclaw.json，跳过注销步骤"
}

# 3. 二次确认删除
Write-Host ""
Write-Host "⚠️  即将永久删除以下目录（含 .env 和所有数据）："
Write-Host "    $PLUGIN_DIR"
Write-Host ""
$CONFIRM = Read-Host "确认删除？输入 yes 继续"
if ($CONFIRM -ne "yes") {
    Write-Host "已取消，未做任何改动。"
    exit 0
}

# 4. 删除插件目录
Write-Host "▶ 删除插件目录…"
Remove-Item -Recurse -Force $PLUGIN_DIR

Write-Host ""
Write-Host "✅ 插件已完整移除。重启 Gateway 生效："
Write-Host "   openclaw gateway stop; openclaw gateway start"
