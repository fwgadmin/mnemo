import React from 'react';
import { StyleSheet, useColorScheme, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppShell } from './src/AppShell';
import { FallbackSafeAreaProvider } from './src/components/FallbackSafeAreaProvider';
import { ThemePreferenceProvider } from './src/context/ThemePreferenceContext';
import { hasRNCSafeAreaProvider } from './src/lib/hasRNCSafeAreaProvider';
import { getThemeForScheme } from './src/theme/theme';

const SafeAreaRoot = hasRNCSafeAreaProvider() ? SafeAreaProvider : FallbackSafeAreaProvider;

/**
 * Sync imports only — lazy + Suspense was leaving a frame where iOS showed white before the stack painted.
 */
export default function App() {
  const scheme = useColorScheme();
  const { height } = useWindowDimensions();
  const bg = getThemeForScheme(scheme).background;
  return (
    <GestureHandlerRootView style={[styles.root, { minHeight: height, backgroundColor: bg }]}>
      <SafeAreaRoot>
        <ThemePreferenceProvider>
          <AppShell />
        </ThemePreferenceProvider>
      </SafeAreaRoot>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
