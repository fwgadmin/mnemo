import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { RootStackParamList } from './types';

export type MobileStackEntry =
  | { name: 'Main' }
  | { name: 'NoteDetail'; params: { noteId: string } }
  | { name: 'NoteEditor'; params: { noteId: string } }
  | { name: 'Search' }
  | { name: 'Legal'; params: { doc: 'privacy' | 'terms' } };

/**
 * Build a validated stack entry. Returns null if required params are missing — navigation is ignored.
 */
function stackEntryFromRoute<K extends keyof RootStackParamList>(
  name: K,
  params?: RootStackParamList[K],
): MobileStackEntry | null {
  switch (name) {
    case 'Main':
      return { name: 'Main' };
    case 'Search':
      return { name: 'Search' };
    case 'NoteDetail': {
      const p = params as RootStackParamList['NoteDetail'] | undefined;
      const noteId = p?.noteId?.trim() ?? '';
      if (!noteId) {
        if (__DEV__) console.error('[MobileNav] NoteDetail requires a non-empty params.noteId');
        return null;
      }
      return { name: 'NoteDetail', params: { noteId } };
    }
    case 'NoteEditor': {
      const p = params as RootStackParamList['NoteEditor'] | undefined;
      const noteId = p?.noteId?.trim() ?? '';
      if (!noteId) {
        if (__DEV__) console.error('[MobileNav] NoteEditor requires a non-empty params.noteId');
        return null;
      }
      return { name: 'NoteEditor', params: { noteId } };
    }
    case 'Legal': {
      const p = params as RootStackParamList['Legal'] | undefined;
      const doc = p?.doc;
      if (doc !== 'privacy' && doc !== 'terms') {
        if (__DEV__) console.error('[MobileNav] Legal requires params.doc: "privacy" | "terms"');
        return null;
      }
      return { name: 'Legal', params: { doc } };
    }
    default: {
      const _exhaustive: never = name;
      return _exhaustive;
    }
  }
}

export type MobileNavApi = {
  /** Push a screen onto the stack (or reset to Main if name is Main). */
  navigate: <K extends keyof RootStackParamList>(name: K, params?: RootStackParamList[K]) => void;
  push: <K extends keyof RootStackParamList>(name: K, params?: RootStackParamList[K]) => void;
  goBack: () => void;
  replace: <K extends keyof RootStackParamList>(name: K, params?: RootStackParamList[K]) => void;
  popToTop: () => void;
};

type Ctx = MobileNavApi & {
  stack: MobileStackEntry[];
  top: MobileStackEntry;
};

const MobileNavContext = createContext<Ctx | null>(null);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<MobileStackEntry[]>([{ name: 'Main' }]);

  const top = stack[stack.length - 1];

  const navigate = useCallback(<K extends keyof RootStackParamList>(name: K, params?: RootStackParamList[K]) => {
    if (name === 'Main') {
      setStack([{ name: 'Main' }]);
      return;
    }
    const entry = stackEntryFromRoute(name, params);
    if (!entry) return;
    setStack(s => [...s, entry]);
  }, []);

  const push = navigate;

  const goBack = useCallback(() => {
    setStack(s => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const replace = useCallback(<K extends keyof RootStackParamList>(name: K, params?: RootStackParamList[K]) => {
    if (name === 'Main') {
      setStack([{ name: 'Main' }]);
      return;
    }
    const entry = stackEntryFromRoute(name, params);
    if (!entry) return;
    setStack(s => (s.length === 0 ? [entry] : [...s.slice(0, -1), entry]));
  }, []);

  const popToTop = useCallback(() => {
    setStack([{ name: 'Main' }]);
  }, []);

  const value = useMemo(
    () => ({
      stack,
      top,
      navigate,
      push,
      goBack,
      replace,
      popToTop,
    }),
    [stack, top, navigate, push, goBack, replace, popToTop],
  );

  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav(): Ctx {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error('useMobileNav must be used within MobileNavProvider');
  return ctx;
}
