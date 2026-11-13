/**
 * Repair for a layout conflict between the CLI and the desktop app.
 *
 * The canonical layout keeps the shared ("inherit") database at `<root>/mnemo.db` with its Markdown mirror at
 * `<root>/vault`; the desktop app and the CLI both open it there. Older CLI builds also ran a "legacy flat →
 * nested" move on every note/sync command, relocating `<root>/mnemo.db`, `<root>/vault`, `config.json` and
 * `ui-preferences.json` into `<root>/workspaces/default/` and then opening a new, empty `<root>/mnemo.db`.
 * The desktop app kept reading the flat path, so notes appeared to vanish (nothing was deleted).
 *
 * This module moves or merges that misplaced data back. It never deletes: the nested copy is archived under
 * `<root>/workspaces/_migrated/<stamp>/`.
 */
import * as fs from 'fs';
import * as path from 'path';
import { LocalNoteStore } from './store/NoteStore';
import { copyMissingAttachments, readLocalNotesAndLinksForSync } from './storePullRemote';
import { DEFAULT_WORKSPACE_ID, readWorkspaceProfilesFile } from './workspaceProfiles';

export interface LayoutRecoveryResult {
  action: 'none' | 'moved' | 'merged';
  notes?: number;
  attachments?: number;
  archivedTo?: string;
}

const DB_SIDE_FILES = ['', '-wal', '-shm'];
const SETTINGS_FILES = ['config.json', 'ui-preferences.json'];

function moveIfAbsent(src: string, dest: string): boolean {
  if (!fs.existsSync(src) || fs.existsSync(dest)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(src, dest);
  return true;
}

/** Move Markdown files and attachment copies from `fromVault` into `toVault` where missing. */
function mergeVaultFiles(fromVault: string, toVault: string): void {
  if (!fs.existsSync(fromVault)) return;
  for (const entry of fs.readdirSync(fromVault, { withFileTypes: true })) {
    const src = path.join(fromVault, entry.name);
    const dest = path.join(toVault, entry.name);
    if (entry.isDirectory()) mergeVaultFiles(src, dest);
    else moveIfAbsent(src, dest);
  }
}

function archiveDir(root: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(root, 'workspaces', '_migrated', stamp, `${DEFAULT_WORKSPACE_ID}-misplaced-by-cli`);
}

/**
 * True when `<root>/workspaces/default/mnemo.db` exists but is not a dedicated SQLite workspace's own database
 * (a dedicated `sqlite` workspace whose `dbPath` points there is a legitimate layout and is left alone).
 */
export function hasMisplacedDefaultDatabase(root: string): boolean {
  const nestedDb = path.join(root, 'workspaces', DEFAULT_WORKSPACE_ID, 'mnemo.db');
  if (!fs.existsSync(nestedDb)) return false;
  const profiles = readWorkspaceProfilesFile(root);
  for (const w of profiles.workspaces) {
    const s = w.storage;
    if (s?.mode === 'sqlite' && path.resolve(s.dbPath) === path.resolve(nestedDb)) return false;
  }
  return true;
}

/** Idempotent; safe to call on every desktop start and CLI command before any store is opened. */
export async function recoverMisplacedDefaultWorkspace(root: string): Promise<LayoutRecoveryResult> {
  if (!hasMisplacedDefaultDatabase(root)) return { action: 'none' };

  const nestedDir = path.join(root, 'workspaces', DEFAULT_WORKSPACE_ID);
  const nestedDb = path.join(nestedDir, 'mnemo.db');
  const flatDb = path.join(root, 'mnemo.db');
  const flatVault = path.join(root, 'vault');
  const defaultEntry = readWorkspaceProfilesFile(root).workspaces.find(w => w.id === DEFAULT_WORKSPACE_ID);
  // A remote default workspace keeps its own Markdown mirror in workspaces/default/vault — leave that in place.
  const nestedVaultIsMisplaced = (defaultEntry?.storage?.mode ?? 'inherit') !== 'remote';

  for (const name of SETTINGS_FILES) moveIfAbsent(path.join(nestedDir, name), path.join(root, name));

  if (!fs.existsSync(flatDb)) {
    for (const suffix of DB_SIDE_FILES) moveIfAbsent(nestedDb + suffix, flatDb + suffix);
    if (nestedVaultIsMisplaced) {
      if (!moveIfAbsent(path.join(nestedDir, 'vault'), flatVault)) mergeVaultFiles(path.join(nestedDir, 'vault'), flatVault);
    }
    return { action: 'moved' };
  }

  // Both exist: merge nested into flat with the normal sync rules (newest wins, tombstones, exact links,
  // collision-safe refs, hash-verified attachments), then archive the nested copy.
  const { notes, links, tombstones } = readLocalNotesAndLinksForSync(nestedDb);
  const target = new LocalNoteStore(flatDb, flatVault);
  const source = new LocalNoteStore(nestedDb, '');
  let attachments = 0;
  try {
    attachments = (await copyMissingAttachments(source, target)).copied;
    await target.importNotesFromRemote(notes, links, tombstones);
  } finally {
    source.close();
    target.close();
  }
  if (nestedVaultIsMisplaced) mergeVaultFiles(path.join(nestedDir, 'vault'), flatVault);

  const archive = archiveDir(root);
  fs.mkdirSync(archive, { recursive: true });
  for (const suffix of DB_SIDE_FILES) moveIfAbsent(nestedDb + suffix, path.join(archive, 'mnemo.db' + suffix));
  for (const name of fs.readdirSync(nestedDir)) {
    if (/^mnemo\.db\.backup-v\d+-/.test(name)) moveIfAbsent(path.join(nestedDir, name), path.join(archive, name));
  }
  if (nestedVaultIsMisplaced) moveIfAbsent(path.join(nestedDir, 'vault'), path.join(archive, 'vault'));
  try {
    if (fs.readdirSync(nestedDir).length === 0) fs.rmdirSync(nestedDir);
  } catch {
    /* leave the directory */
  }
  return { action: 'merged', notes: notes.length, attachments, archivedTo: archive };
}
