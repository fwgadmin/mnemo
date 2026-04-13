import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { categoryColorStorageKey } from '../lib/categoryPath';
import { buildEffectiveCategoryColors, colorForCategoryPathOrAuto } from '../lib/categoryColors';
import { getAppKv, setAppKv } from '../data/turso';
import { loadCategoryColorsFromStorage, saveCategoryColorsToStorage } from '../storage/categoryColorsStorage';
import { useConnection } from './ConnectionContext';
import { useAppTheme } from '../theme/theme';
const UI_PREFS_KV_KEY = 'ui_preferences';

type CategoryColorsContextValue = {
  ready: boolean;
  /** User-set hex keys (storage keys, same as desktop). */
  explicit: Record<string, string>;
  /** Explicit + auto defaults for General/Unassigned. */
  effective: Record<string, string>;
  /** Stripe / label color (inherits + auto hash fallback). */
  stripeColor: (path: string) => string;
  setCategoryColor: (folderPath: string, hex: string | null) => Promise<void>;
};

const CategoryColorsContext = createContext<CategoryColorsContextValue | null>(null);

function sanitizeColors(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k === 'string' && typeof v === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(v)) {
      out[k] = v;
    }
  }
  return out;
}

export function CategoryColorsProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppTheme();
  const { client, bootstrapping } = useConnection();
  const [explicit, setExplicit] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const local = await loadCategoryColorsFromStorage();
      setExplicit(local);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!client || bootstrapping) return;
    void (async () => {
      try {
        const raw = await getAppKv(client, UI_PREFS_KV_KEY);
        if (!raw) return;
        const j = JSON.parse(raw) as { categoryColors?: unknown };
        const merged = sanitizeColors(j.categoryColors);
        if (Object.keys(merged).length === 0) return;
        setExplicit(prev => {
          const next = { ...prev, ...merged };
          void saveCategoryColorsToStorage(next);
          return next;
        });
      } catch {
        /* ignore */
      }
    })();
  }, [client, bootstrapping]);

  const effective = useMemo(() => buildEffectiveCategoryColors(explicit, theme), [explicit, theme]);

  const stripeColor = useCallback(
    (path: string) => colorForCategoryPathOrAuto(path, effective, theme),
    [effective, theme],
  );

  const setCategoryColor = useCallback(
    async (folderPath: string, hex: string | null) => {
      const key = categoryColorStorageKey(folderPath);
      setExplicit(prev => {
        const next = { ...prev };
        if (hex === null) delete next[key];
        else next[key] = hex;
        void saveCategoryColorsToStorage(next);
        return next;
      });

      if (!client) return;
      try {
        const raw = await getAppKv(client, UI_PREFS_KV_KEY);
        if (raw === null) return;
        let prefs: Record<string, unknown>;
        try {
          prefs = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return;
        }
        if (typeof prefs !== 'object' || prefs === null) return;
        const cc = { ...(sanitizeColors(prefs.categoryColors) as Record<string, string>) };
        if (hex === null) delete cc[key];
        else cc[key] = hex;
        prefs.categoryColors = cc;
        await setAppKv(client, UI_PREFS_KV_KEY, JSON.stringify(prefs));
      } catch {
        /* ignore — local storage still updated */
      }
    },
    [client],
  );

  const value = useMemo(
    (): CategoryColorsContextValue => ({
      ready,
      explicit,
      effective,
      stripeColor,
      setCategoryColor,
    }),
    [ready, explicit, effective, stripeColor, setCategoryColor],
  );

  return <CategoryColorsContext.Provider value={value}>{children}</CategoryColorsContext.Provider>;
}

export function useCategoryColors(): CategoryColorsContextValue {
  const ctx = useContext(CategoryColorsContext);
  if (!ctx) throw new Error('useCategoryColors requires CategoryColorsProvider');
  return ctx;
}
