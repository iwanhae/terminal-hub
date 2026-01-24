// API types matching the backend
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

const API_BASE_URL = "/api";

// API service functions
export const api = {
  // List all sessions
  async listSessions(): Promise<SessionInfo[]> {
    const response = await fetch(`${API_BASE_URL}/sessions`);
    if (!response.ok) {
      throw new Error(`Failed to list sessions: ${response.statusText}`);
    }
    return response.json() as Promise<SessionInfo[]>;
  },

  // Create a new session
  async createSession(
    request: CreateSessionRequest,
  ): Promise<CreateSessionResponse> {
    const response = await fetch(`${API_BASE_URL}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create session: ${errorText}`);
    }

    return response.json() as Promise<CreateSessionResponse>;
  },

  // Delete a session
  async deleteSession(sessionId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete session: ${errorText}`);
    }
  },
};
