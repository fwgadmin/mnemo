import { useCallback, useEffect, useState } from 'react';
import type { LlmProfile, LlmProviderKind, LlmSettingsFile } from '../../shared/types';
import { DEFAULT_USER_GUARDRAILS } from '../../shared/llmGuardrails';
import { isProfileComplete } from '../../shared/llmProfile';

const PRESET_BASE: Record<LlmProviderKind, string> = {
  openai_compatible: 'https://api.openai.com/v1',
  ollama: 'http://127.0.0.1:11434',
  anthropic: 'https://api.anthropic.com',
  google_gemini: 'https://generativelanguage.googleapis.com',
};

const PRESET_MODEL: Record<LlmProviderKind, string> = {
  openai_compatible: 'gpt-4o-mini',
  ollama: 'llama3.2',
  anthropic: 'claude-3-5-sonnet-20241022',
  google_gemini: 'gemini-2.0-flash',
};

const KIND_LABEL: Record<LlmProviderKind, string> = {
  openai_compatible: 'OpenAI-compatible (Chat Completions)',
  ollama: 'Ollama',
  anthropic: 'Anthropic (Messages API)',
  google_gemini: 'Google Gemini (generateContent)',
};

export default function LlmSummarySettings() {
  const [draft, setDraft] = useState<LlmSettingsFile>({ profiles: [] });
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showDefaultGuardrailsInfo, setShowDefaultGuardrailsInfo] = useState(false);

  const reload = useCallback(async () => {
    try {
      const f = await window.mnemo.llm.read();
      setDraft(f);
    } catch (e) {
      setStatus({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!showDefaultGuardrailsInfo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDefaultGuardrailsInfo(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showDefaultGuardrailsInfo]);

  const save = async () => {
    setStatus(null);
    try {
      await window.mnemo.llm.save(draft);
      await reload();
      setStatus({ ok: true, msg: 'LLM settings saved.' });
    } catch (e) {
      setStatus({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    }
  };

  const addProfile = () => {
    const id = crypto.randomUUID();
    const kind: LlmProviderKind = 'openai_compatible';
    const p: LlmProfile = {
      id,
      providerKind: kind,
      baseUrl: PRESET_BASE[kind],
      model: PRESET_MODEL[kind],
      name: 'New profile',
    };
    setDraft(prev => ({
      ...prev,
      profiles: [...prev.profiles, p],
      defaultLlmProfileId: prev.defaultLlmProfileId ?? id,
    }));
  };

  const removeProfile = (id: string) => {
    setDraft(prev => {
      const profiles = prev.profiles.filter(x => x.id !== id);
      let defaultLlmProfileId = prev.defaultLlmProfileId;
      if (defaultLlmProfileId === id) defaultLlmProfileId = profiles[0]?.id;
      return { ...prev, profiles, defaultLlmProfileId };
    });
  };

  const updateProfile = (id: string, patch: Partial<LlmProfile>) => {
    setDraft(prev => ({
      ...prev,
      profiles: prev.profiles.map(p => (p.id === id ? { ...p, ...patch } : p)),
    }));
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-mnemo-muted uppercase tracking-widest mb-2">Copy / Paste as Summary</h2>
        <p className="text-xs text-mnemo-dim mb-3 leading-relaxed">
          When enabled, the note editor’s context menu can <strong className="text-mnemo-muted">copy</strong> or{' '}
          <strong className="text-mnemo-muted">paste</strong> text through your chosen model as a summary (plain or{' '}
          <strong className="text-mnemo-muted">Markdown-formatted</strong>). Summarization is always required by the app; the
          guardrails field below steers tone and style. API keys stay in a local file under app data — they are not synced to
          Turso. Your note text is sent only to the provider you configure.
        </p>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-mnemo-text">
          <input
            type="checkbox"
            checked={draft.enableCopyPasteSummary ?? false}
            onChange={e => setDraft(p => ({ ...p, enableCopyPasteSummary: e.target.checked }))}
            className="rounded border-mnemo-border"
          />
          Enable Copy / Paste as Summary (shows menu items only with a valid default profile below)
        </label>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h3 className="text-xs font-semibold text-mnemo-muted uppercase tracking-wide">Guardrails / style</h3>
          <button
            type="button"
            onClick={() => setShowDefaultGuardrailsInfo(true)}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-mnemo-border bg-mnemo-panel-elevated text-[10px] font-semibold text-mnemo-dim hover:text-mnemo-text hover:bg-mnemo-hover"
            title="View bundled default guardrails text"
            aria-label="View bundled default guardrails example"
          >
            i
          </button>
        </div>
        <p className="text-xs text-mnemo-dim mb-2">
          Summarization is always required; this text steers tone and style. Leave empty to use the bundled neutral default shown
          in the info (<span className="font-semibold text-mnemo-muted">i</span>) button. A fixed summarization instruction is
          always applied in addition to this text.
        </p>
        <textarea
          value={draft.guardrailsPrompt ?? ''}
          onChange={e => setDraft(p => ({ ...p, guardrailsPrompt: e.target.value }))}
          rows={5}
          className="w-full text-xs font-mono bg-mnemo-app border border-mnemo-border rounded px-3 py-2 text-mnemo-text"
          placeholder="(Bundled default when empty)"
        />
        <button
          type="button"
          onClick={() => setDraft(p => ({ ...p, guardrailsPrompt: DEFAULT_USER_GUARDRAILS }))}
          className="mt-2 text-[11px] text-mnemo-dim hover:text-mnemo-muted underline"
        >
          Reset to default guardrails
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-mnemo-muted uppercase tracking-wide">Profiles</h3>
        <button
          type="button"
          onClick={addProfile}
          className="px-3 py-1.5 text-xs bg-mnemo-panel-elevated border border-mnemo-border rounded hover:bg-mnemo-hover"
        >
          Add profile
        </button>
      </div>

      <ul className="space-y-4">
        {draft.profiles.map(p => {
          const complete = isProfileComplete(p);
          return (
            <li key={p.id} className="border border-mnemo-border rounded-md p-4 bg-mnemo-panel-elevated space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-mnemo-muted">
                  <input
                    type="radio"
                    name="default-llm"
                    checked={draft.defaultLlmProfileId === p.id}
                    onChange={() => setDraft(d => ({ ...d, defaultLlmProfileId: p.id }))}
                  />
                  Use as default for summaries
                </label>
                <span className={`text-[10px] ${complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>
                  {complete ? 'Ready' : 'Incomplete'}
                </span>
                <button
                  type="button"
                  onClick={() => removeProfile(p.id)}
                  className="text-[11px] text-red-600/90 dark:text-red-400 hover:underline"
                >
                  Remove
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-[11px] text-mnemo-dim">
                  Display name
                  <input
                    value={p.name ?? ''}
                    onChange={e => updateProfile(p.id, { name: e.target.value })}
                    className="mt-0.5 w-full px-2 py-1 rounded border border-mnemo-border bg-mnemo-app text-mnemo-text text-xs"
                  />
                </label>
                <label className="block text-[11px] text-mnemo-dim">
                  Provider
                  <select
                    value={p.providerKind}
                    onChange={e => {
                      const k = e.target.value as LlmProviderKind;
                      updateProfile(p.id, {
                        providerKind: k,
                        baseUrl: PRESET_BASE[k],
                        model: PRESET_MODEL[k],
                      });
                    }}
                    className="mt-0.5 w-full px-2 py-1 rounded border border-mnemo-border bg-mnemo-app text-mnemo-text text-xs"
                  >
                    {(Object.keys(KIND_LABEL) as LlmProviderKind[]).map(k => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-[11px] text-mnemo-dim">
                Base URL
                <input
                  value={p.baseUrl}
                  onChange={e => updateProfile(p.id, { baseUrl: e.target.value })}
                  className="mt-0.5 w-full px-2 py-1 rounded border border-mnemo-border bg-mnemo-app text-mnemo-text text-xs font-mono"
                  spellCheck={false}
                />
              </label>
              <label className="block text-[11px] text-mnemo-dim">
                Model id
                <input
                  value={p.model}
                  onChange={e => updateProfile(p.id, { model: e.target.value })}
                  className="mt-0.5 w-full px-2 py-1 rounded border border-mnemo-border bg-mnemo-app text-mnemo-text text-xs font-mono"
                  spellCheck={false}
                />
              </label>
              <label className="block text-[11px] text-mnemo-dim">
                API key (Anthropic / Gemini; optional for local-compatible)
                <input
                  type="password"
                  value={p.apiKey ?? ''}
                  onChange={e => updateProfile(p.id, { apiKey: e.target.value })}
                  autoComplete="off"
                  className="mt-0.5 w-full px-2 py-1 rounded border border-mnemo-border bg-mnemo-app text-mnemo-text text-xs font-mono"
                  placeholder={p.providerKind === 'anthropic' || p.providerKind === 'google_gemini' ? 'Required' : 'Optional'}
                />
              </label>
            </li>
          );
        })}
      </ul>

      {status && (
        <p className={`text-xs ${status.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {status.msg}
        </p>
      )}

      <button
        type="button"
        onClick={() => void save()}
        className="px-4 py-2 text-sm bg-mnemo-accent text-mnemo-on-accent rounded-md hover:opacity-90"
      >
        Save LLM settings
      </button>

      {showDefaultGuardrailsInfo && (
        <>
          <div
            className="fixed inset-0 z-[300] bg-mnemo-app/50"
            aria-hidden
            onMouseDown={() => setShowDefaultGuardrailsInfo(false)}
          />
          <div
            role="dialog"
            aria-modal
            aria-labelledby="default-guardrails-title"
            className="fixed z-[301] left-1/2 top-1/2 w-[min(36rem,calc(100vw-2rem))] max-h-[min(28rem,80vh)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-mnemo-border bg-mnemo-panel-elevated shadow-xl flex flex-col overflow-hidden"
          >
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-mnemo-border">
              <h4 id="default-guardrails-title" className="text-sm font-semibold text-mnemo-text">
                Bundled default guardrails
              </h4>
              <button
                type="button"
                onClick={() => setShowDefaultGuardrailsInfo(false)}
                className="text-mnemo-dim hover:text-mnemo-text text-lg leading-none px-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
              <p className="text-[11px] text-mnemo-dim mb-2">
                This is what Mnemo uses when the guardrails field is empty (you can reset to it from the textarea below).
              </p>
              <pre className="text-xs font-mono text-mnemo-text whitespace-pre-wrap break-words bg-mnemo-app border border-mnemo-border rounded px-3 py-2">
                {DEFAULT_USER_GUARDRAILS}
              </pre>
            </div>
            <div className="shrink-0 px-4 py-3 border-t border-mnemo-border">
              <button
                type="button"
                onClick={() => setShowDefaultGuardrailsInfo(false)}
                className="px-3 py-1.5 text-xs bg-mnemo-panel-elevated border border-mnemo-border rounded hover:bg-mnemo-hover text-mnemo-text"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
