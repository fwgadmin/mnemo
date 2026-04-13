import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { NoteDetailScreen } from '../screens/NoteDetailScreen';
import { NoteEditorScreen } from '../screens/NoteEditorScreen';
import { LegalScreen } from '../screens/LegalScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { useAppTheme } from '../theme/theme';
import { MainTabsScreen } from './MainTabsScreen';
import { MobileNavProvider, useMobileNav } from './MobileNavContext';

/**
 * No @react-navigation/stack — it was painting a full-screen white layer on iOS/Expo Go.
 * Plain Views + a tiny stack state in MobileNavProvider.
 */
function RootNavigatorBody() {
  const theme = useAppTheme();
  const { top } = useMobileNav();

  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {top.name === 'Main' ? <MainTabsScreen /> : null}
      {top.name === 'NoteDetail' ? <NoteDetailScreen /> : null}
      {top.name === 'NoteEditor' ? <NoteEditorScreen /> : null}
      {top.name === 'Search' ? <SearchScreen /> : null}
      {top.name === 'Legal' ? (
        <LegalScreen doc={top.params?.doc === 'terms' ? 'terms' : 'privacy'} />
      ) : null}
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
