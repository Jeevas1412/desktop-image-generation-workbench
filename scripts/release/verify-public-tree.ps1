[CmdletBinding()]
param(
    [switch]$RequireLicense
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$forbiddenExtensions = @('.safetensors', '.ckpt', '.pt', '.pth', '.onnx', '.gguf', '.bin', '.partial', '.pem', '.key', '.pfx', '.p12')
$forbiddenNames = @('.env', 'id_rsa', 'id_ed25519')
$textExtensions = @('.md', '.txt', '.json', '.jsonl', '.yml', '.yaml', '.mjs', '.cjs', '.js', '.ts', '.tsx', '.css', '.html', '.ps1', '.xml')
$contentPatterns = [ordered]@{
    'private key material' = '-----BEGIN [A-Z ]*PRIVATE KEY-----'
    'GitHub classic token' = 'ghp_[A-Za-z0-9]{30,}'
    'GitHub fine-grained token' = 'github_pat_[A-Za-z0-9_]{30,}'
    'AWS access key' = 'AKIA[0-9A-Z]{16}'
    'local Windows user path' = '(?i)C:\\Users\\[^<\\\s]+'
    'internal workspace path' = 'D:\\生图工作流项目'
}

function Get-CandidateFiles {
    $insideGit = Test-Path -LiteralPath (Join-Path $projectRoot '.git')

    if ($insideGit) {
        return @(& git -c core.quotepath=false -C $projectRoot ls-files --cached --modified --others --exclude-standard | Sort-Object -Unique | ForEach-Object {
            $candidate = Join-Path $projectRoot $_
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { Get-Item -LiteralPath $candidate }
        })
    }

    $excluded = @(
        '^\.git[\\/]', '^\.workbuddy[\\/]', '^node_modules[\\/]', '^artifacts[\\/]', '^baselines[\\/]',
        '^tasks[\\/]', '^data[\\/]', '^models[\\/]', '^outputs[\\/]', '^semifinished[\\/]', '^downloads[\\/]', '^logs[\\/]',
        '(^|[\\/])node_modules[\\/]', '(^|[\\/])dist[\\/]', '(^|[\\/])\.vite[\\/]', '(^|[\\/])__pycache__[\\/]',
        '^03_生图工作台GitHub产品化项目框架与任务流程\.md$', '^README_AGENT入口\.md$',
        '^docs[\\/]2026-', '^docs[\\/]C-12\.'
    )
    return @(Get-ChildItem -LiteralPath $projectRoot -Recurse -File | Where-Object {
        $relative = $_.FullName.Substring($projectRoot.Length).TrimStart('\', '/')
        -not ($excluded | Where-Object { $relative -match $_ })
    })
}

$failures = New-Object System.Collections.Generic.List[string]
$files = @(Get-CandidateFiles)

foreach ($file in $files) {
    $relative = $file.FullName.Substring($projectRoot.Length).TrimStart('\', '/')
    $extension = $file.Extension.ToLowerInvariant()
    $name = $file.Name.ToLowerInvariant()

    if ($forbiddenExtensions -contains $extension) { $failures.Add("Forbidden release file extension: $relative") }
    if ($forbiddenNames -contains $name -or $name -like '.env.*') { $failures.Add("Forbidden release file name: $relative") }

    if ($textExtensions -contains $extension -and $file.Length -le 2MB) {
        $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
        foreach ($entry in $contentPatterns.GetEnumerator()) {
            if ($content -match $entry.Value) { $failures.Add("$($entry.Key) found in: $relative") }
        }
    }
}

if ($RequireLicense) {
    foreach ($required in @('LICENSE', 'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md')) {
        if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $required) -PathType Leaf)) {
            $failures.Add("Required public release metadata is missing: $required")
        }
    }
}

if ($failures.Count -gt 0) {
    $failures | Sort-Object -Unique | ForEach-Object { Write-Error $_ }
    throw "Public tree verification failed with $($failures.Count) finding(s)."
}

Write-Host "Public tree verification passed for $($files.Count) candidate file(s). RequireLicense=$RequireLicense"
