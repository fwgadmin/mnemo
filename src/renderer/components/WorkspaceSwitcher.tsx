import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceProfilesState } from '../../shared/types';

interface WorkspaceSwitcherProps {
  /** Bump to reload workspace list from main (e.g. after creating a vault). */
  refreshNonce: number;
  onNewVault: () => void;
  onManageVaults: () => void;
  /** After a successful vault switch: reload notes and prefs for the new workspace. */
  onWorkspaceChanged?: () => void | Promise<void>;
}

export default function WorkspaceSwitcher({
  refreshNonce,
  onNewVault,
  onManageVaults,
  onWorkspaceChanged,
}: WorkspaceSwitcherProps) {
  const [visible, setVisible] = useState(false);
  const [profiles, setProfiles] = useState<WorkspaceProfilesState | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await window.mnemo.workspaceProfiles.list();
    if (r.ok) {
      setProfiles(r.profiles);
    } else {
      setProfiles(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  useEffect(() => {
    if (!visible) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [visible]);

  if (!profiles) {
    return null;
  }

  const active = profiles.workspaces.find(w => w.id === profiles.activeWorkspaceId);
  const label = active?.name ?? profiles.activeWorkspaceId;

  return (
    <div ref={rootRef} className="relative flex items-center justify-end min-w-0 flex-1 pr-2 pl-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => setVisible(v => !v)}
        className="max-w-[min(100%,14rem)] flex items-center gap-1.5 px-2 h-6 rounded border border-mnemo-border bg-mnemo-panel-elevated text-xs text-mnemo-muted hover:text-mnemo-text hover:bg-mnemo-hover transition-colors disabled:opacity-50"
        title="Switch vault workspace"
      >
        <span className="truncate font-medium text-mnemo-text">{label}</span>
        <span className="text-[10px] text-mnemo-dim shrink-0">▾</span>
      </button>
      {visible && (
        <div className="absolute top-full right-0 mt-0 z-[100] min-w-[220px] max-w-[min(100vw-1rem,20rem)] bg-mnemo-panel-elevated border border-mnemo-border rounded shadow-xl py-1 text-xs">
          <div className="px-3 py-1.5 text-[10px] text-mnemo-dim uppercase tracking-wide border-b border-mnemo-border">
            Vault workspaces
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {profiles.workspaces.map(w => {
              const isActive = w.id === profiles.activeWorkspaceId;
              return (
                <li key={w.id}>
                  <button
                    type="button"
                    disabled={busy || isActive}
                    onClick={async () => {
                      if (isActive) return;
                      setBusy(true);
                      try {
                        const r = await window.mnemo.workspaceProfiles.switchTo(w.id);
                        if (!r.ok) {
                          console.error(r.error);
                        } else if (onWorkspaceChanged) {
                          await onWorkspaceChanged();
                        }
                      } finally {
                        setBusy(false);
                        setVisible(false);
                      }
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-mnemo-hover transition-colors ${
                      isActive ? 'text-emerald-500/90' : 'text-mnemo-muted'
                    } disabled:opacity-60`}
                  >
                    <span className="font-medium text-mnemo-text">{w.name}</span>
                    <span className="block font-mono text-[10px] text-mnemo-dim truncate">{w.id}</span>
                    {isActive ? <span className="text-[10px]">active</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-mnemo-border py-1">
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-mnemo-muted hover:bg-mnemo-hover"
              onClick={() => {
                setVisible(false);
                onNewVault();
              }}
            >
              New vault workspace…
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-mnemo-muted hover:bg-mnemo-hover"
              onClick={() => {
                setVisible(false);
                onManageVaults();
              }}
            >
              Manage vaults in Settings…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
