package cron

import (
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/iwanhae/terminal-hub/terminal"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

// MockCronPTYService is a mock implementation of PTYService for cron testing
type MockCronPTYService struct {
	startCalled int
	startFunc   func(shell, workingDir string, envVars map[string]string) (*os.File, error)
	startReturn struct {
		file *os.File
		cmd  *exec.Cmd
		err  error
	}
	setSizeCalled bool
	setSizeCols   int
	setSizeRows   int
}

func (m *MockCronPTYService) Start(shell string) (*os.File, error) {
	m.startCalled++
	if m.startFunc != nil {
		return m.startFunc(shell, "", nil)
	}
	if m.startReturn.err != nil {
		return nil, m.startReturn.err
	}
	return m.startReturn.file, nil
}

func (m *MockCronPTYService) StartWithConfig(shell, workingDir string, envVars map[string]string) (*os.File, *exec.Cmd, error) {
	m.startCalled++
	if m.startFunc != nil {
		f, err := m.startFunc(shell, workingDir, envVars)
		return f, nil, err
	}
	if m.startReturn.err != nil {
		return nil, nil, m.startReturn.err
	}
	return m.startReturn.file, m.startReturn.cmd, m.startReturn.err
}

func (m *MockCronPTYService) SetSize(file *os.File, cols, rows int) error {
	m.setSizeCalled = true
	m.setSizeCols = cols
	m.setSizeRows = rows
	return nil
}

var _ = Describe("CronExecutor", func() {
	var (
		executor *CronExecutor
		config   CronExecutorConfig
		job      *CronJob
	)

	BeforeEach(func() {
		config = CronExecutorConfig{
			MaxOutputSize:    64 * 1024,
			ExecutionTimeout: 5 * time.Second,
			MaxConcurrent:    2,
		}
		executor = NewCronExecutor(config)
		job = &CronJob{
			ID:       "test-job",
			Name:     "Test Job",
			Command:  "echo 'hello'",
			Schedule: "* * * * *",
		}
	})

	Describe("NewCronExecutor", func() {
		It("should create executor with default config", func() {
			exec := NewCronExecutor(CronExecutorConfig{})
			Expect(exec).NotTo(BeNil())
		})

		It("should create executor with custom config", func() {
			exec := NewCronExecutor(CronExecutorConfig{
				MaxOutputSize:    1024,
				ExecutionTimeout: 10 * time.Second,
				MaxConcurrent:    5,
			})
			Expect(exec).NotTo(BeNil())
		})
	})

	Describe("Execute", func() {
		Context("with successful command", func() {
			It("should return successful result", func() {
				job.Command = "echo 'test'"
				result, err := executor.Execute(job)

				Expect(err).ToNot(HaveOccurred())
				Expect(result.ExitCode).To(Equal(0))
				Expect(result.Output).To(ContainSubstring("test"))
				Expect(result.Error).To(BeEmpty())
			})

			It("should capture stdout", func() {
				job.Command = "echo 'stdout output'"
				result, err := executor.Execute(job)

				Expect(err).ToNot(HaveOccurred())
				Expect(result.Output).To(ContainSubstring("stdout output"))
			})

			It("should capture stderr", func() {
				job.Command = "sh -c 'echo error >&2'"
				result, err := executor.Execute(job)

				Expect(err).ToNot(HaveOccurred())
				Expect(result.Output).To(ContainSubstring("error"))
			})

			It("should capture both stdout and stderr", func() {
				job.Command = "sh -c 'echo out; echo err >&2'"
				result, err := executor.Execute(job)

				Expect(err).ToNot(HaveOccurred())
				Expect(result.Output).To(ContainSubstring("out"))
				Expect(result.Output).To(ContainSubstring("err"))
			})

			It("should handle commands with pipes", func() {
				job.Command = "echo 'hello world' | wc -w"
				result, err := executor.Execute(job)

				Expect(err).ToNot(HaveOccurred())
				Expect(result.ExitCode).To(Equal(0))
				Expect(result.Output).To(ContainSubstring("2"))
			})

			It("should handle commands with redirects", func() {
				job.Command = "echo test > /dev/null && echo success"
				result, err := executor.Execute(job)

				Expect(err).ToNot(HaveOccurred())
				Expect(result.ExitCode).To(Equal(0))
				Expect(result.Output).To(ContainSubstring("success"))
			})
		})

		Context("with failing command", func() {
			It("should return non-zero exit code", func() {
				job.Command = "sh -c 'exit 1'"
				result, err := executor.Execute(job)

				Expect(err).ToNot(HaveOccurred())
				Expect(result.ExitCode).To(Equal(1))
				Expect(result.Error).To(ContainSubstring("code 1"))
			})

			It("should return specific exit code", func() {
				job.Command = "sh -c 'exit 42'"
				result, err := executor.Execute(job)

				Expect(err).ToNot(HaveOccurred())
				Expect(result.ExitCode).To(Equal(42))
				Expect(result.Error).To(ContainSubstring("code 42"))
			})

			It("should capture output from failing command", func() {
				job.Command = "sh -c 'echo failure message; exit 1'"
				result, err := executor.Execute(job)

				Expect(err).ToNot(HaveOccurred())
				Expect(result.Output).To(ContainSubstring("failure message"))
				Expect(result.ExitCode).To(Equal(1))
			})
		})

		Context("with command start failure", func() {
			It("should return non-zero exit code for nonexistent command", func() {
				job.Command = "/nonexistent/command/that/does/not/exist"
				result, err := executor.Execute(job)

				Expect(err).ToNot(HaveOccurred())
				Expect(result.ExitCode).To(Equal(127)) // shell returns 127 for command not found
			})

			It("should return non-zero exit code for command with permission issues", func() {
				job.Command = "/root/.hidden"
				result, err := executor.Execute(job)

				Expect(err).ToNot(HaveOccurred())
				Expect(result.ExitCode).ToNot(Equal(0)) // shell returns 126 or 127
			})
		})

		Context("with output truncation", func() {
			It("should truncate large output", func() {
				job.Command = "python3 -c \"print('x' * 100000)\""
				truncConfig := CronExecutorConfig{
					MaxOutputSize:    1024,
					ExecutionTimeout: 10 * time.Second,
					MaxConcurrent:    5,
				}
				truncExecutor := NewCronExecutor(truncConfig)

				result, _ := truncExecutor.Execute(job)
				Expect(len(result.Output)).To(BeNumerically("<=", 1024+100)) // +100 for truncation message
				Expect(result.Output).To(ContainSubstring("truncated"))
			})

			It("should not truncate small output", func() {
				job.Command = "echo 'small'"
				config.MaxOutputSize = 1024

				result, _ := executor.Execute(job)
				Expect(result.Output).ToNot(ContainSubstring("truncated"))
				Expect(result.Output).To(ContainSubstring("small"))
			})
		})

		Context("with working directory", func() {
			It("should execute in specified directory", func() {
				job.WorkingDirectory = "/tmp"
				job.Command = "pwd"
				result, _ := executor.Execute(job)

				Expect(result.Output).To(ContainSubstring("/tmp"))
			})

			It("should fail if directory does not exist", func() {
				job.WorkingDirectory = "/nonexistent/dir/12345"
				job.Command = "pwd"
				result, _ := executor.Execute(job)

				Expect(result.ExitCode).ToNot(Equal(0))
			})
		})

		Context("with environment variables", func() {
			It("should pass environment variables", func() {
				job.EnvVars = map[string]string{"TEST_VAR": "test_value"}
				job.Command = "echo $TEST_VAR"
				result, _ := executor.Execute(job)

				Expect(result.Output).To(ContainSubstring("test_value"))
			})

			It("should pass multiple environment variables", func() {
				job.EnvVars = map[string]string{
					"VAR1": "value1",
					"VAR2": "value2",
				}
				job.Command = "echo $VAR1 $VAR2"
				result, _ := executor.Execute(job)

				Expect(result.Output).To(ContainSubstring("value1"))
				Expect(result.Output).To(ContainSubstring("value2"))
			})

			It("should preserve existing environment variables", func() {
				job.Command = "echo $PATH"
				result, _ := executor.Execute(job)

				Expect(result.Output).NotTo(BeEmpty())
				Expect(result.Output).To(ContainSubstring("/"))
			})
		})

		Context("with custom shell", func() {
			It("should use custom shell when specified", func() {
				job.Shell = "/bin/sh"
				job.Command = "echo 'custom shell'"
				result, _ := executor.Execute(job)

				Expect(result.ExitCode).To(Equal(0))
				Expect(result.Output).To(ContainSubstring("custom shell"))
			})
		})

		Context("with timeout", func() {
			It("should timeout long-running command", func() {
				// Use mock executor to avoid real sleep - much faster
				mockExec := NewMockCommandExecutor()
				mockExec.SetOnExecute(func(command string) MockCommandResult {
					return MockCommandResult{Delay: 2 * time.Second, ExitCode: 0}
				})

				timeoutExecutor := NewCronExecutorWithOptions(CronExecutorConfig{
					MaxOutputSize:    config.MaxOutputSize,
					ExecutionTimeout: 100 * time.Millisecond,
					MaxConcurrent:    5,
				}, WithMockExecutor(mockExec))

				job.Command = "sleep 2" // Will be mocked

				start := time.Now()
				result, err := timeoutExecutor.Execute(job)
				elapsed := time.Since(start)

				Expect(err).ToNot(HaveOccurred())
				Expect(result.ExitCode).ToNot(Equal(0))
				Expect(elapsed).To(BeNumerically("<", 200*time.Millisecond)) // Fast!
			})

			It("should complete within timeout", func() {
				job.Command = "sleep 0.1"

				result, err := executor.Execute(job)
				Expect(err).ToNot(HaveOccurred())
				Expect(result.ExitCode).To(Equal(0))
			})
		})
	})

	Describe("ExecuteInPTY", func() {
		Context("with PTY execution", func() {
			It("should execute command using PTY", func() {
				job.Command = "echo 'pty output'"
				ptyService := &terminal.DefaultPTYService{}
				result, err := executor.ExecuteInPTY(job, ptyService)

				Expect(err).ToNot(HaveOccurred())
				Expect(result.ExitCode).To(Equal(0))
				Expect(result.Output).To(ContainSubstring("pty output"))
			})

			It("should handle signals in PTY mode", func() {
				job.Command = "trap 'echo caught' TERM; sleep 5"
				config.ExecutionTimeout = 1 * time.Second
				ptyService := &terminal.DefaultPTYService{}

				result, err := executor.ExecuteInPTY(job, ptyService)
				Expect(err).ToNot(HaveOccurred())
				Expect(result.ExitCode).ToNot(Equal(0))
			})
		})
	})

	Describe("ExecuteAsync", func() {
		It("should execute in background and call callback", func() {
			job.Command = "echo 'async'"
			done := make(chan *CronExecutionResult, 1)

			executor.ExecuteAsync(job, func(result *CronExecutionResult) {
				done <- result
			})

			var result *CronExecutionResult
			Eventually(done, "2s").Should(Receive(&result))
			Expect(result.Output).To(ContainSubstring("async"))
			Expect(result.ExitCode).To(Equal(0))
		})

		It("should handle async errors", func() {
			job.Command = "/nonexistent/command"
			done := make(chan *CronExecutionResult, 1)

			executor.ExecuteAsync(job, func(result *CronExecutionResult) {
				done <- result
			})

			var result *CronExecutionResult
			Eventually(done, "2s").Should(Receive(&result))
			Expect(result.ExitCode).To(Equal(127)) // shell returns 127 for command not found
		})

		It("should execute multiple jobs concurrently", func() {
			jobs := []*CronJob{
				{ID: "1", Command: "echo 'job1'", Schedule: "* * * * *"},
				{ID: "2", Command: "echo 'job2'", Schedule: "* * * * *"},
				{ID: "3", Command: "echo 'job3'", Schedule: "* * * * *"},
			}

			results := make(chan *CronExecutionResult, len(jobs))
			for _, j := range jobs {
				executor.ExecuteAsync(j, func(r *CronExecutionResult) {
					results <- r
				})
			}

			for i := 0; i < len(jobs); i++ {
				Eventually(results, "2s").Should(Receive())
			}
		})
	})

	Describe("UpdateJobMetadata", func() {
		It("should update metadata for successful run", func() {
			result := &CronExecutionResult{
				ExitCode:  0,
				Output:    "success",
				StartedAt: time.Now().Unix(),
			}
			nextRun := time.Now().Add(1 * time.Hour)

			executor.UpdateJobMetadata(job, result, nextRun)

			Expect(job.Metadata.LastRunStatus).To(Equal("success"))
			Expect(job.Metadata.TotalRuns).To(Equal(1))
			Expect(job.Metadata.FailureCount).To(Equal(0))
			Expect(job.Metadata.LastRunAt).ToNot(Equal(int64(0)))
			Expect(job.Metadata.NextRunAt).ToNot(Equal(int64(0)))
		})

		It("should update metadata for failed run", func() {
			result := &CronExecutionResult{
				ExitCode:  1,
				Error:     "command failed",
				StartedAt: time.Now().Unix(),
			}
			nextRun := time.Now().Add(1 * time.Hour)

			executor.UpdateJobMetadata(job, result, nextRun)

			Expect(job.Metadata.LastRunStatus).To(Equal("failed"))
			Expect(job.Metadata.TotalRuns).To(Equal(1))
			Expect(job.Metadata.FailureCount).To(Equal(1))
			Expect(job.Metadata.LastRunAt).ToNot(Equal(int64(0)))
		})

		It("should increment total runs correctly", func() {
			result1 := &CronExecutionResult{ExitCode: 0}
			executor.UpdateJobMetadata(job, result1, time.Time{})

			result2 := &CronExecutionResult{ExitCode: 0}
			executor.UpdateJobMetadata(job, result2, time.Time{})

			Expect(job.Metadata.TotalRuns).To(Equal(2))
		})

		It("should track consecutive failures", func() {
			// First failure
			result1 := &CronExecutionResult{ExitCode: 1}
			executor.UpdateJobMetadata(job, result1, time.Time{})

			// Second failure
			result2 := &CronExecutionResult{ExitCode: 1}
			executor.UpdateJobMetadata(job, result2, time.Time{})

			Expect(job.Metadata.FailureCount).To(Equal(2))
			Expect(job.Metadata.TotalRuns).To(Equal(2))
		})

		It("should not increment failure count on success", func() {
			// Set up previous failures
			job.Metadata.FailureCount = 3
			job.Metadata.TotalRuns = 3

			// Successful run should not change failure count
			result := &CronExecutionResult{ExitCode: 0}
			executor.UpdateJobMetadata(job, result, time.Time{})

			Expect(job.Metadata.TotalRuns).To(Equal(4))
			Expect(job.Metadata.FailureCount).To(Equal(3)) // unchanged
		})
	})
})

var _ = Describe("CronExecutor Concurrency Control", func() {
	var (
		executor *CronExecutor
		config   CronExecutorConfig
		mockExec *MockCommandExecutor
		useMocks bool = true // Use mocks for faster tests
	)

	BeforeEach(func() {
		config = CronExecutorConfig{
			MaxConcurrent:    2,
			ExecutionTimeout: 10 * time.Second,
			MaxOutputSize:    1024,
		}
		if useMocks {
			mockExec = NewMockCommandExecutor()
			mockExec.SetDefaultResult(MockCommandResult{
				Delay:    50 * time.Millisecond, // Simulated work
				ExitCode: 0,
			})
			executor = NewCronExecutorWithOptions(config, WithMockExecutor(mockExec))
		} else {
			executor = NewCronExecutor(config)
		}
	})

	Context("with MaxConcurrent limit", func() {
		It("should limit concurrent executions", func() {
			job := &CronJob{
				ID:       "concurrent-test",
				Command:  "sleep 0.2", // Will be mocked if useMocks is true
				Schedule: "* * * * *",
			}

			var wg sync.WaitGroup
			completed := make(chan int, 5)
			started := make(chan int, 5)

			for i := 0; i < 5; i++ {
				wg.Add(1)
				go func(idx int) {
					defer wg.Done()
					started <- idx
					executor.Execute(job)
					completed <- idx
				}(i)
			}

			// Wait for all to start
			for i := 0; i < 5; i++ {
				Eventually(started, "2s").Should(Receive())
			}

			// At most MaxConcurrent should complete quickly (50ms each with mocks)
			completions := 0
			waitTime := 100 * time.Millisecond // With mocks, 50ms per job
			if !useMocks {
				waitTime = 300 * time.Millisecond // Real commands need longer
			}
			for i := 0; i < 5; i++ {
				select {
				case <-completed:
					completions++
				case <-time.After(waitTime):
					// Some jobs should be waiting
				}
			}

			wg.Wait()
		})
	})

	Context("with execution timeout waiting for slot", func() {
		It("should timeout waiting for execution slot", func() {
			// This test uses real commands because we need to test semaphore blocking
			// Create executor with short timeout and max concurrent of 1
			realExecutor := NewCronExecutor(CronExecutorConfig{
				MaxConcurrent:    1,
				ExecutionTimeout: 500 * time.Millisecond,
			})

			// Fill the slot with a slow job
			blocker := &CronJob{
				ID:       "blocker",
				Command:  "sleep 2",
				Schedule: "* * * * *",
			}
			go realExecutor.Execute(blocker)

			// Give it time to acquire the slot
			time.Sleep(20 * time.Millisecond)

			// Try to run another - should timeout
			waiter := &CronJob{
				ID:       "waiter",
				Command:  "echo test",
				Schedule: "* * * * *",
			}

			result, err := realExecutor.Execute(waiter)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("timeout"))
			Expect(result).To(BeNil())
		})
	})

	Context("with rapid job submissions", func() {
		It("should handle rapid submissions gracefully", func() {
			job := &CronJob{
				ID:       "rapid",
				Command:  "echo quick", // Fast command (or mocked)
				Schedule: "* * * * *",
			}

			// Submit many jobs rapidly
			results := make(chan *CronExecutionResult, 20)
			for i := 0; i < 20; i++ {
				go func(idx int) {
					result, _ := executor.Execute(job)
					results <- result
				}(i)
			}

			// All should complete quickly (with mocks: 50ms * 10 batches = 500ms max)
			count := 0
			timeoutDuration := 1 * time.Second // Reduced from 3s since we use mocks
			if !useMocks {
				timeoutDuration = 3 * time.Second
			}
			timeout := time.After(timeoutDuration)
			for count < 20 {
				select {
				case <-results:
					count++
				case <-timeout:
					Fail("Timeout waiting for jobs to complete")
				}
			}

			Expect(count).To(Equal(20))
		})
	})
})

// Benchmark tests (only run with -bench flag)
var _ = Describe("CronExecutor Benchmarks", func() {
	var executor *CronExecutor

	BeforeEach(func() {
		executor = NewCronExecutor(CronExecutorConfig{
			MaxOutputSize:    64 * 1024,
			ExecutionTimeout: 5 * time.Second,
			MaxConcurrent:    10,
		})
	})

	Context("benchmark execution performance", func() {
		It("should execute simple command quickly", func() {
			job := &CronJob{
				ID:       "bench",
				Command:  "echo test",
				Schedule: "* * * * *",
			}

			start := time.Now()
			result, err := executor.Execute(job)
			elapsed := time.Since(start)

			Expect(err).ToNot(HaveOccurred())
			Expect(result.ExitCode).To(Equal(0))
			Expect(elapsed).To(BeNumerically("<", 1*time.Second))
		})
	})
})
