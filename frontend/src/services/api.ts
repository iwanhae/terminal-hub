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

export interface UpdateSessionRequest {
  name: string;
}

import type {
  CronJob,
  CronJobExecution,
  CreateCronJobRequest,
  UpdateCronJobRequest,
} from "./cronApi";

const API_BASE_URL = "/api";

// API service functions
export const api = {
  // List all sessions
  async listSessions(): Promise<SessionInfo[]> {
    const response = await fetch(`${API_BASE_URL}/sessions`, {
      credentials: "include",
    });
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
      credentials: "include",
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
      credentials: "include",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete session: ${errorText}`);
    }
  },

  // Update a session name
  async updateSessionName(
    sessionId: string,
    request: UpdateSessionRequest,
  ): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update session: ${errorText}`);
    }
  },

  // === Cron Job API ===

  // List all cron jobs
  async listCronJobs(): Promise<CronJob[]> {
    const response = await fetch(`${API_BASE_URL}/cron/jobs`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`Failed to list cron jobs: ${response.statusText}`);
    }
    return response.json() as Promise<CronJob[]>;
  },

  // Create a new cron job
  async createCronJob(request: CreateCronJobRequest): Promise<CronJob> {
    const response = await fetch(`${API_BASE_URL}/cron/jobs`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create cron job: ${errorText}`);
    }

    return response.json() as Promise<CronJob>;
  },

  // Update a cron job
  async updateCronJob(
    jobId: string,
    request: UpdateCronJobRequest,
  ): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/cron/jobs/${jobId}`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update cron job: ${errorText}`);
    }
  },

  // Delete a cron job
  async deleteCronJob(jobId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/cron/jobs/${jobId}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete cron job: ${errorText}`);
    }
  },

  // List cron job execution history
  async listCronHistory(
    jobId: string,
    limit?: number,
  ): Promise<CronJobExecution[]> {
    const limitParam = limit == null ? "" : `?limit=${limit}`;
    const response = await fetch(
      `${API_BASE_URL}/cron/jobs/${jobId}/history${limitParam}`,
      {
        credentials: "include",
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to list cron history: ${response.statusText}`);
    }
    return response.json() as Promise<CronJobExecution[]>;
  },

  // Trigger a cron job immediately
  async triggerCronJob(jobId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/cron/jobs/${jobId}/trigger`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to trigger cron job: ${errorText}`);
    }
  },

  // Toggle a cron job (enable/disable)
  async toggleCronJob(jobId: string, enabled: boolean): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/cron/jobs/${jobId}/toggle`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to toggle cron job: ${errorText}`);
    }
  },
};
