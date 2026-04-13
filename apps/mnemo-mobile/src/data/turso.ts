/**
 * Turso / libSQL access — mirrors desktop [TursoNoteStore] query shapes.
 */
/** Use `/web` so Metro never bundles `node.js` → `sqlite3.js` (native `libsql` + `node:buffer`). */
import { createClient, type Client } from '@libsql/client/web';
import { randomUUID } from '../lib/randomUUID';
import type { CreateNoteInput, Note, NoteListItem, SearchResult, UpdateNoteInput } from '../types';
import { ftsMatchFromUserQuery, likeWordsFromUserQuery, snippetForSearchResult } from '../lib/searchQuery';

function isTenantRefUniqueConstraint(err: unknown): boolean {
  const parts: string[] = [];
  if (err instanceof Error) {
    parts.push(err.message);
    const c = (err as Error & { cause?: unknown }).cause;
    if (c instanceof Error) parts.push(c.message);
  } else parts.push(String(err));
  const msg = parts.join(' ');
  return msg.includes('UNIQUE constraint failed') && (msg.includes('notes.ref') || msg.includes('tenant_id'));
}

export function createTursoClient(url: string, authToken: string): Client {
  return createClient({ url, authToken });
}

async function loadOutgoingLinkIds(client: Client, sourceId: string): Promise<string[]> {
  const r = await client.execute({
    sql: 'SELECT target_id FROM note_links WHERE source_id = ?',
    args: [sourceId],
  });
  return r.rows.map(row => row['target_id'] as string);
}

function rowToNote(id: string, row: Record<string, unknown>, links: string[]): Note {
  return {
    id,
    ref: row['ref'] as number,
    title: row['title'] as string,
    body: row['body'] as string,
    tags: JSON.parse(row['tags'] as string),
    created: row['created_at'] as string,
    modified: row['updated_at'] as string,
    tenantId: row['tenant_id'] as string,
    links,
    hideHeader: ((row['hide_header'] as number) ?? 0) === 1,
  };
}

export async function getNote(client: Client, id: string): Promise<Note | null> {
  const result = await client.execute({
    sql: 'SELECT * FROM notes WHERE id = ?',
    args: [id],
  });
  const row = result.rows[0];
  if (!row) return null;
  const links = await loadOutgoingLinkIds(client, id);
  return rowToNote(id, row as Record<string, unknown>, links);
}

export async function listNotes(client: Client, tenantId: string = 'default'): Promise<NoteListItem[]> {
  const result = await client.execute({
    sql: `SELECT ref, id, title, body, tags, updated_at, hide_header
          FROM notes WHERE tenant_id = ? ORDER BY updated_at DESC`,
    args: [tenantId],
  });
  return result.rows.map(row => ({
    ref: row['ref'] as number,
    id: row['id'] as string,
    title: row['title'] as string,
    tags: JSON.parse(row['tags'] as string),
    modified: row['updated_at'] as string,
    snippet: (row['body'] as string).substring(0, 120),
    hideHeader: ((row['hide_header'] as number) ?? 0) === 1,
  }));
}

export async function resolveTitle(
  client: Client,
  title: string,
  tenantId: string = 'default',
): Promise<string | null> {
  const result = await client.execute({
    sql: 'SELECT id FROM notes WHERE title = ? AND tenant_id = ? LIMIT 1',
    args: [title, tenantId],
  });
  const row = result.rows[0];
  return row ? (row['id'] as string) : null;
}

export async function searchNotes(
  client: Client,
  query: string,
  tenantId: string = 'default',
): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const fts = ftsMatchFromUserQuery(query);
  if (!fts) return [];

  const mapRow = (row: Record<string, unknown>, rank: number): SearchResult => ({
    ref: row['ref'] as number,
    id: row['id'] as string,
    title: row['title'] as string,
    snippet: snippetForSearchResult(
      row['title'] as string,
      row['body'] as string,
      query,
    ),
    rank,
    hideHeader: ((row['hide_header'] as number) ?? 0) === 1,
  });

  try {
    const result = await client.execute({
      sql: `SELECT n.ref, n.id, n.title, n.body, n.hide_header, notes_fts.rank
            FROM notes_fts
            JOIN notes n ON n.rowid = notes_fts.rowid
            WHERE notes_fts MATCH ?
              AND n.tenant_id = ?
            ORDER BY notes_fts.rank
            LIMIT 50`,
      args: [fts, tenantId],
    });
    return result.rows.map(row => mapRow(row as Record<string, unknown>, row['rank'] as number));
  } catch {
    const words = likeWordsFromUserQuery(query);
    if (words.length === 0) return [];
    const conds = words
      .map(() => '(INSTR(LOWER(title), LOWER(?)) > 0 OR INSTR(LOWER(body), LOWER(?)) > 0)')
      .join(' AND ');
    const args: string[] = [tenantId];
    for (const w of words) {
      args.push(w, w);
    }
    const result = await client.execute({
      sql: `SELECT ref, id, title, body, hide_header FROM notes
            WHERE tenant_id = ? AND ${conds}
            LIMIT 50`,
      args,
    });
    return result.rows.map((row, i) => mapRow(row as Record<string, unknown>, i));
  }
}

