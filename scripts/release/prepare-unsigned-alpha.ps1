[CmdletBinding()]
param(
    [string]$Version,
    [switch]$RequirePublishMetadata,
    [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
Set-Location -LiteralPath $projectRoot
$rootPackage = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($Version)) { $Version = [string]$rootPackage.version }
if ($Version -notmatch '^\d+\.\d+\.\d+-alpha\.\d+$') { throw "Unsigned Alpha version must match x.y.z-alpha.n: $Version" }

foreach ($relative in @('package.json', 'backend/package.json', 'frontend/package.json', 'desktop/package.json')) {
    $package = Get-Content -LiteralPath (Join-Path $projectRoot $relative) -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([string]$package.version -ne $Version) { throw "Version mismatch in $relative. Expected $Version, received $($package.version)." }
}

$verifyArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'verify-public-tree.ps1'))
if ($RequirePublishMetadata) { $verifyArgs += '-RequireLicense' }
& powershell.exe @verifyArgs
if ($LASTEXITCODE -ne 0) { throw 'Public tree verification failed.' }

function Invoke-Checked {
    param([string]$FilePath, [string[]]$Arguments)
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $FilePath $($Arguments -join ' ')" }
}

if (-not $SkipBuild) {
    Invoke-Checked 'npm.cmd' @('run', 'ci')
    Invoke-Checked 'npm.cmd' @('--prefix', 'desktop', 'run', 'dist:win')
}

$builderRoot = Join-Path $projectRoot 'artifacts\windows-installer'
$unpackedRoot = Join-Path $builderRoot 'win-unpacked'
$installerMatches = @(Get-ChildItem -LiteralPath $builderRoot -File -Filter "*Setup $Version.exe")
if ($installerMatches.Count -ne 1) { throw "Expected one NSIS installer for $Version, found $($installerMatches.Count)." }
$installer = $installerMatches[0]

$requiredResources = @(
    'resources/frontend/dist/index.html',
    'resources/backend/src/image/application-core.mjs',
    'resources/backend/src/image/library-store.mjs',
    'resources/contracts/image/capability.schema.json',
    'resources/contracts/image/generation.schema.json',
    'resources/model-catalog/catalog.v1.json',
    'resources/app.asar'
)
foreach ($relative in $requiredResources) {
    if (-not (Test-Path -LiteralPath (Join-Path $unpackedRoot $relative) -PathType Leaf)) { throw "Packaged runtime resource missing: $relative" }
}

$weightExtensions = @('.safetensors', '.ckpt', '.pt', '.pth', '.onnx', '.gguf')
$weights = @(Get-ChildItem -LiteralPath $unpackedRoot -Recurse -File | Where-Object { $weightExtensions -contains $_.Extension.ToLowerInvariant() })
if ($weights.Count -ne 0) { throw "Model weights were found in win-unpacked: $($weights.FullName -join ', ')" }
$forbiddenPackagedNames = @(Get-ChildItem -LiteralPath $unpackedRoot -Recurse -File | Where-Object {
    $_.Name -eq '.env' -or $_.Name -like '.env.*' -or $_.Extension.ToLowerInvariant() -in @('.pem', '.key', '.pfx', '.p12', '.partial')
})
if ($forbiddenPackagedNames.Count -ne 0) { throw "Secret/cache-like files were found in win-unpacked: $($forbiddenPackagedNames.FullName -join ', ')" }

$signature = Get-AuthenticodeSignature -LiteralPath $installer.FullName
if ([string]$signature.Status -ne 'NotSigned') { throw "Unsigned Alpha requires an explicitly unsigned installer; status was $($signature.Status)." }

$assetRoot = Join-Path $projectRoot "artifacts\unsigned-alpha\$Version"
if (Test-Path -LiteralPath $assetRoot) {
    if ((Get-ChildItem -LiteralPath $assetRoot -Force | Measure-Object).Count -gt 0) { throw "Release asset directory already contains files: $assetRoot" }
} else {
    New-Item -ItemType Directory -Path $assetRoot | Out-Null
}

$assetName = "DGX-Image-Workbench-Setup-$Version-UNSIGNED-ALPHA.exe"
$assetInstaller = Join-Path $assetRoot $assetName
Copy-Item -LiteralPath $installer.FullName -Destination $assetInstaller

