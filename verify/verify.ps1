# 统一验证入口 · eco-execution-graph
# 用法: .\verify\verify.ps1 [check|test|leak|build|all]
param([Parameter(Position = 0)][ValidateSet("check", "test", "leak", "build", "all")][string]$Target = "all")

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$failed = @()

function Invoke-Step {
    param([string]$Name, [scriptblock]$Body)
    Write-Host "== [$Name] ==" -ForegroundColor Cyan
    try { & $Body; Write-Host "[$Name] PASS" -ForegroundColor Green }
    catch { Write-Host "[$Name] FAIL: $_" -ForegroundColor Red; $script:failed += $Name }
}

if ($Target -in @("check", "all")) {
    Invoke-Step "schema-validate" {
        # JSON Schema 自身合法性(P0);P1 起增加数据实例校验
        Get-ChildItem "$root\schema\*.schema.json" | ForEach-Object {
            $null = Get-Content $_ -Raw | ConvertFrom-Json
        }
    }
    Invoke-Step "docs-matrix" {
        $required = @("README.md", "ARCHITECTURE.md", "CODEMAP.md", "AGENTS.md", "CONTEXT.md")
        foreach ($f in $required) { if (-not (Test-Path "$root\$f")) { throw "missing $f" } }
    }
}

if ($Target -in @("test", "all")) {
    Invoke-Step "pipeline-unit" {
        if (Test-Path "$root\pipeline\tests") { python -m pytest "$root\pipeline\tests" -q; if ($LASTEXITCODE -ne 0) { throw "pytest failed" } }
        else { Write-Host "  (pipeline tests 尚未建立 — AFK baseline=null,见 afk-test.config.json TODO)" -ForegroundColor Yellow }
    }
}

if ($Target -in @("leak", "all")) {
    Invoke-Step "private-leak-contract" {
        if (Test-Path "$root\pipeline\validate_no_private_leak.py") { python "$root\pipeline\validate_no_private_leak.py"; if ($LASTEXITCODE -ne 0) { throw "leak detected" } }
        elseif (Test-Path "$root\data\exports") {
            # P0 兜底:exports 下任何含 "shared" 的包不得含 "private" 字样的 tier 记录
            $sharedPkgs = Get-ChildItem "$root\data\exports" -Directory -Filter "*shared*" -ErrorAction SilentlyContinue
            foreach ($pkg in $sharedPkgs) {
                $hits = Get-ChildItem $pkg.FullName -Recurse -Include *.json, *.ndjson | Select-String -Pattern '"tier"\s*:\s*"private"'
                if ($hits) { throw "private tier record found in $($pkg.Name)" }
            }
        }
    }
}

if ($Target -in @("build", "all")) {
    Invoke-Step "ui-build" {
        if (Test-Path "$root\graph-ui\package.json") { Push-Location "$root\graph-ui"; pnpm build; $code = $LASTEXITCODE; Pop-Location; if ($code -ne 0) { throw "ui build failed" } }
        else { Write-Host "  (graph-ui 尚未脚手架 — P2 建立)" -ForegroundColor Yellow }
    }
}

Write-Host ""
if ($failed.Count -gt 0) { Write-Host "VERIFY FAILED: $($failed -join ', ')" -ForegroundColor Red; exit 1 }
Write-Host "VERIFY OK ($Target)" -ForegroundColor Green
