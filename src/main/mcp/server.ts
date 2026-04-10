import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { INoteStore, MnemoUiPreferences } from '../../shared/types';
import { mergeAndWriteUiPreferencesAsync, readUiPreferencesMerged } from '../uiPreferences';

/**
 * Creates and configures the Mnemo MCP server.
 * Exposes notes as resources, CRUD + search as tools, and prompt templates.
 */
export function createMcpServer(store: INoteStore): McpServer {
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
    async () => ({
      contents: [{
        uri: 'mnemo://notes',
        mimeType: 'application/json',
        text: JSON.stringify(await store.list(), null, 2),
      }],
    }),
  );

  mcp.resource(
    'mnemo-preferences',
    'mnemo://preferences',
    {
      description:
        'Mnemo UI preferences (theme, layout, Markdown CSS overrides, category colors, IDE tabs, …) — merged from disk + Turso app_kv when connected; same shape as ui-preferences.json',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [{
        uri: 'mnemo://preferences',
        mimeType: 'application/json',
        text: JSON.stringify(await readUiPreferencesMerged(store), null, 2),
      }],
    }),
  );

  // Dynamic resource: read a single note by ID
  mcp.resource(
    'note',
    new ResourceTemplate('mnemo://notes/{id}', { list: undefined }),
    { description: 'A single note by ID', mimeType: 'text/markdown' },
    async (uri, variables) => {
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
      const note = await store.create({
        title: args.title,
        body: args.body,
        tags: args.tags,
        hideHeader: args.hideHeader,
      });
      return { content: [{ type: 'text', text: JSON.stringify(note, null, 2) }] };
    },
  );

  mcp.tool(
    'read_note',
    'Read a note by ID',
    { id: z.string() },
    async (args) => {
      const note = await store.read(args.id);
      if (!note) {
        return { content: [{ type: 'text', text: `Note ${args.id} not found` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(note, null, 2) }] };
    },
  );

  mcp.tool(
    'update_note',
    'Update an existing note (title, body, tags, hideHeader). The first tag is the category folder (same rules as create_note).',
    {
      id: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      tags: z.array(z.string()).optional(),
      hideHeader: z.boolean().optional(),
    },
    async (args) => {
      const note = await store.update({
        id: args.id,
        title: args.title,
        body: args.body,
        tags: args.tags,
        hideHeader: args.hideHeader,
      });
      if (!note) {
        return { content: [{ type: 'text', text: `Note ${args.id} not found` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(note, null, 2) }] };
    },
  );

  mcp.tool(
    'delete_note',
    'Delete a note by ID',
    { id: z.string() },
    async (args) => {
      const deleted = await store.delete(args.id);
      return {
        content: [{ type: 'text', text: deleted ? `Deleted ${args.id}` : `Note ${args.id} not found` }],
        isError: !deleted,
      };
    },
  );

  mcp.tool(
    'search_notes',
    'Full-text search across all notes',
    { query: z.string() },
    async (args) => {
      const results = await store.search(args.query);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );

  mcp.tool(
    'get_backlinks',
    'Get all notes that link to the given note',
    { id: z.string() },
    async (args) => {
      const backlinks = await store.getBacklinks(args.id);
      return { content: [{ type: 'text', text: JSON.stringify(backlinks, null, 2) }] };
    },
  );

  mcp.tool(
    'link_notes',
    'Set outgoing links from a source note to one or more target notes',
    { sourceId: z.string(), targetIds: z.array(z.string()) },
    async (args) => {
      await store.updateLinks(args.sourceId, args.targetIds);
      return { content: [{ type: 'text', text: `Linked ${args.sourceId} → [${args.targetIds.join(', ')}]` }] };
    },
  );

  mcp.tool(
    'get_graph',
    'Get the full note graph (nodes and links)',
    {},
    async () => {
      const [notes, links] = await Promise.all([store.list(), store.getAllLinks()]);
      const graph = {
        nodes: notes.map(n => ({ id: n.id, title: n.title, ref: n.ref })),
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
    markdownGlobal: z.record(z.string(), z.string()).optional(),
    markdownByTheme: z.record(z.string(), z.record(z.string(), z.string())).optional(),
    ideTabIds: z.array(z.string().uuid()).optional(),
  };

  mcp.tool(
    'get_ui_preferences',
    'Read merged UI preferences (disk + Turso app_kv when using cloud DB): theme, layout, Markdown CSS overrides (markdownGlobal / markdownByTheme), category colors, IDE tab order, etc. Same JSON as mnemo://preferences.',
    {},
    async () => {
      const prefs = await readUiPreferencesMerged(store);
      return { content: [{ type: 'text', text: JSON.stringify(prefs, null, 2) }] };
    },
  );

  mcp.tool(
    'set_ui_preferences',
    'Merge partial UI preferences into ui-preferences.json and mirror the full merged JSON to Turso app_kv (key ui_preferences) when the store is Turso. Markdown map keys must be valid (--mnemo-editor-*, --mnemo-syntax-*).',
    uiPrefFields,
    async (args) => {
      const merged = await mergeAndWriteUiPreferencesAsync(args as Partial<MnemoUiPreferences>, undefined, store);
      return { content: [{ type: 'text', text: JSON.stringify(merged, null, 2) }] };
    },
  );

  // ─── Prompts ──────────────────────────────────────────────

  mcp.prompt(
    'summarize_note',
    'Generate a concise summary of a note',
    { id: z.string() },
    async (args) => {
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
      const notes = await store.list();
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
