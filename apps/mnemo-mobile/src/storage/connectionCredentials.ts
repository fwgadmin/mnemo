/**
 * Credential persistence: prefer Expo Secure Store, then AsyncStorage, then in-memory (session only).
 * If you see the in-memory warning, rebuild the dev client so native modules are linked
 * (`eas build --profile development` or `npx expo prebuild && npx expo run:ios|android`).
 */
import { NativeModules } from 'react-native';

const KEY_URL = 'mnemo_turso_url';
const KEY_TOKEN = 'mnemo_turso_token';
const KEY_TENANT = 'mnemo_tenant_id';

type SecureStoreModule = {
  getItemAsync: (key: string, options?: object) => Promise<string | null>;
  setItemAsync: (key: string, value: string, options?: object) => Promise<void>;
  deleteItemAsync: (key: string, options?: object) => Promise<void>;
};

type StorageImpl =
  | { kind: 'secure'; secure: SecureStoreModule }
  | { kind: 'async'; AsyncStorage: typeof import('@react-native-async-storage/async-storage').default }
  | { kind: 'memory'; map: Map<string, string> };

let implPromise: Promise<StorageImpl> | null = null;

/** Do not `import('expo-secure-store')` unless native is present — loading that JS calls `requireNativeModule` and can surface as an uncaught error. */
function hasExpoSecureStoreNative(): boolean {
  try {
    return NativeModules.ExpoSecureStore != null;
  } catch {
    return false;
  }
}

function warnMemoryFallback(): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(
      '[mnemo-mobile] No native secure storage module. Using session-only memory for credentials. ' +
        'Rebuild your development client after native changes (expo-secure-store in app.json plugins).',
    );
  }
}

async function getImpl(): Promise<StorageImpl> {
  if (!implPromise) {
    implPromise = (async (): Promise<StorageImpl> => {
      if (hasExpoSecureStoreNative()) {
        try {
          const secure = (await import('expo-secure-store')) as SecureStoreModule;
          return { kind: 'secure', secure };
        } catch {
          // Rare: native present but JS load failed
        }
      }
      try {
        const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
        return { kind: 'async', AsyncStorage };
      } catch {
        // e.g. tests or very old binary
      }
      warnMemoryFallback();
      return { kind: 'memory', map: new Map() };
    })();
  }
  return implPromise;
}

async function getItem(key: string): Promise<string | null> {
  const impl = await getImpl();
  if (impl.kind === 'memory') return impl.map.get(key) ?? null;
  if (impl.kind === 'secure') return impl.secure.getItemAsync(key);
  return impl.AsyncStorage.getItem(key);
}

async function setItem(key: string, value: string): Promise<void> {
  const impl = await getImpl();
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
  const impl = await getImpl();
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
