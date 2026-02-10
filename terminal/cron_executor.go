package terminal

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
)

// CronExecutor handles the execution of cron jobs
type CronExecutor struct {
	config    CronExecutorConfig
	semaphore chan struct{} // for concurrency control
	mu        sync.Mutex
}

// NewCronExecutor creates a new cron executor with the given configuration
func NewCronExecutor(config CronExecutorConfig) *CronExecutor {
	return &CronExecutor{
		config:    config,
		semaphore: make(chan struct{}, config.MaxConcurrent),
	}
}

// Execute runs a cron job and returns the execution result
func (e *CronExecutor) Execute(job *CronJob) (*CronExecutionResult, error) {
	// Acquire semaphore
	select {
	case e.semaphore <- struct{}{}:
		defer func() { <-e.semaphore }()
	case <-time.After(30 * time.Second):
		return nil, fmt.Errorf("timeout waiting for execution slot (too many concurrent jobs)")
	}

	executionID := "exec_" + uuid.New().String()
	startedAt := time.Now()

	log.Printf("[Cron] Starting execution %s for job %s (%s)", executionID, job.ID, job.Name)

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), e.config.ExecutionTimeout)
	defer cancel()

	// Prepare the command
	cmd := e.buildCommand(ctx, job)

	// Capture output
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Start the command
	if err := cmd.Start(); err != nil {
		finishedAt := time.Now()
		return &CronExecutionResult{
			JobID:       job.ID,
			ExecutionID: executionID,
			StartedAt:   startedAt.Unix(),
			FinishedAt:  finishedAt.Unix(),
			ExitCode:    -1,
			Output:      "",
			Error:       fmt.Sprintf("Failed to start command: %v", err),
		}, nil
	}

	// Wait for command to complete
	err := cmd.Wait()

	finishedAt := time.Now()
	output := stdout.String()
	errOutput := stderr.String()

	// Combine stdout and stderr for the output
	if errOutput != "" {
		if output != "" {
			output += "\n" + errOutput
		} else {
			output = errOutput
		}
	}

	// Truncate output if needed
	if len(output) > e.config.MaxOutputSize {
		output = output[:e.config.MaxOutputSize] + "\n... (output truncated)"
	}

	// Determine exit code
	exitCode := 0
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			exitCode = exitError.ExitCode()
		} else {
			exitCode = -1
		}
	}

	result := &CronExecutionResult{
		JobID:       job.ID,
		ExecutionID: executionID,
		StartedAt:   startedAt.Unix(),
		FinishedAt:  finishedAt.Unix(),
		ExitCode:    exitCode,
		Output:      output,
	}

	if exitCode != 0 {
		result.Error = fmt.Sprintf("Command exited with code %d", exitCode)
	}

	log.Printf("[Cron] Completed execution %s for job %s (exit code: %d, duration: %s)",
		executionID, job.ID, exitCode, finishedAt.Sub(startedAt))

	return result, nil
}

// buildCommand creates the exec.Cmd for a cron job
func (e *CronExecutor) buildCommand(ctx context.Context, job *CronJob) *exec.Cmd {
	// Determine shell to use
	shell := job.Shell
	if shell == "" {
		shell = "/bin/sh"
	}

	// Build the command with shell
	// We use shell -c to execute the command string
	cmd := exec.CommandContext(ctx, shell, "-c", job.Command)

	// Set working directory
	if job.WorkingDirectory != "" {
		cmd.Dir = job.WorkingDirectory
	}

	// Set environment variables
	cmd.Env = e.buildEnvVars(job.EnvVars)

	return cmd
}

// buildEnvVars builds the environment variables for the command
func (e *CronExecutor) buildEnvVars(customVars map[string]string) []string {
	env := os.Environ()

	// Add custom environment variables
	for key, value := range customVars {
		env = append(env, fmt.Sprintf("%s=%s", key, value))
	}

	return env
}

// ExecuteAsync runs a cron job asynchronously and returns the result via a channel
func (e *CronExecutor) ExecuteAsync(job *CronJob, callback func(*CronExecutionResult)) {
	go func() {
		result, err := e.Execute(job)
		if err != nil {
			// Create error result
			result = &CronExecutionResult{
				JobID:       job.ID,
				ExecutionID: "exec_" + uuid.New().String(),
				StartedAt:   time.Now().Unix(),
				FinishedAt:  time.Now().Unix(),
				ExitCode:    -1,
				Output:      "",
				Error:       err.Error(),
			}
		}
		if callback != nil {
			callback(result)
		}
	}()
}

// UpdateJobMetadata updates the job metadata after an execution
func (e *CronExecutor) UpdateJobMetadata(job *CronJob, result *CronExecutionResult, nextRun time.Time) {
	job.Metadata.LastRunAt = result.StartedAt
	job.Metadata.TotalRuns++
	job.Metadata.ExecutionCount++

	if result.ExitCode == 0 {
		job.Metadata.LastRunStatus = "success"
		job.Metadata.LastRunOutput = result.Output
		job.Metadata.LastRunError = ""
	} else {
		job.Metadata.LastRunStatus = "failed"
		job.Metadata.LastRunOutput = result.Output
		job.Metadata.LastRunError = result.Error
		job.Metadata.FailureCount++
	}

	job.Metadata.NextRunAt = nextRun.Unix()
	job.Metadata.UpdatedAt = time.Now().Unix()
}

// helper to get int from env
func getEnvInt(key string) int {
	if val := os.Getenv(key); val != "" {
		if intVal, err := strconv.Atoi(val); err == nil {
			return intVal
		}
	}
	return 0
}

