package terminal

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/robfig/cron/v3"
)

// CronManager manages cron jobs with JSON file persistence
type CronManager struct {
	cron       *cron.Cron
	jobs       map[string]*CronJob           // id -> job
	jobsByID   map[cron.EntryID]*CronJob     // cron entry id -> job
	executions []CronExecutionResult         // execution history
	filePath   string                        // path to JSON file
	maxHistory int                           // max execution history entries
	mu         sync.RWMutex
	executor   *CronExecutor
	ptyService PTYService
	started    bool
}

// NewCronManager creates a new manager and loads persisted jobs from JSON
func NewCronManager(filePath string, maxHistory int) (*CronManager, error) {
	if maxHistory <= 0 {
		maxHistory = 1000 // default
	}

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create cron directory: %w", err)
	}

	manager := &CronManager{
		cron:       cron.New(cron.WithParser(cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.SecondOptional))),
		jobs:       make(map[string]*CronJob),
		jobsByID:   make(map[cron.EntryID]*CronJob),
		executions: make([]CronExecutionResult, 0, maxHistory),
		filePath:   filePath,
		maxHistory: maxHistory,
		executor:   NewCronExecutorWithEnv(),
		ptyService: &DefaultPTYService{},
		started:    false,
	}

	// Load from file if exists
	if err := manager.load(); err != nil {
		return nil, fmt.Errorf("failed to load cron data: %w", err)
	}

	return manager, nil
}

// load reads the cron data from the JSON file
func (m *CronManager) load() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	data, err := os.ReadFile(m.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			// File doesn't exist yet, that's OK
			return nil
		}
		return err
	}

	var cronData CronData
	if err := json.Unmarshal(data, &cronData); err != nil {
		// Corrupt or partial JSON — start fresh
		log.Printf("[Cron] Warning: corrupt data in %s, starting fresh: %v", m.filePath, err)
		return nil
	}

	// Load jobs
	for i := range cronData.Jobs {
		job := &cronData.Jobs[i]
		m.jobs[job.ID] = job
	}

	// Load executions
	m.executions = cronData.Executions

	log.Printf("[Cron] Loaded %d jobs and %d executions from %s", len(m.jobs), len(m.executions), m.filePath)

	return nil
}

// save writes current state to JSON file atomically.
// Must be called with m.mu already held (Lock or RLock).
func (m *CronManager) save() error {

	jobs := make([]CronJob, 0, len(m.jobs))
	for _, job := range m.jobs {
		jobs = append(jobs, *job)
	}

	data := CronData{
		Jobs:       jobs,
		Executions: m.executions,
	}

	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}

	// Atomic write: temp file + rename
	tmpFile := m.filePath + ".tmp"
	if err := os.WriteFile(tmpFile, jsonData, 0600); err != nil {
		return fmt.Errorf("failed to write temp file: %w", err)
	}

	if err := os.Rename(tmpFile, m.filePath); err != nil {
		return fmt.Errorf("failed to rename temp file: %w", err)
	}

	return nil
}

// Start starts the cron scheduler
func (m *CronManager) Start() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.started {
		return errors.New("cron manager already started")
	}

	// Reschedule enabled jobs
	for _, job := range m.jobs {
		if job.Enabled {
			if err := m.scheduleJobLocked(job); err != nil {
				log.Printf("[Cron] Failed to schedule job %s: %v", job.ID, err)
			}
		}
	}

	m.cron.Start()
	m.started = true

	log.Printf("[Cron] Started cron scheduler with %d jobs", len(m.jobs))

	return nil
}

// Stop stops the cron scheduler
func (m *CronManager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.started {
		return
	}

	ctx := m.cron.Stop()
	<-ctx.Done()

	m.started = false
	log.Printf("[Cron] Stopped cron scheduler")
}

