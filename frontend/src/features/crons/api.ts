import { apiFetch, throwApiError } from "../../shared/http/client";

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

export const cronsApi = {
  async listCrons(): Promise<CronJob[]> {
    const response = await apiFetch("/crons");
    if (!response.ok) {
      await throwApiError(response, "Failed to list cron jobs");
    }
    const data = (await response.json()) as { jobs: CronJob[] };
    return data.jobs;
  },

  async getCron(jobId: string): Promise<CronJob> {
    const response = await apiFetch(`/crons/${jobId}`);
    if (!response.ok) {
      await throwApiError(response, "Failed to get cron job");
    }
    return response.json() as Promise<CronJob>;
  },

  async createCron(
    request: CreateCronRequest,
  ): Promise<{ id: string; job: CronJob }> {
    const response = await apiFetch("/crons", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      await throwApiError(response, "Failed to create cron job");
    }
    return response.json() as Promise<{ id: string; job: CronJob }>;
  },

  async updateCron(
    jobId: string,
    request: UpdateCronRequest,
  ): Promise<CronJob> {
    const response = await apiFetch(`/crons/${jobId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      await throwApiError(response, "Failed to update cron job");
    }
    return response.json() as Promise<CronJob>;
  },

  async deleteCron(jobId: string): Promise<void> {
    const response = await apiFetch(`/crons/${jobId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      await throwApiError(response, "Failed to delete cron job");
    }
  },

  async runCronNow(jobId: string): Promise<CronExecutionResult> {
    const response = await apiFetch(`/crons/${jobId}/run`, {
      method: "POST",
    });
    if (!response.ok) {
      await throwApiError(response, "Failed to run cron job");
    }
    return response.json() as Promise<CronExecutionResult>;
  },

  async enableCron(jobId: string): Promise<void> {
    const response = await apiFetch(`/crons/${jobId}/enable`, {
      method: "POST",
    });
    if (!response.ok) {
      await throwApiError(response, "Failed to enable cron job");
    }
  },

  async disableCron(jobId: string): Promise<void> {
    const response = await apiFetch(`/crons/${jobId}/disable`, {
      method: "POST",
    });
    if (!response.ok) {
      await throwApiError(response, "Failed to disable cron job");
    }
  },

  async getCronHistory(jobId: string): Promise<CronExecutionResult[]> {
    const response = await apiFetch(`/crons/${jobId}/history`);
    if (!response.ok) {
      await throwApiError(response, "Failed to get cron history");
    }
    const data = (await response.json()) as {
      executions: CronExecutionResult[];
    };
    return data.executions;
  },
};
