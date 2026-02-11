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

// Cron job types
export interface CronMetadata {
  created_at: number;
  updated_at: number;
  last_run_at: number;
  next_run_at: number;
  last_run_status: string;
  last_run_output: string;
  last_run_error: string;
  total_runs: number;
  failure_count: number;
  execution_count: number;
  concurrent_runs: number;
}

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  command: string;
  shell?: string;
  working_directory?: string;
  env_vars?: Record<string, string>;
  enabled: boolean;
  metadata: CronMetadata;
}

export interface CreateCronRequest {
  name: string;
  schedule: string;
  command: string;
  shell?: string;
  working_directory?: string;
  env_vars?: Record<string, string>;
  enabled: boolean;
}

export interface UpdateCronRequest {
  name?: string;
  schedule?: string;
  command?: string;
  shell?: string;
  working_directory?: string;
  env_vars?: Record<string, string>;
  enabled?: boolean;
}

export interface CronExecutionResult {
  job_id: string;
  execution_id: string;
  started_at: number;
  finished_at: number;
  exit_code: number;
  output: string;
  error: string;
}

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

  // List all cron jobs
  async listCrons(): Promise<CronJob[]> {
    const response = await fetch(`${API_BASE_URL}/crons`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`Failed to list cron jobs: ${response.statusText}`);
    }
    const data = (await response.json()) as { jobs: CronJob[] };
    return data.jobs;
  },

  // Get single cron job
  async getCron(jobId: string): Promise<CronJob> {
    const response = await fetch(`${API_BASE_URL}/crons/${jobId}`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`Failed to get cron job: ${response.statusText}`);
    }
    return response.json() as Promise<CronJob>;
  },

  // Create cron job
  async createCron(
    request: CreateCronRequest,
  ): Promise<{ id: string; job: CronJob }> {
    const response = await fetch(`${API_BASE_URL}/crons`, {
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
    return response.json() as Promise<{ id: string; job: CronJob }>;
  },

  // Update cron job
  async updateCron(
    jobId: string,
    request: UpdateCronRequest,
  ): Promise<CronJob> {
    const response = await fetch(`${API_BASE_URL}/crons/${jobId}`, {
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
    return response.json() as Promise<CronJob>;
  },

  // Delete cron job
  async deleteCron(jobId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/crons/${jobId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete cron job: ${errorText}`);
    }
  },

  // Run cron job now
  async runCronNow(jobId: string): Promise<CronExecutionResult> {
    const response = await fetch(`${API_BASE_URL}/crons/${jobId}/run`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to run cron job: ${errorText}`);
    }
    return response.json() as Promise<CronExecutionResult>;
  },

  // Enable cron job
  async enableCron(jobId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/crons/${jobId}/enable`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to enable cron job: ${errorText}`);
    }
  },

  // Disable cron job
  async disableCron(jobId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/crons/${jobId}/disable`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to disable cron job: ${errorText}`);
    }
  },

  // Get execution history
  async getCronHistory(jobId: string): Promise<CronExecutionResult[]> {
    const response = await fetch(`${API_BASE_URL}/crons/${jobId}/history`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`Failed to get cron history: ${response.statusText}`);
    }
    const data = (await response.json()) as {
      executions: CronExecutionResult[];
    };
    return data.executions;
  },
};
