import { createContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import type { SessionBackend, SessionInfo } from "./api";
import { sessionsApi } from "./api";
import toast from "react-hot-toast";

interface SessionContextType {
  sessions: SessionInfo[];
  loading: boolean;
  error: string | null;
  refreshSessions: () => Promise<void>;
  createSession: (
    name: string,
    workingDirectory?: string,
    command?: string,
    envVars?: Record<string, string>,
    backend?: SessionBackend,
  ) => Promise<string>;
  deleteSession: (sessionId: string) => Promise<void>;
  updateSessionName: (sessionId: string, newName: string) => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await sessionsApi.listSessions();
      setSessions(data);
    } catch (error_) {
      const message =
        error_ instanceof Error ? error_.message : "Failed to fetch sessions";
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
    envVars?: Record<string, string>,
    backend: SessionBackend = "tmux",
  ): Promise<string> => {
    try {
      const response = await sessionsApi.createSession({
        name,
        working_directory: workingDirectory,
        command,
        env_vars: envVars,
        backend,
      });

      toast.success(`Session "${name}" created successfully`);
      await refreshSessions();
      return response.id;
    } catch (error_) {
      const message =
        error_ instanceof Error ? error_.message : "Failed to create session";
      toast.error(message);
      throw error_;
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      await sessionsApi.deleteSession(sessionId);
      toast.success("Session deleted successfully");
      await refreshSessions();
    } catch (error_) {
      const message =
        error_ instanceof Error ? error_.message : "Failed to delete session";
      toast.error(message);
      throw error_;
    }
  };

  const updateSessionName = async (sessionId: string, newName: string) => {
    try {
      await sessionsApi.updateSessionName(sessionId, { name: newName });
      toast.success("Session renamed successfully");
      await refreshSessions();
    } catch (error_) {
      const message =
        error_ instanceof Error ? error_.message : "Failed to rename session";
      toast.error(message);
      throw error_;
    }
  };

  // Auto-refresh every 5 seconds
  useEffect(() => {
    void refreshSessions();
    const interval = setInterval(() => void refreshSessions(), 5000);
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
        updateSessionName,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export { SessionContext };
