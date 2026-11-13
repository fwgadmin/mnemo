import { useCallback, useEffect, useState } from 'react';

type Stats = Awaited<ReturnType<typeof window.mnemo.attachments.stats>>;

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Settings → Database: attachment usage, inline-media conversion, unused-file cleanup (active workspace). */
export default function AttachmentSettings() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    try {
      setStats(await window.mnemo.attachments.stats());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMessage('');
    try {
      setMessage(await fn());
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-8 max-w-lg">
      <h2 className="text-sm font-semibold text-mnemo-muted uppercase tracking-widest mb-4">Attachments</h2>
      <p className="text-xs text-mnemo-dim mb-4 leading-relaxed">
        Images and files you paste or drop are stored once per workspace and sync with the database. These actions
        apply to the current workspace only.
      </p>
      {stats && (
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-xs mb-4">
          <dt className="text-mnemo-dim">Stored</dt>
          <dd>
            {stats.count} file{stats.count === 1 ? '' : 's'} · {size(stats.bytes)}
          </dd>
          <dt className="text-mnemo-dim">Unused</dt>
          <dd>
            {stats.unused} file{stats.unused === 1 ? '' : 's'} · {size(stats.unusedBytes)}
          </dd>
          <dt className="text-mnemo-dim">Notes with inline media</dt>
          <dd>{stats.notesWithInlineMedia}</dd>
        </dl>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !stats?.notesWithInlineMedia}
          className="px-3 py-1.5 rounded text-xs border border-mnemo-border hover:bg-mnemo-hover disabled:opacity-40"
          title="Older notes kept pasted media as base64 inside the note text. This moves it into attachments."
          onClick={() =>
            void run(async () => {
              const r = await window.mnemo.attachments.convertInline();
              return `Converted ${r.converted} embedded file${r.converted === 1 ? '' : 's'} in ${r.notes} note${r.notes === 1 ? '' : 's'}${
                r.skipped ? ` (${r.skipped} left inline: unsupported type or over 10 MB)` : ''
              }.`;
            })
          }
        >
          Convert inline media
        </button>
        <button
          type="button"
          disabled={busy || !stats?.unused}
          className="px-3 py-1.5 rounded text-xs border border-mnemo-border hover:bg-mnemo-hover disabled:opacity-40"
          title="Deletes attachments that no note references and that are more than a day old."
          onClick={() => {
            if (!window.confirm(`Delete ${stats?.unused ?? 0} unused attachment file(s) from this workspace?`)) return;
            void run(async () => {
              const r = await window.mnemo.attachments.removeUnused();
              return `Removed ${r.removed} unused file${r.removed === 1 ? '' : 's'} (${size(r.bytes)}).`;
            });
          }}
        >
          Remove unused attachments
        </button>
      </div>
      {message && <p className="text-xs text-mnemo-muted mt-3">{message}</p>}
    </section>
  );
}