$catalogName = 'model-catalog-v1.json'
Copy-Item -LiteralPath (Join-Path $projectRoot 'model-catalog\catalog.v1.json') -Destination (Join-Path $assetRoot $catalogName)

function Write-Sbom {
    param([string]$ProjectDirectory, [string]$Destination)
    $jsonLines = & npm.cmd --prefix $ProjectDirectory sbom --sbom-format spdx --sbom-type application
    if ($LASTEXITCODE -ne 0) { throw "npm sbom failed for $ProjectDirectory" }
    $json = $jsonLines -join [Environment]::NewLine
    $null = $json | ConvertFrom-Json
    [System.IO.File]::WriteAllText($Destination, $json, (New-Object System.Text.UTF8Encoding($false)))
}

Write-Sbom (Join-Path $projectRoot 'frontend') (Join-Path $assetRoot 'SBOM.frontend.spdx.json')
Write-Sbom (Join-Path $projectRoot 'desktop') (Join-Path $assetRoot 'SBOM.desktop.spdx.json')

$sourceCommit = if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_SHA)) { $env:GITHUB_SHA } elseif (Test-Path -LiteralPath (Join-Path $projectRoot '.git')) {
    [string](& git -C $projectRoot rev-parse HEAD)
} else { 'not-initialized' }
$installerHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $assetInstaller).Hash
$manifest = [ordered]@{
    version = $Version
    releaseKind = 'unsigned-alpha'
    productionReady = $false
    windowsAuthenticode = 'NotSigned'
    sourceCommit = $sourceCommit
    builtAtUtc = [DateTime]::UtcNow.ToString('o')
    installer = [ordered]@{ file = $assetName; sha256 = $installerHash; sizeBytes = (Get-Item -LiteralPath $assetInstaller).Length }
    packagedResources = $requiredResources
    modelWeightCount = 0
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $assetRoot 'release-manifest.json') -Encoding UTF8

$notes = @"
# DGX Image Workbench $Version — UNSIGNED ALPHA

> WARNING: This Windows installer is not Authenticode signed. Windows may display **Unknown Publisher** or block execution. This build is only for informed Alpha testers and is not production-ready.

- Release channel: Draft / Prerelease only
- Project positioning: non-commercial research, learning, and non-production testing; the source license remains Apache-2.0.
- Installer SHA-256: **$installerHash**
- Models included: none
- Controlled DGX validation: Alpha34 source completed five serialized real rounds for each registered Pony, Illustrious, and FLUX workflow; no queue clear, service restart, or model write was used.
- Windows Sandbox source-installer validation: completed for first install, restart, and empty initial data.
- This GitHub-built installer still requires its own clean-Windows verification before a Draft is made public.
- Production guarantee: none

Verify the downloaded installer against `SHA256SUMS.txt`. If the workflow generated an artifact attestation and your repository plan supports verification, also run:

``````powershell
gh attestation verify .\$assetName -R OWNER/REPOSITORY
``````

GitHub provenance does not replace Windows Authenticode signing.
"@
$notes | Set-Content -LiteralPath (Join-Path $assetRoot 'RELEASE_NOTES.md') -Encoding UTF8

foreach ($metadata in @('LICENSE', 'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md')) {
    $source = Join-Path $projectRoot $metadata
    if (Test-Path -LiteralPath $source -PathType Leaf) { Copy-Item -LiteralPath $source -Destination (Join-Path $assetRoot $metadata) }
}

$hashFiles = @(Get-ChildItem -LiteralPath $assetRoot -File | Where-Object { $_.Name -ne 'SHA256SUMS.txt' } | Sort-Object Name)
$hashLines = foreach ($file in $hashFiles) { "{0}  {1}" -f (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash, $file.Name }
$hashLines | Set-Content -LiteralPath (Join-Path $assetRoot 'SHA256SUMS.txt') -Encoding ASCII

Write-Host "Unsigned Alpha candidate prepared: $assetRoot"
Write-Host "Installer: $assetName"
Write-Host "SHA256: $installerHash"
Write-Host 'Authenticode: NotSigned (expected for this channel)'
