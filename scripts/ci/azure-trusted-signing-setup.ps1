#Requires -Version 7.0
<#
  Installs Microsoft.ArtifactSigning.Client (NuGet), locates SignTool, writes metadata.json,
  and appends AZURE_METADATA_JSON, AZURE_CODE_SIGNING_DLIB, WINDOWS_SIGNTOOL_PATH to GITHUB_ENV.

  Required environment variables (set by GitHub Actions or locally before npm run make):
    AZURE_CODESIGNING_ENDPOINT
    AZURE_CODESIGNING_ACCOUNT_NAME
    AZURE_CERTIFICATE_PROFILE_NAME
    GITHUB_WORKSPACE (repo root; defaults to current directory)

  Optional:
    ARTIFACT_SIGNING_NUGET_VERSION (default: 1.0.128)
#>
$ErrorActionPreference = 'Stop'

$workspace = $env:GITHUB_WORKSPACE
if ([string]::IsNullOrWhiteSpace($workspace)) {
  $workspace = (Get-Location).Path
}

$endpoint = $env:AZURE_CODESIGNING_ENDPOINT
$account = $env:AZURE_CODESIGNING_ACCOUNT_NAME
$profile = $env:AZURE_CERTIFICATE_PROFILE_NAME
if ([string]::IsNullOrWhiteSpace($endpoint) -or [string]::IsNullOrWhiteSpace($account) -or [string]::IsNullOrWhiteSpace($profile)) {
  throw 'AZURE_CODESIGNING_ENDPOINT, AZURE_CODESIGNING_ACCOUNT_NAME, and AZURE_CERTIFICATE_PROFILE_NAME must be set.'
}

$ver = $env:ARTIFACT_SIGNING_NUGET_VERSION
if ([string]::IsNullOrWhiteSpace($ver)) {
  $ver = '1.0.128'
}

$root = Join-Path $workspace 'artifact-signing-ci'
New-Item -ItemType Directory -Path $root -Force | Out-Null

$nugetExe = Join-Path $root 'nuget.exe'
if (-not (Test-Path $nugetExe)) {
  Invoke-WebRequest -Uri 'https://dist.nuget.org/win-x86-commandline/latest/nuget.exe' -OutFile $nugetExe
}

& $nugetExe install Microsoft.ArtifactSigning.Client -Version $ver -OutputDirectory $root -ExcludeVersion
$dlibDir = Join-Path $root 'Microsoft.ArtifactSigning.Client\bin\x64'
$dlib = Join-Path $dlibDir 'Azure.CodeSigning.Dlib.dll'
if (-not (Test-Path $dlib)) {
  throw "Azure.CodeSigning.Dlib.dll not found at $dlib — check package version or NuGet layout."
}

# @electron/windows-sign: avoid spaces in signing-related paths (issue #45).
if ($dlib -match '\s') {
  throw 'Path to Azure.CodeSigning.Dlib.dll must not contain spaces.'
}

$metaObj = [ordered]@{
  Endpoint                 = $endpoint
  CodeSigningAccountName   = $account
  CertificateProfileName   = $profile
}
$metaJson = $metaObj | ConvertTo-Json -Compress
$metaPath = Join-Path $root 'metadata.json'
if ($metaPath -match '\s') {
  throw 'Path to metadata.json must not contain spaces.'
}
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($metaPath, $metaJson, $utf8NoBom)

$signtool = $null
$kitsRoot = 'C:\Program Files (x86)\Windows Kits\10\bin'
if (Test-Path $kitsRoot) {
  $kitDirs = Get-ChildItem -Path $kitsRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^\d+\.\d+' } |
    Sort-Object { [version]($_.Name) } -Descending
  foreach ($kit in $kitDirs) {
    $candidate = Join-Path $kit.FullName 'x64\signtool.exe'
    if (Test-Path $candidate) {
      $signtool = $candidate
      break
    }
  }
}
if (-not $signtool) {
  throw 'signtool.exe not found under Windows Kits. Install the Windows SDK on this machine or set WINDOWS_SIGNTOOL_PATH.'
}

# @electron/windows-sign: paths must not contain spaces (issue #45). Windows Kits lives under
# "Program Files (x86)\...", so copy signtool next to the dlib under $root (workspace path is space-free on CI).
$signtoolDest = Join-Path $root 'signtool.exe'
Copy-Item -LiteralPath $signtool -Destination $signtoolDest -Force
$signtool = (Resolve-Path -LiteralPath $signtoolDest).Path
if ($signtool -match '\s') {
  throw 'Path to signtool.exe must not contain spaces (copy into artifact-signing-ci failed).'
}

$ghEnv = $env:GITHUB_ENV
if (-not [string]::IsNullOrWhiteSpace($ghEnv)) {
  "AZURE_METADATA_JSON=$metaPath" | Out-File -FilePath $ghEnv -Append -Encoding utf8
  "AZURE_CODE_SIGNING_DLIB=$dlib" | Out-File -FilePath $ghEnv -Append -Encoding utf8
  "WINDOWS_SIGNTOOL_PATH=$signtool" | Out-File -FilePath $ghEnv -Append -Encoding utf8
  Write-Host "Wrote signing paths to GITHUB_ENV."
} else {
  Write-Host "GITHUB_ENV not set — export locally:"
  Write-Host "AZURE_METADATA_JSON=$metaPath"
  Write-Host "AZURE_CODE_SIGNING_DLIB=$dlib"
  Write-Host "WINDOWS_SIGNTOOL_PATH=$signtool"
}
