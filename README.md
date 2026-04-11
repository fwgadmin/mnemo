# Mnemo

A local-first notebook you can query from the terminal, the desktop, or over **MCP** — with optional **libSQL** (Turso or self-hosted) so the same vault syncs everywhere.

## Why this exists

Most note tools fail when you need to:

- capture something quickly mid-workflow
- find it again reliably
- reuse it from scripts, agents, or IDEs

Mnemo keeps a **stable ref** per note, **full-text search**, **wikilinks**, and a **category/folder** model (first tag = path). Data lives in **SQLite** locally with a **markdown mirror** under your vault directory, or in **remote libSQL** when you configure it.

## Features

- **Desktop app (Electron)** — Markdown editor, graph, **IDE layout with editor tabs** as the default (classic sidebar and top layouts in Settings), remote DB in Settings, background vault sync + manual reload (Turso), **F11** fullscreen on Linux/Windows
- **CLI** — `mnemo note …` for list/search/show/new/import, compose/edit in `$EDITOR`, categories, link graph, autolink; interactive list pager scrolls with selection
- **MCP** — stdio server (`mnemo mcp`) for Cursor / Claude Desktop (list/categories/ref-based tools, autolink, etc.); HTTP/SSE (`mnemo mcp-http`) for remote libSQL + bearer auth
- **Optional cloud** — same credentials in GUI Settings or env vars for CLI/MCP

## Quick start (CLI)

```bash
npm install -g mnemo-note
mnemo note list
mnemo note search "your query"
mnemo note new --title "Hello" --body "Markdown **here**." -c General
mnemo note show 1
```

`ref` in `show` is the **#** column from `note list` (not arbitrary IDs). See `**mnemo --help`** for every subcommand.

## Quick start (desktop)

```bash
git clone https://github.com/fwgadmin/mnemo.git
cd mnemo
npm install
npm start
```

Installers: [GitHub Releases](https://github.com/fwgadmin/mnemo/releases) (tagged `**v***` builds).

## Documentation


| Resource                                         | Contents                                                                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Help → Documentation** (in the app)            | Full GUI help: notes, wikilinks, categories, MCP tables, shortcuts                                                                                    |
| `**mnemo --help`**                               | Same facts as in-app documentation (paths, MCP resources/tools/prompts, note commands) — source: `[src/shared/userGuide.ts](src/shared/userGuide.ts)` |
| **[examples/](examples/README.md)**              | CLI local / libSQL, MCP stdio & HTTP, GUI + shared config                                                                                             |
| **[docs/CODE_SIGNING.md](docs/CODE_SIGNING.md)** | Optional Windows Authenticode signing in CI                                                                                                           |


## Using Mnemo with AI

- **MCP stdio** — add `mnemo` / `mcp` to your IDE’s MCP config ([examples/mcp-stdio.md](examples/mcp-stdio.md))
- **MCP HTTP** — for hosted setups with Turso + API key ([examples/mcp-http.md](examples/mcp-http.md))
- **Deterministic refs** — cite `ref` or titles in prompts; no vector DB required

## Philosophy

- Small surface area, batteries included for Markdown + links + search
- Same vault from GUI, CLI, and MCP when credentials align

## Status

Actively developed. Issues and PRs welcome.

## Contributing

PRs, issues, and feedback are welcome.

## About

Mnemo is built and maintained by [Ferrowood Group, LLC](https://www.ferrowoodgroup.com).

## License

This project is open source under the [MIT License](LICENSE). The same terms apply to the npm package `**mnemo-note`**.

### Publishing to npm (maintainers)

The registry name is `**mnemo-note`**; the binary remains `**mnemo`**.

1. `npm login`
2. Bump `**version**` in `package.json` for a new release
3. `**npm publish**` — `prepublishOnly` runs typecheck and builds CLI/MCP bundles into `dist/`
4. With npm **2FA**: `npm publish --otp=…`
5. Optional: `npm pack --dry-run` to inspect the tarball

**Desktop zips** on GitHub Releases come from the **Release** workflow when you push a `**v*`** tag, not from `npm publish`. The npm package ships `**bin/`**, `**dist/`**, `**LICENSE**`, `**README.md**`, and `**examples/**` (see `package.json` → `files`).

---

MIT © [Ferrowood Group, LLC](https://www.ferrowoodgroup.com)