// helper to get duration from env
func getEnvDuration(key string) time.Duration {
	if val := os.Getenv(key); val != "" {
		// Try to parse as duration (e.g., "5m", "1h")
		if duration, err := time.ParseDuration(val); err == nil {
			return duration
		}
	}
	return 0
}

// GetCronExecutorConfigFromEnv reads configuration from environment variables
func GetCronExecutorConfigFromEnv() CronExecutorConfig {
	config := DefaultCronExecutorConfig()

	// Max output size (default: 64KB)
	if maxSize := getEnvInt("TERMINAL_HUB_CRON_MAX_OUTPUT_SIZE"); maxSize > 0 {
		config.MaxOutputSize = maxSize
	}

	// Execution timeout (default: 5m)
	if timeout := getEnvDuration("TERMINAL_HUB_CRON_EXECUTION_TIMEOUT"); timeout > 0 {
		config.ExecutionTimeout = timeout
	}

	// Max concurrent runs (default: 5)
	if maxConcurrent := getEnvInt("TERMINAL_HUB_CRON_MAX_CONCURRENT"); maxConcurrent > 0 {
		config.MaxConcurrent = maxConcurrent
	}

	return config
}

// NewCronExecutorWithEnv creates a new cron executor using environment configuration
func NewCronExecutorWithEnv() *CronExecutor {
	return NewCronExecutor(GetCronExecutorConfigFromEnv())
}

// ExecuteInPTY runs a cron job using a PTY (for interactive commands)
// This is an alternative execution method for jobs that require a terminal
func (e *CronExecutor) ExecuteInPTY(job *CronJob, ptyService PTYService) (*CronExecutionResult, error) {
	// Acquire semaphore
	select {
	case e.semaphore <- struct{}{}:
		defer func() { <-e.semaphore }()
	case <-time.After(30 * time.Second):
		return nil, fmt.Errorf("timeout waiting for execution slot (too many concurrent jobs)")
	}

	executionID := "exec_" + uuid.New().String()
	startedAt := time.Now()

	log.Printf("[Cron] Starting PTY execution %s for job %s (%s)", executionID, job.ID, job.Name)

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), e.config.ExecutionTimeout)
	defer cancel()

	// Prepare shell
	shell := job.Shell
	if shell == "" {
		shell = os.Getenv("SHELL")
		if shell == "" {
			shell = "/bin/bash"
		}
	}

	// Start PTY
	ptyFile, cmd, err := ptyService.StartWithConfig(shell, job.WorkingDirectory, job.EnvVars)
	if err != nil {
		finishedAt := time.Now()
		return &CronExecutionResult{
			JobID:       job.ID,
			ExecutionID: executionID,
			StartedAt:   startedAt.Unix(),
			FinishedAt:  finishedAt.Unix(),
			ExitCode:    -1,
			Output:      "",
			Error:       fmt.Sprintf("Failed to start PTY: %v", err),
		}, nil
	}
	defer ptyFile.Close()

	// Write the command to the PTY
	command := job.Command + "\n"
	if _, err := ptyFile.Write([]byte(command)); err != nil {
		cmd.Process.Kill()
		finishedAt := time.Now()
		return &CronExecutionResult{
			JobID:       job.ID,
			ExecutionID: executionID,
			StartedAt:   startedAt.Unix(),
			FinishedAt:  finishedAt.Unix(),
			ExitCode:    -1,
			Output:      "",
			Error:       fmt.Sprintf("Failed to write command to PTY: %v", err),
		}, nil
	}

	// Read output from PTY with timeout
	output := make([]byte, 0, e.config.MaxOutputSize)
	buffer := make([]byte, 1024)
	deadline := time.After(e.config.ExecutionTimeout)

readLoop:
	for {
		select {
		case <-deadline:
			// Timeout
			cmd.Process.Kill()
			break readLoop
		case <-ctx.Done():
			// Context cancelled
			cmd.Process.Kill()
			break readLoop
		default:
			// Set read deadline to avoid blocking forever
			ptyFile.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
			n, err := ptyFile.Read(buffer)
			if err != nil {
				if err == io.EOF {
					break readLoop
				}
				// Continue on other errors (timeout, etc.)
				continue
			}
			output = append(output, buffer[:n]...)
			if len(output) >= e.config.MaxOutputSize {
				// Truncate if exceeds max size
				break readLoop
			}
		}
	}

	// Wait for command to complete
	err = cmd.Wait()
	finishedAt := time.Now()

	// Truncate output if needed
	outputStr := string(output)
	if len(outputStr) > e.config.MaxOutputSize {
		outputStr = outputStr[:e.config.MaxOutputSize] + "\n... (output truncated)"
	}

	// Determine exit code
	exitCode := 0
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			exitCode = exitError.ExitCode()
		} else {
			exitCode = -1
		}
	}

	result := &CronExecutionResult{
		JobID:       job.ID,
		ExecutionID: executionID,
		StartedAt:   startedAt.Unix(),
		FinishedAt:  finishedAt.Unix(),
		ExitCode:    exitCode,
		Output:      outputStr,
	}

	if exitCode != 0 {
		result.Error = fmt.Sprintf("Command exited with code %d", exitCode)
	}

	log.Printf("[Cron] Completed PTY execution %s for job %s (exit code: %d, duration: %s)",
		executionID, job.ID, exitCode, finishedAt.Sub(startedAt))

	return result, nil
}

// ExecuteCommandWithPTY is a convenience method that creates a PTY and executes the command
func ExecuteCommandWithPTY(job *CronJob) (*CronExecutionResult, error) {
	executor := NewCronExecutorWithEnv()
	ptyService := &DefaultPTYService{}
	return executor.ExecuteInPTY(job, ptyService)
}
