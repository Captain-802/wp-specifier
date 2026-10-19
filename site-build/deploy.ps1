# Builds the obfuscated site (_site/) and publishes it to BOTH hosts:
#   - Vercel, the project in site-build/vercel-project.json
#   - GitHub Pages, the gh-pages branch of this repo (built page only, so the
#     source on main is never served by the site)
#
# Run after pushing main:  pwsh site-build/deploy.ps1
# Skip a host with -NoVercel or -NoPages.
param([switch]$NoVercel, [switch]$NoPages)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent

# ---------------------------------------------------------------- build
$tools = Join-Path $env:LOCALAPPDATA 'ced-site-build'
if (-not (Test-Path (Join-Path $tools 'node_modules\javascript-obfuscator'))) {
  New-Item -ItemType Directory -Force $tools | Out-Null
  npm install --prefix $tools --no-fund --no-audit javascript-obfuscator@4.1.1
  if ($LASTEXITCODE) { throw 'npm install failed' }
}
$env:NODE_PATH = Join-Path $tools 'node_modules'
node (Join-Path $PSScriptRoot 'build-site.cjs') $repo
if ($LASTEXITCODE) { throw 'build failed' }

$built = Join-Path $repo '_site\index.html'
if (-not (Test-Path $built)) { throw "build produced no _site\index.html" }
$commit = git -C $repo log -1 --format='%h %s'

# ---------------------------------------------------------------- Vercel
if (-not $NoVercel) {
  $p = Get-Content (Join-Path $PSScriptRoot 'vercel-project.json') -Raw | ConvertFrom-Json
  $env:VERCEL_ORG_ID = $p.orgId
  $env:VERCEL_PROJECT_ID = $p.projectId
  Write-Host "Vercel      <- $commit  ->  $($p.url)"
  vercel deploy (Join-Path $repo '_site') --prod --yes
  if ($LASTEXITCODE) { throw 'vercel deploy failed' }
}

# ---------------------------------------------------------------- GitHub Pages
# A worktree is used so the branch you are working on, and any uncommitted
# changes in it, are left alone.
if (-not $NoPages) {
  $wt = Join-Path ([System.IO.Path]::GetTempPath()) ("ced-pages-" + [guid]::NewGuid().ToString('N').Substring(0,8))
  git -C $repo fetch -q origin gh-pages 2>$null
  $hasRemote = (git -C $repo ls-remote --heads origin gh-pages) -ne $null -and
               (git -C $repo ls-remote --heads origin gh-pages).Length -gt 0
  try {
    if ($hasRemote) {
      git -C $repo worktree add -q --detach $wt origin/gh-pages
      if ($LASTEXITCODE) { throw 'worktree add failed' }
      git -C $wt checkout -q -B gh-pages
    } else {
      git -C $repo worktree add -q --detach $wt
      if ($LASTEXITCODE) { throw 'worktree add failed' }
      git -C $wt checkout -q --orphan gh-pages
      git -C $wt rm -rq --cached . 2>$null
      Get-ChildItem $wt -Force -Exclude '.git' | Remove-Item -Recurse -Force
    }
    Copy-Item $built (Join-Path $wt 'index.html') -Force
    New-Item -ItemType File -Force (Join-Path $wt '.nojekyll') | Out-Null
    git -C $wt add -A
    if ((git -C $wt status --porcelain).Length -eq 0) {
      Write-Host "GitHub Pages: already up to date"
    } else {
      git -C $wt -c user.name='Captain-802' -c user.email='fayaz.ahmad@cedengineers.com' `
        commit -q -m "Built site: $commit"
      if ($LASTEXITCODE) { throw 'pages commit failed' }
      git -C $wt push -q origin gh-pages
      if ($LASTEXITCODE) { throw 'pages push failed' }
      Write-Host "GitHub Pages <- $commit  ->  https://captain-802.github.io/wp-specifier/"
    }
  } finally {
    git -C $repo worktree remove --force $wt 2>$null
  }
}

Write-Host "Done."
