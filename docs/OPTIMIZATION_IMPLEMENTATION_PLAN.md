# Mnemo Optimization and Enhancement Implementation Plan

Status: ready for execution  
Prepared from repository state: 2026-09-03  
Primary targets: Electron desktop, local SQLite, Turso/libSQL, MCP, CLI, and mobile parity

## Purpose

This document converts the current-state review into small, ordered tickets that a lower-reasoning implementation model can execute independently. Each ticket has a bounded scope, named files, explicit steps, required tests, and acceptance criteria.

Do not execute multiple tickets in one change unless a ticket explicitly says otherwise.

## Current baseline

- Root and mobile TypeScript checks pass.
- The production renderer compiles, with an initial entry size of approximately 2.44 MiB.
- There is no automated test suite.
- The working tree contains uncommitted user-requested features. Treat every existing modification and untracked file as user-owned work. Never reset, stash, overwrite, or discard it.
- Current high-risk areas are data lifecycle/sync semantics, Electron renderer privileges, storage-schema drift, autosave ordering, large list payloads, quadratic category processing, and monolithic orchestration files.

## Rules for every implementation ticket

1. Read the entire ticket and every named file before editing.
2. Inspect `git status --short` and `git diff -- <target files>` before editing.
3. Preserve unrelated edits. If a target file already has overlapping changes that cannot be preserved confidently, stop and report the overlap.
4. Use `apply_patch` for source edits.
5. Keep local SQLite and Turso behavior equivalent unless the ticket explicitly describes a backend-specific exception.
6. Update shared types before implementations and callers.
7. Do not add a new state-management framework or perform an unrelated rewrite.
8. Do not make destructive migration behavior the default. Back up data before schema changes.
9. Add or update tests in the same ticket as the behavior change.
10. Update `CHANGELOG.md` for user-visible changes. Update help/examples when commands, settings, or behavior change.
11. Run the ticket-specific checks, then the common checks.
12. Report changed files, test results, and any deferred risk. Do not claim success if an acceptance criterion is unmet.

Common checks:

```bash
npm run typecheck
npm run build:cli
npm run build:mcp
npm run build:mcp-http
npm run typecheck --prefix apps/mnemo-mobile
git diff --check
```

When renderer code changes, also compile the renderer to a temporary directory:

```bash
renderer_check_dir="$(mktemp -d /tmp/mnemo-renderer-check.XXXXXX)"
npx webpack-cli --config webpack.renderer.config.js \
  --entry ./src/renderer/index.tsx \
  --mode production \
  --output-path "$renderer_check_dir" \
  --output-filename renderer.js
```

## Execution order

Use the tickets in this exact order:

1. `MNE-001` test and CI foundation
2. `MNE-002` complete list/search contracts and safe row parsing
3. `MNE-003` canonical schema migrations and Markdown serialization
4. `MNE-004` reversible workspace archive
5. `MNE-005` deletion tombstones and exact link sync
6. `MNE-006` Electron and secret-storage hardening
7. `MNE-007` MCP HTTP workspace isolation and lifecycle
8. `MNE-008` lean list payloads and indexed queries
9. `MNE-009` linear category model
10. `MNE-010` atomic/coalesced note saves
11. `MNE-011` bulk category and deletion mutations
12. `MNE-012` efficient polling and renderer code splitting
13. `MNE-013` orchestration-file decomposition
14. Feature tickets `MNE-101` onward

Tickets may be stopped between any two items. Never skip directly to a dependent ticket.

---

## MNE-001 — Test and CI foundation

Priority: P0  
Risk: low  
Depends on: none

### Files

- `package.json`
- `package-lock.json`
- new `vitest.config.ts`
- new `src/**/*.test.ts` and `src/**/*.test.tsx`
- new `.github/workflows/validate.yml`
- mobile package configuration only if needed for its typecheck

### Steps

