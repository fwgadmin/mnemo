import { useEffect, useState } from 'react';
import type { AppConfig, SyncResult } from '../../shared/types';

interface Props {
  onClose: () => void;
  onSaved?: () => void;
}

export default function SettingsView({ onClose, onSaved }: Props) {
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
      setTursoUrl(cfg.tursoUrl ?? '');
      setTursoToken(cfg.tursoToken ?? '');
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
      setStatus({ ok: true, msg: type === 'turso' ? 'Connected to Turso — loading notes…' : 'Saved — using local SQLite.' });
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
    <div className="flex flex-col h-full bg-[#111] text-[#ccc] p-8 overflow-y-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <button
          onClick={onClose}
          className="text-[#555] hover:text-white transition-colors text-lg leading-none"
          aria-label="Close settings"
        >✕</button>
      </div>

      {/* Connection status badge */}
      {storeType && (
        <div className={`inline-flex items-center gap-2 mb-8 px-3 py-1.5 rounded text-xs font-medium w-fit ${
          storeType === 'turso'
            ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/40'
            : 'bg-[#1a1a1a] text-[#888] border border-[#2a2a2a]'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${storeType === 'turso' ? 'bg-emerald-400' : 'bg-[#555]'}`} />
          {storeType === 'turso' ? 'Connected to Turso' : 'Local SQLite'}
        </div>
      )}

      <section className="mb-8 max-w-lg">
        <h2 className="text-sm font-semibold text-[#aaa] uppercase tracking-widest mb-4">Turso Cloud Sync</h2>
        <p className="text-xs text-[#666] mb-5 leading-relaxed">
          Connect to a Turso database to sync notes across devices and share with MCP clients.
          Leave blank to use local SQLite only. Credentials are stored in{' '}
          <code className="text-[#888] bg-[#1a1a1a] px-1 rounded">%APPDATA%\Mnemo\config.json</code>.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[#888] mb-1.5" htmlFor="turso-url">Database URL</label>
            <input
              id="turso-url"
              type="url"
              value={tursoUrl}
              onChange={e => setTursoUrl(e.target.value)}
              placeholder="libsql://your-db.turso.io"
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444] font-mono"
              spellCheck={false}
            />
          </div>

          <div>
            <label className="block text-xs text-[#888] mb-1.5" htmlFor="turso-token">Auth Token</label>
            <div className="relative">
              <input
                id="turso-token"
                type={showToken ? 'text' : 'password'}
                value={tursoToken}
                onChange={e => setTursoToken(e.target.value)}
                placeholder="eyJ…"
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-2 pr-16 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#444] font-mono"
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowToken(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#555] hover:text-[#aaa] transition-colors px-1"
              >
                {showToken ? 'hide' : 'show'}
              </button>
            </div>
          </div>
        </div>

        {/* Status message */}
        {status && (
          <p className={`mt-3 text-xs ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {status.msg}
          </p>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-[#2a2a2a] hover:bg-[#333] border border-[#3a3a3a] rounded text-sm text-white transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save & Reconnect'}
          </button>
          {(tursoUrl || tursoToken) && (
            <button
              onClick={handleClear}
              disabled={saving}
              className="px-4 py-1.5 bg-transparent hover:bg-[#1a1a1a] border border-[#2a2a2a] rounded text-sm text-[#888] hover:text-red-400 transition-colors disabled:opacity-50"
            >
              Clear credentials
            </button>
          )}
        </div>
      </section>

      {/* Local → Turso sync — only visible when connected */}
      {storeType === 'turso' && (
        <section className="mb-8 max-w-lg">
          <h2 className="text-sm font-semibold text-[#aaa] uppercase tracking-widest mb-4">Import Local Notes</h2>
          <p className="text-xs text-[#666] mb-5 leading-relaxed">
            Copy notes from your offline local database into Turso. Existing Turso notes are kept;
            local notes are only written if they are newer. Safe to run more than once.
          </p>
          {syncResult && (
            <p className="text-xs text-emerald-400 mb-3">
              Done — {syncResult.synced} note{syncResult.synced !== 1 ? 's' : ''} synced to Turso.
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
            className="px-4 py-1.5 bg-[#2a2a2a] hover:bg-[#333] border border-[#3a3a3a] rounded text-sm text-white transition-colors disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : 'Sync local notes to Turso'}
          </button>
        </section>
      )}

      <section className="max-w-lg">
        <h2 className="text-sm font-semibold text-[#aaa] uppercase tracking-widest mb-4">Getting Started with Turso</h2>
        <ol className="text-xs text-[#666] space-y-2 leading-relaxed list-decimal list-inside">
          <li>Install the Turso CLI: <code className="text-[#888] bg-[#1a1a1a] px-1 rounded">npm i -g @turso/cli</code></li>
          <li>Sign up / log in: <code className="text-[#888] bg-[#1a1a1a] px-1 rounded">turso auth signup</code></li>
          <li>Create a database: <code className="text-[#888] bg-[#1a1a1a] px-1 rounded">turso db create mnemo</code></li>
          <li>Get the URL: <code className="text-[#888] bg-[#1a1a1a] px-1 rounded">turso db show mnemo --url</code></li>
          <li>Create a token: <code className="text-[#888] bg-[#1a1a1a] px-1 rounded">turso db tokens create mnemo</code></li>
          <li>Paste both above and click <strong className="text-[#aaa]">Save &amp; Reconnect</strong>.</li>
        </ol>
      </section>
    </div>
  );
}
