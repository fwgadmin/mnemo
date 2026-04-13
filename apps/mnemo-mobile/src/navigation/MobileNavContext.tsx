import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { RootStackParamList } from './types';

export type MobileStackEntry =
  | { name: 'Main' }
  | { name: 'NoteDetail'; params: { noteId: string } }
  | { name: 'NoteEditor'; params: { noteId: string } }
  | { name: 'Search' };

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
    setStack(s => [...s, { name, params } as MobileStackEntry]);
  }, []);

  const push = navigate;

  const goBack = useCallback(() => {
    setStack(s => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const replace = useCallback(<K extends keyof RootStackParamList>(name: K, params?: RootStackParamList[K]) => {
    setStack(s => {
      if (s.length === 0) return [{ name, params } as MobileStackEntry];
      return [...s.slice(0, -1), { name, params } as MobileStackEntry];
    });
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
