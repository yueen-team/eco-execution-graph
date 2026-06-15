param(
  [string]$OutputDir = "graph-ui/dist-cloudbase-static-readonly"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$dist = Join-Path $root "graph-ui/dist"
$out = Join-Path $root $OutputDir
$reports = Join-Path $root "reports"
$demoData = Join-Path $out "demo-data"
$resolvedOut = [System.IO.Path]::GetFullPath($out)
$allowedPrefix = [System.IO.Path]::GetFullPath((Join-Path $root "graph-ui"))
if (-not $resolvedOut.StartsWith($allowedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "OutputDir must resolve inside graph-ui. Refusing recursive cleanup: $resolvedOut"
}

$oldBase = $env:ECO_GRAPH_UI_BASE
$env:ECO_GRAPH_UI_BASE = "/eco-execution-graph/"
try {
  pnpm --dir graph-ui build | Out-Host
} finally {
  $env:ECO_GRAPH_UI_BASE = $oldBase
}

if (Test-Path $out) {
  Remove-Item $out -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $out | Out-Null
Copy-Item (Join-Path $dist "*") $out -Recurse -Force

$reviewData = Join-Path $out "review-data"
if (Test-Path $reviewData) {
  Remove-Item $reviewData -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $demoData | Out-Null

$sharedGraph = Join-Path $root "data/exports/shared_product_v1/graph.json"
$sharedCards = Join-Path $root "data/exports/shared_product_v1/cards.shared.json"
$gapReport = Join-Path $root "reports/gap-report-full.json"
$upstreamVisibility = Join-Path $root "reports/upstream-visibility-dashboard.json"

Copy-Item $sharedGraph (Join-Path $demoData "full-shared-graph.json") -Force
Copy-Item $sharedCards (Join-Path $demoData "full-shared-cards.json") -Force
Copy-Item $sharedGraph (Join-Path $demoData "full-graph.json") -Force
Copy-Item $sharedCards (Join-Path $demoData "full-cards.json") -Force
Copy-Item $sharedGraph (Join-Path $demoData "graph.json") -Force
Copy-Item $sharedCards (Join-Path $demoData "cards.json") -Force
Copy-Item $gapReport (Join-Path $demoData "gap-report.json") -Force
if (Test-Path $upstreamVisibility) {
  Copy-Item $upstreamVisibility (Join-Path $demoData "upstream-visibility.json") -Force
}

$deployPolicy = [pscustomobject]@{
  readonly_shared = $true
  allowed_dataset = "shared_product_v1"
  disabled_controls = @("view-switch", "product-switch")
  private_runtime = "not packaged"
}
$deployPolicy | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $demoData "deploy-policy.json") -Encoding UTF8

$monthly = Join-Path $demoData "monthly-comparison.json"
if (Test-Path $monthly) {
  Remove-Item $monthly -Force
}

$files = Get-ChildItem $out -Recurse -File
$findings = @()
$codeWarnings = @()
foreach ($file in $files) {
  if ($file.Extension -notin @(".json", ".js", ".html", ".css", ".txt", ".md")) {
    continue
  }
  $text = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
  $relativePath = $file.FullName.Replace("$root\", "").Replace("\", "/")
  $secretMarker = $text -match 'raw RAG response|SecretId|SecretKey|API_KEY'
  $privateJsonMarker = $file.Extension -eq ".json" -and (
      $text -match '"tier"\s*:\s*"private"' -or
      $text -match '"node_type"\s*:\s*"(evidence_judgment_standard|rectification_template|report_expression|issue_instance|pitfall_instance)"' -or
      $text -match '"edge_type"\s*:\s*"(rectified_by|reported_as)"' -or
      $text -match '"(source_ref|source_refs|edge_id|node_id)"\s*:\s*"[^"]*(private|rectification_template|report_expression|evidence_judgment_standard|pitfall_instance|issue_instance)[^"]*"'
  )
  if ($secretMarker -or $privateJsonMarker) {
    $findings += [pscustomobject]@{
      file = $relativePath
      reason = if ($secretMarker) { "secret or raw RAG marker" } else { "private graph marker in JSON data" }
    }
  } elseif ($file.Extension -in @(".js", ".html", ".css") -and
      $text -match 'evidence_judgment_standard|rectification_template|report_expression|issue_instance|pitfall_instance|private runtime') {
    $codeWarnings += [pscustomobject]@{
      file = $relativePath
      reason = "code bundle still contains internal vocabulary labels; data package is checked separately"
    }
  }
}

$hashes = @()
foreach ($name in @("index.html", "demo-data/full-graph.json", "demo-data/full-cards.json", "demo-data/gap-report.json")) {
  $path = Join-Path $out $name
  if (Test-Path $path) {
    $hashes += [pscustomobject]@{
      path = $name
      sha256 = (Get-FileHash $path -Algorithm SHA256).Hash.ToLowerInvariant()
      bytes = (Get-Item $path).Length
    }
  }
}

$manifest = [pscustomobject]@{
  status = if ($findings.Count -eq 0) { "pass" } else { "blocked" }
  package_dir = $out.Replace("$root\", "").Replace("\", "/")
  deploy_target = "CloudBase static hosting"
  access_policy = "read-only shared demo; no private tier; no real enterprise data; no keys; no raw RAG response"
  source_dist = "graph-ui/dist"
  shared_graph = "data/exports/shared_product_v1/graph.json"
  shared_cards = "data/exports/shared_product_v1/cards.shared.json"
  removed = @("demo-data/monthly-comparison.json", "review-data/")
  overwritten_with_shared = @(
    "demo-data/full-graph.json",
    "demo-data/full-cards.json",
    "demo-data/graph.json",
    "demo-data/cards.json",
    "demo-data/deploy-policy.json"
  )
  file_count = $files.Count
  findings = $findings
  code_warnings = $codeWarnings
  hashes = $hashes
  generated_at = (Get-Date).ToString("s")
}

$manifestPath = Join-Path $reports "cloudbase-static-readonly-package.json"
$manifest | ConvertTo-Json -Depth 8 | Set-Content $manifestPath -Encoding UTF8

$lines = @(
  "# CloudBase Static Readonly Package",
  "",
  "- status: ``$($manifest.status)``",
  "- package_dir: ``$($manifest.package_dir)``",
  "- deploy_target: CloudBase static hosting",
  "- access_policy: $($manifest.access_policy)",
  "- file_count: $($manifest.file_count)",
  "",
  "## Safe Data Handling",
  '- `full-graph.json` and `graph.json` are overwritten with `shared_product_v1/graph.json`.',
  '- `full-cards.json` and `cards.json` are overwritten with `shared_product_v1/cards.shared.json`.',
  '- `deploy-policy.json` locks the static app to readonly shared mode and disables product/view switching.',
  '- `monthly-comparison.json` is removed because monthly comparison remains blocked until ETO blind review.',
  "",
  "## Findings",
  $(if ($findings.Count -eq 0) { "- none" } else { ($findings | ForEach-Object { "- $($_.file): $($_.reason)" }) -join "`n" }),
  "",
  "## Code Warnings",
  $(if ($codeWarnings.Count -eq 0) { "- none" } else { ($codeWarnings | ForEach-Object { "- $($_.file): $($_.reason)" }) -join "`n" }),
  "",
  "## Deploy Command",
  "- Upload directory: $($manifest.package_dir)",
  "- Target: CloudBase static hosting.",
  '- Do not upload graph-ui/dist directly.'
)
$lines -join "`n" | Set-Content (Join-Path $reports "cloudbase-static-readonly-package.md") -Encoding UTF8

if ($findings.Count -gt 0) {
  throw "CloudBase readonly package contains blocked markers. See reports/cloudbase-static-readonly-package.json"
}

Write-Output ($manifest | ConvertTo-Json -Depth 8)
