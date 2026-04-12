/**
 * Import / sync markdown files from a workspace folder into the vault (category `Workspace/…`).
 */
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const matter = require('gray-matter');
import type { INoteStore } from '../shared/types';
import { tagsForCategoryPath } from './cliCategory';

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'out',
  '.next',
  'target',
]);

export interface WorkspaceSyncResult {
  imported: number;
  updated: number;
}

function workspaceCategoryTag(rootAbs: string, absFile: string): string {
  const relDir = path.relative(rootAbs, path.dirname(absFile));
  if (!relDir || relDir === '.') return 'Workspace';
  const posix = relDir.split(path.sep).join('/');
  return `Workspace/${posix}`;
}

function parseMdBody(raw: string, fallbackTitle: string): { title: string; body: string } {
  const parsed = matter(raw);
  const title =
    (typeof parsed.data?.title === 'string' && parsed.data.title.trim()) || fallbackTitle;
  const body = typeof parsed.content === 'string' ? parsed.content.trim() : '';
  return { title, body };
}

function walkMarkdownFiles(rootAbs: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootAbs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const abs = path.join(rootAbs, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIR_NAMES.has(ent.name)) continue;
      walkMarkdownFiles(abs, out);
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) {
      out.push(abs);
    }
  }
}

function loadMap(mapPath: string): Record<string, string> {
  try {
    const raw = fs.readFileSync(mapPath, 'utf-8');
    const j = JSON.parse(raw) as { version?: number; files?: Record<string, string> };
    if (j.files && typeof j.files === 'object') return j.files;
  } catch {
    /* missing */
  }
  return {};
}

function saveMap(mapPath: string, files: Record<string, string>): void {
  fs.mkdirSync(path.dirname(mapPath), { recursive: true });
  fs.writeFileSync(mapPath, JSON.stringify({ version: 1, files }, null, 2), 'utf-8');
}

/**
 * Sync all markdown files recursively under rootAbs into the store.
 * Relative paths (posix) map to note ids in workspace-import-map.json.
 */
export async function syncWorkspaceFolder(
  store: INoteStore,
  rootAbs: string,
  mapPath: string,
  /** When set, new/updated notes use this tenant (inherit workspaces). */
  tenantId?: string,
): Promise<WorkspaceSyncResult> {
  const rootResolved = path.resolve(rootAbs);
  if (!fs.existsSync(rootResolved) || !fs.statSync(rootResolved).isDirectory()) {
    throw new Error(`Not a directory: ${rootResolved}`);
  }

  const filesAbs: string[] = [];
  walkMarkdownFiles(rootResolved, filesAbs);
  filesAbs.sort((a, b) => a.localeCompare(b));

  const map = loadMap(mapPath);
  let imported = 0;
  let updated = 0;

  const seen = new Set<string>();

  for (const abs of filesAbs) {
    const rel = path.relative(rootResolved, abs).split(path.sep).join('/');
    seen.add(rel);
    let raw: string;
    try {
      raw = fs.readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }
    const ext = path.extname(abs);
    const fallbackTitle = path.basename(abs, ext) || 'Untitled';
    const { title, body } = parseMdBody(raw, fallbackTitle);
    const cat = workspaceCategoryTag(rootResolved, abs);
    const tags = tagsForCategoryPath(cat, []);

    const existingId = map[rel];
    if (existingId) {
      const existing = await store.read(existingId);
      if (existing) {
        await store.update({ id: existingId, title, body, tags });
        updated++;
        continue;
      }
      delete map[rel];
    }

    const created = await store.create({ title, body, tags, tenantId });
    map[rel] = created.id;
    imported++;
  }

  for (const rel of Object.keys(map)) {
    if (!seen.has(rel)) {
      delete map[rel];
    }
  }

  saveMap(mapPath, map);
  return { imported, updated };
}
