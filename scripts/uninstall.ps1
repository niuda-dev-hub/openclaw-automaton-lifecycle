# =============================================================
# automaton-lifecycle 插件移除脚本（Windows PowerShell）
# 用法：.\scripts\uninstall.ps1
# 警告：此操作将永久删除插件目录及所有配置！
# =============================================================
$ErrorActionPreference = "Stop"

$PLUGIN_NAME = "automaton-lifecycle"

# 自动推断 OpenClaw 的 extensions 目录
$OPENCLAW_HOME = if ($env:OPENCLAW_HOME) { $env:OPENCLAW_HOME } else { "$HOME\.openclaw" }
$EXTENSIONS_DIR = Join-Path $OPENCLAW_HOME "workspace\.openclaw\extensions"
$PLUGIN_DIR = Join-Path $EXTENSIONS_DIR $PLUGIN_NAME

Write-Host "========================================"
Write-Host " OpenClaw 插件移除：$PLUGIN_NAME"
Write-Host "========================================"

# 1. 确认插件目录存在
if (-not (Test-Path $PLUGIN_DIR)) {
    Write-Host "⚠️  未找到插件目录：$PLUGIN_DIR"
    Write-Host "   可能已经删除或从未安装。"
    exit 0
}

# 2. 二次确认
Write-Host ""
Write-Host "⚠️  即将永久删除以下目录："
Write-Host "    $PLUGIN_DIR"
Write-Host ""
$CONFIRM = Read-Host "确认删除？输入 yes 继续"
if ($CONFIRM -ne "yes") {
    Write-Host "已取消，未做任何改动。"
    exit 0
}

# 3. 删除插件目录
Write-Host "▶ 删除插件目录…"
Remove-Item -Recurse -Force $PLUGIN_DIR

Write-Host ""
Write-Host "✅ 插件目录已删除。"
Write-Host ""
Write-Host "后续步骤："
Write-Host "  1. 如需彻底清除配置，从 openclaw.json 中删除 automaton-lifecycle 相关条目（若有）"
Write-Host "  2. 重启 OpenClaw Gateway：openclaw gateway stop; openclaw gateway start"
