/**
 * Run before navigators load (see index.ts). With `enableScreens(false)`, React Navigation
 * uses plain Views instead of RNSScreen / RNSScreenStack — required when the dev client does
 * not implement those native screens (see red overlay: "Unimplemented component: RNSScreenStack").
 */
import { Platform } from 'react-native';
import { enableScreens } from 'react-native-screens';

if (Platform.OS !== 'web') {
  enableScreens(false);
}
