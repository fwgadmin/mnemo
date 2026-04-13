import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConnectionProvider, useConnection } from './src/context/ConnectionContext';
import { RootNavigator } from './src/navigation/RootNavigator';

function AppInner() {
  const scheme = useColorScheme();
  const { bootstrapping } = useConnection();

  if (bootstrapping) {
    return (
      <View style={[styles.boot, { backgroundColor: scheme === 'dark' ? '#0f1117' : '#f6f7f9' }]}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <>
      <RootNavigator />
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ConnectionProvider>
        <AppInner />
      </ConnectionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
