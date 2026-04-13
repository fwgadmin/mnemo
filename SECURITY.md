# Security

## Reporting

Please report security vulnerabilities via [GitHub Security Advisories](https://github.com/fwgadmin/mnemo/security/advisories/new) or by opening a **private** issue if advisories are unavailable.

## Secrets and configuration

- **Do not commit** `.env` files, API keys, Turso/libSQL tokens, or signing certificates. The repository `.gitignore` excludes `.env`, `.env.*`, `certificate.pfx`, and common log paths.
- **User credentials** (database URL, token) are entered in the app or CLI and stored locally; they are not embedded in this source tree.
- **`eas.json`** may contain **Apple Team ID** and **App Store Connect app id** (`ascAppId`) for EAS Submit automation. These identify your Apple developer account and app listing; they are **not** authentication secrets, but treat the repository access model like any other CI config.

## CI / GitHub Actions

Windows release signing uses GitHub **encrypted secrets** (`WINDOWS_CERTIFICATE_*`); certificate material is not stored in git.

## Audits

Before releases, scan for accidental secrets (e.g. `git grep` for token-like strings) and ensure no personal machine paths or one-off credentials were pasted into docs or config.
