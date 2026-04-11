import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { GENERAL_PATH, normalizePath, UNASSIGNED_PATH } from '../categoryPath';

interface CategoryComboboxProps {
  paths: string[];
  value: string;
  onChange: (path: string) => void;
  placeholder?: string;
  allowCreate?: boolean;
  /**
   * suggest (default): Enter picks first filtered match when the typed path already exists — good for quick-pick.
   * typed: Enter always commits normalized input — use for folder rename so Enter applies what you typed.
   */
  commitBehavior?: 'suggest' | 'typed';
  /** Label for the “new path” row when allowCreate (default Create “…”). Use renameDestination for folder rename. */
  newPathLabel?: 'create' | 'renameDestination';
  className?: string;
}

/** Searchable dropdown for category paths; Enter commits; allows creating new paths when allowCreate */
export default function CategoryCombobox({
  paths,
  value,
  onChange,
  placeholder = 'Category path…',
  allowCreate = true,
  commitBehavior = 'suggest',
  newPathLabel = 'create',
  className = '',
}: CategoryComboboxProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInput(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [...paths].sort((a, b) => a.localeCompare(b));
    return paths.filter(p => p.toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b));
  }, [paths, input]);

  const normalizedNew = useMemo(() => {
    const n = normalizePath(input);
    if (!n) return GENERAL_PATH;
    return n;
  }, [input]);

  const canCreate =
    allowCreate &&
    normalizedNew &&
    normalizedNew !== GENERAL_PATH &&
    normalizedNew !== UNASSIGNED_PATH &&
    !paths.some(p => p === normalizedNew);

  const commit = useCallback(
    (path: string) => {
      onChange(path);
      setInput(path);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        type="text"
        value={input}
        onChange={e => {
          setInput(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (commitBehavior === 'typed') {
              const raw = normalizePath(input);
              commit(raw);
              return;
            }
            if (filtered.length > 0 && !canCreate) commit(filtered[0]);
            else if (canCreate) commit(normalizedNew);
            else if (filtered.length > 0) commit(filtered[0]);
            else commit(normalizedNew === GENERAL_PATH ? GENERAL_PATH : normalizedNew);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 text-[11px] bg-mnemo-panel border border-mnemo-border rounded text-mnemo-text placeholder-mnemo-muted focus:outline-none focus:ring-1 focus:ring-mnemo-accent"
      />
      {open && (filtered.length > 0 || canCreate) && (
        <ul className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded border border-mnemo-border bg-mnemo-panel-elevated shadow-lg py-1 text-[11px]">
          {filtered.slice(0, 40).map(p => (
            <li key={p}>
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left text-mnemo-text hover:bg-mnemo-hover truncate"
                onMouseDown={e => e.preventDefault()}
                onClick={() => commit(p)}
              >
                {p}
              </button>
            </li>
          ))}
          {canCreate && (
            <li>
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left text-mnemo-accent hover:bg-mnemo-hover truncate"
                onMouseDown={e => e.preventDefault()}
                onClick={() => commit(normalizedNew)}
              >
                {newPathLabel === 'renameDestination'
                  ? `Rename to “${normalizedNew}”`
                  : `Create “${normalizedNew}”`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
