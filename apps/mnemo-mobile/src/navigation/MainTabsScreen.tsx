import React, { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NotesListScreen } from '../screens/NotesListScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { MainTabProvider } from './MainTabContext';

/**
 * Notes + Settings without @react-navigation/bottom-tabs (avoids nested tab/stack layout bugs on iOS).
 * One root stack handles pushes (detail, editor, search); this screen is only "Main".
 */
export function MainTabsScreen() {
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const [tab, setTab] = useState<'notes' | 'settings'>('notes');
  const [notesRefreshToken, setNotesRefreshToken] = useState(0);

  const setMainTab = useCallback((t: 'notes' | 'settings') => {
    setTab(t);
    if (t === 'notes') {
      setNotesRefreshToken(n => n + 1);
    }
  }, []);

  useEffect(() => {
    setNotesRefreshToken(n => n + 1);
  }, []);

  const active = '#2563eb';
  const inactive = '#6b7280';
  const barBg = scheme === 'dark' ? '#181b26' : '#ffffff';
  const border = scheme === 'dark' ? '#2d3344' : '#e2e4e8';
  const pageBg = scheme === 'dark' ? '#0f1117' : '#f6f7f9';
  const minH = Math.max(windowH, Dimensions.get('screen').height);

  return (
    <MainTabProvider value={{ setMainTab }}>
      <View style={[styles.root, { backgroundColor: pageBg, minHeight: minH }]}>
        <View style={[styles.body, { backgroundColor: pageBg }]}>
          {tab === 'notes' ? (
            <NotesListScreen refreshToken={notesRefreshToken} />
          ) : (
            <SettingsScreen />
          )}
        </View>
        <View style={[styles.tabBar, { backgroundColor: barBg, borderTopColor: border, paddingBottom: insets.bottom }]}>
          <Pressable style={styles.tabItem} onPress={() => setMainTab('notes')}>
            <Text style={[styles.tabLabel, { color: tab === 'notes' ? active : inactive }]}>Notes</Text>
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
