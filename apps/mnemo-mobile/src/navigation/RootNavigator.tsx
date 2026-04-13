import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { useColorScheme, View } from 'react-native';
import { NoteDetailScreen } from '../screens/NoteDetailScreen';
import { NoteEditorScreen } from '../screens/NoteEditorScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { MainTabsScreen } from './MainTabsScreen';
import { MobileNavProvider, useMobileNav } from './MobileNavContext';

/**
 * No @react-navigation/stack — it was painting a full-screen white layer on iOS/Expo Go.
 * Plain Views + a tiny stack state in MobileNavProvider.
 */
function RootNavigatorBody() {
  const scheme = useColorScheme();
  const bg = scheme === 'dark' ? '#0f1117' : '#f6f7f9';
  const { top } = useMobileNav();

  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {top.name === 'Main' ? <MainTabsScreen /> : null}
      {top.name === 'NoteDetail' ? <NoteDetailScreen /> : null}
      {top.name === 'NoteEditor' ? <NoteEditorScreen /> : null}
      {top.name === 'Search' ? <SearchScreen /> : null}
    </View>
  );
}

export function RootNavigator() {
  return (
    <MobileNavProvider>
      <RootNavigatorBody />
    </MobileNavProvider>
  );
}
