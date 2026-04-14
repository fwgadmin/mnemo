import * as path from 'path';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type {
  INoteStore,
  MnemoUiPreferences,
  NoteListItem,
  WorkspaceProfilesState,
  WorkspaceStorage,
} from '../../shared/types';
import { mergeAndWriteUiPreferencesAsync, readUiPreferencesMerged } from '../uiPreferences';
import { recomputeAutolinks } from '../autolinkRecompute';
import { refreshOutgoingLinksForNote, relocateWikilinksAfterTitleChange } from '../noteOutgoingLinks';
import {
  categoryPathFromTags,
  filterNotesByCategory,
  GENERAL_PATH,
  normalizePath,
} from '../../renderer/categoryPath';
import {
  exportCategoryTreeJson,
  setNoteCategory,
  renameCategoryFolder,
  promoteCategoryFolder,
  demoteCategoryFolder,
} from '../cliCategory';
import { readWorkspaceProfilesMerged } from '../workspaceProfilesSync';
import { openBootstrapNoteStoreForImport } from '../workspaceBootstrapStore';
import {
  applyWorkspaceRemovalDataPurge,
  archiveWorkspaceProfile,
  createWorkspaceProfile,
  deleteWorkspaceProfile,
  importFolderIntoWorkspaceProfile,
  renameWorkspaceProfile,
  setActiveWorkspace,
  setWorkspaceProfileStorage,
} from '../workspaceProfiles';
import { pickWorkspaceId, resolveWorkspaceSelector } from '../workspaceResolve';
import { resolveWorkspaceBootstrapRoot } from '../userConfig';
import { closeDedicatedStores, getGlobalStore, setActiveWorkspaceId } from '../storeResolver';

/** Shape for tools: pass exactly one of `id` or `ref` (validated in handler; MCP SDK needs a raw Zod shape). */
const idOrRefShape = {
  id: z.string().optional(),
  ref: z.number().int().positive().optional(),
};

function idOrRefError(args: { id?: string; ref?: number }): string | null {
  const hasId = args.id != null && args.id.length > 0;
  const hasRef = args.ref != null;
  if (hasId === hasRef) return 'Provide exactly one of id or ref';
  return null;
}

const workspaceStorageSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('inherit') }),
  z.object({
    mode: z.literal('sqlite'),
    dbPath: z.string().min(1),
    vaultPath: z.string().min(1),
  }),
  z.object({
    mode: z.literal('remote'),
    tursoUrl: z.string().optional(),
    tursoToken: z.string().optional(),
    libsqlUrl: z.string().optional(),
    libsqlAuthToken: z.string().optional(),
  }),
]);

function resolveWorkspaceTargetId(
  profiles: WorkspaceProfilesState,
  workspace_id: string,
): { ok: true; id: string } | { ok: false; message: string } {
  const sel = resolveWorkspaceSelector(profiles, workspace_id.trim());
  if (sel.kind === 'error') return { ok: false, message: sel.message };
  return { ok: true, id: pickWorkspaceId(profiles, sel) };
}

async function resolveToNoteId(
  store: INoteStore,
  args: { id?: string; ref?: number },
  tenantId: string,
): Promise<{ ok: true; id: string } | { ok: false; text: string }> {
  const hasId = args.id != null && args.id.length > 0;
  const hasRef = args.ref != null;
  if (hasId === hasRef) {
    return { ok: false, text: 'Provide exactly one of id or ref' };
  }
  if (hasId) {
    const n = await store.read(args.id!);
    if (!n) return { ok: false, text: `Note ${args.id} not found` };
    return { ok: true, id: n.id };
  }
  const n = await store.readByRef(args.ref!, tenantId);
  if (!n) return { ok: false, text: `No note with ref ${args.ref}` };
  return { ok: true, id: n.id };
}

export type StoreContextResolver = () => Promise<{
  store: INoteStore;
  tenantId: string;
  workspaceId: string;
}>;