// scheduleJobLocked schedules a job (caller must hold lock)
func (m *CronManager) scheduleJobLocked(job *CronJob) error {
	if job.Schedule == "" {
		return fmt.Errorf("job %s has empty schedule", job.ID)
	}

	// Validate schedule
	if err := ValidateSchedule(job.Schedule); err != nil {
		return err
	}

	// Add to cron scheduler
	entryID, err := m.cron.AddFunc(job.Schedule, func() {
		m.executeJob(job.ID)
	})
	if err != nil {
		return fmt.Errorf("failed to add cron job: %w", err)
	}

	// Store the entry ID
	m.jobsByID[entryID] = job

	// Calculate next run time
	nextRun, err := GetNextRunTime(job.Schedule, time.Now())
	if err != nil {
		return err
	}
	job.Metadata.NextRunAt = nextRun.Unix()

	return nil
}

// scheduleJob schedules a job (public version)
func (m *CronManager) scheduleJob(job *CronJob) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.scheduleJobLocked(job)
}

// unscheduleJob removes a job from the scheduler (acquires lock)
func (m *CronManager) unscheduleJob(jobID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.unscheduleJobLocked(jobID)
}

// unscheduleJobLocked removes a job from the scheduler.
// Must be called with m.mu already held.
func (m *CronManager) unscheduleJobLocked(jobID string) {
	job, ok := m.jobs[jobID]
	if !ok {
		return
	}

	// Find and remove the cron entry
	for entryID, j := range m.jobsByID {
		if j.ID == jobID {
			m.cron.Remove(entryID)
			delete(m.jobsByID, entryID)
			break
		}
	}

	job.Metadata.NextRunAt = 0
}

