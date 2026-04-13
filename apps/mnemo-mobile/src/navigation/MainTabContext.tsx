import React, { createContext, useContext } from 'react';

export type MainTab = 'notes' | 'settings';

type MainTabContextValue = {
  setMainTab: (tab: MainTab) => void;
};

const MainTabContext = createContext<MainTabContextValue | null>(null);

export function MainTabProvider({ value, children }: { value: MainTabContextValue; children: React.ReactNode }) {
  return <MainTabContext.Provider value={value}>{children}</MainTabContext.Provider>;
}

export function useMainTab(): MainTabContextValue {
  const ctx = useContext(MainTabContext);
  if (!ctx) throw new Error('useMainTab must be used within MainTabProvider');
  return ctx;
}
