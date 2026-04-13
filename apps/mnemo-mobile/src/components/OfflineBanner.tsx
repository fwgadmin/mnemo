import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

function isOfflineState(state: {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}): boolean {
  if (state.isConnected === false) return true;
  if (state.isInternetReachable === false) return true;
  return false;
}

/**
 * Uses `expo-network` (Expo native module), loaded only at runtime.
 * If the native module is missing (stale dev client), we show nothing — no crash.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let subscription: { remove: () => void } | undefined;

    void (async () => {
      try {
        const Network = await import('expo-network');
        subscription = Network.addNetworkStateListener(state => {
          if (!cancelled) setOffline(isOfflineState(state));
        });
        const initial = await Network.getNetworkStateAsync();
        if (!cancelled) setOffline(isOfflineState(initial));
      } catch {
        // ExpoNetwork not in binary — skip offline UI (rebuild dev client to enable).
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  if (!offline) return null;

  return (
    <View style={[styles.bar, { backgroundColor: '#92400e' }]}>
      <Text style={[styles.text, { color: '#fffbeb' }]}>
        You appear offline. Notes load from Turso when the network is available.
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
