import React, { createContext, useContext } from 'react';

/** Sent to Notes tab to clear the category chip filter (show all notes). */
export const PENDING_CATEGORY_SHOW_ALL = '__mnemo_show_all__';

export type MainTab = 'notes' | 'categories' | 'settings';

type MainTabContextValue = {
  setMainTab: (tab: MainTab) => void;
  /** Switches to Notes and applies filter: a category path, or PENDING_CATEGORY_SHOW_ALL for All. */
  openNotesWithCategoryFilter: (pathOrShowAll: string) => void;
  pendingNotesCategoryFilter: string | null;
  clearPendingNotesCategoryFilter: () => void;
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
