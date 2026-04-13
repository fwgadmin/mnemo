import type { Client } from '@libsql/client/web';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { InteractionManager } from 'react-native';
import { createTursoClient } from '../data/turso';
import { useNetworkOnline } from '../hooks/useNetworkOnline';
import { runFlushOutbox } from '../sync/persist';
import { clearConnection, loadConnection, saveConnection, type StoredConnection } from '../storage/connectionCredentials';

type ConnectionState = {
  client: Client | null;
  tenantId: string;
  configured: boolean;
  bootstrapping: boolean;
  lastError: string | null;
  isOnline: boolean;
};

type ConnectionContextValue = ConnectionState & {
  refreshClient: () => Promise<void>;
  applyCredentials: (c: StoredConnection) => Promise<void>;
  clearCredentials: () => Promise<void>;
  flushSync: () => Promise<{ ok: number; failed: number } | null>;
};

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<Client | null>(null);
  const [tenantId, setTenantId] = useState('default');
  const [bootstrapping, setBootstrapping] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const isOnline = useNetworkOnline();

  const refreshClient = useCallback(async () => {
    setLastError(null);
    const stored = await loadConnection();
    if (!stored) {
      setClient(null);
      setTenantId('default');
      return;
    }
    try {
      const c = createTursoClient(stored.url, stored.token);
      setClient(c);
      setTenantId(stored.tenantId);
    } catch (e) {
      setClient(null);
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const applyCredentials = useCallback(async (c: StoredConnection) => {
    await saveConnection(c);
    await refreshClient();
  }, [refreshClient]);

  const clearCredentials = useCallback(async () => {
    await clearConnection();
    setClient(null);
    setTenantId('default');
    setLastError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const bootstrapTimeoutMs = 15000;
    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          await Promise.race([
            refreshClient(),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error('Connection bootstrap timeout')), bootstrapTimeoutMs),
            ),
          ]);
        } catch {
          // Stale storage / SecureStore hang — still show UI
        } finally {
          if (!cancelled) setBootstrapping(false);
        }
        // Second pass: native SecureStore/AsyncStorage can be ready shortly after first read
        if (!cancelled) {
          retryTimer = setTimeout(() => {
            if (!cancelled) void refreshClient();
          }, 250);
        }
      })();
    });
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      task.cancel();
    };
  }, [refreshClient]);

  const flushSync = useCallback(async () => {
    if (!client) return null;
    return runFlushOutbox(client, tenantId);
  }, [client, tenantId]);

  useEffect(() => {
    if (!client || !isOnline) return;
    void runFlushOutbox(client, tenantId).catch(() => {});
  }, [client, tenantId, isOnline]);

  const value = useMemo<ConnectionContextValue>(
    () => ({
      client,
      tenantId,
      configured: !!client,
      bootstrapping,
      lastError,
      isOnline,
      refreshClient,
      applyCredentials,
      clearCredentials,
      flushSync,
    }),
    [client, tenantId, bootstrapping, lastError, isOnline, refreshClient, applyCredentials, clearCredentials, flushSync],
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnection must be used within ConnectionProvider');
  return ctx;
}
