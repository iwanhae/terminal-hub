// TypeScript types for cron job management API

export interface CronJob {
  id: string;
  name: string;
  cron_expression: string;
  command: string;
  working_directory?: string;
  env_vars?: Record<string, string>;
  shell_path?: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  next_run?: string;
  previous_run?: string;
  last_status?: string;
}

export interface CronJobExecution {
  job_id: string;
  execution_id: string;
  timestamp: string;
  exit_code: number;
  output: string;
  duration_ms: number;
  status: ExecutionStatus;
}

export interface CreateCronJobRequest {
  name: string;
  cron_expression: string;
  command: string;
  working_directory?: string;
  env_vars?: Record<string, string>;
  shell_path?: string;
}

export interface UpdateCronJobRequest {
  name?: string;
  cron_expression?: string;
  command?: string;
  working_directory?: string;
  env_vars?: Record<string, string>;
  shell_path?: string;
}

export interface ListCronJobsResponse {
  jobs: CronJob[];
}

export interface ListCronHistoryResponse {
  executions: CronJobExecution[];
}

export type ExecutionStatus = "success" | "failed" | "running";
