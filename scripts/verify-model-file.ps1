[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ArtifactId,

  [Parameter(Mandatory = $true)]
  [string]$Path
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$catalogPath = Join-Path $projectRoot 'model-catalog\catalog.v1.json'
$catalog = Get-Content -LiteralPath $catalogPath -Raw -Encoding UTF8 | ConvertFrom-Json
$artifact = @($catalog.artifacts | Where-Object { $_.artifactId -eq $ArtifactId })

if ($artifact.Count -ne 1) { throw "Unknown or ambiguous artifactId: $ArtifactId" }
if ([string]::IsNullOrWhiteSpace($artifact[0].distribution.sha256)) { throw "Artifact has no single-file SHA-256: $ArtifactId" }
if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "File not found: $Path" }

$actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
$expected = [string]$artifact[0].distribution.sha256
$result = [pscustomobject]@{
  artifactId = $ArtifactId
  expectedFileName = [string]$artifact[0].expectedFileName
  actualFileName = Split-Path -Leaf $Path
  expectedSha256 = $expected
  actualSha256 = $actual
  verified = $actual -eq $expected
}

$result | ConvertTo-Json -Depth 3
if (-not $result.verified) { exit 1 }
