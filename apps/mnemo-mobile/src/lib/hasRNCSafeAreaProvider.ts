import { Platform, UIManager } from 'react-native';

/**
 * True when the native view manager from `react-native-safe-area-context` is registered.
 * If false (stale dev client / missing native rebuild), use {@link FallbackSafeAreaProvider}.
 */
export function hasRNCSafeAreaProvider(): boolean {
  if (Platform.OS === 'web') return true;
  try {
    const cfg = UIManager.getViewManagerConfig?.('RNCSafeAreaProvider');
    return cfg != null;
  } catch {
    return false;
  }
}
