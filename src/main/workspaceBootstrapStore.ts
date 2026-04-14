/**
 * Opens the bootstrap DB used to import markdown into a new inherit-mode workspace (CLI / MCP stdio).
 */
import * as path from 'path';
import type { INoteStore } from '../shared/types';
import { parseMcpStdioArgs } from './mcp/stdio-bootstrap';
import { resolveTursoCredentials } from './userConfig';
import { LocalNoteStore } from './store/NoteStore';
import { TursoNoteStore } from './store/TursoNoteStore';
import { getLocalWorkspaceDbPathsForCli } from './workspaceProfiles';

export async function openBootstrapNoteStoreForImport(
  root: string,
  argvTailForCredentials: string[],
): Promise<INoteStore> {
  const creds = resolveTursoCredentials(parseMcpStdioArgs(argvTailForCredentials));
  if (creds.tursoUrl?.trim() && creds.tursoToken?.trim()) {
    const turso = new TursoNoteStore(creds.tursoUrl!, creds.tursoToken!, path.join(root, 'vault'));
    await turso.initSchema();
    return turso;
  }
  const { dbPath, vaultPath } = getLocalWorkspaceDbPathsForCli();
  return new LocalNoteStore(dbPath, vaultPath);
}