1. Add Vitest, jsdom, and React Testing Library as development dependencies.
2. Add `test`, `test:watch`, `test:desktop`, and `check` scripts.
3. Keep native-store tests separate from pure renderer/shared tests so Electron's `better-sqlite3` ABI does not break ordinary unit tests.
4. Add initial tests for:
   - `categoryPath.ts`
   - `categorySort.ts`
   - `categoryColorPalette.ts`
   - `fixedMenuPosition.ts`
   - `mediaMarkdown.ts`
   - `uiPreferences.ts` sanitization and merge behavior
   - workspace selector and `WorkspaceContextSession` isolation
   - wikilink extraction and link inference
5. Add a local-store integration test using an explicit temporary database and vault directory. Ensure cleanup targets only that generated temporary directory.
6. Add a Linux validation workflow that runs install, root/mobile typechecks, tests, and CLI/MCP/renderer builds on pull requests.

### Acceptance criteria

- `npm test` executes real tests and exits successfully.
- `npm run check` runs unit tests plus root/mobile typechecks.
- Tests prove that two workspace sessions can target different workspaces.
- The new CI workflow does not publish artifacts or mutate releases.

---

## MNE-002 — Complete data contracts and safe row parsing

Priority: P0  
Risk: low  
Depends on: `MNE-001`

### Files

- `src/shared/types.ts`
- `src/main/store/NoteStore.ts`
- `src/main/store/TursoNoteStore.ts`
- `src/renderer/App.tsx`
- `src/main/mcp/server.ts`
- `apps/mnemo-mobile/src/types.ts`
- `apps/mnemo-mobile/src/data/turso.ts`
- `apps/mnemo-mobile/src/sync/noteCache.ts`

### Steps

1. Give `SearchResult` the metadata needed to become a valid sidebar item: `tags`, `created`, `modified`, and `hideHeader`.
2. Return those fields from local, Turso, MCP, and mobile search implementations.
3. Remove renderer mappings that manufacture `created: ''`, `modified: ''`, or `tags: []`.
4. Add a shared safe tag parser that returns `[]` for malformed or non-array JSON and keeps only strings.
5. Replace direct `JSON.parse(row.tags)` calls on database rows with the safe parser.
6. Add contract tests for valid and malformed rows.

### Acceptance criteria

- Search results retain category and date information.
- Sorting a category after searching cannot encounter fabricated empty dates.
- Malformed tag JSON cannot crash listing, reading, search, or backlink retrieval.

---

## MNE-003 — Canonical migrations and Markdown serialization

Priority: P0  
Risk: medium  
Depends on: `MNE-002`

### Files

- `src/main/store/schema.sql`
- `src/main/store/NoteStore.ts`
- `src/main/store/TursoNoteStore.ts`
- new `src/main/store/migrations.ts`
- new `src/main/store/noteMarkdown.ts`
- mobile schema initialization files
- migration tests

### Steps

1. Introduce `schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`.
2. Represent every migration as an ordered, idempotent unit shared by local and Turso implementations.
3. Include `ref` and `hide_header` in the canonical current schema; migrate old databases without losing values.
4. Move note-to-Markdown frontmatter generation into one pure serializer.
5. Make local and Turso vault mirrors include the same `id`, `ref`, `title`, `tags`, `created`, `modified`, `tenantId`, and `hideHeader` fields.
6. Before migrating a local file database, create one timestamped backup beside it. Do not repeatedly back up the same schema version.
7. Test an empty database, a legacy database, repeated migration, and local/Turso serialization equality.

### Acceptance criteria

- Running migrations twice changes nothing the second time.
- Legacy notes, refs, links, and headers survive migration.
- Local and Turso write byte-equivalent Markdown for the same note.
- Migration failures leave the original local database recoverable.

---

## MNE-004 — Make workspace archive reversible

Priority: P0  
Risk: medium  
Depends on: `MNE-003`

### Files

