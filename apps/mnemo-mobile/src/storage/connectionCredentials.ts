/**
 * Credential persistence: prefer Expo Secure Store, then AsyncStorage, then in-memory (session only).
 * Uses synchronous `require()` after native checks so Metro keeps a stable module graph (avoids
 * "requiring unknown module <id>" from async chunks). Rebuild dev client for Keychain storage.
 */
import { NativeModules, TurboModuleRegistry } from 'react-native';

const KEY_URL = 'mnemo_turso_url';
const KEY_TOKEN = 'mnemo_turso_token';
const KEY_TENANT = 'mnemo_tenant_id';

type SecureStoreModule = {
  getItemAsync: (key: string, options?: object) => Promise<string | null>;
  setItemAsync: (key: string, value: string, options?: object) => Promise<void>;
  deleteItemAsync: (key: string, options?: object) => Promise<void>;
};

type AsyncStorageModule = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

type StorageImpl =
  | { kind: 'secure'; secure: SecureStoreModule }
  | { kind: 'async'; AsyncStorage: AsyncStorageModule }
  | { kind: 'memory'; map: Map<string, string> };

let cachedImpl: StorageImpl | null = null;

function hasExpoSecureStoreNative(): boolean {
  try {
    return NativeModules.ExpoSecureStore != null;
  } catch {
    return false;
  }
}

function tryRequireSecureStore(): SecureStoreModule | null {
  if (!hasExpoSecureStoreNative()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-secure-store') as SecureStoreModule;
  } catch {
    return null;
  }
}

/**
 * AsyncStorage.native.js throws synchronously if RCTAsyncStorage is null — do not require() until native exists.
 * @see https://github.com/react-native-async-storage/async-storage/blob/main/packages/default-storage/lib/module/AsyncStorage.native.js
 */
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

function warnMemoryFallback(): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(
      '[mnemo-mobile] No SecureStore / AsyncStorage native modules. Using session-only memory for credentials. ' +
        'Rebuild your development client (expo-secure-store, async-storage autolinking).',
    );
  }
}

function getImpl(): StorageImpl {
  if (!cachedImpl) {
    const secure = tryRequireSecureStore();
    if (secure) {
      cachedImpl = { kind: 'secure', secure };
    } else {
      const asyncSt = tryRequireAsyncStorage();
      if (asyncSt) {
        cachedImpl = { kind: 'async', AsyncStorage: asyncSt };
      } else {
        warnMemoryFallback();
        cachedImpl = { kind: 'memory', map: new Map() };
      }
    }
  }
  return cachedImpl;
}

async function getItem(key: string): Promise<string | null> {
  const impl = getImpl();
  if (impl.kind === 'memory') return impl.map.get(key) ?? null;
  if (impl.kind === 'secure') return impl.secure.getItemAsync(key);
  return impl.AsyncStorage.getItem(key);
}

async function setItem(key: string, value: string): Promise<void> {
  const impl = getImpl();
  if (impl.kind === 'memory') {
    impl.map.set(key, value);
    return;
  }
  if (impl.kind === 'secure') {
    await impl.secure.setItemAsync(key, value);
    return;
  }
  await impl.AsyncStorage.setItem(key, value);
}

async function removeItem(key: string): Promise<void> {
  const impl = getImpl();
  if (impl.kind === 'memory') {
    impl.map.delete(key);
    return;
  }
  if (impl.kind === 'secure') {
    await impl.secure.deleteItemAsync(key);
    return;
  }
  await impl.AsyncStorage.removeItem(key);
}

export type StoredConnection = {
  url: string;
  token: string;
  tenantId: string;
};

export async function loadConnection(): Promise<StoredConnection | null> {
  const [url, token, tenantRaw] = await Promise.all([
    getItem(KEY_URL),
    getItem(KEY_TOKEN),
    getItem(KEY_TENANT),
  ]);
  if (!url?.trim() || !token?.trim()) return null;
  return {
    url: url.trim(),
    token: token.trim(),
    tenantId: tenantRaw?.trim() || 'default',
  };
}

export async function saveConnection(input: StoredConnection): Promise<void> {
  await Promise.all([
    setItem(KEY_URL, input.url.trim()),
    setItem(KEY_TOKEN, input.token.trim()),
    setItem(KEY_TENANT, input.tenantId.trim() || 'default'),
  ]);
}

export async function clearConnection(): Promise<void> {
  await Promise.all([removeItem(KEY_URL), removeItem(KEY_TOKEN), removeItem(KEY_TENANT)]);
}
