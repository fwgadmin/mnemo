<#
.SYNOPSIS
    Registers (or removes) "Open in Mnemo" right-click context menu entries for
    .md and .txt files in the current user's registry (no admin required).

.DESCRIPTION
    Mirrors the registry structure that the Squirrel installer writes via the
    --squirrel-install / --squirrel-updated hooks in main/index.ts:

      HKCU\Software\Classes\MnemoNote\             (ProgId root)
      HKCU\Software\Classes\MnemoNote\DefaultIcon  (app icon)
      HKCU\Software\Classes\MnemoNote\shell\open\command

      For each extension (.md, .txt):
        HKCU\Software\Classes\{ext}\shell\mnemo.open\command   (right-click verb)
        HKCU\Software\Classes\{ext}\OpenWithProgids\MnemoNote  (Open With dialog)

      HKCU\Software\Classes\Applications\Mnemo.exe\            (app capabilities)

    Run with -Unregister to remove all entries.
    Use this script in dev/source mode; the installer handles it automatically.

.PARAMETER ExePath
    Path to the Mnemo executable.
    Defaults to the Squirrel-installed location (%LOCALAPPDATA%\Mnemo\Mnemo.exe).
    For a dev build pass the full path, e.g.:
        -ExePath 'C:\dev\fwg\mnemo\out\Mnemo-win32-x64\Mnemo.exe'

.PARAMETER Unregister
    Switch: remove all Mnemo shell entries instead of adding them.

.EXAMPLE
    # Register using the installed app (default)
    .\register-shell-windows.ps1

.EXAMPLE
    # Unregister
    .\register-shell-windows.ps1 -Unregister

.EXAMPLE
    # Register with a specific build
    .\register-shell-windows.ps1 -ExePath 'C:\dev\fwg\mnemo\out\Mnemo-win32-x64\Mnemo.exe'
#>

param(
    [string]$ExePath,
    [switch]$Unregister
)

$Extensions = @('.md', '.txt', '.log', '.csv', '.json', '.yaml', '.yml', '.toml', '.ini', '.conf', '.cfg', '.env')
$ProgId     = 'MnemoNote'
$VerbKey    = 'mnemo.open'
$VerbLabel  = 'Open in &Mnemo'
$ClassRoot  = 'HKCU:\Software\Classes'
$ProgRoot   = "$ClassRoot\$ProgId"
$AppRoot    = "$ClassRoot\Applications\Mnemo.exe"

if (-not $ExePath) {
    # Default: Squirrel installs to %LOCALAPPDATA%\Mnemo\Mnemo.exe
    $candidate = Join-Path $env:LOCALAPPDATA 'Mnemo\Mnemo.exe'
    if (Test-Path $candidate) {
        $ExePath = $candidate
    } else {
        Write-Error "Could not find Mnemo.exe at '$candidate'. Pass -ExePath explicitly."
        exit 1
    }
}

$IconVal = "`"$ExePath`",0"
$CmdVal  = "`"$ExePath`" `"%1`""

if ($Unregister) {
    # ── Remove ProgId root ────────────────────────────────────────────────────
    if (Test-Path $ProgRoot) {
        Remove-Item -Path $ProgRoot -Recurse -Force
        Write-Host "Removed ProgId $ProgId"
    }

    # ── Remove per-extension entries ──────────────────────────────────────────
    foreach ($ext in $Extensions) {
        $verbPath = "$ClassRoot\$ext\shell\$VerbKey"
        if (Test-Path $verbPath) {
            Remove-Item -Path $verbPath -Recurse -Force
            Write-Host "Removed context-menu verb for $ext"
        }
        $owpPath = "$ClassRoot\$ext\OpenWithProgids"
        if (Test-Path "$owpPath\$ProgId") {
            Remove-ItemProperty -Path $owpPath -Name $ProgId -ErrorAction SilentlyContinue
            Write-Host "Removed OpenWithProgids entry for $ext"
        }
    }

    # ── Remove Applications\Mnemo.exe ────────────────────────────────────────
    if (Test-Path $AppRoot) {
        Remove-Item -Path $AppRoot -Recurse -Force
        Write-Host "Removed Applications\Mnemo.exe"
    }

    Write-Host "`nUnregistration complete."
} else {
    # ── ProgId root ───────────────────────────────────────────────────────────
    New-Item -Path $ProgRoot -Force | Out-Null
    Set-ItemProperty -Path $ProgRoot -Name '(default)' -Value 'Mnemo Note'

    New-Item -Path "$ProgRoot\DefaultIcon" -Force | Out-Null
    Set-ItemProperty -Path "$ProgRoot\DefaultIcon" -Name '(default)' -Value $IconVal

    New-Item -Path "$ProgRoot\shell\open" -Force | Out-Null
    Set-ItemProperty -Path "$ProgRoot\shell\open" -Name '(default)' -Value $VerbLabel
    Set-ItemProperty -Path "$ProgRoot\shell\open" -Name 'Icon'      -Value $IconVal

    New-Item -Path "$ProgRoot\shell\open\command" -Force | Out-Null
    Set-ItemProperty -Path "$ProgRoot\shell\open\command" -Name '(default)' -Value $CmdVal

    Write-Host "Registered ProgId $ProgId"

    # ── Per-extension entries ─────────────────────────────────────────────────
    foreach ($ext in $Extensions) {
        # Right-click context-menu verb
        $verbPath = "$ClassRoot\$ext\shell\$VerbKey"
        New-Item -Path $verbPath -Force | Out-Null
        Set-ItemProperty -Path $verbPath -Name '(default)' -Value $VerbLabel
        Set-ItemProperty -Path $verbPath -Name 'Icon'      -Value $IconVal

        New-Item -Path "$verbPath\command" -Force | Out-Null
        Set-ItemProperty -Path "$verbPath\command" -Name '(default)' -Value $CmdVal

        # OpenWithProgids — surfaces Mnemo in the right-click "Open with" submenu
        New-Item -Path "$ClassRoot\$ext\OpenWithProgids" -Force | Out-Null
        New-ItemProperty -Path "$ClassRoot\$ext\OpenWithProgids" `
            -Name $ProgId -PropertyType Binary -Value ([byte[]]@()) -Force | Out-Null

        Write-Host "Registered context-menu verb for $ext"
    }

    # ── Applications\Mnemo.exe ────────────────────────────────────────────────
    New-Item -Path $AppRoot -Force | Out-Null
    Set-ItemProperty -Path $AppRoot -Name 'FriendlyAppName' -Value 'Mnemo'

    New-Item -Path "$AppRoot\shell\open\command" -Force | Out-Null
    Set-ItemProperty -Path "$AppRoot\shell\open\command" -Name '(default)' -Value $CmdVal

    New-Item -Path "$AppRoot\SupportedTypes" -Force | Out-Null
    foreach ($ext in $Extensions) {
        New-ItemProperty -Path "$AppRoot\SupportedTypes" `
            -Name $ext -PropertyType String -Value '' -Force | Out-Null
    }

    Write-Host "Registered Applications\Mnemo.exe"

    Write-Host "`nDone. Right-click any .md or .txt file and choose 'Open in Mnemo'."
    Write-Host "Changes take effect immediately (no Explorer restart needed)."
}
