import React, { useCallback, useEffect, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoriesScreen } from '../screens/CategoriesScreen';
import { useAppTheme } from '../theme/theme';
import { NotesListScreen } from '../screens/NotesListScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { MainTabProvider } from './MainTabContext';

/**
 * Notes + Settings without @react-navigation/bottom-tabs (avoids nested tab/stack layout bugs on iOS).
 * One root stack handles pushes (detail, editor, search); this screen is only "Main".
 */
export function MainTabsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const [tab, setTab] = useState<'notes' | 'categories' | 'settings'>('notes');
  const [notesRefreshToken, setNotesRefreshToken] = useState(0);
  const [categoriesRefreshToken, setCategoriesRefreshToken] = useState(0);
  const [pendingNotesCategoryFilter, setPendingNotesCategoryFilter] = useState<string | null>(null);

  const clearPendingNotesCategoryFilter = useCallback(() => {
    setPendingNotesCategoryFilter(null);
  }, []);

  const openNotesWithCategoryFilter = useCallback((pathOrShowAll: string) => {
    setPendingNotesCategoryFilter(pathOrShowAll);
    setTab('notes');
    setNotesRefreshToken(n => n + 1);
  }, []);

  const setMainTab = useCallback((t: 'notes' | 'categories' | 'settings') => {
    setTab(t);
    if (t === 'notes') {
      setNotesRefreshToken(n => n + 1);
    }
    if (t === 'categories') {
      setCategoriesRefreshToken(n => n + 1);
    }
  }, []);

  useEffect(() => {
    setNotesRefreshToken(n => n + 1);
    setCategoriesRefreshToken(n => n + 1);
  }, []);

  const active = theme.primary;
  const inactive = theme.textMuted;
  const barBg = theme.categoryBar;
  const border = theme.border;
  const pageBg = theme.background;
  const minH = Math.max(windowH, Dimensions.get('screen').height);

  return (
    <MainTabProvider
      value={{
        setMainTab,
        openNotesWithCategoryFilter,
        pendingNotesCategoryFilter,
        clearPendingNotesCategoryFilter,
      }}>
      <View style={[styles.root, { backgroundColor: pageBg, minHeight: minH }]}>
        <View style={[styles.body, { backgroundColor: pageBg }]}>
          {tab === 'notes' ? (
            <NotesListScreen refreshToken={notesRefreshToken} />
          ) : tab === 'categories' ? (
            <CategoriesScreen refreshToken={categoriesRefreshToken} />
          ) : (
            <SettingsScreen />
          )}
        </View>
        <View style={[styles.tabBar, { backgroundColor: barBg, borderTopColor: border, paddingBottom: insets.bottom }]}>
          <Pressable style={styles.tabItem} onPress={() => setMainTab('notes')}>
            <Text style={[styles.tabLabel, { color: tab === 'notes' ? active : inactive }]}>Notes</Text>
          </Pressable>
          <Pressable style={styles.tabItem} onPress={() => setMainTab('categories')}>
            <Text style={[styles.tabLabel, { color: tab === 'categories' ? active : inactive }]}>Categories</Text>
          </Pressable>
          <Pressable style={styles.tabItem} onPress={() => setMainTab('settings')}>
            <Text style={[styles.tabLabel, { color: tab === 'settings' ? active : inactive }]}>Settings</Text>
          </Pressable>
        </View>
      </View>
    </MainTabProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%' },
  body: { flex: 1, minHeight: 0 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});
