import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { CategoryColorsProvider } from './context/CategoryColorsContext';
import { ConnectionProvider, useConnection } from './context/ConnectionContext';
import { useThemePreference } from './context/ThemePreferenceContext';
import { RootNavigator } from './navigation/RootNavigator';
import { useAppTheme } from './theme/theme';

function AppInner() {
  const { resolvedScheme } = useThemePreference();
  const theme = useAppTheme();
  const { height } = useWindowDimensions();
  const { bootstrapping } = useConnection();

  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  if (bootstrapping) {
    return (
      <View style={[styles.boot, { minHeight: height, backgroundColor: theme.surfaceActive }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.bootHint, { color: theme.primary }]}>Connecting…</Text>
      </View>
    );
  }

  return (
    <CategoryColorsProvider>
      <View style={[styles.appRoot, { minHeight: height, backgroundColor: theme.background }]}>
        <RootNavigator />
        <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    </CategoryColorsProvider>
  );
}

export function AppShell() {
  return (
    <ConnectionProvider>
      <AppErrorBoundary>
        <AppInner />
      </AppErrorBoundary>
    </ConnectionProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootHint: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '500',
  },
});
