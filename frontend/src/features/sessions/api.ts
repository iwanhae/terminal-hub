import { apiFetch, throwApiError } from "../../shared/http/client";

export interface SessionMetadata {
  name: string;
  created_at: string;
  last_activity_at: string;
  client_count: number;
  working_directory?: string;
  command?: string;
  env_vars?: Record<string, string>;
}

export interface SessionInfo {
  id: string;
  metadata: SessionMetadata;
}

export interface CreateSessionRequest {
  name: string;
  working_directory?: string;
  command?: string;
  env_vars?: Record<string, string>;
  shell_path?: string;
}

export interface CreateSessionResponse {
  id: string;
  metadata: SessionMetadata;
}

export interface UpdateSessionRequest {
  name: string;
}

export const sessionsApi = {
  async listSessions(): Promise<SessionInfo[]> {
    const response = await apiFetch("/sessions");
    if (!response.ok) {
      await throwApiError(response, "Failed to list sessions");
    }
    return response.json() as Promise<SessionInfo[]>;
  },

  async createSession(
    request: CreateSessionRequest,
  ): Promise<CreateSessionResponse> {
    const response = await apiFetch("/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      await throwApiError(response, "Failed to create session");
    }

    return response.json() as Promise<CreateSessionResponse>;
  },

  async deleteSession(sessionId: string): Promise<void> {
    const response = await apiFetch(`/sessions/${sessionId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      await throwApiError(response, "Failed to delete session");
    }
  },

  async updateSessionName(
    sessionId: string,
    request: UpdateSessionRequest,
  ): Promise<void> {
    const response = await apiFetch(`/sessions/${sessionId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      await throwApiError(response, "Failed to update session");
    }
  },
};
