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

function Invoke-CheckedCommand {
    param([string[]]$Command)
    $exe = $Command[0]
    $args = @($Command | Select-Object -Skip 1)
    & $exe @args
    if ($LASTEXITCODE -ne 0) { throw "$($Command -join ' ') failed with exit code $LASTEXITCODE" }
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
    Invoke-Step "bdd-export" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "bdd:export") }
        finally { Pop-Location }
    }
}

if ($Target -in @("test", "all")) {
    Invoke-Step "graph-build" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "graph:build") }
        finally { Pop-Location }
    }
    Invoke-Step "graph-quality" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "graph:quality") }
        finally { Pop-Location }
    }
    Invoke-Step "gap-report" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "gap:report") }
        finally { Pop-Location }
    }
    Invoke-Step "monthly-compare" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "monthly:compare") }
        finally { Pop-Location }
    }
    Invoke-Step "pitfall-map" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "pitfall:map") }
        finally { Pop-Location }
    }
    Invoke-Step "regulatory-consistency" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "regulatory:check") }
        finally { Pop-Location }
    }
    Invoke-Step "ecocheck-aggregate-candidates" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "ecocheck:aggregate") }
        finally { Pop-Location }
    }
    Invoke-Step "graph-api-contract" {
        Push-Location $root
        try {
            Invoke-CheckedCommand -Command @("pnpm", "api:check")
            Invoke-CheckedCommand -Command @("pnpm", "api:test")
        }
        finally { Pop-Location }
    }
    Invoke-Step "p2p3-upstream-lock" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "upstream:lock") }
        finally { Pop-Location }
    }
    Invoke-Step "p2p3-upstream-inventory" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "upstream:inventory") }
        finally { Pop-Location }
    }
    Invoke-Step "p2p3-eco-kb-import" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "upstream:import:eco-kb") }
        finally { Pop-Location }
    }
    Invoke-Step "p2p3-spl-contracts" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "upstream:contracts:spl") }
        finally { Pop-Location }
    }
    Invoke-Step "p2p3-spl-compat" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "upstream:compat") }
        finally { Pop-Location }
    }
    Invoke-Step "p2p3-rag-resolve" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "rag:resolve") }
        finally { Pop-Location }
    }
    Invoke-Step "p2p3-full-graph" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "graph:build:full") }
        finally { Pop-Location }
    }
    Invoke-Step "p2p3-full-reports" {
        Push-Location $root
        try {
            Invoke-CheckedCommand -Command @("pnpm", "gap:report:full")
            Invoke-CheckedCommand -Command @("pnpm", "monthly:compare:full")
            Invoke-CheckedCommand -Command @("pnpm", "pitfall:map:full")
            Invoke-CheckedCommand -Command @("pnpm", "lineage:check")
            Invoke-CheckedCommand -Command @("pnpm", "demo:pack")
        }
        finally { Pop-Location }
    }
    Invoke-Step "pipeline-unit" {
        if (Test-Path "$root\tests") {
            python -m unittest discover -s "$root\tests" -p "test_*.py"
            if ($LASTEXITCODE -ne 0) { throw "unittest failed" }
        }
        elseif (Test-Path "$root\pipeline\tests") { python -m pytest "$root\pipeline\tests" -q; if ($LASTEXITCODE -ne 0) { throw "pytest failed" } }
        else { Write-Host "  (pipeline tests 尚未建立 — AFK baseline=null,见 afk-test.config.json TODO)" -ForegroundColor Yellow }
    }
}

if ($Target -in @("leak", "all")) {
    Invoke-Step "shared-export" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "graph:export:shared") }
        finally { Pop-Location }
    }
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
    Invoke-Step "p2p3-private-leak-contract" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "leak:full") }
        finally { Pop-Location }
    }
    Invoke-Step "p2p3-regulatory-consistency" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "regulatory:check:full") }
        finally { Pop-Location }
    }
}

if ($Target -in @("build", "all")) {
    Invoke-Step "ui-build" {
        if (Test-Path "$root\graph-ui\package.json") { Push-Location "$root\graph-ui"; pnpm build; $code = $LASTEXITCODE; Pop-Location; if ($code -ne 0) { throw "ui build failed" } }
        else { Write-Host "  (graph-ui 尚未脚手架 — P2 建立)" -ForegroundColor Yellow }
    }
    Invoke-Step "delivery-report" {
        Push-Location $root
        try {
            if (Test-Path "$root\pipeline\final_delivery.py") { Invoke-CheckedCommand -Command @("pnpm", "delivery:report") }
            else { Write-Host "  (final_delivery.py 尚未建立)" -ForegroundColor Yellow }
        }
        finally { Pop-Location }
    }
    Invoke-Step "p2p3-delivery-report" {
        Push-Location $root
        try { Invoke-CheckedCommand -Command @("pnpm", "delivery:p2p3") }
        finally { Pop-Location }
    }
}

Write-Host ""
if ($failed.Count -gt 0) { Write-Host "VERIFY FAILED: $($failed -join ', ')" -ForegroundColor Red; exit 1 }
Write-Host "VERIFY OK ($Target)" -ForegroundColor Green
