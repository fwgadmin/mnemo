import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { InteractionManager, useColorScheme } from 'react-native';
import { loadThemeMode, saveThemeMode, type ThemeMode } from '../storage/mobileSettings';

type ThemePreferenceValue = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => Promise<void>;
  /** Effective palette after resolving System → device. */
  resolvedScheme: 'light' | 'dark';
  ready: boolean;
};

export const ThemePreferenceContext = createContext<ThemePreferenceValue | null>(null);

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void loadThemeMode().then(m => {
        setModeState(m);
        setReady(true);
      });
    });
    return () => task.cancel();
  }, []);

  const setMode = useCallback(async (m: ThemeMode) => {
    setModeState(m);
    await saveThemeMode(m);
  }, []);

  const resolvedScheme: 'light' | 'dark' =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

  const value = useMemo<ThemePreferenceValue>(
    () => ({
      mode,
      setMode,
      resolvedScheme,
      ready,
    }),
    [mode, setMode, resolvedScheme, ready],
  );

  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
}

export function useThemePreference(): ThemePreferenceValue {
  const ctx = useContext(ThemePreferenceContext);
  if (!ctx) throw new Error('useThemePreference must be used within ThemePreferenceProvider');
  return ctx;
}

/** For StatusBar / rare cases outside hook rules — returns null if no provider. */
export function useThemePreferenceOptional(): ThemePreferenceValue | null {
  return useContext(ThemePreferenceContext);
}