export async function getBacklinks(client: Client, noteId: string): Promise<NoteListItem[]> {
  const result = await client.execute({
    sql: `SELECT n.ref, n.id, n.title, n.body, n.tags, n.updated_at
          FROM note_links nl
          JOIN notes n ON n.id = nl.source_id
          WHERE nl.target_id = ?
          ORDER BY n.updated_at DESC`,
    args: [noteId],
  });
  return result.rows.map(row => ({
    ref: row['ref'] as number,
    id: row['id'] as string,
    title: row['title'] as string,
    tags: JSON.parse(row['tags'] as string),
    modified: row['updated_at'] as string,
    snippet: (row['body'] as string).substring(0, 120),
  }));
}

export async function updateLinks(client: Client, sourceId: string, targetIds: string[]): Promise<void> {
  const statements = [
    { sql: 'DELETE FROM note_links WHERE source_id = ?', args: [sourceId] },
    ...targetIds.map(targetId => ({
      sql: 'INSERT OR IGNORE INTO note_links (source_id, target_id) VALUES (?, ?)',
      args: [sourceId, targetId],
    })),
  ];
  await client.batch(statements, 'write');
}

export async function createNote(client: Client, input: CreateNoteInput): Promise<Note> {
  const now = new Date().toISOString();
  const id = input.id?.trim() || randomUUID();
  const tenantId = input.tenantId ?? 'default';
  const tags = input.tags ?? [];
  const hideHeader = input.hideHeader ? 1 : 0;

  const sql = `INSERT INTO notes (id, title, body, tags, tenant_id, created_at, updated_at, ref, hide_header)
    VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(ref), 0) + 1 FROM notes AS n WHERE n.tenant_id = ?), ?)`;
  const args = [
    id,
    input.title,
    input.body,
    JSON.stringify(tags),
    tenantId,
    now,
    now,
    tenantId,
    hideHeader,
  ];

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await client.execute({ sql, args });
      break;
    } catch (e) {
      if (attempt < 7 && isTenantRefUniqueConstraint(e)) {
        await new Promise(r => setTimeout(r, 15 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }

  const note = await getNote(client, id);
  if (!note) throw new Error('createNote: inserted row not read back');
  return note;
}

export async function updateNote(client: Client, input: UpdateNoteInput): Promise<Note | null> {
  const existing = await getNote(client, input.id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const title = input.title ?? existing.title;
  const body = input.body ?? existing.body;
  const tags = input.tags ?? existing.tags;
  const hideHeader = input.hideHeader !== undefined ? input.hideHeader : existing.hideHeader;

  await client.execute({
    sql: `UPDATE notes SET title = ?, body = ?, tags = ?, updated_at = ?, hide_header = ? WHERE id = ?`,
    args: [title, body, JSON.stringify(tags), now, hideHeader ? 1 : 0, input.id],
  });

  const note = await getNote(client, input.id);
  return note;
}

export async function deleteNote(client: Client, id: string): Promise<boolean> {
  const result = await client.execute({
    sql: 'DELETE FROM notes WHERE id = ?',
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}

/** Mirrors desktop TursoNoteStore — same key as `ui-preferences` cloud sync (`ui_preferences`). */
export async function getAppKv(client: Client, key: string): Promise<string | null> {
  const r = await client.execute({
    sql: 'SELECT value FROM app_kv WHERE key = ?',
    args: [key],
  });
  return (r.rows[0]?.['value'] as string) ?? null;
}

export async function setAppKv(client: Client, key: string, value: string): Promise<void> {
  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO app_kv (key, value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [key, value, now],
  });
}