// executeJob executes a cron job
func (m *CronManager) executeJob(jobID string) {
	m.mu.Lock()
	job, ok := m.jobs[jobID]
	if !ok {
		m.mu.Unlock()
		log.Printf("[Cron] Job %s not found, skipping execution", jobID)
		return
	}

	// Update concurrent run count
	job.Metadata.ConcurrentRuns++
	m.saveJobMetadata(job)
	m.mu.Unlock()

	// Execute the job
	result, err := m.executor.Execute(job)

	m.mu.Lock()
	defer m.mu.Unlock()

	job.Metadata.ConcurrentRuns--

	if err != nil {
		log.Printf("[Cron] Execution error for job %s: %v", jobID, err)
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

	// Add to execution history
	m.addExecution(result)

	// Calculate next run time
	nextRun, err := GetNextRunTime(job.Schedule, time.Now())
	if err != nil {
		log.Printf("[Cron] Failed to calculate next run for job %s: %v", jobID, err)
	} else {
		job.Metadata.NextRunAt = nextRun.Unix()
	}

	// Update job metadata
	m.executor.UpdateJobMetadata(job, result, nextRun)

	// Save to file
	if err := m.save(); err != nil {
		log.Printf("[Cron] Failed to save after execution: %v", err)
	}
}

// saveJobMetadata saves job metadata without full save
func (m *CronManager) saveJobMetadata(job *CronJob) {
	// Metadata is updated in-place, will be saved on next full save
}

// addExecution adds an execution result to history with rotation
func (m *CronManager) addExecution(result *CronExecutionResult) {
	m.executions = append(m.executions, *result)

	// Rotate if exceeds max history
	if len(m.executions) > m.maxHistory {
		// Remove oldest entries
		overflow := len(m.executions) - m.maxHistory
		m.executions = m.executions[overflow:]
	}
}

// Create creates a new cron job
func (m *CronManager) Create(req CreateCronRequest) (*CronJob, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Validate request
	if req.Name == "" {
		return nil, errors.New("name is required")
	}
	if req.Schedule == "" {
		return nil, errors.New("schedule is required")
	}
	if req.Command == "" {
		return nil, errors.New("command is required")
	}

	// Validate schedule
	if err := ValidateSchedule(req.Schedule); err != nil {
		return nil, err
	}

	// Create job
	jobID := "cron_" + uuid.New().String()
	now := time.Now()

	// Calculate next run time (only for enabled jobs)
	var nextRunUnix int64
	if req.Enabled {
		nextRun, _ := GetNextRunTime(req.Schedule, now)
		nextRunUnix = nextRun.Unix()
	}

	job := &CronJob{
		ID:               jobID,
		Name:             req.Name,
		Schedule:         req.Schedule,
		Command:          req.Command,
		Shell:            req.Shell,
		WorkingDirectory: req.WorkingDirectory,
		EnvVars:          req.EnvVars,
		Enabled:          req.Enabled,
		Metadata: CronMetadata{
			CreatedAt:      now.Unix(),
			UpdatedAt:      now.Unix(),
			LastRunAt:      0,
			NextRunAt:      nextRunUnix,
			LastRunStatus:  "",
			LastRunOutput:  "",
			LastRunError:   "",
			TotalRuns:      0,
			FailureCount:   0,
			ExecutionCount: 0,
			ConcurrentRuns: 0,
		},
	}

	m.jobs[jobID] = job

	// Schedule if enabled
	if req.Enabled {
		if err := m.scheduleJobLocked(job); err != nil {
			delete(m.jobs, jobID)
			return nil, fmt.Errorf("failed to schedule job: %w", err)
		}
	}

	// Save to file
	if err := m.save(); err != nil {
		// Rollback on save failure
		delete(m.jobs, jobID)
		if req.Enabled {
			m.unscheduleJobLocked(jobID)
		}
		return nil, fmt.Errorf("failed to save job: %w", err)
	}

	log.Printf("[Cron] Created job %s (%s)", jobID, req.Name)

	return job, nil
}

// Get retrieves a cron job by ID
func (m *CronManager) Get(id string) (*CronJob, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	job, ok := m.jobs[id]
	if !ok {
		return nil, errors.New("job not found")
	}

	// Return a copy
	jobCopy := *job
	return &jobCopy, nil
}

// List returns all cron jobs
func (m *CronManager) List() ([]CronJob, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	jobs := make([]CronJob, 0, len(m.jobs))
	for _, job := range m.jobs {
		jobs = append(jobs, *job)
	}

	return jobs, nil
}

// Update updates a cron job
func (m *CronManager) Update(id string, req UpdateCronRequest) (*CronJob, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	job, ok := m.jobs[id]
	if !ok {
		return nil, errors.New("job not found")
	}

	// Unschedule first
	m.unscheduleJobLocked(id)

	// Update fields
	if req.Name != nil {
		job.Name = *req.Name
	}
	if req.Schedule != nil {
		if err := ValidateSchedule(*req.Schedule); err != nil {
			// Reschedule with old settings
			m.scheduleJobLocked(job)
			return nil, err
		}
		job.Schedule = *req.Schedule
	}
	if req.Command != nil {
		job.Command = *req.Command
	}
	if req.Shell != nil {
		job.Shell = *req.Shell
	}
	if req.WorkingDirectory != nil {
		job.WorkingDirectory = *req.WorkingDirectory
	}
	if req.EnvVars != nil {
		job.EnvVars = req.EnvVars
	}
	if req.Enabled != nil {
		job.Enabled = *req.Enabled
	}

	job.Metadata.UpdatedAt = time.Now().Unix()

	// Recalculate next run time
	nextRun, _ := GetNextRunTime(job.Schedule, time.Now())
	job.Metadata.NextRunAt = nextRun.Unix()

	// Reschedule if enabled
	if job.Enabled {
		if err := m.scheduleJobLocked(job); err != nil {
			return nil, fmt.Errorf("failed to reschedule job: %w", err)
		}
	}

	// Save to file
	if err := m.save(); err != nil {
		return nil, fmt.Errorf("failed to save job: %w", err)
	}

	log.Printf("[Cron] Updated job %s", id)

	// Return a copy
	jobCopy := *job
	return &jobCopy, nil
}

// Delete deletes a cron job
func (m *CronManager) Delete(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	job, ok := m.jobs[id]
	if !ok {
		return errors.New("job not found")
	}

	// Unschedule
	m.unscheduleJobLocked(id)

	// Remove from map
	delete(m.jobs, id)

	// Save to file
	if err := m.save(); err != nil {
		// Rollback
		m.jobs[id] = job
		return fmt.Errorf("failed to save: %w", err)
	}

	log.Printf("[Cron] Deleted job %s", id)

	return nil
}

// Enable enables a cron job
func (m *CronManager) Enable(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	job, ok := m.jobs[id]
	if !ok {
		return errors.New("job not found")
	}

	if job.Enabled {
		return nil // Already enabled
	}

	job.Enabled = true
	job.Metadata.UpdatedAt = time.Now().Unix()

	if err := m.scheduleJobLocked(job); err != nil {
		job.Enabled = false
		return fmt.Errorf("failed to schedule job: %w", err)
	}

	if err := m.save(); err != nil {
		return fmt.Errorf("failed to save: %w", err)
	}

	log.Printf("[Cron] Enabled job %s", id)

	return nil
}

// Disable disables a cron job
func (m *CronManager) Disable(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	job, ok := m.jobs[id]
	if !ok {
		return errors.New("job not found")
	}

	if !job.Enabled {
		return nil // Already disabled
	}

	job.Enabled = false
	job.Metadata.UpdatedAt = time.Now().Unix()
	job.Metadata.NextRunAt = 0

	m.unscheduleJobLocked(id)

	if err := m.save(); err != nil {
		return fmt.Errorf("failed to save: %w", err)
	}

	log.Printf("[Cron] Disabled job %s", id)

	return nil
}

// RunNow triggers immediate execution of a cron job
func (m *CronManager) RunNow(id string) (*CronExecutionResult, error) {
	m.mu.Lock()
	job, ok := m.jobs[id]
	if !ok {
		m.mu.Unlock()
		return nil, errors.New("job not found")
	}
	m.mu.Unlock()

	// Execute the job
	result, err := m.executor.Execute(job)

	m.mu.Lock()
	defer m.mu.Unlock()

	if err != nil {
		return nil, err
	}

	// Add to execution history
	m.addExecution(result)

	// Calculate next run time
	nextRun, _ := GetNextRunTime(job.Schedule, time.Now())
	job.Metadata.NextRunAt = nextRun.Unix()

	// Update job metadata
	m.executor.UpdateJobMetadata(job, result, nextRun)

	// Save to file
	if err := m.save(); err != nil {
		log.Printf("[Cron] Failed to save after manual execution: %v", err)
	}

	log.Printf("[Cron] Manual execution completed for job %s (exit code: %d)", id, result.ExitCode)

	return result, nil
}

// GetHistory returns execution history for a specific job
func (m *CronManager) GetHistory(id string) ([]CronExecutionResult, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Check if job exists
	if _, ok := m.jobs[id]; !ok {
		return nil, errors.New("job not found")
	}

	// Filter executions by job ID
	history := make([]CronExecutionResult, 0)
	for _, exec := range m.executions {
		if exec.JobID == id {
			history = append(history, exec)
		}
	}

	return history, nil
}

// GetAllHistory returns all execution history
func (m *CronManager) GetAllHistory() []CronExecutionResult {
	m.mu.RLock()
	defer m.mu.RUnlock()

	history := make([]CronExecutionResult, len(m.executions))
	copy(history, m.executions)

	return history
}

// GetJobCount returns the number of jobs
func (m *CronManager) GetJobCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return len(m.jobs)
}

