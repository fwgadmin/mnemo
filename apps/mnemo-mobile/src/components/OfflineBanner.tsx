import React, { useEffect, useState } from 'react';
import { NativeModules, StyleSheet, Text, View } from 'react-native';

function isOfflineState(state: {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}): boolean {
  if (state.isConnected === false) return true;
  if (state.isInternetReachable === false) return true;
  return false;
}

function hasExpoNetworkNative(): boolean {
  try {
    return NativeModules.ExpoNetwork != null;
  } catch {
    return false;
  }
}

/**
 * Uses `expo-network` with synchronous `require()` after a native check so Metro does not split
 * async chunks (can trigger "requiring unknown module <id>"). If the module is missing, no UI.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!hasExpoNetworkNative()) return;

    let cancelled = false;
    let subscription: { remove: () => void } | undefined;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Network = require('expo-network');
      subscription = Network.addNetworkStateListener((state: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) => {
        if (!cancelled) setOffline(isOfflineState(state));
      });
      void Network.getNetworkStateAsync().then((initial: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) => {
        if (!cancelled) setOffline(isOfflineState(initial));
      });
    } catch {
      // Native or JS unavailable
    }

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  if (!offline) return null;

  return (
    <View style={[styles.bar, { backgroundColor: '#92400e' }]}>
      <Text style={[styles.text, { color: '#fffbeb' }]}>
        Offline — showing cached notes. Edits are saved on this device and sync when you are back online.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  text: {
    fontSize: 13,
    textAlign: 'center',
  },
});
