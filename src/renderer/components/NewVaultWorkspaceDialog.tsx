import { useState } from 'react';

interface NewVaultWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after a vault is created so parents can refresh lists. */
  onCreated: () => void;
  onWorkspaceChanged?: () => void | Promise<void>;
}

export default function NewVaultWorkspaceDialog({
  open,
  onClose,
  onCreated,
  onWorkspaceChanged,
}: NewVaultWorkspaceDialogProps) {
  const [name, setName] = useState('');
  const [importFolder, setImportFolder] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  if (!open) {
    return null;
  }

  const resetForm = () => {
    setName('');
    setImportFolder(null);
    setStatus(null);
  };

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div
        className="bg-mnemo-panel-elevated border border-mnemo-border rounded-lg shadow-xl max-w-md w-full p-5"
        role="dialog"
        aria-labelledby="new-vault-title"
      >
        <h2 id="new-vault-title" className="text-lg font-semibold text-mnemo-text mb-1">
          New vault workspace
        </h2>
        <p className="text-xs text-mnemo-dim mb-4 leading-relaxed">
          New workspaces use the shared database with their own tenant id unless you set a storage override in
          Settings. You can import Markdown from a folder; the new workspace opens as soon as it is created.
        </p>

        <label className="block text-[10px] text-mnemo-dim uppercase tracking-wide mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Workspace name"
          className="w-full bg-mnemo-app border border-mnemo-border rounded px-3 py-2 text-sm text-mnemo-text mb-4"
        />

        <div className="text-[10px] text-mnemo-dim uppercase tracking-wide mb-1">Optional import</div>
        <div className="flex flex-wrap gap-2 items-center mb-4">
          <div className="flex-1 min-w-0 text-xs font-mono text-mnemo-text bg-mnemo-app border border-mnemo-border rounded px-3 py-2 break-all min-h-[2.25rem]">
            {importFolder ?? '— none — (empty vault)'}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await window.mnemo.workspaceProfiles.pickImportFolder();
                if (r.ok) setImportFolder(r.path);
              } finally {
                setBusy(false);
              }
            }}
            className="px-3 py-1.5 bg-mnemo-app hover:bg-mnemo-hover border border-mnemo-border rounded text-sm text-mnemo-text disabled:opacity-50"
          >
            Pick folder…
          </button>
          <button
            type="button"
            disabled={busy || !importFolder}
            onClick={() => setImportFolder(null)}
            className="px-3 py-1.5 border border-mnemo-border rounded text-sm text-mnemo-dim hover:text-mnemo-text disabled:opacity-50"
          >
            Clear
          </button>
        </div>

        {status ? (
          <p
            className={`text-xs mb-3 ${status.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
          >
            {status.msg}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="px-4 py-1.5 border border-mnemo-border rounded text-sm text-mnemo-muted hover:bg-mnemo-hover disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              setStatus(null);
              try {
                const r = await window.mnemo.workspaceProfiles.create(
                  name.trim(),
                  importFolder ?? undefined,
                );
                if (r.ok) {
                  onCreated();
                  const sw = await window.mnemo.workspaceProfiles.switchTo(r.newWorkspaceId);
                  if (!sw.ok) {
                    setStatus({ ok: false, msg: sw.error });
                  } else {
                    if (onWorkspaceChanged) await onWorkspaceChanged();
                    resetForm();
                    onClose();
                  }
                } else {
                  setStatus({ ok: false, msg: r.error });
                }
              } finally {
                setBusy(false);
              }
            }}
            className="px-4 py-1.5 bg-mnemo-accent text-mnemo-on-accent rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            Create workspace
          </button>
        </div>
      </div>
    </div>
  );
}
