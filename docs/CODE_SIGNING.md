# Windows code signing for Mnemo

This document explains **what to buy**, **how it fits GitHub Actions**, and **which repository secrets to set** so release builds sign **`Mnemo.exe`** (via `@electron/packager` / `@electron/windows-sign`) and **`MnemoSetup.exe`** (via Squirrel).

## PFX file vs EV / hardware token — what we recommend

| Approach | GitHub-hosted `windows-latest` | SmartScreen / reputation | Notes |
|----------|-------------------------------|---------------------------|--------|
| **Standard (OV) certificate exported as `.pfx`** | **Works well** — decode the PFX in CI and point Forge at the path + password. | Good; reputation builds over time. | **Simplest path** for automated releases in this repo. |
| **EV on a USB token** | **Does not work** on shared runners — no USB. | Often faster trust. | Use a **self-hosted Windows runner** with the token plugged in, or switch to **cloud signing** (DigiCert KeyLocker, SSL.com, etc.). |
| **EV / token via cloud HSM** (DigiCert KeyLocker, Azure Key Vault, etc.) | **Works** if your CA documents **SignTool** + `/csp` / `/kc` (or custom `signtool.exe`). | Strong. | Configure `WINDOWS_SIGN_WITH_PARAMS` + optional `WINDOWS_SIGNTOOL_PATH` (see [Environment variables](#environment-variables)). Not wired by default — extend `forge.config.js` or use a custom hook. |
| **Azure Trusted Signing** | **Works** on Microsoft-hosted runners with the right setup. | Strong. | See [Electron Forge — Azure Trusted Signing](https://www.electronforge.io/guides/code-signing/code-signing-windows). Requires Azure + app registration; different env vars than the PFX flow below. |

**Practical advice for this repo:** Prefer **Azure Artifact Signing** (Trusted Signing) in GitHub Actions — workflows install the **Microsoft.ArtifactSigning.Client** NuGet package, write `metadata.json`, and set env vars automatically (see [GitHub Actions — Azure Artifact Signing](#github-actions--azure-artifact-signing)). **PFX** remains supported as a fallback when Azure is not fully configured.

If you use a **commercial OV `.pfx`** instead, store the PFX (base64) and password as secrets — see [One-time: create GitHub secrets (PFX)](#one-time-create-github-secrets-pfx).

## What you purchase (checklist)

1. **Windows Authenticode** code-signing certificate (OV is fine for CI with PFX).
2. Confirm with the vendor you can **export** the cert as **`.pfx`** with a password (some EV policies forbid export — then use cloud HSM signing instead).
3. From the CA, note the **timestamp server** URL (often DigiCert or Sectigo). The default in Forge is `http://timestamp.digicert.com` unless you override `WINDOWS_TIMESTAMP_SERVER`.

## One-time: create GitHub secrets (PFX)

Use this path only if you sign with a **`.pfx`** and are **not** using Azure Artifact Signing for that workflow.

In the repo: **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Purpose |
|--------|---------|
| `WINDOWS_CERTIFICATE_PFX_B64` | Base64-encoded contents of your **entire** `.pfx` file (see below). |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password for that `.pfx`. |

Optional:

| Variable / secret | Purpose |
|-------------------|---------|
| `WINDOWS_TIMESTAMP_SERVER` | Repository **variable** (or secret) — PFX flow defaults to DigiCert; Azure Artifact Signing uses Microsoft’s timestamp in `forge.config.js`. |

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

## How CI uses a PFX (fallback)

On **Windows** jobs, when `WINDOWS_CERTIFICATE_PFX_B64` is non-empty **and** Azure Artifact Signing is **not** fully configured (see below), the workflow:

1. Writes the decoded bytes to `certificate.pfx` at the repo root on the runner.
2. Sets `WINDOWS_CERTIFICATE_FILE` to that path and passes `WINDOWS_CERTIFICATE_PASSWORD` into the environment.
3. Runs `npm run make`. `forge.config.js` enables PFX-based signing for the packaged app and Squirrel.

If neither Azure nor PFX is configured, Windows builds stay **unsigned**.

## Azure Trusted Signing (PFX not used)

If you use **[Azure Trusted Signing](https://azure.microsoft.com/products/trusted-signing)** instead of a `.pfx`, the app and Squirrel installer are still signed via **SignTool** and the Azure Code Signing Dlib — the same approach as [Electron Forge — Azure Trusted Signing](https://www.electronforge.io/guides/code-signing/code-signing-windows#configuring-forge-trusted-signing).

**Prerequisites (on the Windows build machine):** Windows SDK **SignTool** (not only the stub inside `electron-winstaller`), the **Azure.CodeSigning.Dlib** package, a **`metadata.json`** from your Trusted Signing profile, and an **Azure AD app registration** (client ID/secret/tenant) that SignTool uses via environment variables.

### Environment variables

| Variable | Purpose |
|----------|---------|
| `AZURE_CLIENT_ID` | App registration client ID |
| `AZURE_CLIENT_SECRET` | App registration secret |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_METADATA_JSON` | Absolute path to `metadata.json` (**no spaces** in path) |
| `AZURE_CODE_SIGNING_DLIB` | Absolute path to `Azure.CodeSigning.Dlib.dll` (**no spaces** in path) |
| `WINDOWS_SIGNTOOL_PATH` or `SIGNTOOL_PATH` | Absolute path to **real** `signtool.exe` from the Windows SDK (recommended) |

Optional: `WINDOWS_TRUSTED_TIMESTAMP_SERVER` — defaults to `http://timestamp.acs.microsoft.com`.

Do **not** set `WINDOWS_CERTIFICATE_FILE` when using Trusted Signing; if a PFX path is present and the file exists, **PFX signing takes precedence**.

### Repo-specific behavior

`forge.config.js` enables Trusted Signing when **no PFX** is configured and, on **Windows**, `AZURE_METADATA_JSON` and `AZURE_CODE_SIGNING_DLIB` point to existing files. It passes the same `windowsSign` options to Electron Packager and to **Squirrel** (`electron-winstaller`), which signs `MnemoSetup.exe` via `@electron/windows-sign`.

### Local command

1. Create **`.env.trustedsigning`** in the repo root (gitignored) with the variables above plus the Azure paths. Paths with spaces are not supported by `@electron/windows-sign` ([issue #45](https://github.com/electron/windows-sign/issues/45)).
2. Run:

```bash
npm run make:win:trusted
```

Or set the same variables in your shell and run `npm run make`.

### GitHub Actions — Azure Artifact Signing

Releases (`.github/workflows/release.yml`) and the Windows CI workflow (`.github/workflows/windows-build.yml`) run **`scripts/ci/azure-trusted-signing-setup.ps1`** when configuration is complete. The script downloads NuGet, installs [Microsoft.ArtifactSigning.Client](https://www.nuget.org/packages/Microsoft.ArtifactSigning.Client) (pinned version in the script), writes `artifact-signing-ci/metadata.json`, resolves **SignTool** under the Windows SDK, and exports `AZURE_METADATA_JSON`, `AZURE_CODE_SIGNING_DLIB`, and `WINDOWS_SIGNTOOL_PATH` to the job environment. The **Create Windows installers** step then passes `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and `AZURE_TENANT_ID` so the dlib can authenticate (see the package README — **DefaultAzureCredential** / environment variables).

#### What you must do in Azure (one-time)

1. Create an **[Artifact Signing](https://learn.microsoft.com/azure/artifact-signing/)** account in the correct **region**. Note the **endpoint** (region table in the [NuGet package README](https://www.nuget.org/packages/Microsoft.ArtifactSigning.Client)), **account name**, and **certificate profile name**.
2. In **Microsoft Entra ID**, register an **application** and create a **client secret**. Note **Application (client) ID**, **Directory (tenant) ID**, and the secret value.
3. In the Azure portal, open your **Artifact Signing account** → **Access control (IAM)** → grant that app registration a role such as **Artifact Signing Certificate Profile Signer** (exact name may vary; see current Microsoft docs).
4. Confirm **.NET 8** runtime is acceptable on the runner (GitHub-hosted `windows-latest` includes it).

#### What you must do in GitHub

**Repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|--------|
| `AZURE_CLIENT_ID` | App registration **Application (client) ID** |
| `AZURE_CLIENT_SECRET` | App registration **client secret** |
| `AZURE_TENANT_ID` | **Directory (tenant) ID** |

**Repository variables** (Settings → Secrets and variables → Actions → **Variables** tab):

| Variable | Example / note |
|----------|----------------|
| `AZURE_CODESIGNING_ENDPOINT` | `https://eus.codesigning.azure.net` — must match the region where the signing account was created |
| `AZURE_CODESIGNING_ACCOUNT_NAME` | Artifact Signing **account** name |
| `AZURE_CERTIFICATE_PROFILE_NAME` | **Certificate profile** name |

When all **three secrets** and **three variables** are set, the **Set up Azure Artifact Signing** step runs and signing uses **Trusted Signing** (PFX decode is skipped even if `WINDOWS_CERTIFICATE_PFX_B64` exists). If anything is missing, the workflow falls back to **PFX** when `WINDOWS_CERTIFICATE_PFX_B64` is set, or builds **unsigned**.

#### Troubleshooting CI

- **403 Forbidden** during signing: wrong **endpoint** for the account region, or the app lacks the signing role on the Artifact Signing account.
- **DLL / SignTool not found**: open an issue — the script expects `Azure.CodeSigning.Dlib.dll` under the NuGet package layout and SignTool under `C:\Program Files (x86)\Windows Kits\10\bin\<version>\x64\`.
- **Fork PRs**: secrets from the base repo are not available to workflows from forks; Windows jobs will usually build **unsigned** unless you use a different policy.

- **`AADSTS700016` / `unauthorized_client` / “Application with identifier '…' was not found in the directory '…'”** (often during `ClientSecretCredential` / `SignAsync`):
  - **`AZURE_CLIENT_ID`**, **`AZURE_TENANT_ID`**, and the client secret must all refer to the **same** Microsoft Entra ID (Azure AD) **tenant** and **one** app registration.
  - In **[Microsoft Entra admin center](https://entra.microsoft.com)** → **Identity** → **Applications** → **App registrations** → open **your** app (the one granted Artifact Signing access). Copy from **Overview**:
    - **Application (client) ID** → GitHub secret `AZURE_CLIENT_ID`
    - **Directory (tenant) ID** → GitHub secret `AZURE_TENANT_ID`
  - Create or rotate **Certificates & secrets** → **Client secret** → paste the **value** into `AZURE_CLIENT_SECRET` (secrets expire; an expired secret causes auth failures).
  - If the client ID was copied from a **different** directory, subscription, or app, or the tenant ID is from another organization, Entra returns **700016**. Re-paste all three values from the **same** app blade in the **same** tenant—do not mix IDs from the Artifact Signing resource blade with IDs from a different Entra tenant.
  - The display name **“Default Directory”** in the error is Microsoft’s label for the tenant you authenticated to; it does not mean you should use a literal string—your secret must still be the **GUID** for your organization’s directory that **contains** that app registration.

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