function sortListLikeCli(notes: NoteListItem[]): NoteListItem[] {
  return [...notes].sort((a, b) => {
    const cmp = a.modified < b.modified ? 1 : a.modified > b.modified ? -1 : 0;
    if (cmp !== 0) return cmp;
    return (a.ref ?? 0) - (b.ref ?? 0);
  });
}

/**
 * Creates and configures the Mnemo MCP server.
 * Exposes notes as resources, CRUD + search as tools, and prompt templates.
 */
export function createMcpServer(
  storeOrResolver: INoteStore | StoreContextResolver,
): McpServer {
  const resolve: StoreContextResolver =
    typeof storeOrResolver === 'function'
      ? storeOrResolver
      : async () => ({
          store: storeOrResolver,
          tenantId: 'default',
          workspaceId: 'default',
        });

  const mcp = new McpServer(
    { name: 'mnemo', version: '0.1.0' },
    { capabilities: { resources: {}, tools: {}, prompts: {} } },
  );

  // ─── Resources ────────────────────────────────────────────

  // Static resource: list all notes
  mcp.resource(
    'notes-list',
    'mnemo://notes',
    { description: 'List of all notes in the vault', mimeType: 'application/json' },
    async () => {
      const { store, tenantId } = await resolve();
      return {
        contents: [{
          uri: 'mnemo://notes',
          mimeType: 'application/json',
          text: JSON.stringify(await store.list(tenantId), null, 2),
        }],
      };
    },
  );

  mcp.resource(
    'mnemo-preferences',
    'mnemo://preferences',
    {
      description:
        'Mnemo UI preferences (theme, layout, Markdown CSS overrides, category colors, IDE tabs, …) — merged from disk + Turso app_kv when connected; same shape as ui-preferences.json',
      mimeType: 'application/json',
    },
    async () => {
      const { store, workspaceId } = await resolve();
      return {
        contents: [{
          uri: 'mnemo://preferences',
          mimeType: 'application/json',
          text: JSON.stringify(await readUiPreferencesMerged(store, undefined, workspaceId), null, 2),
        }],
      };
    },
  );

  // Dynamic resource: read a single note by ID
  mcp.resource(
    'note',
    new ResourceTemplate('mnemo://notes/{id}', { list: undefined }),
    { description: 'A single note by ID', mimeType: 'text/markdown' },
    async (uri, variables) => {
      const { store } = await resolve();
      const id = String(variables.id);
      const note = await store.read(id);
      if (!note) {
        return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: `Note ${id} not found` }] };
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'text/markdown',
          text: `# ${note.title}\n\n${note.body}`,
        }],
      };
    },
  );

  // ─── Tools ────────────────────────────────────────────────

  mcp.tool(
    'create_note',
    'Create a new note in the vault. Optional tags: the first tag is the category folder (nested paths use /). Use the tag General for the General bucket; omit tags or leave the first tag empty for uncategorized notes (shown as Unassigned in the app when other categories exist).',
    {
      title: z.string(),
      body: z.string(),
      tags: z.array(z.string()).optional(),
      hideHeader: z.boolean().optional(),
    },
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      const note = await store.create({
        title: args.title,
        body: args.body,
        tags: args.tags,
        hideHeader: args.hideHeader,
        tenantId,
      });
      return { content: [{ type: 'text', text: JSON.stringify(note, null, 2) }] };
    },
  );

  mcp.tool(
    'read_note',
    'Read a note by UUID id or by numeric ref (same refs as list/show). Provide exactly one of id or ref.',
    idOrRefShape,
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      const bad = idOrRefError(args);
      if (bad) return { content: [{ type: 'text', text: bad }], isError: true };
      let note = null;
      if (args.id != null && args.id.length > 0) {
        note = await store.read(args.id);
        if (!note) {
          return { content: [{ type: 'text', text: `Note ${args.id} not found` }], isError: true };
        }
      } else if (args.ref != null) {
        note = await store.readByRef(args.ref, tenantId);
        if (!note) {
          return { content: [{ type: 'text', text: `No note with ref ${args.ref}` }], isError: true };
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify(note, null, 2) }] };
    },
  );

  const updateNoteShape = {
    ...idOrRefShape,
    title: z.string().optional(),
    body: z.string().optional(),
    tags: z.array(z.string()).optional(),
    hideHeader: z.boolean().optional(),
  };

  mcp.tool(
    'update_note',
    'Update an existing note (title, body, tags, hideHeader). Target by UUID id or numeric ref. The first tag is the category folder (same rules as create_note).',
    updateNoteShape,
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      const bad = idOrRefError(args);
      if (bad) return { content: [{ type: 'text', text: bad }], isError: true };
      const resolved = await resolveToNoteId(store, { id: args.id, ref: args.ref }, tenantId);
      if (!resolved.ok) {
        return { content: [{ type: 'text', text: resolved.text }], isError: true };
      }
      const before = await store.read(resolved.id);
      if (!before) {
        return { content: [{ type: 'text', text: `Note ${resolved.id} not found` }], isError: true };
      }
      const note = await store.update({
        id: resolved.id,
        title: args.title,
        body: args.body,
        tags: args.tags,
        hideHeader: args.hideHeader,
      });
      if (!note) {
        return { content: [{ type: 'text', text: `Note ${resolved.id} not found` }], isError: true };
      }
      const titleChanged =
        args.title !== undefined && before.title.trim() !== note.title.trim();
      if (titleChanged) {
        await relocateWikilinksAfterTitleChange(store, before.title, note.title, tenantId);
      } else if (args.body !== undefined) {
        await refreshOutgoingLinksForNote(store, note.id, tenantId);
      }
      return { content: [{ type: 'text', text: JSON.stringify(note, null, 2) }] };
    },
  );

  mcp.tool(
    'delete_note',
    'Delete a note by UUID id or numeric ref',
    idOrRefShape,
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      const bad = idOrRefError(args);
      if (bad) return { content: [{ type: 'text', text: bad }], isError: true };
      const resolved = await resolveToNoteId(store, args, tenantId);
      if (!resolved.ok) {
        return { content: [{ type: 'text', text: resolved.text }], isError: true };
      }
      const deleted = await store.delete(resolved.id);
      return {
        content: [{ type: 'text', text: deleted ? `Deleted ${resolved.id}` : `Note ${resolved.id} not found` }],
        isError: !deleted,
      };
    },
  );

  mcp.tool(
    'list_workspace_profiles',
    'List vault workspaces (merged disk + Turso app_kv when connected): activeWorkspaceId, names, storage, tombstones. Pair with switch_workspace, create_workspace, rename_workspace, set_workspace_storage, archive_workspace, delete_workspace for full management without the GUI.',
    {},
    async () => {
      const root = resolveWorkspaceBootstrapRoot();
      const store = getGlobalStore();
      const profiles = await readWorkspaceProfilesMerged(store ?? undefined, root);
      return { content: [{ type: 'text', text: JSON.stringify(profiles, null, 2) }] };
    },
  );

  mcp.tool(
    'rename_workspace',
    'Rename a vault’s display label (id unchanged; includes the default vault). Persists to workspace-profiles.json and mirrors to app_kv when using Turso.',
    { workspace_id: z.string(), name: z.string() },
    async (args) => {
      const root = resolveWorkspaceBootstrapRoot();
      const nm = args.name.trim();
      if (!nm) {
        return { content: [{ type: 'text', text: 'Empty name' }], isError: true };
      }
      const next = renameWorkspaceProfile(root, args.workspace_id.trim(), nm);
      if (!next) {
        return { content: [{ type: 'text', text: 'Unknown workspace or empty name.' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(next, null, 2) }] };
    },
  );

  mcp.tool(
    'switch_workspace',
    'Set the active vault on this machine (workspace-profiles.json only; not synced). Same as `mnemo workspace switch`.',
    { workspace_id: z.string() },
    async (args) => {
      const root = resolveWorkspaceBootstrapRoot();
      const store = getGlobalStore();
      const profiles = await readWorkspaceProfilesMerged(store ?? undefined, root);
      const res = resolveWorkspaceTargetId(profiles, args.workspace_id);
      if (!res.ok) {
        return { content: [{ type: 'text', text: res.message }], isError: true };
      }
      const next = setActiveWorkspace(root, res.id);
      if (!next) {
        return { content: [{ type: 'text', text: 'Unknown workspace.' }], isError: true };
      }
      setActiveWorkspaceId(next.activeWorkspaceId);
      return { content: [{ type: 'text', text: JSON.stringify(next, null, 2) }] };
    },
  );

  mcp.tool(
    'create_workspace',
    'Create a vault workspace. Optional import_folder imports markdown into the new tenant (same as GUI). Uses bootstrap Turso/local when the global store is unset.',
    {
      name: z.string(),
      import_folder: z.string().optional(),
    },
    async (args) => {
      const root = resolveWorkspaceBootstrapRoot();
      const name = args.name.trim();
      if (!name) {
        return { content: [{ type: 'text', text: 'Empty name' }], isError: true };
      }
      const { state, newId } = createWorkspaceProfile(root, name);
      const folder = args.import_folder?.trim();
      if (!folder) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ profiles: state, newWorkspaceId: newId }, null, 2) }],
        };
      }
      const gs = getGlobalStore();
      let importStore: INoteStore;
      let closeImportStore = false;
      if (gs) {
        importStore = gs;
      } else {
        importStore = await openBootstrapNoteStoreForImport(root, []);
        closeImportStore = true;
      }
      try {
        const stats = await importFolderIntoWorkspaceProfile(root, newId, path.resolve(folder), importStore);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  profiles: state,
                  newWorkspaceId: newId,
                  imported: stats.imported,
                  updated: stats.updated,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      } finally {
        if (closeImportStore) {
          try {
            importStore.close();
          } catch {
            /* ignore */
          }
        }
      }
    },
  );

  mcp.tool(
    'set_workspace_storage',
    'Edit where a workspace stores notes (inherit / sqlite / remote). Same as Settings → Storage; closes dedicated DB caches first.',
    {
      workspace_id: z.string(),
      storage: workspaceStorageSchema,
    },
    async (args) => {
      const root = resolveWorkspaceBootstrapRoot();
      const store = getGlobalStore();
      const profiles = await readWorkspaceProfilesMerged(store ?? undefined, root);
      const res = resolveWorkspaceTargetId(profiles, args.workspace_id);
      if (!res.ok) {
        return { content: [{ type: 'text', text: res.message }], isError: true };
      }
      const storage = args.storage as WorkspaceStorage;
      if (storage.mode === 'remote') {
        const url = (storage.tursoUrl || storage.libsqlUrl || '').trim();
        const tok = (storage.tursoToken || storage.libsqlAuthToken || '').trim();
        if (!url || !tok) {
          return {
            content: [{ type: 'text', text: 'remote storage requires a URL and token (turso/libsql fields).' }],
            isError: true,
          };
        }
      }
      closeDedicatedStores();
      const next = setWorkspaceProfileStorage(root, res.id, storage);
      if (!next) {
        return { content: [{ type: 'text', text: 'Unknown workspace.' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(next, null, 2) }] };
    },
  );

  mcp.tool(
    'archive_workspace',
    'Archive a vault: remove profile, purge notes, delete dedicated sqlite files when applicable (non-default, non-active, ≥2 vaults).',
    { workspace_id: z.string() },
    async (args) => {
      const root = resolveWorkspaceBootstrapRoot();
      const store = getGlobalStore();
      const profiles = await readWorkspaceProfilesMerged(store ?? undefined, root);
      const res = resolveWorkspaceTargetId(profiles, args.workspace_id);
      if (!res.ok) {
        return { content: [{ type: 'text', text: res.message }], isError: true };
      }
      const id = res.id;
      const entry = profiles.workspaces.find(w => w.id === id);
      const r = archiveWorkspaceProfile(root, id);
      if (!r) {
        return {
          content: [
            {
              type: 'text',
              text:
                'Cannot archive: switch to another workspace first, keep at least two vaults, and do not archive the default workspace.',
            },
          ],
          isError: true,
        };
      }
      if (entry) {
        await applyWorkspaceRemovalDataPurge(root, entry);
      }
      return { content: [{ type: 'text', text: JSON.stringify(r.state, null, 2) }] };
    },
  );

  mcp.tool(
    'delete_workspace',
    'Permanently delete a vault workspace (same constraints as archive).',
    { workspace_id: z.string() },
    async (args) => {
      const root = resolveWorkspaceBootstrapRoot();
      const store = getGlobalStore();
      const profiles = await readWorkspaceProfilesMerged(store ?? undefined, root);
      const res = resolveWorkspaceTargetId(profiles, args.workspace_id);
      if (!res.ok) {
        return { content: [{ type: 'text', text: res.message }], isError: true };
      }
      const id = res.id;
      const entry = profiles.workspaces.find(w => w.id === id);
      const r = deleteWorkspaceProfile(root, id);
      if (!r) {
        return {
          content: [
            {
              type: 'text',
              text:
                'Cannot delete: switch to another workspace first, keep at least two vaults, and do not delete the default workspace.',
            },
          ],
          isError: true,
        };
      }
      if (entry) {
        await applyWorkspaceRemovalDataPurge(root, entry);
      }
      return { content: [{ type: 'text', text: JSON.stringify(r.state, null, 2) }] };
    },
  );

  mcp.tool(
    'search_notes',
    'Full-text search across all notes',
    { query: z.string() },
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      const results = await store.search(args.query, tenantId);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );

  mcp.tool(
    'list_notes',
    'List notes with optional category filter and paging (same sort as CLI: modified desc, then ref). Omit categoryPath for all notes. Use page only with limit.',
    {
      categoryPath: z.string().optional(),
      includeDescendants: z.boolean().optional(),
      page: z.number().int().positive().optional(),
      limit: z.number().int().positive().optional(),
    },
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      const includeDescendants = args.includeDescendants ?? true;
      if (args.page != null && args.limit == null) {
        return {
          content: [{ type: 'text', text: 'list_notes: page requires limit' }],
          isError: true,
        };
      }
      let notes = await store.list(tenantId);
      if (args.categoryPath != null && args.categoryPath.trim() !== '') {
        const trimmed = args.categoryPath.trim();
        const folderPath = normalizePath(trimmed) || GENERAL_PATH;
        notes = filterNotesByCategory(notes, folderPath, includeDescendants);
      } else if (args.categoryPath != null) {
        notes = filterNotesByCategory(notes, GENERAL_PATH, includeDescendants);
      }
      const sorted = sortListLikeCli(notes);
      const total = sorted.length;
      let slice = sorted;
      if (args.limit != null) {
        const lim = args.limit;
        const page = args.page ?? 1;
        const start = (page - 1) * lim;
        slice = sorted.slice(start, start + lim);
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total,
                notes: slice.map((n) => ({
                  id: n.id,
                  ref: n.ref,
                  title: n.title,
                  modified: n.modified,
                  snippet: n.snippet,
                  tags: n.tags,
                  categoryPath: categoryPathFromTags(n.tags, sorted),
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  mcp.tool(
    'get_categories',
    'Category tree with note counts (same data as `mnemo note categories`). Use flat:true for path\\tdirect\\tsubtree style rows.',
    { flat: z.boolean().optional() },
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      const flat = args.flat ?? false;
      const notes = await store.list(tenantId);
      const tree = exportCategoryTreeJson(notes, flat);
      return { content: [{ type: 'text', text: JSON.stringify(tree, null, 2) }] };
    },
  );

  const setCategoryShape = {
    ...idOrRefShape,
    categoryPath: z.string(),
  };

  mcp.tool(
    'set_note_category',
    'Move a note to a category folder (General, Unassigned, or nested path like Work/Meetings). Same as `mnemo note set-category`. Preserves secondary tags.',
    setCategoryShape,
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      const bad = idOrRefError(args);
      if (bad) return { content: [{ type: 'text', text: bad }], isError: true };
      const resolved = await resolveToNoteId(store, { id: args.id, ref: args.ref }, tenantId);
      if (!resolved.ok) {
        return { content: [{ type: 'text', text: resolved.text }], isError: true };
      }
      const vaultList = await store.list(tenantId);
      try {
        await setNoteCategory(store, vaultList, resolved.id, args.categoryPath);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
      const note = await store.read(resolved.id);
      return { content: [{ type: 'text', text: JSON.stringify(note, null, 2) }] };
    },
  );

  mcp.tool(
    'rename_category',
    'Rename a category folder for all notes in that folder (same as `mnemo note category rename`).',
    { oldPath: z.string(), newPath: z.string() },
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      try {
        const r = await renameCategoryFolder(store, args.oldPath, args.newPath, { silent: true, tenantId });
        return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    },
  );

  mcp.tool(
    'promote_category',
    'Move a category one level toward General (`mnemo note category promote`).',
    { path: z.string() },
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      try {
        const r = await promoteCategoryFolder(store, args.path, { silent: true, tenantId });
        return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    },
  );

  mcp.tool(
    'demote_category',
    'Nest a category under a parent (`mnemo note category demote`).',
    { folderPath: z.string(), parentPath: z.string() },
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      try {
        const r = await demoteCategoryFolder(store, args.folderPath, args.parentPath, { silent: true, tenantId });
        return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    },
  );

  mcp.tool(
    'resolve_note_title',
    'Resolve a note title to its UUID (wikilink target resolution; first exact match in vault).',
    { title: z.string() },
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      const raw = args.title.trim();
      if (!raw) {
        return { content: [{ type: 'text', text: 'Empty title' }], isError: true };
      }
      const id = await store.resolveTitle(raw, tenantId);
      return {
        content: [{ type: 'text', text: JSON.stringify({ title: raw, id }, null, 2) }],
      };
    },
  );

  mcp.tool(
    'recompute_autolinks',
    'Recompute outgoing wikilinks for every note from [[Title]] and title-inference (same as `mnemo note autolink`).',
    { dryRun: z.boolean().optional() },
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      const dryRun = args.dryRun ?? false;
      const result = await recomputeAutolinks(store, dryRun, tenantId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  mcp.tool(
    'get_backlinks',
    'Get all notes that link to the given note (target by UUID id or numeric ref)',
    idOrRefShape,
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      const bad = idOrRefError(args);
      if (bad) return { content: [{ type: 'text', text: bad }], isError: true };
      const resolved = await resolveToNoteId(store, args, tenantId);
      if (!resolved.ok) {
        return { content: [{ type: 'text', text: resolved.text }], isError: true };
      }
      const backlinks = await store.getBacklinks(resolved.id);
      return { content: [{ type: 'text', text: JSON.stringify(backlinks, null, 2) }] };
    },
  );

  mcp.tool(
    'link_notes',
    'Set outgoing links from a source note to one or more target notes',
    { sourceId: z.string(), targetIds: z.array(z.string()) },
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      await store.updateLinks(args.sourceId, args.targetIds);
      return { content: [{ type: 'text', text: `Linked ${args.sourceId} → [${args.targetIds.join(', ')}]` }] };
    },
  );

  mcp.tool(
    'get_graph',
    'Get the full note graph (nodes and links)',
    {},
    async () => {
      const { store, tenantId } = await resolve();
      const [notes, links] = await Promise.all([store.list(tenantId), store.getAllLinks(tenantId)]);
      const graph = {
        nodes: notes.map((n: NoteListItem) => ({ id: n.id, title: n.title, ref: n.ref })),
        links,
      };
      return { content: [{ type: 'text', text: JSON.stringify(graph, null, 2) }] };
    },
  );

  const uiPrefFields = {
    themeId: z.string().optional(),
    layoutOverride: z.enum(['inherit', 'sidebar', 'top', 'ide']).optional(),
    showSidebar: z.boolean().optional(),
    showNoteHeader: z.boolean().optional(),
    showLineNumbers: z.boolean().optional(),
    showNoteRefs: z.boolean().optional(),
    grouped: z.boolean().optional(),
    categoryScopeSubtree: z.boolean().optional(),
    categoryColors: z.record(z.string(), z.string()).optional(),
    categoryColorStamps: z.record(z.string(), z.number()).optional(),
    markdownGlobal: z.record(z.string(), z.string()).optional(),
    markdownByTheme: z.record(z.string(), z.record(z.string(), z.string())).optional(),
    ideTabIds: z.array(z.string().uuid()).optional(),
  };

  mcp.tool(
    'get_ui_preferences',
    'Read merged UI preferences (disk + Turso app_kv when using cloud DB): theme, layout, Markdown CSS overrides (markdownGlobal / markdownByTheme), category colors, IDE tab order, etc. Same JSON as mnemo://preferences.',
    {},
    async () => {
      const { store, workspaceId } = await resolve();
      const prefs = await readUiPreferencesMerged(store, undefined, workspaceId);
      return { content: [{ type: 'text', text: JSON.stringify(prefs, null, 2) }] };
    },
  );

  mcp.tool(
    'set_ui_preferences',
    'Merge partial UI preferences into ui-preferences.json and mirror the full merged JSON to Turso app_kv (key ui_preferences) when the store is Turso. Markdown map keys must be valid (--mnemo-editor-*, --mnemo-syntax-*).',
    uiPrefFields,
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      const merged = await mergeAndWriteUiPreferencesAsync(
        args as Partial<MnemoUiPreferences>,
        undefined,
        store,
        workspaceId,
      );
      return { content: [{ type: 'text', text: JSON.stringify(merged, null, 2) }] };
    },
  );

  // ─── Prompts ──────────────────────────────────────────────

  mcp.prompt(
    'summarize_note',
    'Generate a concise summary of a note',
    { id: z.string() },
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      const note = await store.read(args.id);
      if (!note) {
        return {
          messages: [{
            role: 'user' as const,
            content: { type: 'text' as const, text: `Note ${args.id} not found.` },
          }],
        };
      }
      return {
        messages: [{
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Please summarize the following note titled "${note.title}":\n\n${note.body}`,
          },
        }],
      };
    },
  );

  mcp.prompt(
    'relate_notes',
    'Analyze relationships and commonalities between two notes',
    { id1: z.string(), id2: z.string() },
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      const [n1, n2] = await Promise.all([store.read(args.id1), store.read(args.id2)]);
      if (!n1 || !n2) {
        const missing = !n1 ? args.id1 : args.id2;
        return {
          messages: [{
            role: 'user' as const,
            content: { type: 'text' as const, text: `Note ${missing} not found.` },
          }],
        };
      }
      return {
        messages: [{
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Analyze the relationship between these two notes:\n`,
              `## Note 1: ${n1.title}`,
              n1.body,
              `\n## Note 2: ${n2.title}`,
              n2.body,
              `\nDescribe their shared themes, contradictions, and how they might be linked.`,
            ].join('\n'),
          },
        }],
      };
    },
  );

  mcp.prompt(
    'query_vault',
    'Ask a question using the full vault as context',
    { question: z.string() },
    async (args) => {
      const { store, tenantId, workspaceId } = await resolve();
      const notes = await store.list(tenantId);
      const summaries = notes.map(n => `- **${n.title}** (${n.id}): ${n.snippet}`).join('\n');
      return {
        messages: [{
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Given the following notes in the vault:\n`,
              summaries,
              `\nAnswer this question: ${args.question}`,
            ].join('\n'),
          },
        }],
      };
    },
  );

  return mcp;
}
