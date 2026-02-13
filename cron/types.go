package cron

import "time"

// CronJob configuration
type CronJob struct {
	ID               string            `json:"id"`
	Name             string            `json:"name"`
	Schedule         string            `json:"schedule"`        // cron expression: "* * * * *"
	Command          string            `json:"command"`         // command to execute
	Shell            string            `json:"shell,omitempty"` // optional: override default shell
	WorkingDirectory string            `json:"working_directory,omitempty"`
	EnvVars          map[string]string `json:"env_vars,omitempty"`
	Enabled          bool              `json:"enabled"`
	Metadata         CronMetadata      `json:"metadata"`
}

// CronMetadata tracks job runtime information
type CronMetadata struct {
	CreatedAt      int64  `json:"created_at"` // unix timestamp
	UpdatedAt      int64  `json:"updated_at"`
	LastRunAt      int64  `json:"last_run_at"`     // unix timestamp, 0 if never run
	NextRunAt      int64  `json:"next_run_at"`     // unix timestamp
	LastRunStatus  string `json:"last_run_status"` // "success", "failed", "running", ""
	LastRunOutput  string `json:"last_run_output"` // truncated output (max 4KB)
	LastRunError   string `json:"last_run_error"`  // error message if failed
	TotalRuns      int    `json:"total_runs"`
	FailureCount   int    `json:"failure_count"`
	ExecutionCount int    `json:"execution_count"` // current run number
	ConcurrentRuns int    `json:"concurrent_runs"` // current number of concurrent runs
}

// Execution history (kept in memory, truncated per job)
type CronExecutionResult struct {
	JobID       string `json:"job_id"`
	ExecutionID string `json:"execution_id"` // unique ID for this run
	StartedAt   int64  `json:"started_at"`
	FinishedAt  int64  `json:"finished_at"`
	ExitCode    int    `json:"exit_code"`
	Output      string `json:"output"` // full command output
	Error       string `json:"error"`  // error message if failed
}

// Request/Response types
type CreateCronRequest struct {
	Name             string            `json:"name"`                        // Required
	Schedule         string            `json:"schedule"`                    // Required: cron expression
	Command          string            `json:"command"`                     // Required
	Shell            string            `json:"shell,omitempty"`             // Optional
	WorkingDirectory string            `json:"working_directory,omitempty"` // Optional
	EnvVars          map[string]string `json:"env_vars,omitempty"`          // Optional
	Enabled          bool              `json:"enabled"`                     // Default: true
}

type UpdateCronRequest struct {
	Name             *string           `json:"name,omitempty"` // Pointer to distinguish zero-value
	Schedule         *string           `json:"schedule,omitempty"`
	Command          *string           `json:"command,omitempty"`
	Shell            *string           `json:"shell,omitempty"`
	WorkingDirectory *string           `json:"working_directory,omitempty"`
	EnvVars          map[string]string `json:"env_vars,omitempty"`
	Enabled          *bool             `json:"enabled,omitempty"`
}

type CreateCronResponse struct {
	ID  string  `json:"id"`
	Job CronJob `json:"job"`
}

type ListCronsResponse struct {
	Jobs []CronJob `json:"jobs"`
}

type GetHistoryResponse struct {
	Executions []CronExecutionResult `json:"executions"`
}

// CronData is the root structure stored in JSON file
type CronData struct {
	Jobs       []CronJob             `json:"jobs"`
	Executions []CronExecutionResult `json:"executions"` // limited size, rotated
}

// CronExecutorConfig holds configuration for job execution
type CronExecutorConfig struct {
	MaxOutputSize    int           // Max output size per run
	ExecutionTimeout time.Duration // Max execution time
	MaxConcurrent    int           // Max concurrent job runs
}

// DefaultCronExecutorConfig returns the default executor configuration
func DefaultCronExecutorConfig() CronExecutorConfig {
	return CronExecutorConfig{
		MaxOutputSize:    64 * 1024, // 64KB
		ExecutionTimeout: 5 * time.Minute,
		MaxConcurrent:    5,
	}
}
