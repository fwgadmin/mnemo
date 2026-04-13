/**
 * Lazy AsyncStorage access — never import @react-native-async-storage at module load.
 * If RCTAsyncStorage is null (bridge not ready), defer and retry; fall back to in-memory map.
 * @see connectionCredentials.ts (same native checks).
 */
import { NativeModules, TurboModuleRegistry } from 'react-native';

type AsyncStorageModule = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

function hasAsyncStorageNative(): boolean {
  try {
    if (NativeModules.RNCAsyncStorage != null) return true;
    if (NativeModules.AsyncSQLiteDBStorage != null) return true;
    if (NativeModules.PlatformLocalStorage != null) return true;
    if (NativeModules.AsyncLocalStorage != null) return true;
    const tryTurbo = (name: string) => {
      try {
        return TurboModuleRegistry?.get?.(name) != null;
      } catch {
        return false;
      }
    };
    if (tryTurbo('RNCAsyncStorage') || tryTurbo('AsyncSQLiteDBStorage') || tryTurbo('PlatformLocalStorage')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function tryRequireAsyncStorage(): AsyncStorageModule | null {
  if (!hasAsyncStorageNative()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-async-storage/async-storage').default;
  } catch {
    return null;
  }
}

const memoryMap = new Map<string, string>();

const memoryKv: AsyncStorageModule = {
  getItem: async key => memoryMap.get(key) ?? null,
  setItem: async (key, value) => {
    memoryMap.set(key, value);
  },
  removeItem: async key => {
    memoryMap.delete(key);
  },
};

let warnedMemory = false;
/** After a native call throws (e.g. bridge not ready), stay on memory for this session. */
let preferMemory = false;

function getBacking(): AsyncStorageModule {
  if (preferMemory) return memoryKv;
  const native = tryRequireAsyncStorage();
  if (native) return native;
  if (typeof __DEV__ !== 'undefined' && __DEV__ && !warnedMemory) {
    warnedMemory = true;
    console.warn(
      '[mnemo-mobile] AsyncStorage native module not available yet — using in-memory note cache until it is.',
    );
  }
  return memoryKv;
}

export async function kvGetItem(key: string): Promise<string | null> {
  try {
    return await getBacking().getItem(key);
  } catch {
    preferMemory = true;
    return memoryKv.getItem(key);
  }
}

export async function kvSetItem(key: string, value: string): Promise<void> {
  try {
    return await getBacking().setItem(key, value);
  } catch {
    preferMemory = true;
    return memoryKv.setItem(key, value);
  }
}

export async function kvRemoveItem(key: string): Promise<void> {
  try {
    return await getBacking().removeItem(key);
  } catch {
    preferMemory = true;
    return memoryKv.removeItem(key);
  }
}
