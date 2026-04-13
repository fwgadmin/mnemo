// @ts-check
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const shimGestureHandler = path.resolve(__dirname, 'src/shims/react-native-gesture-handler.js');

/** Dev / Metro: stub avoids TurboModuleRegistry when RNGH native is missing. Production bundles use real RNGH. Override with EXPO_USE_RNGH_SHIM=0|1. */
function useGestureHandlerShim() {
  if (process.env.EXPO_USE_RNGH_SHIM === '1') return true;
  if (process.env.EXPO_USE_RNGH_SHIM === '0') return false;
  return process.env.NODE_ENV !== 'production';
}

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-gesture-handler' && useGestureHandlerShim()) {
    return { filePath: shimGestureHandler, type: 'sourceFile' };
  }
  if (typeof upstreamResolveRequest === 'function') {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
