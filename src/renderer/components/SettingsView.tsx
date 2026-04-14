import { useEffect, useState } from 'react';
import type { AppConfig, SyncResult, WorkspaceProfilesState, WorkspaceStorage } from '../../shared/types';
import { THEMES, type LayoutPreset } from '../theme/themes';
import MarkdownEditorSettings from './MarkdownEditorSettings';

type LayoutOverride = 'inherit' | LayoutPreset;

const SETTINGS_TABS = [
  { id: 'general' as const, label: 'General' },
  { id: 'markdown' as const, label: 'Markdown' },
  { id: 'workspace' as const, label: 'Workspace' },
  { id: 'database' as const, label: 'Database' },
];
type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

interface Props {
  onClose: () => void;
  onSaved?: () => void;
  /** Reload notes and merged prefs after switching vault workspace from this screen. */
  onWorkspaceChanged?: () => void | Promise<void>;
  themeId: string;
  onThemeIdChange: (id: string) => void;
  layoutOverride: LayoutOverride;
  onLayoutOverrideChange: (v: LayoutOverride) => void;
  showNoteRefs: boolean;
  onShowNoteRefsChange: (v: boolean) => void;
  markdownGlobal: Record<string, string>;
  markdownByTheme: Record<string, Record<string, string>>;
  onMarkdownGlobalChange: (v: Record<string, string>) => void;
  onMarkdownThemeChange: (themeId: string, v: Record<string, string>) => void;
}

