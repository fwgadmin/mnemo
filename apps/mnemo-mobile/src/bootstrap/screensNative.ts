/**
 * Must run before any navigator imports. If the dev client lacks react-native-screens
 * native code, disable native screens so React Navigation uses JS views (no RNSScreen*).
 */
import { Platform, UIManager } from 'react-native';
import { enableScreens } from 'react-native-screens';

if (Platform.OS !== 'web') {
  const linked = UIManager.getViewManagerConfig?.('RNSScreen') != null;
  if (!linked) {
    enableScreens(false);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(
        '[mnemo-mobile] react-native-screens native module missing; using JS stack. Rebuild dev client.',
      );
    }
  }
}
