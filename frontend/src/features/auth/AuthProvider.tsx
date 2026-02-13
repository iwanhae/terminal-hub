import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthContext } from "./AuthContext";
import { authApi } from "./api";

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const checkAuth = useCallback(async () => {
    try {
      const data = await authApi.status();
      setIsAuthenticated(data.authenticated);
      setUsername(data.username ?? null);
    } catch {
      setIsAuthenticated(false);
      setUsername(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(
    async (usernameVal: string, passwordVal: string) => {
      await authApi.login(usernameVal, passwordVal);

      await checkAuth();
      // Navigate to home after successful login
      // eslint-disable-next-line sonarjs/void-use
      void navigate("/");
    },
    [checkAuth, navigate],
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    setIsAuthenticated(false);
    setUsername(null);
    // Navigate to login after logout
    // eslint-disable-next-line sonarjs/void-use
    void navigate("/login");
  }, [navigate]);

  useEffect(() => {
    // Check auth on mount
    void checkAuth();
  }, [checkAuth]);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, username, loading, login, logout, checkAuth }}
    >
      {children}
    </AuthContext.Provider>
  );
}
