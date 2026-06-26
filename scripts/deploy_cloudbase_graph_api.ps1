param(
  [string]$EnvId = "yueen-huanbao-1gqfjr5s41e61180",
  [string]$Region = "ap-shanghai",
  [string]$ServiceName = "graph-api",
  [string]$Source = ".tmp/cloudbase-graph-api-deploy",
  [int]$Port = 8787,
  [string]$EnvFile = ".env.local",
  [string]$TimeSourceUrl = "https://tcb.tencentcloudapi.com/",
  [int]$DeployWaitSeconds = 600,
  [switch]$SkipChecks,
  [switch]$SkipSmoke
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

function Write-Step {
  param([string]$Message)
  Write-Host "== $Message =="
}

function Import-DotEnv {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return
  }

  foreach ($line in Get-Content $Path) {
    if ($line -notmatch '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
      continue
    }
    $name = $matches[1]
    $value = $matches[2].Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"')) {
      $value = $value.Substring(1, $value.Length - 2)
    } elseif ($value.StartsWith("'") -and $value.EndsWith("'")) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

function Get-FirstEnv {
  param([string[]]$Names)

  foreach ($name in $Names) {
    $value = [Environment]::GetEnvironmentVariable($name, "Process")
    if ($value) {
      return [pscustomobject]@{ Name = $name; Value = $value }
    }
  }
  return $null
}

function Resolve-CloudBaseCredential {
  $pairs = @(
    @("TENCENT_SECRET_ID", "TENCENT_SECRET_KEY", "standard Tencent Cloud secret"),
    @("TENCENTCLOUD_SECRET_ID", "TENCENTCLOUD_SECRET_KEY", "Tencent Cloud SDK secret"),
    @("TCB_SECRET_ID", "TCB_SECRET_KEY", "TCB secret"),
    @("TENCENT_LKE_SECRET_ID", "TENCENT_LKE_SECRET_KEY", "LKE Tencent Cloud secret alias")
  )

  foreach ($pair in $pairs) {
    $secretId = [Environment]::GetEnvironmentVariable($pair[0], "Process")
    $secretKey = [Environment]::GetEnvironmentVariable($pair[1], "Process")
    if ($secretId -and $secretKey) {
      return [pscustomobject]@{
        Kind = "tencent-secret"
        Source = "$($pair[0])/$($pair[1]) ($($pair[2]))"
        SecretId = $secretId
        SecretKey = $secretKey
      }
    }
  }

  $cloudbaseApiKey = Get-FirstEnv @("CLOUDBASE_API_KEY", "TCB_CLOUDBASE_API_KEY")
  if ($cloudbaseApiKey) {
    return [pscustomobject]@{
      Kind = "cloudbase-api-key"
      Source = $cloudbaseApiKey.Name
      ApiKey = $cloudbaseApiKey.Value
    }
  }

  throw @"
No CloudBase deploy credential found.
Set one of these in process env or .env.local:
- TENCENT_SECRET_ID + TENCENT_SECRET_KEY
- TENCENTCLOUD_SECRET_ID + TENCENTCLOUD_SECRET_KEY
- TCB_SECRET_ID + TCB_SECRET_KEY
- CLOUDBASE_API_KEY
"@
}

function Get-CloudTimeOffsetSeconds {
  param([string]$Url)

  $urls = [System.Collections.Generic.List[string]]::new()
  foreach ($candidate in @($Url, "https://tcb.tencentcloudapi.com/", "https://cloud.tencent.com/")) {
    if ($candidate -and -not $urls.Contains($candidate)) {
      $urls.Add($candidate)
    }
  }

  foreach ($sourceUrl in $urls) {
    try {
      $response = Invoke-WebRequest -Method Head -Uri $sourceUrl -UseBasicParsing -TimeoutSec 20
      $dateHeader = $response.Headers["Date"]
      if ($dateHeader -is [array]) {
        $dateHeader = $dateHeader[0]
      }
      if (-not $dateHeader) {
        continue
      }
      $serverTime = [DateTimeOffset]::Parse(
        $dateHeader,
        [System.Globalization.CultureInfo]::InvariantCulture,
        [System.Globalization.DateTimeStyles]::AssumeUniversal
      ).ToUniversalTime()
      $localTime = [DateTimeOffset]::Now.ToUniversalTime()
      Write-Host "time source: $sourceUrl"
      return [int][Math]::Round(($serverTime - $localTime).TotalSeconds)
    } catch {
      Write-Warning "Could not calculate CloudBase time offset from ${sourceUrl}: $($_.Exception.Message)"
    }
  }

  return 0
}

function Format-SafeCloudBaseArgs {
  param([string[]]$Arguments)

  $masked = @()
  $maskNext = $false
  foreach ($arg in $Arguments) {
    if ($maskNext) {
      $masked += "<redacted>"
      $maskNext = $false
      continue
    }
    $masked += $arg
    if ($arg -in @("--apiKeyId", "--apiKey", "--cloudbase-api-key", "--token")) {
      $maskNext = $true
    }
  }
  return ($masked -join " ")
}

function Invoke-Native {
  param(
    [string]$Command,
    [string[]]$Arguments
  )

  & $Command @Arguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "$Command $($Arguments -join ' ') failed with exit code $exitCode"
  }
}

