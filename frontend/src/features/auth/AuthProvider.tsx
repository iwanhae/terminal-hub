import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthContext } from "./AuthContext";
import { authApi } from "./api";
import { SESSION_INVALID_EVENT } from "./sessionEvents";

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const hasRedirectedForInvalidSessionRef = useRef(false);

  const checkAuth = useCallback(async () => {
    try {
      const data = await authApi.status();
      setIsAuthenticated(data.authenticated);
      setUsername(data.username ?? null);
      if (data.authenticated) {
        hasRedirectedForInvalidSessionRef.current = false;
      }
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
    hasRedirectedForInvalidSessionRef.current = false;
    // Navigate to login after logout
    // eslint-disable-next-line sonarjs/void-use
    void navigate("/login");
  }, [navigate]);

  useEffect(() => {
    // Check auth on mount
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const handleSessionInvalid = () => {
      setIsAuthenticated(false);
      setUsername(null);
      setLoading(false);

      if (
        location.pathname === "/login" ||
        hasRedirectedForInvalidSessionRef.current
      ) {
        return;
      }

      hasRedirectedForInvalidSessionRef.current = true;
      const fromPath = `${location.pathname}${location.search}${location.hash}`;

      // eslint-disable-next-line sonarjs/void-use
      void navigate("/login", {
        replace: true,
        state: { from: { pathname: fromPath } },
      });
    };

    window.addEventListener(SESSION_INVALID_EVENT, handleSessionInvalid);
    return () => {
      window.removeEventListener(SESSION_INVALID_EVENT, handleSessionInvalid);
    };
  }, [location.hash, location.pathname, location.search, navigate]);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, username, loading, login, logout, checkAuth }}
    >
      {children}
    </AuthContext.Provider>
  );
}
