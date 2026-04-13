import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const KEY_URL = 'mnemo_turso_url';
const KEY_TOKEN = 'mnemo_turso_token';
const KEY_TENANT = 'mnemo_tenant_id';

export type StoredConnection = {
  url: string;
  token: string;
  tenantId: string;
};

export async function loadConnection(): Promise<StoredConnection | null> {
  const [url, token, tenantRaw] = await Promise.all([
    SecureStore.getItemAsync(KEY_URL),
    SecureStore.getItemAsync(KEY_TOKEN),
    AsyncStorage.getItem(KEY_TENANT),
  ]);
  if (!url?.trim() || !token?.trim()) return null;
  return {
    url: url.trim(),
    token: token.trim(),
    tenantId: (tenantRaw?.trim() || 'default') || 'default',
  };
}

export async function saveConnection(input: StoredConnection): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEY_URL, input.url.trim()),
    SecureStore.setItemAsync(KEY_TOKEN, input.token.trim()),
    AsyncStorage.setItem(KEY_TENANT, input.tenantId.trim() || 'default'),
  ]);
}

export async function clearConnection(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_URL),
    SecureStore.deleteItemAsync(KEY_TOKEN),
    AsyncStorage.removeItem(KEY_TENANT),
  ]);
}