- `src/shared/types.ts`
- `src/main/workspaceProfiles.ts`
- `src/main/workspaceProfilesSync.ts`
- `src/main/index.ts`
- `src/main/mcp/server.ts`
- `src/main/cli.ts`
- `src/renderer/components/WorkspaceSwitcher.tsx`
- `src/renderer/components/SettingsView.tsx`
- documentation and tests

### Steps

1. Add optional `archivedAt` to a workspace profile.
2. Change archive to mark the profile archived without purging its tenant, database, or vault.
3. Hide archived profiles from normal switching while retaining them in management views.
4. Add restore in GUI, CLI, and MCP.
5. Keep permanent deletion separate and explicitly destructive.
6. Preserve archived state through disk/cloud profile merges.

### Acceptance criteria

- Archiving never deletes note or file data.
- Restoring makes the workspace usable with all previous notes.
- Permanent deletion continues to require explicit confirmation and cannot target the active/default workspace.

---

## MNE-005 — Synchronize deletions and links correctly

Priority: P0  
Risk: high  
Depends on: `MNE-003`, `MNE-004`

### Files

- schema/migrations
- `src/shared/types.ts`
- both desktop stores
- `src/main/storePullRemote.ts`
- sync commands in `src/main/cli.ts`
- mobile Turso, cache, persistence, and outbox modules
- sync tests

### Steps

1. Add note tombstones containing note ID, tenant ID, and deletion timestamp.
2. Write a tombstone whenever a note is deleted.
3. Include tombstones in push/pull and mobile synchronization.
4. Apply the newest event by timestamp: a newer tombstone deletes a note; a newer note update supersedes an older tombstone.
5. Change link synchronization from additive insertion to exact replacement for each source note included in a sync payload.
6. Add a bounded tombstone-retention policy, but do not automatically purge tombstones until all supported clients understand them.
7. Add two-store tests covering create, update, delete, recreate, link addition, and link removal.

### Acceptance criteria

- A deleted note does not reappear after bidirectional sync.
- A removed link stays removed.
- Sync is idempotent.
- Older offline changes cannot silently overwrite a newer deletion.

---

## MNE-006 — Electron and secret-storage hardening

Priority: P0  
Risk: high  
Depends on: `MNE-001`

### Files

- `src/main/index.ts`
- `src/preload/index.ts`
- `src/renderer/global.d.ts`
- `src/renderer/index.html`
- `src/renderer/components/MarkdownNoteBody.tsx`
- `src/main/llm/llmConfig.ts`
- `src/main/userConfig.ts`
- `src/main/workspaceProfiles.ts`
- `src/main/storeResolver.ts`
- all LLM provider files

### Steps

1. Set Mermaid security to `strict`. Do not render unsanitized loose Mermaid SVG.
2. Add a production-compatible CSP permitting only resources the app actually needs.
3. Deny unexpected `will-navigate` events and window creation. Open approved `https:` links with `shell.openExternal`.
4. Enable the Electron renderer sandbox and verify the bundled preload still works.
5. Replace renderer-supplied arbitrary filesystem paths with main-process-issued opaque file capability IDs.
6. Only grant a capability after a native file picker or OS-open event. Reject unknown and expired capabilities.
7. Preserve external-file-tab UX. If a persisted tab is outside an approved workspace root, require user reauthorization instead of silently granting access.
8. Store credential files with owner-only permissions. Use Electron `safeStorage` for secrets when available, retaining an explicit migration path from plaintext.
9. Key cached dedicated stores by workspace/profile identity, not URL alone. Use per-workspace vault directories.
10. Add `AbortSignal.timeout` to all outbound LLM calls and return a clear timeout error.

### Acceptance criteria

- Renderer code cannot read or write an arbitrary path by inventing a string.
- Markdown and Mermaid cannot navigate or inject executable renderer content.
- Profiles sharing a URL but using different tokens never share a cached client.
- Existing stored credentials migrate without being displayed or logged.

---

## MNE-007 — MCP HTTP workspace isolation and lifecycle