export default function SettingsView({
  onClose,
  onSaved,
  onWorkspaceChanged,
  themeId,
  onThemeIdChange,
  layoutOverride,
  onLayoutOverrideChange,
  showNoteRefs,
  onShowNoteRefsChange,
  markdownGlobal,
  markdownByTheme,
  onMarkdownGlobalChange,
  onMarkdownThemeChange,
}: Props) {
  const [markdownScope, setMarkdownScope] = useState<'global' | 'theme'>('global');
  const lightUi = themeId.startsWith('light');
  const successMsgClass = lightUi ? 'text-emerald-800' : 'text-emerald-300';

  const [tursoUrl, setTursoUrl]     = useState('');
  const [tursoToken, setTursoToken] = useState('');
  const [showToken, setShowToken]   = useState(false);
  const [storeType, setStoreType]   = useState<'turso' | 'local' | null>(null);
  const [saving, setSaving]         = useState(false);
  const [syncingPush, setSyncingPush] = useState(false);
  const [syncingPull, setSyncingPull] = useState(false);
  const [syncPushResult, setSyncPushResult] = useState<SyncResult | null>(null);
  const [syncPullResult, setSyncPullResult] = useState<SyncResult | null>(null);
  const [status, setStatus]         = useState<{ ok: boolean; msg: string } | null>(null);
  const [workspaceFolder, setWorkspaceFolder] = useState('');
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [vaultProfiles, setVaultProfiles] = useState<WorkspaceProfilesState | null>(null);
  const [storageEditId, setStorageEditId] = useState<string | null>(null);
  const [storageDraft, setStorageDraft] = useState<WorkspaceStorage>({ mode: 'inherit' });
  const [newVaultName, setNewVaultName] = useState('');
  const [newVaultImportFolder, setNewVaultImportFolder] = useState<string | null>(null);
  const [vaultProfileBusy, setVaultProfileBusy] = useState(false);
  const [renameEditId, setRenameEditId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('general');

  useEffect(() => {
    (async () => {
      const [cfg, type, prefs, vp] = await Promise.all([
        window.mnemo.config.read(),
        window.mnemo.config.storeType(),
        window.mnemo.preferences.read(),
        window.mnemo.workspaceProfiles.list(),
      ]);
      setTursoUrl(cfg.tursoUrl ?? cfg.libsqlUrl ?? '');
      setTursoToken(cfg.tursoToken ?? cfg.libsqlAuthToken ?? '');
      setStoreType(type);
      setWorkspaceFolder(prefs.workspaceFolder ?? '');
      if (vp.ok) {
        setVaultProfiles(vp.profiles);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const cfg: AppConfig = {
        tursoUrl:   tursoUrl.trim()   || undefined,
        tursoToken: tursoToken.trim() || undefined,
      };
      await window.mnemo.config.save(cfg);
      const type = await window.mnemo.config.storeType();
      setStoreType(type);
      setStatus({
        ok: true,
        msg:
          type === 'turso'
            ? 'Connected to remote libSQL database — loading notes…'
            : 'Saved — using local SQLite.',
      });
      onSaved?.();
      // Close settings so the reloaded note list is immediately visible
      setTimeout(() => onClose(), 800);
    } catch (e) {
      setStatus({ ok: false, msg: `Failed to save: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setTursoUrl('');
    setTursoToken('');
    setSaving(true);
    setStatus(null);
    try {
      await window.mnemo.config.save({});
      setStoreType('local');
      setStatus({ ok: true, msg: 'Credentials cleared — using local SQLite.' });
      onSaved?.();
      setTimeout(() => onClose(), 800);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-mnemo-panel text-mnemo-muted">
      <div className="shrink-0 px-6 pt-6 pb-3 border-b border-mnemo-border">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h1 className="text-xl font-semibold text-mnemo-text">Settings</h1>
          <button
            type="button"
            onClick={onClose}
            className="text-mnemo-dim hover:text-mnemo-text transition-colors text-lg leading-none shrink-0"
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>
        <nav className="flex flex-wrap gap-1" aria-label="Settings sections">
          {SETTINGS_TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={settingsTab === t.id}
              onClick={() => setSettingsTab(t.id)}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors border border-transparent ${
                settingsTab === t.id
                  ? 'bg-mnemo-panel-elevated text-mnemo-text border-mnemo-border shadow-sm'
                  : 'text-mnemo-dim hover:text-mnemo-text hover:bg-mnemo-hover'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {status && (
        <div
          className={`shrink-0 px-6 py-2.5 text-xs border-b border-mnemo-border ${
            status.ok
              ? lightUi
                ? 'bg-emerald-50/90 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-200'
                : 'bg-emerald-950/35 text-emerald-200'
              : lightUi
                ? 'bg-red-50 text-red-900'
                : 'bg-red-950/40 text-red-300'
          }`}
        >
          {status.msg}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
      {settingsTab === 'general' && (
      <>
      <section className="mb-2 max-w-2xl">
        <h2 className="text-sm font-semibold text-mnemo-muted uppercase tracking-widest mb-4">Appearance</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-mnemo-dim mb-1.5" htmlFor="theme-preset">Theme</label>
            <select
              id="theme-preset"
              value={themeId}
              onChange={e => onThemeIdChange(e.target.value)}
              className="w-full bg-mnemo-panel-elevated border border-mnemo-border rounded px-3 py-2 text-sm text-mnemo-text focus:outline-none focus:border-mnemo-border-strong"
            >
              {THEMES.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-mnemo-dim mt-2 leading-relaxed">
              Themes use CSS variables; &quot;Dark (top bar)&quot; uses horizontal navigation; &quot;Dark/Light (IDE)&quot; uses a wide editor column with the sidebar. You can override layout below.
            </p>
          </div>
          <div>
            <label className="block text-xs text-mnemo-dim mb-1.5" htmlFor="layout-override">Layout</label>
            <select
              id="layout-override"
              value={layoutOverride}
              onChange={e => onLayoutOverrideChange(e.target.value as LayoutOverride)}
              className="w-full bg-mnemo-panel-elevated border border-mnemo-border rounded px-3 py-2 text-sm text-mnemo-text focus:outline-none focus:border-mnemo-border-strong"
            >
              <option value="inherit">Match theme</option>
              <option value="sidebar">Classic sidebar</option>
              <option value="top">Top navigation</option>
              <option value="ide">IDE (sidebar + editor)</option>
            </select>
          </div>
        </div>
      </section>

      <section className="mb-8 max-w-lg">
        <h2 className="text-sm font-semibold text-mnemo-muted uppercase tracking-widest mb-4">Editor</h2>
        <label className="flex items-start gap-3 text-sm text-mnemo-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showNoteRefs}
            onChange={e => onShowNoteRefsChange(e.target.checked)}
            className="mt-0.5 rounded border-mnemo-border"
          />
          <span>
            <span className="block text-mnemo-text">Show note index numbers</span>
            <span className="block text-xs text-mnemo-dim mt-1 leading-relaxed">
              Displays stable #refs in the note list and graph (same numbers as the CLI). Off by default.
            </span>
          </span>
        </label>
        <p className="text-xs text-mnemo-dim mt-4 leading-relaxed">
          <span className="text-mnemo-muted">Categories:</span>{' '}
          In the sidebar, <strong>right-click</strong> a category header (grouped view or IDE Explorer) for{' '}
          <strong>Rename</strong>, <strong>Promote</strong> (move up one level), <strong>Demote</strong> (nest under a
          parent — including moving <strong>General</strong> under another folder), <strong>suggested colors</strong>, a{' '}
          <strong>custom color</strong> control, or <strong>Clear folder color</strong>. Top-level folders line up
          flat; only nested paths are indented. Subfolders inherit a
          parent color until you set their own. Colors apply to folder labels and note titles; the IDE layout uses the same
          accent on the active note in the list.
        </p>
      </section>
      </>
      )}

      {settingsTab === 'markdown' && (
      <section className="mb-2 max-w-2xl">
        <h2 className="text-sm font-semibold text-mnemo-muted uppercase tracking-widest mb-4">Markdown appearance</h2>
        <MarkdownEditorSettings
          scope={markdownScope}
          onScopeChange={setMarkdownScope}
          themeName={(THEMES.find(t => t.id === themeId) ?? THEMES[0])!.name}
          values={markdownScope === 'global' ? markdownGlobal : (markdownByTheme[themeId] ?? {})}
          onValuesChange={next => {
            if (markdownScope === 'global') onMarkdownGlobalChange(next);
            else onMarkdownThemeChange(themeId, next);
          }}
          onReset={() => {
            if (markdownScope === 'global') onMarkdownGlobalChange({});
            else onMarkdownThemeChange(themeId, {});
          }}
        />
      </section>
      )}

      {settingsTab === 'workspace' && (
      <>
      <section className="mb-8 max-w-2xl">
        <h2 className="text-sm font-semibold text-mnemo-muted uppercase tracking-widest mb-4">Workspace folder</h2>
        <p className="text-xs text-mnemo-dim mb-4 leading-relaxed">
          Point Mnemo at a directory of markdown files. Notes are imported under{' '}
          <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">Workspace/…</code> categories (mirroring
          subfolders). Use <strong className="text-mnemo-muted">Sync</strong> or <strong className="text-mnemo-muted">Reload Note List</strong> to
          pull changes from disk.
        </p>
        <div className="text-xs font-mono text-mnemo-text bg-mnemo-panel-elevated border border-mnemo-border rounded px-3 py-2 break-all min-h-[2rem]">
          {workspaceFolder || '— none —'}
        </div>
        <div className="flex flex-wrap gap-3 mt-4">
          <button
            type="button"
            disabled={workspaceBusy}
            onClick={async () => {
              setWorkspaceBusy(true);
              try {
                const r = await window.mnemo.workspace.chooseFolder();
                if (r.ok) {
                  setWorkspaceFolder(r.path);
                  setStatus({ ok: true, msg: `Workspace set — imported ${r.imported}, updated ${r.updated}.` });
                  onSaved?.();
                }
              } finally {
                setWorkspaceBusy(false);
              }
            }}
            className="px-4 py-1.5 bg-mnemo-panel-elevated hover:bg-mnemo-hover border border-mnemo-border-strong rounded text-sm text-mnemo-text transition-colors disabled:opacity-50"
          >
            {workspaceBusy ? '…' : 'Choose folder…'}
          </button>
          <button
            type="button"
            disabled={workspaceBusy || !workspaceFolder.trim()}
            onClick={async () => {
              setWorkspaceBusy(true);
              try {
                const r = await window.mnemo.workspace.sync();
                if (r.ok) {
                  setStatus({ ok: true, msg: `Synced — imported ${r.imported}, updated ${r.updated}.` });
                  onSaved?.();
                } else {
                  setStatus({ ok: false, msg: r.error });
                }
              } finally {
                setWorkspaceBusy(false);
              }
            }}
            className="px-4 py-1.5 bg-mnemo-panel-elevated hover:bg-mnemo-hover border border-mnemo-border-strong rounded text-sm text-mnemo-text transition-colors disabled:opacity-50"
          >
            Sync now
          </button>
          <button
            type="button"
            disabled={workspaceBusy || !workspaceFolder.trim()}
            onClick={async () => {
              setWorkspaceBusy(true);
              try {
                await window.mnemo.preferences.save({ workspaceFolder: '' });
                setWorkspaceFolder('');
                setStatus({ ok: true, msg: 'Workspace folder cleared.' });
              } finally {
                setWorkspaceBusy(false);
              }
            }}
            className="px-4 py-1.5 border border-mnemo-border rounded text-sm text-mnemo-dim hover:text-mnemo-text hover:bg-mnemo-hover transition-colors disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </section>

      {vaultProfiles && (
        <section className="mb-8 max-w-2xl">
          <h2 className="text-sm font-semibold text-mnemo-muted uppercase tracking-widest mb-4">Vault workspaces</h2>
          <p className="text-xs text-mnemo-dim mb-4 leading-relaxed">
            By default, workspaces share one database and are isolated by <strong className="text-mnemo-muted">tenant id</strong>{' '}
            (same as workspace id). You can optionally give a workspace its own SQLite files or libSQL URL in{' '}
            <strong className="text-mnemo-muted">Storage</strong>. Switching workspaces updates the note list immediately
            when using the shared connection; dedicated databases switch without restarting the app.{' '}
            <strong className="text-mnemo-muted">Archive</strong> / <strong className="text-mnemo-muted">Delete</strong>{' '}
            remove the profile and purge that workspace’s notes (dedicated SQLite: deletes the DB and vault folder). You need
            at least two vaults, and you cannot archive or delete the active or Default vault. Use <strong className="text-mnemo-muted">Rename</strong> to
            change the default vault’s label (or any vault; the id stays fixed). The <strong className="text-mnemo-muted">Workspace folder</strong> block above syncs markdown into the{' '}
            <strong className="text-mnemo-muted">current</strong> workspace.
          </p>
          <ul className="space-y-2 mb-4">
            {vaultProfiles.workspaces.map(w => {
              const canRemoveVault =
                w.id !== 'default' &&
                w.id !== vaultProfiles.activeWorkspaceId &&
                vaultProfiles.workspaces.length > 1;
              const st = w.storage?.mode ?? 'inherit';
              return (
                <li
                  key={w.id}
                  className="flex flex-col gap-2 text-xs text-mnemo-muted bg-mnemo-panel-elevated border border-mnemo-border rounded px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="text-mnemo-text font-medium">{w.name}</span>
                    <span className="ml-2 font-mono text-[10px] text-mnemo-dim break-all">{w.id}</span>
                    {w.id === vaultProfiles.activeWorkspaceId ? (
                      <span className="ml-2 text-emerald-500/90">active</span>
                    ) : null}
                    <span className="ml-2 text-[10px] text-mnemo-dim">storage: {st}</span>
                  </span>
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    {w.id !== vaultProfiles.activeWorkspaceId ? (
                      <button
                        type="button"
                        disabled={vaultProfileBusy}
                        onClick={async () => {
                          setVaultProfileBusy(true);
                          try {
                            const r = await window.mnemo.workspaceProfiles.switchTo(w.id);
                            if (!r.ok) {
                              setStatus({ ok: false, msg: r.error });
                            } else if (onWorkspaceChanged) {
                              await onWorkspaceChanged();
                            }
                          } finally {
                            setVaultProfileBusy(false);
                          }
                        }}
                        className="px-2 py-1 rounded border border-mnemo-border-strong text-mnemo-text hover:bg-mnemo-hover disabled:opacity-50"
                      >
                        Switch…
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={vaultProfileBusy}
                      onClick={() => {
                        setRenameEditId(renameEditId === w.id ? null : w.id);
                        setRenameDraft(w.name);
                        setStorageEditId(null);
                      }}
                      className="px-2 py-1 rounded border border-mnemo-border text-mnemo-dim hover:text-mnemo-text hover:bg-mnemo-hover disabled:opacity-50"
                    >
                      Rename…
                    </button>
                    <button
                      type="button"
                      disabled={vaultProfileBusy}
                      onClick={() => {
                        setStorageEditId(storageEditId === w.id ? null : w.id);
                        setStorageDraft(w.storage ?? { mode: 'inherit' });
                        setRenameEditId(null);
                      }}
                      className="px-2 py-1 rounded border border-mnemo-border text-mnemo-dim hover:text-mnemo-text hover:bg-mnemo-hover disabled:opacity-50"
                    >
                      Storage…
                    </button>
                    {canRemoveVault ? (
                      <>
                        <button
                          type="button"
                          disabled={vaultProfileBusy}
                          onClick={async () => {
                            if (
                              !window.confirm(
                                `Archive workspace “${w.name}”? Notes for this workspace will be removed from the database (and dedicated files deleted if applicable).`,
                              )
                            ) {
                              return;
                            }
                            setVaultProfileBusy(true);
                            try {
                              const r = await window.mnemo.workspaceProfiles.archiveVault(w.id);
                              if (r.ok) {
                                setVaultProfiles(r.profiles);
                                setStatus({ ok: true, msg: `Archived “${w.name}”.` });
                              } else {
                                setStatus({ ok: false, msg: r.error });
                              }
                            } finally {
                              setVaultProfileBusy(false);
                            }
                          }}
                          className="px-2 py-1 rounded border border-amber-700/50 text-amber-700 dark:text-amber-400 hover:bg-mnemo-hover disabled:opacity-50"
                        >
                          Archive
                        </button>
                        <button
                          type="button"
                          disabled={vaultProfileBusy}
                          onClick={async () => {
                            if (
                              !window.confirm(
                                `Permanently delete vault “${w.name}” and all notes in it? This cannot be undone.`,
                              )
                            ) {
                              return;
                            }
                            setVaultProfileBusy(true);
                            try {
                              const r = await window.mnemo.workspaceProfiles.deleteVault(w.id);
                              if (r.ok) {
                                setVaultProfiles(r.profiles);
                                setStatus({ ok: true, msg: `Deleted vault “${w.name}”.` });
                              } else {
                                setStatus({ ok: false, msg: r.error });
                              }
                            } finally {
                              setVaultProfileBusy(false);
                            }
                          }}
                          className="px-2 py-1 rounded border border-red-700/50 text-red-700 dark:text-red-400 hover:bg-mnemo-hover disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </div>
                  </div>
                  {renameEditId === w.id ? (
                    <div className="pl-1 pt-2 border-t border-mnemo-border space-y-2 w-full max-w-xl">
                      <div className="text-[10px] text-mnemo-dim uppercase tracking-wide">Rename vault</div>
                      <input
                        type="text"
                        value={renameDraft}
                        onChange={e => setRenameDraft(e.target.value)}
                        className="w-full bg-mnemo-panel border border-mnemo-border rounded px-2 py-1.5 text-mnemo-text text-sm"
                        autoFocus
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={vaultProfileBusy || !renameDraft.trim()}
                          onClick={async () => {
                            setVaultProfileBusy(true);
                            try {
                              const r = await window.mnemo.workspaceProfiles.renameVault(w.id, renameDraft.trim());
                              if (r.ok) {
                                setVaultProfiles(r.profiles);
                                setRenameEditId(null);
                                setStatus({ ok: true, msg: `Renamed to “${renameDraft.trim()}”.` });
                              } else {
                                setStatus({ ok: false, msg: r.error });
                              }
                            } finally {
                              setVaultProfileBusy(false);
                            }
                          }}
                          className="px-3 py-1.5 rounded bg-mnemo-accent text-mnemo-on-accent text-xs font-medium"
                        >
                          Save name
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenameEditId(null)}
                          className="px-3 py-1.5 rounded border border-mnemo-border text-xs text-mnemo-dim hover:text-mnemo-text"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {storageEditId === w.id ? (
                    <div className="pl-1 pt-2 border-t border-mnemo-border space-y-2 w-full max-w-xl">
                      <div className="text-[10px] text-mnemo-dim uppercase tracking-wide">Storage override</div>
                      <select
                        value={storageDraft.mode}
                        onChange={e => {
                          const m = e.target.value as WorkspaceStorage['mode'];
                          if (m === 'inherit') setStorageDraft({ mode: 'inherit' });
                          else if (m === 'sqlite') {
                            setStorageDraft(
                              storageDraft.mode === 'sqlite'
                                ? storageDraft
                                : { mode: 'sqlite', dbPath: '', vaultPath: '' },
                            );
                          } else {
                            setStorageDraft(
                              storageDraft.mode === 'remote'
                                ? storageDraft
                                : { mode: 'remote', tursoUrl: '', tursoToken: '' },
                            );
                          }
                        }}
                        className="w-full bg-mnemo-panel border border-mnemo-border rounded px-2 py-1.5 text-mnemo-text text-xs"
                      >
                        <option value="inherit">Inherit global database (tenant = workspace id)</option>
                        <option value="sqlite">Dedicated SQLite files</option>
                        <option value="remote">Dedicated libSQL (URL + token)</option>
                      </select>
                      {storageDraft.mode === 'sqlite' ? (
                        <div className="flex flex-col gap-1.5">
                          <input
                            type="text"
                            placeholder="Absolute path to mnemo.db"
                            value={storageDraft.dbPath}
                            onChange={e =>
                              setStorageDraft({
                                mode: 'sqlite',
                                dbPath: e.target.value,
                                vaultPath: storageDraft.mode === 'sqlite' ? storageDraft.vaultPath : '',
                              })
                            }
                            className="w-full font-mono text-xs bg-mnemo-panel border border-mnemo-border rounded px-2 py-1.5 text-mnemo-text"
                          />
                          <input
                            type="text"
                            placeholder="Absolute path to vault directory"
                            value={storageDraft.mode === 'sqlite' ? storageDraft.vaultPath : ''}
                            onChange={e =>
                              setStorageDraft({
                                mode: 'sqlite',
                                dbPath: storageDraft.mode === 'sqlite' ? storageDraft.dbPath : '',
                                vaultPath: e.target.value,
                              })
                            }
                            className="w-full font-mono text-xs bg-mnemo-panel border border-mnemo-border rounded px-2 py-1.5 text-mnemo-text"
                          />
                        </div>
                      ) : null}
                      {storageDraft.mode === 'remote' ? (
                        <div className="flex flex-col gap-1.5">
                          <input
                            type="text"
                            placeholder="Database URL (libsql://… or https://…)"
                            value={storageDraft.tursoUrl ?? ''}
                            onChange={e =>
                              setStorageDraft({
                                mode: 'remote',
                                tursoUrl: e.target.value,
                                tursoToken: storageDraft.mode === 'remote' ? storageDraft.tursoToken ?? '' : '',
                              })
                            }
                            className="w-full font-mono text-xs bg-mnemo-panel border border-mnemo-border rounded px-2 py-1.5 text-mnemo-text"
                          />
                          <input
                            type="password"
                            placeholder="Auth token"
                            value={storageDraft.tursoToken ?? ''}
                            onChange={e =>
                              setStorageDraft({
                                mode: 'remote',
                                tursoUrl: storageDraft.mode === 'remote' ? storageDraft.tursoUrl ?? '' : '',
                                tursoToken: e.target.value,
                              })
                            }
                            className="w-full font-mono text-xs bg-mnemo-panel border border-mnemo-border rounded px-2 py-1.5 text-mnemo-text"
                          />
                        </div>
                      ) : null}
                      <p className="text-[10px] text-mnemo-dim leading-snug">
                        Tokens in workspace profiles are stored in plain JSON on disk (v1). Dedicated SQLite uses a single
                        tenant inside that file.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={vaultProfileBusy}
                          onClick={async () => {
                            setVaultProfileBusy(true);
                            try {
                              const r = await window.mnemo.workspaceProfiles.setStorage(w.id, storageDraft);
                              if (r.ok) {
                                setVaultProfiles(r.profiles);
                                setStorageEditId(null);
                                setStatus({ ok: true, msg: `Storage updated for “${w.name}”.` });
                              } else {
                                setStatus({ ok: false, msg: r.error });
                              }
                            } finally {
                              setVaultProfileBusy(false);
                            }
                          }}
                          className="px-3 py-1.5 rounded bg-mnemo-accent text-mnemo-on-accent text-xs font-medium"
                        >
                          Save storage
                        </button>
                        <button
                          type="button"
                          onClick={() => setStorageEditId(null)}
                          className="px-3 py-1.5 rounded border border-mnemo-border text-xs text-mnemo-dim hover:text-mnemo-text"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="text"
                value={newVaultName}
                onChange={e => setNewVaultName(e.target.value)}
                placeholder="New workspace name"
                className="flex-1 min-w-[12rem] bg-mnemo-panel-elevated border border-mnemo-border rounded px-3 py-1.5 text-sm text-mnemo-text"
              />
            </div>
            <div className="text-[10px] text-mnemo-dim uppercase tracking-wide">Optional import into new vault</div>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex-1 min-w-[12rem] text-xs font-mono text-mnemo-text bg-mnemo-panel-elevated border border-mnemo-border rounded px-3 py-2 break-all min-h-[2rem]">
                {newVaultImportFolder ?? '— none — (empty vault)'}
              </div>
              <button
                type="button"
                disabled={vaultProfileBusy}
                onClick={async () => {
                  setVaultProfileBusy(true);
                  try {
                    const r = await window.mnemo.workspaceProfiles.pickImportFolder();
                    if (r.ok) setNewVaultImportFolder(r.path);
                  } finally {
                    setVaultProfileBusy(false);
                  }
                }}
                className="px-3 py-1.5 bg-mnemo-panel-elevated hover:bg-mnemo-hover border border-mnemo-border rounded text-sm text-mnemo-text transition-colors disabled:opacity-50"
              >
                Pick folder…
              </button>
              <button
                type="button"
                disabled={vaultProfileBusy || !newVaultImportFolder}
                onClick={() => setNewVaultImportFolder(null)}
                className="px-3 py-1.5 border border-mnemo-border rounded text-sm text-mnemo-dim hover:text-mnemo-text disabled:opacity-50"
              >
                Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                disabled={vaultProfileBusy || !newVaultName.trim()}
                onClick={async () => {
                  setVaultProfileBusy(true);
                  try {
                    const r = await window.mnemo.workspaceProfiles.create(
                      newVaultName.trim(),
                      newVaultImportFolder ?? undefined,
                    );
                    if (r.ok) {
                      setNewVaultName('');
                      setNewVaultImportFolder(null);
                      const extra =
                        r.imported !== undefined
                          ? ` Imported ${r.imported}, updated ${r.updated ?? 0} from disk.`
                          : '';
                      const sw = await window.mnemo.workspaceProfiles.switchTo(r.newWorkspaceId);
                      if (!sw.ok) {
                        setStatus({ ok: false, msg: sw.error });
                        setVaultProfiles(r.profiles);
                      } else {
                        setVaultProfiles(sw.profiles);
                        if (onWorkspaceChanged) await onWorkspaceChanged();
                        setStatus({
                          ok: true,
                          msg: `Workspace created and opened.${extra}`,
                        });
                      }
                    } else {
                      setStatus({ ok: false, msg: r.error });
                    }
                  } finally {
                    setVaultProfileBusy(false);
                  }
                }}
                className="px-4 py-1.5 bg-mnemo-panel-elevated hover:bg-mnemo-hover border border-mnemo-border-strong rounded text-sm text-mnemo-text transition-colors disabled:opacity-50"
              >
                Create workspace
              </button>
            </div>
          </div>
        </section>
      )}
      </>
      )}

      {settingsTab === 'database' && (
      <>
      {/* Connection status badge — light themes need darker green on solid tint for WCAG contrast */}
      {storeType && (
        <div className={`inline-flex items-center gap-2 mb-8 px-3 py-1.5 rounded text-xs font-medium w-fit ${
          storeType === 'turso'
            ? lightUi
              ? 'bg-emerald-100 text-emerald-950 border border-emerald-700/45'
              : 'bg-emerald-900/40 text-emerald-300 border border-emerald-600/45'
            : 'bg-mnemo-panel-elevated text-mnemo-muted border border-mnemo-border'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${storeType === 'turso' ? (lightUi ? 'bg-emerald-600' : 'bg-emerald-400') : 'bg-mnemo-dim'}`} />
          {storeType === 'turso' ? 'Remote libSQL' : 'Local SQLite'}
        </div>
      )}

      <section className="mb-8 max-w-lg">
        <h2 className="text-sm font-semibold text-mnemo-muted uppercase tracking-widest mb-4">Remote database</h2>
        <p className="text-xs text-mnemo-dim mb-5 leading-relaxed">
          Mnemo uses the libSQL protocol (same stack as Turso). You can use{' '}
          <strong className="text-mnemo-muted">Turso Cloud</strong>, a{' '}
          <strong className="text-mnemo-muted">self-hosted libSQL / sqld</strong> instance on your VPS, or any
          endpoint compatible with <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">@libsql/client</code>.
          Leave blank to use local SQLite only. Credentials are stored in{' '}
          <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">%APPDATA%\Mnemo\config.json</code>{' '}
          as <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">tursoUrl</code> /{' '}
          <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">tursoToken</code> (legacy names; values work for any libSQL host).
        </p>
        <p className="text-xs text-mnemo-dim mb-5 leading-relaxed">
          <strong className="text-mnemo-muted">Multiple devices:</strong> the same URL and token on each machine
          point at one vault. Notes, links, and merged UI settings (folder colors, theme, layout, Markdown overrides,
          etc.) are stored in the remote database and mirrored to{' '}
          <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">app_kv</code>.
          The app polls for changes and reloads the note list, open note (when the editor has no unsaved edits), and
          preferences automatically; use <strong>↻</strong> or <strong>Reload Note List</strong> for an immediate pull.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-mnemo-dim mb-1.5" htmlFor="turso-url">Database URL</label>
            <input
              id="turso-url"
              type="url"
              value={tursoUrl}
              onChange={e => setTursoUrl(e.target.value)}
              placeholder="libsql://….turso.io or https://db.example.com"
              className="w-full bg-mnemo-panel-elevated border border-mnemo-border rounded px-3 py-2 text-sm text-mnemo-text placeholder-mnemo-dim focus:outline-none focus:border-mnemo-border-strong font-mono"
              spellCheck={false}
            />
          </div>

          <div>
            <label className="block text-xs text-mnemo-dim mb-1.5" htmlFor="turso-token">Auth token</label>
            <div className="relative">
              <input
                id="turso-token"
                type={showToken ? 'text' : 'password'}
                value={tursoToken}
                onChange={e => setTursoToken(e.target.value)}
                placeholder="eyJ…"
                className="w-full bg-mnemo-panel-elevated border border-mnemo-border rounded px-3 py-2 pr-16 text-sm text-mnemo-text placeholder-mnemo-dim focus:outline-none focus:border-mnemo-border-strong font-mono"
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowToken(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-mnemo-dim hover:text-mnemo-muted transition-colors px-1"
              >
                {showToken ? 'hide' : 'show'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-mnemo-panel-elevated hover:bg-mnemo-hover border border-mnemo-border-strong rounded text-sm text-mnemo-text transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save & Reconnect'}
          </button>
          {(tursoUrl || tursoToken) && (
            <button
              onClick={handleClear}
              disabled={saving}
              className="px-4 py-1.5 bg-transparent hover:bg-mnemo-hover border border-mnemo-border rounded text-sm text-mnemo-muted hover:text-red-400 transition-colors disabled:opacity-50"
            >
              Clear credentials
            </button>
          )}
        </div>
      </section>

      {/* Local ↔ Turso sync — only visible when connected */}
      {storeType === 'turso' && (
        <section className="mb-8 max-w-lg space-y-8">
          <div>
            <h2 className="text-sm font-semibold text-mnemo-muted uppercase tracking-widest mb-4">Sync with remote</h2>
            <p className="text-xs text-mnemo-dim mb-5 leading-relaxed">
              Both directions are <strong className="text-mnemo-muted">additive</strong>: nothing is deleted on either side.
              Notes merge by <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">updated_at</code> (newer
              wins). Links only use <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">INSERT OR IGNORE</code>.
              CLI: <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">mnemo sync push</code> /{' '}
              <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">mnemo sync pull</code> (see{' '}
              <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">mnemo help sync</code>).
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-mnemo-muted uppercase tracking-wide mb-3">Upload (local → remote)</h3>
            <p className="text-xs text-mnemo-dim mb-4 leading-relaxed">
              Copy rows from this device&apos;s local <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">mnemo.db</code> into
              the remote database. Remote rows stay unless your local copy is newer.
            </p>
            {syncPushResult && (
              <p className={`text-xs mb-3 ${successMsgClass}`}>
                Done — {syncPushResult.synced} note row{syncPushResult.synced !== 1 ? 's' : ''} sent to remote (additive merge).
              </p>
            )}
            <button
              type="button"
              onClick={async () => {
                setSyncingPush(true);
                setSyncPushResult(null);
                try {
                  const result = await window.mnemo.config.syncLocalNotes();
                  setSyncPushResult(result);
                  onSaved?.();
                } catch (e) {
                  setStatus({ ok: false, msg: `Upload failed: ${e instanceof Error ? e.message : String(e)}` });
                } finally {
                  setSyncingPush(false);
                }
              }}
              disabled={syncingPush || syncingPull || saving}
              className="px-4 py-1.5 bg-mnemo-panel-elevated hover:bg-mnemo-hover border border-mnemo-border-strong rounded text-sm text-mnemo-text transition-colors disabled:opacity-50"
            >
              {syncingPush ? 'Uploading…' : 'Upload local database to remote'}
            </button>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-mnemo-muted uppercase tracking-wide mb-3">Download (remote → local)</h3>
            <p className="text-xs text-mnemo-dim mb-4 leading-relaxed">
              Merge the remote database into your local <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">mnemo.db</code> and
              mirror <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">vault/*.md</code>. Local-only notes remain; each row updates
              only when the remote copy is newer than your local copy.
            </p>
            {syncPullResult && (
              <p className={`text-xs mb-3 ${successMsgClass}`}>
                Done — merged {syncPullResult.synced} updates from remote ({syncPullResult.skipped} skipped: local newer or unchanged).
              </p>
            )}
            <button
              type="button"
              onClick={async () => {
                setSyncingPull(true);
                setSyncPullResult(null);
                try {
                  const result = await window.mnemo.config.syncPullLocalNotes();
                  setSyncPullResult(result);
                  onSaved?.();
                } catch (e) {
                  setStatus({ ok: false, msg: `Download failed: ${e instanceof Error ? e.message : String(e)}` });
                } finally {
                  setSyncingPull(false);
                }
              }}
              disabled={syncingPush || syncingPull || saving}
              className="px-4 py-1.5 bg-mnemo-panel-elevated hover:bg-mnemo-hover border border-mnemo-border-strong rounded text-sm text-mnemo-text transition-colors disabled:opacity-50"
            >
              {syncingPull ? 'Downloading…' : 'Download remote snapshot to local'}
            </button>
          </div>
        </section>
      )}

      <section className="max-w-lg space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-mnemo-muted uppercase tracking-widest mb-4">Turso Cloud (hosted)</h2>
          <ol className="text-xs text-mnemo-dim space-y-2 leading-relaxed list-decimal list-inside">
            <li>Install the Turso CLI: <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">npm i -g @turso/cli</code></li>
            <li>Sign up / log in: <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">turso auth signup</code></li>
            <li>Create a database: <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">turso db create mnemo</code></li>
            <li>Get the URL: <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">turso db show mnemo --url</code></li>
            <li>Create a token: <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">turso db tokens create mnemo</code></li>
            <li>Paste both above and click <strong className="text-mnemo-muted">Save &amp; Reconnect</strong>.</li>
          </ol>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-mnemo-muted uppercase tracking-widest mb-3">Self-hosted (VPS / your cloud)</h2>
          <p className="text-xs text-mnemo-dim leading-relaxed mb-3">
            Run a libSQL-compatible server (for example{' '}
            <a
              href="https://github.com/tursodatabase/libsql"
              target="_blank"
              rel="noopener noreferrer"
              className="text-mnemo-accent hover:underline"
            >
              libSQL / sqld
            </a>
            ) with TLS, expose the HTTP/libSQL endpoint, then paste that URL and a valid JWT or auth token here.
            You can also set <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">libsqlUrl</code> /{' '}
            <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">libsqlAuthToken</code> in{' '}
            <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">config.json</code> instead of the Turso-named keys.
            Environment: <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">MNEMO_LIBSQL_URL</code> and{' '}
            <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">MNEMO_LIBSQL_AUTH_TOKEN</code> (or the existing{' '}
            <code className="text-mnemo-muted bg-mnemo-panel-elevated px-1 rounded">MNEMO_TURSO_*</code> names).
          </p>
        </div>
      </section>
      </>
      )}
      </div>
    </div>
  );
}