// IsStarted returns whether the scheduler is started
func (m *CronManager) IsStarted() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.started
}

// GetDefaultCronFilePath returns the default path for the cron JSON file
func GetDefaultCronFilePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, ".terminal-hub", "crons.json"), nil
}

// GetCronFilePathFromEnv returns the cron file path from environment variable or default
func GetCronFilePathFromEnv() string {
	if path := os.Getenv("TERMINAL_HUB_CRON_FILE"); path != "" {
		return path
	}

	path, err := GetDefaultCronFilePath()
	if err != nil {
		// Fallback to current directory
		return "crons.json"
	}

	return path
}

// GetHistorySizeFromEnv returns the history size from environment variable or default
func GetHistorySizeFromEnv() int {
	if size := os.Getenv("TERMINAL_HUB_CRON_HISTORY_SIZE"); size != "" {
		if s, err := strconv.Atoi(size); err == nil && s > 0 {
			return s
		}
	}
	return 1000 // default
}

// IsCronEnabledFromEnv returns whether cron is enabled from environment variable
func IsCronEnabledFromEnv() bool {
	enabled := os.Getenv("TERMINAL_HUB_CRON_ENABLED")
	if enabled == "" {
		return true // default: enabled
	}

	// Parse boolean
	if enabled == "true" || enabled == "1" || enabled == "yes" {
		return true
	}

	return false
}