Priority: P0  
Risk: medium  
Depends on: `MNE-006`

### Files

- `src/main/mcp/http.ts`
- `src/main/mcp/server.ts`
- `src/main/storeResolver.ts`
- MCP integration tests
- `examples/mcp-http.md`

### Steps

1. Create one `WorkspaceContextSession` per HTTP MCP transport.
2. Pass its resolver and session into `createMcpServer`.
3. Ensure `switch_workspace` changes only that transport.
4. Close the MCP server when its transport closes.
5. Add idle expiry and a configurable maximum session count.
6. Require authentication for diagnostics that expose session information.
7. Add request-size and request-time limits.
8. If the installed SDK supports its current Streamable HTTP transport, migrate from legacy SSE in a separate commit inside this ticket.

### Acceptance criteria

- Two HTTP clients can select different workspaces and concurrently list/create notes without crossover.
- Closing or expiring a transport releases its server and map entry.
- One client cannot change GUI, CLI, stdio, or another HTTP client's active workspace.

---

## MNE-008 — Lean note-list payloads and indexed queries

Priority: P1  
Risk: low  
Depends on: `MNE-003`

### Files

- canonical migrations
- both desktop stores
- `apps/mnemo-mobile/src/data/turso.ts`
- store benchmarks/tests

### Steps

1. Replace full-body list selection with SQL-generated snippets, such as `substr(body, 1, 120) AS snippet`.
2. Stop transferring full note bodies from Turso for list/sidebar operations.
3. Add indexes for tenant plus modified date, created date, and title.
4. Confirm query plans use the intended tenant indexes.
5. Add a benchmark fixture containing large bodies and embedded media strings.

### Acceptance criteria

- List payload growth depends on note count, not total body/media size.
- Existing list ordering and snippets remain compatible.
- Query-plan tests or documented `EXPLAIN QUERY PLAN` output show the new indexes are used.

---

## MNE-009 — Build the category model in linear time

Priority: P1  
Risk: medium  
Depends on: `MNE-001`

### Files

- `src/renderer/categoryPath.ts`
- `src/renderer/components/Sidebar.tsx`
- `src/renderer/components/IdeSolutionTree.tsx`
- corresponding mobile category-path code
- benchmarks/tests

### Steps

1. Compute whether the vault has assigned categories once.
2. Resolve each note's category once and retain the result in a category model.
3. Build parent-to-child adjacency maps instead of filtering all paths for every node.
4. Compute direct and subtree counts in one bottom-up pass.
5. Sort category children once during model construction.
6. Sort note arrays once in `Sidebar`; remove repeated sorting from `IdeSolutionTree`.
7. Share the pure category-model implementation with mobile where practical.
8. Benchmark 10,000 notes across 1,000 paths.

### Acceptance criteria

- Construction is approximately `O(notes + categories log categories)`.
- The IDE and classic grouped sidebars render identical folders, counts, colors, and note order.
- The benchmark records a material improvement without changing behavior.

---

## MNE-010 — Atomic and coalesced note saves

Priority: P1  
Risk: high  
Depends on: `MNE-002`, `MNE-005`

### Files

- `src/shared/types.ts`
- both stores
- `src/main/noteOutgoingLinks.ts`
- main IPC registration and preload API
- `src/renderer/App.tsx`
- `src/renderer/components/Editor.tsx`
- save tests

### Steps

1. Add a single `saveNote` service/API accepting note changes and an `expectedModified` or revision value.
2. In the main process, update the note, compute explicit/inferred links from one preloaded title index, replace links, and return the updated note plus list item.
3. For local SQLite, perform note and link writes in one transaction.
4. For Turso, use one bounded write batch and reject stale revisions.
5. Serialize saves per note in the renderer.
6. Coalesce queued saves so only the newest unsent body/title is written.
7. Flush the queue on explicit save, note switch, tab close, and application close.
8. Replace alerts with a persistent save/error indicator that permits retry.

