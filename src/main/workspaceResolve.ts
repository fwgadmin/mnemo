import type { WorkspaceProfilesState } from '../shared/types';

export type WorkspaceResolveResult =
  | { kind: 'active' }
  | { kind: 'id'; id: string }
  | { kind: 'error'; message: string };

/**
 * Resolve `--workspace` / `workspace switch` argument: numeric index (1-based) or profile id.
 */
export function resolveWorkspaceSelector(
  profiles: WorkspaceProfilesState,
  selector: string | null | undefined,
): WorkspaceResolveResult {
  const s = selector?.trim();
  if (!s) return { kind: 'active' };
  if (/^\d+$/.test(s)) {
    const idx = parseInt(s, 10);
    if (idx < 1 || idx > profiles.workspaces.length) {
      return {
        kind: 'error',
        message: `Workspace index out of range: ${s} (use 1–${profiles.workspaces.length})`,
      };
    }
    return { kind: 'id', id: profiles.workspaces[idx - 1]!.id };
  }
  const found = profiles.workspaces.some(w => w.id === s);
  if (!found) {
    return { kind: 'error', message: `Unknown workspace: ${s}` };
  }
  return { kind: 'id', id: s };
}

export function pickWorkspaceId(
  profiles: WorkspaceProfilesState,
  res: Exclude<WorkspaceResolveResult, { kind: 'error' }>,
): string {
  if (res.kind === 'active') return profiles.activeWorkspaceId;
  return res.id;
}
