import { useEffect, useState } from 'react';
import type { AppConfig, SyncResult } from '../../shared/types';
import { THEMES, type LayoutPreset } from '../theme/themes';
import MarkdownEditorSettings from './MarkdownEditorSettings';

type LayoutOverride = 'inherit' | LayoutPreset;

interface Props {
  onClose: () => void;
  onSaved?: () => void;
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
  const [syncing, setSyncing]       = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [status, setStatus]         = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    (async () => {
      const [cfg, type] = await Promise.all([
        window.mnemo.config.read(),
        window.mnemo.config.storeType(),
      ]);
      setTursoUrl(cfg.tursoUrl ?? cfg.libsqlUrl ?? '');
      setTursoToken(cfg.tursoToken ?? cfg.libsqlAuthToken ?? '');
      setStoreType(type);
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
    <div className="flex flex-col h-full bg-mnemo-panel text-mnemo-muted p-8 overflow-y-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold text-mnemo-text">Settings</h1>
        <button
          type="button"
          onClick={onClose}
          className="text-mnemo-dim hover:text-mnemo-text transition-colors text-lg leading-none"
          aria-label="Close settings"
        >✕</button>
      </div>

      <section className="mb-8 max-w-lg">
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

      <section className="mb-8 max-w-2xl">
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
          point at one vault. After notes or categories change elsewhere, use the sidebar <strong>↻</strong> reload
          control (or <strong>Reload Note List</strong> in the command palette) to refresh lists and the open note;
          the app also polls the database periodically while the window is visible and updates the open note when
          you have no unsaved edits in the editor.
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

        {/* Status message */}
        {status && (
          <p className={`mt-3 text-xs ${status.ok ? successMsgClass : lightUi ? 'text-red-700' : 'text-red-400'}`}>
            {status.msg}
          </p>
        )}

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

      {/* Local → Turso sync — only visible when connected */}
      {storeType === 'turso' && (
        <section className="mb-8 max-w-lg">
          <h2 className="text-sm font-semibold text-mnemo-muted uppercase tracking-widest mb-4">Import Local Notes</h2>
          <p className="text-xs text-mnemo-dim mb-5 leading-relaxed">
            Copy notes from your offline local database into the remote database. Existing remote notes are kept;
            local notes are only written if they are newer. Safe to run more than once.
          </p>
          {syncResult && (
            <p className={`text-xs mb-3 ${successMsgClass}`}>
              Done — {syncResult.synced} note{syncResult.synced !== 1 ? 's' : ''} synced to remote database.
            </p>
          )}
          <button
            onClick={async () => {
              setSyncing(true);
              setSyncResult(null);
              try {
                const result = await window.mnemo.config.syncLocalNotes();
                setSyncResult(result);
                onSaved?.();  // reload sidebar
              } catch (e) {
                setStatus({ ok: false, msg: `Sync failed: ${e instanceof Error ? e.message : String(e)}` });
              } finally {
                setSyncing(false);
              }
            }}
            disabled={syncing || saving}
            className="px-4 py-1.5 bg-mnemo-panel-elevated hover:bg-mnemo-hover border border-mnemo-border-strong rounded text-sm text-mnemo-text transition-colors disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : 'Sync local notes to remote database'}
          </button>
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
    </div>
  );
}