function Assert-PathInside {
  param(
    [string]$Path,
    [string]$Parent
  )

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $fullParent = [System.IO.Path]::GetFullPath($Parent)
  if (-not $fullParent.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $fullParent = "$fullParent$([System.IO.Path]::DirectorySeparatorChar)"
  }
  if (-not $fullPath.StartsWith($fullParent, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Path must stay inside $fullParent, got $fullPath"
  }
}

function Prepare-CloudBaseDeploySource {
  param([string]$TargetSource)

  $tmpRoot = Join-Path $repoRoot ".tmp"
  $target = Join-Path $repoRoot $TargetSource
  Assert-PathInside $target $tmpRoot

  if (Test-Path $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }

  New-Item -ItemType Directory -Force -Path (Join-Path $target "graph-api") | Out-Null
  Copy-Item -LiteralPath (Join-Path $repoRoot "cloudbaserc.json") -Destination (Join-Path $target "cloudbaserc.json") -Force

  foreach ($file in @("Dockerfile", "package.json", "pnpm", "cloudbaserc.json")) {
    Copy-Item -LiteralPath (Join-Path $repoRoot "graph-api/$file") -Destination (Join-Path $target "graph-api/$file") -Force
  }
  foreach ($dir in @("src", "scripts", "data")) {
    Copy-Item -LiteralPath (Join-Path $repoRoot "graph-api/$dir") -Destination (Join-Path $target "graph-api/$dir") -Recurse -Force
  }

  $resolved = (Resolve-Path $target).Path
  Write-Host "prepared deploy source: $resolved"
  return $resolved
}

function Invoke-CloudBase {
  param(
    [string[]]$Arguments,
    [int]$TimeOffsetSeconds,
    [string]$InputText = ""
  )

  $oldNodeOptions = $env:NODE_OPTIONS
  $oldOffset = $env:CLOUDBASE_TIME_OFFSET_SECONDS
  $shim = (Resolve-Path (Join-Path $PSScriptRoot "cloudbase-time-offset-shim.cjs")).Path.Replace("\", "/")

  try {
    if ([Math]::Abs($TimeOffsetSeconds) -gt 30) {
      $env:CLOUDBASE_TIME_OFFSET_SECONDS = [string]$TimeOffsetSeconds
      $shimOption = "--require=$shim"
      if ($oldNodeOptions) {
        $env:NODE_OPTIONS = "$shimOption $oldNodeOptions"
      } else {
        $env:NODE_OPTIONS = $shimOption
      }
    }

    if ($InputText) {
      $InputText | & cloudbase @Arguments
    } else {
      & cloudbase @Arguments
    }
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
      throw "cloudbase $(Format-SafeCloudBaseArgs $Arguments) failed with exit code $exitCode"
    }
  } finally {
    $env:NODE_OPTIONS = $oldNodeOptions
    $env:CLOUDBASE_TIME_OFFSET_SECONDS = $oldOffset
  }
}

function Invoke-CloudBaseListOutput {
  param([int]$TimeOffsetSeconds)

  $oldNodeOptions = $env:NODE_OPTIONS
  $oldOffset = $env:CLOUDBASE_TIME_OFFSET_SECONDS
  $shim = (Resolve-Path (Join-Path $PSScriptRoot "cloudbase-time-offset-shim.cjs")).Path.Replace("\", "/")

  try {
    if ([Math]::Abs($TimeOffsetSeconds) -gt 30) {
      $env:CLOUDBASE_TIME_OFFSET_SECONDS = [string]$TimeOffsetSeconds
      $shimOption = "--require=$shim"
      if ($oldNodeOptions) {
        $env:NODE_OPTIONS = "$shimOption $oldNodeOptions"
      } else {
        $env:NODE_OPTIONS = $shimOption
      }
    }

    $output = & cloudbase cloudrun list -e $EnvId --json 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
      throw "cloudbase cloudrun list failed with exit code $exitCode"
    }
    return ($output -join [Environment]::NewLine)
  } finally {
    $env:NODE_OPTIONS = $oldNodeOptions
    $env:CLOUDBASE_TIME_OFFSET_SECONDS = $oldOffset
  }
}

function Invoke-CloudBaseWithFreshTimeRetry {
  param(
    [string[]]$Arguments,
    [string]$TimeSourceUrl,
    [int]$InitialTimeOffsetSeconds,
    [string]$InputText = "",
    [int]$MaxAttempts = 3
  )

  $timeOffsetSeconds = $InitialTimeOffsetSeconds
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    if ($attempt -gt 1) {
      Write-Host "refresh CloudBase CLI time offset before retry"
      $timeOffsetSeconds = Get-CloudTimeOffsetSeconds $TimeSourceUrl
      Write-Host "retry time offset seconds: $timeOffsetSeconds"
    }

    try {
      Invoke-CloudBase -Arguments $Arguments -TimeOffsetSeconds $timeOffsetSeconds -InputText $InputText
      return $timeOffsetSeconds
    } catch {
      if ($attempt -ge $MaxAttempts) {
        throw
      }
      Write-Warning "cloudbase $(Format-SafeCloudBaseArgs $Arguments) failed on attempt $attempt/$MaxAttempts; retrying after refreshing time offset."
      Start-Sleep -Seconds 5
    }
  }

  throw "cloudbase $(Format-SafeCloudBaseArgs $Arguments) failed after $MaxAttempts attempts"
}

