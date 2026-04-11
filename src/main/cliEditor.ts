/**
 * External editor for mnemo compose / edit (nano, $EDITOR, etc.).
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** argv[0] is the binary; remaining args are passed before the file path. */
export function resolveEditor(): string[] {
  const raw =
    process.env.MNEMO_EDITOR?.trim() ||
    process.env.VISUAL?.trim() ||
    process.env.EDITOR?.trim();
  if (raw) {
    return raw.split(/\s+/).filter(Boolean);
  }
  if (process.platform === 'win32') {
    return ['notepad.exe'];
  }
  return ['nano'];
}

/** Run editor on a file; stdio inherited (full-screen). Returns exit code (0 = ok). */
export function runEditorForPath(filePath: string): number {
  const parts = resolveEditor();
  const bin = parts[0]!;
  const extra = parts.slice(1);
  const r = spawnSync(bin, [...extra, filePath], {
    stdio: 'inherit',
    env: process.env,
  });
  if (r.error) {
    console.error(r.error.message);
    return 1;
  }
  return r.status ?? 1;
}

/**
 * First line = title; blank second line separates title from body; if no blank line,
 * everything after line 1 is the body.
 */
export function parseTitleBodyFile(content: string): { title: string; body: string } {
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const title = (lines[0] ?? '').trim();
  if (lines.length <= 1) {
    return { title: title || 'Untitled', body: '' };
  }
  if (lines[1] === '') {
    return { title: title || 'Untitled', body: lines.slice(2).join('\n') };
  }
  return { title: title || 'Untitled', body: lines.slice(1).join('\n') };
}

export function formatTitleBodyFile(title: string, body: string): string {
  return `${title}\n\n${body}`;
}

export function createTempNoteFile(initialTitle: string, initialBody: string): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-compose-'));
  const file = path.join(dir, 'note.md');
  fs.writeFileSync(file, formatTitleBodyFile(initialTitle, initialBody), 'utf8');
  return { dir, file };
}

export function removeTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
