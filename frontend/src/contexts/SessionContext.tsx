import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { SessionInfo } from '../services/api';
import { api } from '../services/api';
import toast from 'react-hot-toast';

interface SessionContextType {
  sessions: SessionInfo[];
  loading: boolean;
  error: string | null;
  refreshSessions: () => Promise<void>;
  createSession: (name: string, workingDirectory?: string, command?: string, envVars?: Record<string, string>) => Promise<string>;
  deleteSession: (sessionId: string) => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listSessions();
      setSessions(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch sessions';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const createSession = async (
    name: string,
    workingDirectory?: string,
    command?: string,
    envVars?: Record<string, string>
  ): Promise<string> => {
    try {
      const response = await api.createSession({
        name,
        working_directory: workingDirectory,
        command,
        env_vars: envVars,
      });

      toast.success(`Session "${name}" created successfully`);
      await refreshSessions();
      return response.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create session';
      toast.error(message);
      throw err;
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      await api.deleteSession(sessionId);
      toast.success('Session deleted successfully');
      await refreshSessions();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete session';
      toast.error(message);
      throw err;
    }
  };

  // Auto-refresh every 5 seconds
  useEffect(() => {
    refreshSessions();
    const interval = setInterval(refreshSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <SessionContext.Provider
      value={{
        sessions,
        loading,
        error,
        refreshSessions,
        createSession,
        deleteSession,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSessions() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSessions must be used within a SessionProvider');
  }
  return context;
}
