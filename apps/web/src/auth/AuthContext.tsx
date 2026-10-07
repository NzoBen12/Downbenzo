import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, SESSION_EXPIRED_EVENT } from '../api/client';

export interface SessionUser {
  id: string; email: string; fullName: string; roleCode: string; permissions: string[];
  agencyId: string | null; managerId: string | null;
}

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  sessionExpired: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (...permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    api.get<{ user: SessionUser }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setUser((u) => {
        if (u) setSessionExpired(true);
        return null;
      });
      queryClient.clear();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [queryClient]);

  const login = useCallback(async (identifier: string, password: string) => {
    const r = await api.post<{ user: SessionUser }>('/auth/login', { identifier, password });
    setSessionExpired(false);
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({ user, loading, sessionExpired, login, logout, can: (...p) => p.every((x) => user?.permissions.includes(x)) }),
    [user, loading, sessionExpired, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

/** Sólo UX: la autorización real se aplica en el backend. */
export function Can({ permission, children }: { permission: string | string[]; children: ReactNode }) {
  const { can } = useAuth();
  return can(...(Array.isArray(permission) ? permission : [permission])) ? <>{children}</> : null;
}
