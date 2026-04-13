/**
 * Credential persistence: prefer Expo Secure Store, then AsyncStorage, then in-memory (session only).
 * Uses synchronous `require()` after native checks so Metro keeps a stable module graph (avoids
 * "requiring unknown module <id>" from async chunks). Rebuild dev client for Keychain storage.
 */

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

/** Session-only fallback when native storage is not yet linked or bridge not ready. */
const memorySingleton = new Map<string, string>();

let warnedMemory = false;

/**
 * Prefer expo-secure-store, then AsyncStorage. If the JS package loads but native calls fail
 * (e.g. "Cannot find native module 'ExpoSecureStore'", "AsyncStorage is null"), skip that tier.
 */
let preferSecureStore = true;
let preferAsyncStorage = true;

/**
 * Prefer expo-secure-store. Do not gate on `NativeModules.ExpoSecureStore` — Expo modules use
 * `requireNativeModule` and may work when the legacy NativeModules map is empty (new architecture).
 */
function tryRequireSecureStore(): SecureStoreModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-secure-store') as Record<string, unknown>;
    if (typeof mod['getItemAsync'] !== 'function') return null;
    return mod as unknown as SecureStoreModule;
  } catch {
    return null;
  }
}

/** Try load; may throw if native not linked — caught by caller. Prefer retrying on each access so a late bridge still works. */
function tryRequireAsyncStorage(): AsyncStorageModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-async-storage/async-storage').default;
  } catch {
    return null;
  }
}

function warnMemoryFallbackOnce(): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__ && !warnedMemory) {
    warnedMemory = true;
    console.warn(
      '[mnemo-mobile] No SecureStore / AsyncStorage native modules yet. Using in-memory session for credentials until durable storage is available. Rebuild dev client if this persists.',
    );
  }
}

/** Resolve each time so a late-ready bridge picks up SecureStore/AsyncStorage instead of locking to memory forever. */
function resolveImpl(): StorageImpl {
  if (preferSecureStore) {
    const secure = tryRequireSecureStore();
    if (secure) return { kind: 'secure', secure };
  }
  if (preferAsyncStorage) {
    const asyncSt = tryRequireAsyncStorage();
    if (asyncSt) return { kind: 'async', AsyncStorage: asyncSt };
  }
  warnMemoryFallbackOnce();
  return { kind: 'memory', map: memorySingleton };
}

async function migrateMemoryToDurable(impl: StorageImpl): Promise<void> {
  if (impl.kind === 'memory' || memorySingleton.size === 0) return;
  try {
    for (const [k, v] of [...memorySingleton.entries()]) {
      if (impl.kind === 'secure') {
        await impl.secure.setItemAsync(k, v);
      } else {
        await impl.AsyncStorage.setItem(k, v);
      }
    }
    memorySingleton.clear();
  } catch {
    if (impl.kind === 'secure') preferSecureStore = false;
    else preferAsyncStorage = false;
    throw new Error('mnemo_storage_migrate');
  }
}

async function getItem(key: string): Promise<string | null> {
  try {
    const impl = resolveImpl();
    try {
      await migrateMemoryToDurable(impl);
    } catch {
      if (impl.kind === 'secure') preferSecureStore = false;
      else if (impl.kind === 'async') preferAsyncStorage = false;
      return getItem(key);
    }
    if (impl.kind === 'memory') return impl.map.get(key) ?? null;
    try {
      if (impl.kind === 'secure') return await impl.secure.getItemAsync(key);
      return await impl.AsyncStorage.getItem(key);
    } catch {
      if (impl.kind === 'secure') preferSecureStore = false;
      else if (impl.kind === 'async') preferAsyncStorage = false;
      return getItem(key);
    }
  } catch {
    warnMemoryFallbackOnce();
    return memorySingleton.get(key) ?? null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  try {
    const impl = resolveImpl();
    try {
      await migrateMemoryToDurable(impl);
    } catch {
      if (impl.kind === 'secure') preferSecureStore = false;
      else if (impl.kind === 'async') preferAsyncStorage = false;
      return setItem(key, value);
    }
    if (impl.kind === 'memory') {
      impl.map.set(key, value);
      return;
    }
    try {
      if (impl.kind === 'secure') {
        await impl.secure.setItemAsync(key, value);
        return;
      }
      await impl.AsyncStorage.setItem(key, value);
    } catch {
      if (impl.kind === 'secure') preferSecureStore = false;
      else if (impl.kind === 'async') preferAsyncStorage = false;
      return setItem(key, value);
    }
  } catch {
    warnMemoryFallbackOnce();
    memorySingleton.set(key, value);
  }
}

async function removeItem(key: string): Promise<void> {
  try {
    const impl = resolveImpl();
    try {
      await migrateMemoryToDurable(impl);
    } catch {
      if (impl.kind === 'secure') preferSecureStore = false;
      else if (impl.kind === 'async') preferAsyncStorage = false;
      return removeItem(key);
    }
    if (impl.kind === 'memory') {
      impl.map.delete(key);
      return;
    }
    try {
      if (impl.kind === 'secure') {
        await impl.secure.deleteItemAsync(key);
        return;
      }
      await impl.AsyncStorage.removeItem(key);
    } catch {
      if (impl.kind === 'secure') preferSecureStore = false;
      else if (impl.kind === 'async') preferAsyncStorage = false;
      return removeItem(key);
    }
  } catch {
    warnMemoryFallbackOnce();
    memorySingleton.delete(key);
  }
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
