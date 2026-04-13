import type { Client } from '@libsql/client/web';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createTursoClient } from '../data/turso';
import { clearConnection, loadConnection, saveConnection, type StoredConnection } from '../storage/connectionCredentials';

type ConnectionState = {
  client: Client | null;
  tenantId: string;
  configured: boolean;
  bootstrapping: boolean;
  lastError: string | null;
};

type ConnectionContextValue = ConnectionState & {
  refreshClient: () => Promise<void>;
  applyCredentials: (c: StoredConnection) => Promise<void>;
  clearCredentials: () => Promise<void>;
};

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<Client | null>(null);
  const [tenantId, setTenantId] = useState('default');
  const [bootstrapping, setBootstrapping] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

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
    (async () => {
      await refreshClient();
      if (!cancelled) setBootstrapping(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshClient]);

  const value = useMemo<ConnectionContextValue>(
    () => ({
      client,
      tenantId,
      configured: !!client,
      bootstrapping,
      lastError,
      refreshClient,
      applyCredentials,
      clearCredentials,
    }),
    [client, tenantId, bootstrapping, lastError, refreshClient, applyCredentials, clearCredentials],
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnection must be used within ConnectionProvider');
  return ctx;
}
