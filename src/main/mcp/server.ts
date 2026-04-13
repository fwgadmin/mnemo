import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { INoteStore, MnemoUiPreferences, NoteListItem } from '../../shared/types';
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
