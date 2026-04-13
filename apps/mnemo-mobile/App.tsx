import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppShell } from './src/AppShell';
import { FallbackSafeAreaProvider } from './src/components/FallbackSafeAreaProvider';
import { hasRNCSafeAreaProvider } from './src/lib/hasRNCSafeAreaProvider';

const SafeAreaRoot = hasRNCSafeAreaProvider() ? SafeAreaProvider : FallbackSafeAreaProvider;

/**
 * Sync imports only — lazy + Suspense was leaving a frame where iOS showed white before the stack painted.
 */
export default function App() {
  const { height } = useWindowDimensions();
  return (
    <GestureHandlerRootView style={[styles.root, { minHeight: height }]}>
      <SafeAreaRoot>
        <AppShell />
      </SafeAreaRoot>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f6f7f9',
  },
});
