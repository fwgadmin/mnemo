import React, { useMemo } from 'react';
import { Dimensions, Platform, StatusBar, View } from 'react-native';
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
} from 'react-native-safe-area-context';
import type { EdgeInsets, Rect } from 'react-native-safe-area-context';

/**
 * Provides safe-area context without `RNCSafeAreaProvider` (approximate insets).
 * Used when the dev client binary predates `react-native-safe-area-context` native code.
 */
export function FallbackSafeAreaProvider({ children }: { children: React.ReactNode }) {
  const window = Dimensions.get('window');

  const insets: EdgeInsets = useMemo(() => {
    if (Platform.OS === 'android') {
      return {
        top: StatusBar.currentHeight ?? 0,
        bottom: 0,
        left: 0,
        right: 0,
      };
    }
    // iOS: rough defaults when native safe area is unavailable (rebuild dev client for real values)
    return { top: 54, bottom: 34, left: 0, right: 0 };
  }, []);

  const frame: Rect = useMemo(
    () => ({
      x: 0,
      y: 0,
      width: window.width,
      height: window.height,
    }),
    [window.height, window.width],
  );

  return (
    <SafeAreaFrameContext.Provider value={frame}>
      <SafeAreaInsetsContext.Provider value={insets}>
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </SafeAreaFrameContext.Provider>
  );
}
