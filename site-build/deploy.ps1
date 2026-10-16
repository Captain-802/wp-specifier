# Builds the obfuscated site (_site/) and deploys it to the Vercel project in
# site-build/vercel-project.json. Only _site/ is uploaded; the source stays in
# the private GitHub repo. Run after pushing: pwsh site-build/deploy.ps1
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$tools = Join-Path $env:LOCALAPPDATA 'ced-site-build'
if (-not (Test-Path (Join-Path $tools 'node_modules\javascript-obfuscator'))) {
  New-Item -ItemType Directory -Force $tools | Out-Null
  npm install --prefix $tools --no-fund --no-audit javascript-obfuscator@4.1.1
  if ($LASTEXITCODE) { throw 'npm install failed' }
}
$env:NODE_PATH = Join-Path $tools 'node_modules'
node (Join-Path $PSScriptRoot 'build-site.cjs') $repo
if ($LASTEXITCODE) { throw 'build failed' }
$p = Get-Content (Join-Path $PSScriptRoot 'vercel-project.json') -Raw | ConvertFrom-Json
$env:VERCEL_ORG_ID = $p.orgId
$env:VERCEL_PROJECT_ID = $p.projectId
Write-Host "Deploying $(git -C $repo log -1 --format='%h %s') to $($p.url)"
vercel deploy (Join-Path $repo '_site') --prod --yes
if ($LASTEXITCODE) { throw 'vercel deploy failed' }
