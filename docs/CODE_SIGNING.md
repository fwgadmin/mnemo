# Windows code signing for Mnemo

This document explains **what to buy**, **how it fits GitHub Actions**, and **which repository secrets to set** so release builds sign **`Mnemo.exe`** (via `@electron/packager` / `@electron/windows-sign`) and **`MnemoSetup.exe`** (via Squirrel).

## PFX file vs EV / hardware token — what we recommend

| Approach | GitHub-hosted `windows-latest` | SmartScreen / reputation | Notes |
|----------|-------------------------------|---------------------------|--------|
| **Standard (OV) certificate exported as `.pfx`** | **Works well** — decode the PFX in CI and point Forge at the path + password. | Good; reputation builds over time. | **Simplest path** for automated releases in this repo. |
| **EV on a USB token** | **Does not work** on shared runners — no USB. | Often faster trust. | Use a **self-hosted Windows runner** with the token plugged in, or switch to **cloud signing** (DigiCert KeyLocker, SSL.com, etc.). |
| **EV / token via cloud HSM** (DigiCert KeyLocker, Azure Key Vault, etc.) | **Works** if your CA documents **SignTool** + `/csp` / `/kc` (or custom `signtool.exe`). | Strong. | Configure `WINDOWS_SIGN_WITH_PARAMS` + optional `WINDOWS_SIGNTOOL_PATH` (see [Environment variables](#environment-variables)). Not wired by default — extend `forge.config.js` or use a custom hook. |
| **Azure Trusted Signing** | **Works** on Microsoft-hosted runners with the right setup. | Strong. | See [Electron Forge — Azure Trusted Signing](https://www.electronforge.io/guides/code-signing/code-signing-windows). Requires Azure + app registration; different env vars than the PFX flow below. |

**Practical advice:** For **GitHub Actions only**, purchase a **standard (OV) Authenticode** certificate where your CA allows **export to a password-protected `.pfx`**. Store the PFX (base64) and password as **GitHub Actions secrets** — this matches the workflow in `.github/workflows/release.yml`.

If you later need **EV** and **cannot** export a PFX, plan for **cloud signing** or a **self-hosted runner**, not the USB token alone on `windows-latest`.

## What you purchase (checklist)

1. **Windows Authenticode** code-signing certificate (OV is fine for CI with PFX).
2. Confirm with the vendor you can **export** the cert as **`.pfx`** with a password (some EV policies forbid export — then use cloud HSM signing instead).
3. From the CA, note the **timestamp server** URL (often DigiCert or Sectigo). The default in Forge is `http://timestamp.digicert.com` unless you override `WINDOWS_TIMESTAMP_SERVER`.

## One-time: create GitHub secrets

In the repo: **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Purpose |
|--------|---------|
| `WINDOWS_CERTIFICATE_PFX_B64` | Base64-encoded contents of your **entire** `.pfx` file (see below). |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password for that `.pfx`. |

Optional:

| Variable / secret | Purpose |
|-------------------|---------|
| `WINDOWS_TIMESTAMP_SERVER` | Repository **variable** (or secret) — e.g. `http://timestamp.digicert.com` if your CA requires a different RFC 3161 server. |

### Encode the PFX as base64 (do this locally, never commit the file)

**PowerShell (Windows):**

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\your-cert.pfx")) | Set-Clipboard
```

**macOS / Linux:**

```bash
base64 -i your-cert.pfx | pbcopy   # macOS
base64 -w0 your-cert.pfx           # Linux; paste into the secret manually
```

Paste the **single-line** base64 string into `WINDOWS_CERTIFICATE_PFX_B64`.

## How CI uses the certificate

On **Windows** jobs, when `WINDOWS_CERTIFICATE_PFX_B64` is non-empty, the workflow:

1. Writes the decoded bytes to `certificate.pfx` at the repo root on the runner.
2. Sets `WINDOWS_CERTIFICATE_FILE` to that path and passes `WINDOWS_CERTIFICATE_PASSWORD` into the environment.
3. Runs `npm run make`. `forge.config.js` enables `packagerConfig.windowsSign` and Squirrel `certificateFile` / `certificatePassword` when those env vars are set and the file exists.

If the secrets are **missing**, builds stay **unsigned** (same as today).

## Local signing (optional)

On a Windows machine with the `.pfx` file:

```powershell
$env:WINDOWS_CERTIFICATE_FILE = "C:\secure\path\cert.pfx"
$env:WINDOWS_CERTIFICATE_PASSWORD = "your-password"
npm run make
```

Do not commit the `.pfx` or password.

## Environment variables (reference)

| Variable | Role |
|----------|------|
| `WINDOWS_CERTIFICATE_FILE` | Absolute path to `.pfx` on the build machine. |
| `WINDOWS_CERTIFICATE_PASSWORD` | `.pfx` password. |
| `WINDOWS_TIMESTAMP_SERVER` | Optional. Defaults to `http://timestamp.digicert.com` in `forge.config.js`. |

Advanced (cloud HSM / custom SignTool): set `WINDOWS_SIGNTOOL_PATH` and/or `WINDOWS_SIGN_WITH_PARAMS` per [`@electron/windows-sign`](https://github.com/electron/windows-sign) and adjust `forge.config.js` to pass `signToolPath` / `signWithParams` into `windowsSign` — not required for a plain PFX.

## Verification

After a signed build, on Windows:

```powershell
Get-AuthenticodeSignature -FilePath "path\to\Mnemo.exe"
Get-AuthenticodeSignature -FilePath "path\to\MnemoSetup.exe"
```

You should see a valid signature and the publisher name from your certificate.

## Further reading

- [Electron Forge — Signing a Windows app](https://www.electronforge.io/guides/code-signing/code-signing-windows)
- [`@electron/windows-sign`](https://github.com/electron/windows-sign)