### Acceptance criteria

- A normal autosave crosses IPC once.
- Rapid edits cannot finish out of order.
- Failed saves remain dirty and can be retried.
- Link graph state corresponds to the saved body.

---

## MNE-011 — Bulk category and deletion mutations

Priority: P1  
Risk: medium  
Depends on: `MNE-010`

### Files

- shared store interface and types
- both stores
- main IPC/preload
- `src/renderer/App.tsx`
- CLI/MCP category helpers where applicable
- tests

### Steps

1. Add bulk category-prefix move and bulk note-delete operations to `INoteStore`.
2. Validate every requested source/target path in the main process.
3. Use one SQLite transaction locally and bounded Turso batches remotely.
4. Update category colors, stamps, and sort modes through one pure key-remapping helper.
5. Replace renderer loops that issue one IPC call per note.
6. Refresh the sidebar once after completion.

### Acceptance criteria

- Rename, promote, demote, archive-category, and delete-category use one IPC operation each.
- Partial failures return structured results and do not leave silently mixed state.
- A 500-note operation uses bounded batches and one renderer refresh.

---

## MNE-012 — Efficient polling and renderer code splitting

Priority: P1  
Risk: medium  
Depends on: `MNE-008`, `MNE-010`

### Files

- `src/shared/types.ts`
- both stores' snapshot methods
- `src/renderer/App.tsx`
- optional-view components
- Webpack configuration if required
- performance notes/tests

### Steps

1. Split note, link, and app-preference fingerprints so each change reloads only its consumers.
2. Reuse the snapshot obtained by a polling tick; do not immediately request another snapshot after refresh.
3. Prevent overlapping ticks and add bounded exponential backoff after transient failures.
4. Pause network polling while hidden and run one immediate check when visible again.
5. Use `React.lazy`/dynamic imports for Graph, Help, Settings, Markdown Helper, and Mermaid rendering.
6. Load Mermaid only when the visible body actually contains a Mermaid fence.
7. Record production entry size before and after.
8. Prune irrelevant platform-specific libSQL binaries during packaging, with Windows and Linux packaging smoke checks.

### Acceptance criteria

- No duplicate snapshot request occurs per refresh.
- Polls cannot overlap.
- Note-only changes do not reload preferences or workspace profiles.
- Initial renderer JavaScript decreases by at least 35% from the 2.44 MiB baseline, or the ticket documents the measured blocker and largest remaining modules.

---

## MNE-013 — Decompose orchestration files

Priority: P2  
Risk: medium  
Depends on: `MNE-010`, `MNE-011`, `MNE-012`

### Files

- `src/renderer/App.tsx`
- `src/main/index.ts`
- `src/main/cli.ts`
- new focused hooks/services/IPC/command modules

### Steps

1. Extract renderer hooks: `useNoteSession`, `useWorkspaceSession`, `useUiPreferences`, and `useRemoteRefresh`.
2. Extract category mutations into a service/hook with no JSX.
3. Split main-process IPC registration by notes, files, preferences, LLM, and workspaces.
4. Split CLI subcommands into focused command modules; keep `cli.ts` as parsing/dispatch orchestration.
5. Move code without changing behavior. Avoid simultaneous UI redesign.
6. Keep all existing tests unchanged and add only boundary tests needed by extraction.

### Acceptance criteria

- `App.tsx` is below approximately 700 lines.
- `cli.ts` primarily performs parsing and dispatch.
- IPC domains can be tested independently.
- No user-visible behavior changes.

---

## Feature wave

Do not begin these until `MNE-001` through `MNE-012` are complete.

## MNE-101 — Content-addressed attachment store

Priority: P1 feature  
Risk: high