function Remove-Ansi {
  param([string]$Text)

  $esc = [char]27
  return (($Text -replace "$esc\[[0-9;?]*[ -/]*[@-~]", "") -replace "`r", "")
}

function Get-CloudRunServiceSnapshot {
  param([int]$TimeOffsetSeconds)

  $output = Invoke-CloudBaseListOutput $TimeOffsetSeconds
  $plain = Remove-Ansi $output
  foreach ($line in ($plain -split "`n")) {
    if ($line -notmatch $ServiceName) {
      continue
    }
    $columns = @($line -split "│" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($columns.Count -ge 5 -and $columns[0] -eq $ServiceName) {
      return [pscustomobject]@{
        Service = $columns[0]
        Type = $columns[1]
        UpdatedAt = $columns[2]
        Status = $columns[3]
        PublicAccess = $columns[4]
        Raw = $line.Trim()
      }
    }
  }
  return $null
}

function Get-CloudRunServiceSnapshotWithRetry {
  param(
    [int]$TimeOffsetSeconds,
    [int]$MaxAttempts = 3
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      return Get-CloudRunServiceSnapshot $TimeOffsetSeconds
    } catch {
      if ($attempt -ge $MaxAttempts) {
        throw
      }
      Write-Warning "cloudbase cloudrun list snapshot failed on attempt $attempt/$MaxAttempts; retrying."
      Start-Sleep -Seconds 5
    }
  }

  return $null
}

function Wait-CloudRunDeployment {
  param(
    [string]$BeforeUpdatedAt,
    [int]$TimeOffsetSeconds,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    Start-Sleep -Seconds 20
    try {
      $snapshot = Get-CloudRunServiceSnapshotWithRetry $TimeOffsetSeconds
    } catch {
      Write-Warning "cloudrun status poll failed: $($_.Exception.Message)"
      continue
    }
    if ($snapshot) {
      Write-Host "cloudrun $($snapshot.Service) updated_at=$($snapshot.UpdatedAt) status=$($snapshot.Status)"
      if ($snapshot.UpdatedAt -and $snapshot.UpdatedAt -ne $BeforeUpdatedAt -and $snapshot.Status -eq "normal") {
        return $snapshot
      }
    } else {
      Write-Host "cloudrun $ServiceName not found while waiting"
    }
  } while ((Get-Date) -lt $deadline)

  throw "CloudBase deployment did not reach a new normal revision within $TimeoutSeconds seconds. Previous updated_at=$BeforeUpdatedAt"
}

function Invoke-GraphApiTests {
  $clearedNames = @("ECO_GRAPH_API_TOKEN", "ECO_GRAPH_ENV", "ECO_GRAPH_DEPLOY_TARGET")
  $oldValues = @{}
  foreach ($name in $clearedNames) {
    $oldValues[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    [Environment]::SetEnvironmentVariable($name, $null, "Process")
  }

  try {
    Invoke-Native "pnpm" @("--dir", "graph-api", "test")
  } finally {
    foreach ($name in $clearedNames) {
      [Environment]::SetEnvironmentVariable($name, $oldValues[$name], "Process")
    }
  }
}

function Test-HttpStatus {
  param(
    [string]$Name,
    [string]$Url,
    [int[]]$ExpectedStatus,
    [hashtable]$Headers = @{}
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 20 -Headers $Headers
    $status = [int]$response.StatusCode
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    } else {
      throw "$Name smoke failed: $($_.Exception.Message)"
    }
  }

  if ($ExpectedStatus -notcontains $status) {
    throw "$Name smoke expected $($ExpectedStatus -join '/') but got $status"
  }
  Write-Host "$Name smoke status=$status"
}

