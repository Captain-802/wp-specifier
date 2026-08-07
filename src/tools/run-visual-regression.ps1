param(
  [switch]$Update
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$pagePath = Join-Path $projectRoot "l-section-prototype.html"
$baselineDirectory = Join-Path $projectRoot "tests\visual-baselines"
$actualDirectory = Join-Path $projectRoot "test-results\visual"
New-Item -ItemType Directory -Force -Path $baselineDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $actualDirectory | Out-Null

$fileUrl = "file:///" + ($pagePath -replace "\\", "/" -replace " ", "%20")
$cases = @(
  @{ Name = "l-shallow-900"; Section = "LP 125x70x4"; Length = 900 },
  @{ Name = "l-shallow-6000"; Section = "LP 125x70x4"; Length = 6000 },
  @{ Name = "u-shallow-900"; Section = "UP 55x60x4"; Length = 900 },
  @{ Name = "u-shallow-6000"; Section = "UP 55x60x4"; Length = 6000 },
  @{ Name = "l-simply-900"; Section = "LP 125x70x4"; Length = 900;
     Support = "simplySupported" },
  @{ Name = "u-75-simply-900"; Section = "UP 75x60x4"; Length = 900;
     Support = "simplySupported" }
)

$failures = 0
foreach ($case in $cases) {
  $encodedSection = [Uri]::EscapeDataString($case.Section)
  $support = if ($case.Support) { $case.Support } else { "cantilever" }
  $url = "$fileUrl`?section=$encodedSection&length=$($case.Length)&support=$support&palette=mono&visual=1"
  $actual = Join-Path $actualDirectory ($case.Name + ".png")
  $baseline = Join-Path $baselineDirectory ($case.Name + ".png")

  & npx --yes --package "@playwright/test" playwright screenshot `
    --channel chrome `
    --viewport-size "794,1123" `
    --full-page `
    $url `
    $actual
  if ($LASTEXITCODE -ne 0) {
    throw "Screenshot generation failed for $($case.Name)."
  }

  if ($Update -or -not (Test-Path -LiteralPath $baseline)) {
    Copy-Item -LiteralPath $actual -Destination $baseline -Force
    Write-Output "UPDATED $($case.Name)"
    continue
  }

  $expectedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $baseline).Hash
  $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $actual).Hash
  if ($expectedHash -eq $actualHash) {
    Write-Output "PASS $($case.Name)"
  } else {
    Write-Output "FAIL $($case.Name) - raster output differs from its approved baseline"
    $failures += 1
  }
}

if ($failures -gt 0) {
  Write-Output "$failures visual regression case(s) failed."
  exit 1
}

Write-Output "All $($cases.Count) A4 visual regression cases passed."
