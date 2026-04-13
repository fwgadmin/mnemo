import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { ConnectionProvider, useConnection } from './context/ConnectionContext';
import { RootNavigator } from './navigation/RootNavigator';

function AppInner() {
  const scheme = useColorScheme();
  const { height } = useWindowDimensions();
  const { bootstrapping } = useConnection();

  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  if (bootstrapping) {
    return (
      <View style={[styles.boot, { minHeight: height }]}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.bootHint}>Connecting…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.appRoot, { minHeight: height }]}>
      <AppErrorBoundary>
        <RootNavigator />
      </AppErrorBoundary>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

export function AppShell() {
  return (
    <ConnectionProvider>
      <AppInner />
    </ConnectionProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: '#f6f7f9',
  },
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dbeafe',
  },
  bootHint: {
    marginTop: 12,
    fontSize: 15,
    color: '#1e40af',
  },
});
