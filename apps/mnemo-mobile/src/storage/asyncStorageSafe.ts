/**
 * Lazy AsyncStorage access — never import @react-native-async-storage at module load.
 * If RCTAsyncStorage is null (bridge not ready), defer and retry; fall back to in-memory map.
 * @see connectionCredentials.ts (same lazy require + retry pattern).
 */

type AsyncStorageModule = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

function tryRequireAsyncStorage(): AsyncStorageModule | null {
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

/** After a native error (e.g. RCTAsyncStorage is null), stop calling the broken module. */
let preferNativeAsyncStorage = true;

function getBacking(): AsyncStorageModule {
  if (!preferNativeAsyncStorage) return memoryKv;
  const native = tryRequireAsyncStorage();
  if (native) return native;
  if (typeof __DEV__ !== 'undefined' && __DEV__ && !warnedMemory) {
    warnedMemory = true;
    console.warn(
      '[mnemo-mobile] AsyncStorage not available yet — using in-memory KV until native storage is ready.',
    );
  }
  return memoryKv;
}

export async function kvGetItem(key: string): Promise<string | null> {
  try {
    return await getBacking().getItem(key);
  } catch {
    preferNativeAsyncStorage = false;
    if (typeof __DEV__ !== 'undefined' && __DEV__ && !warnedMemory) {
      warnedMemory = true;
      console.warn(
        '[mnemo-mobile] AsyncStorage native calls failed — using in-memory KV. Rebuild dev client if this persists.',
      );
    }
    return memoryKv.getItem(key);
  }
}

export async function kvSetItem(key: string, value: string): Promise<void> {
  try {
    return await getBacking().setItem(key, value);
  } catch {
    preferNativeAsyncStorage = false;
    return memoryKv.setItem(key, value);
  }
}

export async function kvRemoveItem(key: string): Promise<void> {
  try {
    return await getBacking().removeItem(key);
  } catch {
    preferNativeAsyncStorage = false;
    return memoryKv.removeItem(key);
  }
}
