import { useEffect, useState } from 'react';
import { NativeModules } from 'react-native';

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

/** True when the device appears to have network (Expo Go / dev client). Defaults to true if module missing. */
export function useNetworkOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!hasExpoNetworkNative()) return;

    let cancelled = false;
    let subscription: { remove: () => void } | undefined;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Network = require('expo-network');
      subscription = Network.addNetworkStateListener(
        (state: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) => {
          if (!cancelled) setOnline(!isOfflineState(state));
        },
      );
      void Network.getNetworkStateAsync().then(
        (initial: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) => {
          if (!cancelled) setOnline(!isOfflineState(initial));
        },
      );
    } catch {
      // ignore
    }

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  return online;
}
