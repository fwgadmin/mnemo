import type { ErrorUtils as ErrorUtilsApi } from 'react-native/Libraries/vendor/core/ErrorUtils';

/**
 * Wrap RN's handler so startup / release errors log a clear prefix before redbox / RCTFatal.
 * Must run after `react-native` has initialized `global.ErrorUtils` (see earlyStartup import order).
 */
export function installGlobalErrorHandler(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ErrorUtils = require('react-native/Libraries/vendor/core/ErrorUtils').default as ErrorUtilsApi;
  const prev = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    const err = error instanceof Error ? error : new Error(String(error));
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[mnemo-mobile] JS error', {
        isFatal,
        name: err.name,
        message: err.message,
        stack: err.stack,
      });
    } else {
      console.error('[mnemo-mobile] JS error', err.message);
    }
    prev(error, isFatal);
  });
}