1. Store media separately from note Markdown using a SHA-256 asset ID, MIME type, size, and original filename.
2. Mirror assets beneath a workspace-specific `.attachments` directory.
3. Resolve assets through a safe custom protocol or capability API; never expose arbitrary filesystem paths.
4. Deduplicate identical assets.
5. Lazy-load remote assets and synchronize them independently of note-list payloads.
6. Preserve copy, paste, drag/drop, resize, alignment, move, modify, and delete controls.
7. Add a migration command for existing supported base64 data URLs. Keep the migration reversible until verified.

Acceptance: note lists and ordinary edits never transfer asset bytes; attachments render offline after synchronization; existing data-URL notes continue to render.

## MNE-102 — Trash and bounded revision history

Priority: P1 feature  
Risk: high

1. Make ordinary note deletion a soft delete visible in Trash.
2. Add restore and permanent delete.
3. Store bounded revisions on successful saves, deduplicating identical bodies.
4. Add revision comparison and restore.
5. Synchronize trash/revisions consistently with tombstones.

Acceptance: accidental deletion and recent overwrites are recoverable from desktop; permanent deletion remains explicit.

## MNE-103 — Advanced search and saved views

Priority: P2 feature  
Risk: medium

1. Add structured filters for category, tag, created date, modified date, and header visibility.
2. Add explicit sort and cursor/page parameters to storage, CLI, MCP, and desktop search.
3. Remove the hard-coded 50-result ceiling in favor of bounded pagination.
4. Add saved-search definitions scoped to a workspace.

Acceptance: the same query/filter semantics work in desktop, CLI, and MCP and are covered by contract tests.

## MNE-104 — First-class category records

Priority: P2 feature  
Risk: high

1. Persist categories independently from notes so empty categories survive.
2. Store parent relationship, color, sort mode, manual order, and archived state as category metadata.
3. Migrate existing first-tag paths and preference maps.
4. Keep first-tag compatibility for Markdown export and older clients.

Acceptance: categories can be created empty, reordered, renamed without one note update per item, and synchronized without path-key drift.

## MNE-105 — Stable wikilinks

Priority: P2 feature  
Risk: medium

1. Add ref- or UUID-backed link syntax while continuing to parse `[[Title]]`.
2. Let users disambiguate duplicate titles.
3. Render display text independently from the stable target.
4. Update rename behavior so stable links do not require body rewrites.

Acceptance: duplicate titles are linkable and renaming a target does not break stable links.

## MNE-106 — Shared desktop/mobile core

Priority: P2 architecture  
Risk: medium

1. Create a platform-neutral package for category paths/models, search parsing, wikilinks, link inference, colors, and row contracts.
2. Replace copied mobile implementations with imports from that package.
3. Keep filesystem, Electron, React Native, and database-client code outside the shared package.

Acceptance: duplicated pure logic is removed and the same test vectors run against desktop and mobile consumers.

## MNE-107 — Semantic search decision

Priority: P3 feature  
Risk: high

1. First decide whether semantic retrieval is a supported product feature.
2. If yes, define a provider-neutral embedding interface, background indexing, model/version invalidation, privacy controls, and an evaluation fixture before exposing UI.
3. If no, remove the unused embeddings table in a later migration rather than implying support.

Acceptance: either semantic search has measurable retrieval tests and documented privacy behavior, or unused schema is removed safely.

## Completion definition

The optimization program is complete when:

- all P0/P1 tickets meet their acceptance criteria;
- root and mobile typechecks, automated tests, and all builds pass in CI;
- local, Turso, CLI, MCP, desktop, and mobile contracts have explicit parity tests;
- sync propagates deletions and link removals;
- workspace archive is reversible;
- renderer file access is capability-scoped;
- autosave is ordered and retryable;
- note-list payloads exclude full bodies;
- category construction is linear apart from sorting;
- performance and bundle-size results are recorded in the repository.

## First action

Begin with `MNE-001` only. Before editing, confirm the current working tree is intentionally dirty and preserve it exactly. The first implementation response should contain:

1. the proposed test dependencies and scripts;
2. the exact initial test files;
3. the CI workflow outline;
4. confirmation that no existing user changes will be reset or overwritten.
