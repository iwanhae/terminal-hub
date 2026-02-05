import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthContext } from "./AuthContext";

interface AuthStatusResponse {
  authenticated: boolean;
  username: string;
}

interface LoginErrorResponse {
  message: string;
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/status", {
        credentials: "include",
      });
      const data = (await response.json()) as AuthStatusResponse;
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
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: usernameVal, password: passwordVal }),
      });

      if (!response.ok) {
        const data = (await response.json()) as LoginErrorResponse;
        throw new Error(data.message ?? "Login failed");
      }

      await checkAuth();
      // Navigate to home after successful login
      // eslint-disable-next-line sonarjs/void-use
      void navigate("/");
    },
    [checkAuth, navigate],
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
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
