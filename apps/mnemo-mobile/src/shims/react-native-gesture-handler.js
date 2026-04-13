/**
 * JS-only stand-in when the dev client has no native RNGestureHandlerModule.
 * Metro resolves `react-native-gesture-handler` here so React Navigation
 * can run without TurboModuleRegistry errors. Swipe-back gestures are inert.
 * Rebuild the app with react-native-gesture-handler linked for real gestures.
 */
import React from 'react';
import { View } from 'react-native';

const PassThrough = React.forwardRef(function PassThrough(props, ref) {
  return <View ref={ref} {...props} />;
});

export const PanGestureHandler = PassThrough;
export const GestureHandlerRootView = PassThrough;
export const TapGestureHandler = PassThrough;
export const LongPressGestureHandler = PassThrough;
export const FlingGestureHandler = PassThrough;
export const ForceTouchGestureHandler = PassThrough;
export const PinchGestureHandler = PassThrough;
export const RotationGestureHandler = PassThrough;
export const NativeViewGestureHandler = PassThrough;
export const RawButton = PassThrough;
export const BorderlessButton = PassThrough;
export const RectButton = PassThrough;
export const BaseButton = PassThrough;
export const TouchableHighlight = PassThrough;
export const TouchableNativeFeedback = PassThrough;
export const TouchableOpacity = PassThrough;
export const TouchableWithoutFeedback = PassThrough;
export const ScrollView = PassThrough;
export const Switch = PassThrough;
export const TextInput = PassThrough;
export const DrawerLayout = PassThrough;
export const Swipeable = PassThrough;

export const State = {
  UNDETERMINED: 0,
  FAILED: 1,
  BEGAN: 2,
  CANCELLED: 3,
  ACTIVE: 4,
  END: 5,
};

export const Directions = {
  RIGHT: 1,
  LEFT: 2,
  UP: 4,
  DOWN: 8,
};

export const PointerType = {
  TOUCH: 0,
  STYLUS: 1,
  MOUSE: 2,
  KEY: 3,
  OTHER: 4,
};

export function gestureHandlerRootHOC(Component) {
  return Component;
}
