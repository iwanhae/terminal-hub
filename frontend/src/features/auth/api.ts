import { apiFetch, throwApiError } from "../../shared/http/client";

export interface AuthStatusResponse {
  authenticated: boolean;
  username: string;
}

interface LoginErrorResponse {
  message: string;
}

export const authApi = {
  async status(): Promise<AuthStatusResponse> {
    const response = await apiFetch("/auth/status");
    if (!response.ok) {
      await throwApiError(response, "Failed to check auth status");
    }
    return response.json() as Promise<AuthStatusResponse>;
  },

  async login(username: string, password: string): Promise<void> {
    const response = await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const data = (await response.json()) as LoginErrorResponse;
      throw new Error(data.message ?? "Login failed");
    }
  },

  async logout(): Promise<void> {
    await apiFetch("/auth/logout", {
      method: "POST",
    });
  },
};