if (-not $SkipChecks) {
  Write-Step "stage graph-api data"
  Invoke-Native "node" @("graph-api/scripts/stage-context-data.mjs")

  Write-Step "graph-api syntax check"
  Invoke-Native "pnpm" @("--dir", "graph-api", "check")

  Write-Step "graph-api tests"
  Invoke-GraphApiTests
}

Write-Step "load local deploy env"
Import-DotEnv (Join-Path $repoRoot $EnvFile)
$credential = Resolve-CloudBaseCredential
Write-Host "credential source: $($credential.Source)"

Write-Step "calculate CloudBase CLI time offset"
$timeOffsetSeconds = Get-CloudTimeOffsetSeconds $TimeSourceUrl
Write-Host "time offset seconds: $timeOffsetSeconds"

Write-Step "cloudbase non-interactive login"
if ($credential.Kind -eq "cloudbase-api-key") {
  $timeOffsetSeconds = Invoke-CloudBaseWithFreshTimeRetry -Arguments @("login", "--cloudbase-api-key", $credential.ApiKey, "-e", $EnvId, "--json") -TimeSourceUrl $TimeSourceUrl -InitialTimeOffsetSeconds $timeOffsetSeconds
} else {
  $timeOffsetSeconds = Invoke-CloudBaseWithFreshTimeRetry -Arguments @("login", "--apiKeyId", $credential.SecretId, "--apiKey", $credential.SecretKey, "--json") -TimeSourceUrl $TimeSourceUrl -InitialTimeOffsetSeconds $timeOffsetSeconds
}

Write-Step "cloudbase control-plane check"
$timeOffsetSeconds = Invoke-CloudBaseWithFreshTimeRetry -Arguments @("cloudrun", "list", "-e", $EnvId, "--json") -TimeSourceUrl $TimeSourceUrl -InitialTimeOffsetSeconds $timeOffsetSeconds
$beforeSnapshot = Get-CloudRunServiceSnapshotWithRetry $timeOffsetSeconds
$beforeUpdatedAt = if ($beforeSnapshot) { $beforeSnapshot.UpdatedAt } else { "" }
Write-Host "previous $ServiceName updated_at=$beforeUpdatedAt"

Write-Step "prepare graph-api deploy source"
$deploySource = Prepare-CloudBaseDeploySource $Source

Write-Step "deploy graph-api cloudrun"
$timeOffsetSeconds = Invoke-CloudBaseWithFreshTimeRetry -Arguments @(
  "cloudrun", "deploy",
  "-e", $EnvId,
  "-s", $ServiceName,
  "--source", $deploySource,
  "--port", [string]$Port,
  "--force",
  "--json"
) -TimeSourceUrl $TimeSourceUrl -InitialTimeOffsetSeconds $timeOffsetSeconds -InputText "n`n" -MaxAttempts 4

Write-Step "wait for CloudBase deployment"
$afterSnapshot = Wait-CloudRunDeployment $beforeUpdatedAt $timeOffsetSeconds $DeployWaitSeconds
Write-Host "deployed $ServiceName updated_at=$($afterSnapshot.UpdatedAt) status=$($afterSnapshot.Status)"

if (-not $SkipSmoke) {
  $baseUrl = "https://www.yueen.cc/container-eco-execution-graph"
  Write-Step "remote smoke"
  Test-HttpStatus "healthz" "$baseUrl/healthz" @(200)
  Test-HttpStatus "unauthorized context" "$baseUrl/api/graph/context?q=test" @(401)

  if ($env:ECO_GRAPH_API_TOKEN) {
    Test-HttpStatus "authorized context" "$baseUrl/api/graph/context?q=test" @(200, 400) @{
      Authorization = "Bearer $env:ECO_GRAPH_API_TOKEN"
    }
  } else {
    Write-Warning "ECO_GRAPH_API_TOKEN is not set locally; skipping authorized context smoke."
  }
}

Write-Step "deployment summary"
Write-Host "environment=$EnvId"
Write-Host "region=$Region"
Write-Host "service=$ServiceName"
Write-Host "source=$deploySource"
Write-Host "port=$Port"
Write-Host "rollback=risk limited to graph-api cloudrun revision; use CloudBase cloudrun traffic rollback if the new revision fails smoke"
