import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { INoteStore } from '../../shared/types';

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
    'Create a new note in the vault',
    { title: z.string(), body: z.string(), tags: z.array(z.string()).optional() },
    async (args) => {
      const note = await store.create({ title: args.title, body: args.body, tags: args.tags });
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
    'Update an existing note (title, body, and/or tags)',
    {
      id: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      tags: z.array(z.string()).optional(),
    },
    async (args) => {
      const note = await store.update({ id: args.id, title: args.title, body: args.body, tags: args.tags });
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
        nodes: notes.map(n => ({ id: n.id, title: n.title })),
        links,
      };
      return { content: [{ type: 'text', text: JSON.stringify(graph, null, 2) }] };
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
