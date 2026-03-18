<#
.SYNOPSIS
    Registers (or removes) "Open in Mnemo" right-click context menu entries for
    .md and .txt files in the current user's registry (no admin required).

.DESCRIPTION
    Run with -Unregister to remove the entries.
    The installed-app version of Mnemo does this automatically during setup.
    Use this script when running Mnemo from source / dev mode.

.PARAMETER ExePath
    Path to the Mnemo executable.
    Defaults to the packaged app in the local AppData install directory.
    For dev, pass the full path to your electron binary + entry script, e.g.:
        -ExePath '"C:\path\to\node_modules\.bin\electron.cmd" "C:\path\to\src\main\index.ts"'

.PARAMETER Unregister
    Switch: remove the context menu entries instead of adding them.

.EXAMPLE
    # Register using the packaged app (default)
    .\register-shell-windows.ps1

.EXAMPLE
    # Unregister
    .\register-shell-windows.ps1 -Unregister

.EXAMPLE
    # Register with a custom exe path (packaged build in dist/)
    .\register-shell-windows.ps1 -ExePath '"C:\dev\fwg\mnemo\out\Mnemo-win32-x64\Mnemo.exe"'
#>

param(
    [string]$ExePath,
    [switch]$Unregister
)

$Extensions = @('.md', '.txt')
$MenuLabel  = 'Open in Mnemo'

if (-not $ExePath) {
    # Default: look for the Squirrel-installed exe in AppData\Local\Mnemo
    $candidate = Join-Path $env:LOCALAPPDATA 'Mnemo\Mnemo.exe'
    if (Test-Path $candidate) {
        $ExePath = "`"$candidate`""
    } else {
        Write-Error "Could not find Mnemo.exe at $candidate. Pass -ExePath explicitly."
        exit 1
    }
}

foreach ($ext in $Extensions) {
    $keyBase = "HKCU:\Software\Classes\$ext\shell\$MenuLabel"

    if ($Unregister) {
        if (Test-Path $keyBase) {
            Remove-Item -Path $keyBase -Recurse -Force
            Write-Host "Removed context menu for $ext"
        } else {
            Write-Host "No entry found for $ext (skipped)"
        }
    } else {
        New-Item -Path $keyBase -Force | Out-Null
        Set-ItemProperty -Path $keyBase -Name '(default)' -Value $MenuLabel

        $cmdKey = "$keyBase\command"
        New-Item -Path $cmdKey -Force | Out-Null
        Set-ItemProperty -Path $cmdKey -Name '(default)' -Value "$ExePath `"%1`""

        Write-Host "Registered context menu for $ext  ->  $ExePath"
    }
}

if (-not $Unregister) {
    Write-Host ""
    Write-Host "Done. Right-click any .md or .txt file and choose '$MenuLabel'."
    Write-Host "Changes take effect immediately (no restart needed)."
}
