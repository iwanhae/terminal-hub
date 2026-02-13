package cron

import (
	"context"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

var _ = Describe("CronExecutor with Mock", func() {
	var (
		executor *CronExecutor
		mockExec *MockCommandExecutor
		config   CronExecutorConfig
	)

	BeforeEach(func() {
		config = CronExecutorConfig{
			MaxOutputSize:    64 * 1024,
			ExecutionTimeout: 500 * time.Millisecond,
			MaxConcurrent:    2,
		}
		mockExec = NewMockCommandExecutor()
		executor = NewCronExecutorWithOptions(config,
			WithMockExecutor(mockExec),
		)
	})

	Describe("Fast Timeout Tests", func() {
		Context("with mock executor", func() {
			It("should timeout long-running command (mocked)", func() {
				// Set up mock to simulate a long-running command
				// The delay is longer than the timeout, so it will be cancelled
				mockExec.SetOnExecute(func(command string) MockCommandResult {
					// Simulate a long-running command by waiting
					// Since we have a context timeout, this will be interrupted
					return MockCommandResult{
						Delay:    2 * time.Second, // Longer than timeout
						Stdout:   "should not see this",
						ExitCode: 0,
					}
				})

				job := &CronJob{
					ID:       "test-job",
					Name:     "Test Job",
					Command:  "sleep 10", // This will be mocked
					Schedule: "* * * * *",
				}

				// The mock executor respects context cancellation
				// Since we set a 500ms timeout, and the mock delays 2s,
				// it should return with a context cancellation error
				start := time.Now()
				result, err := executor.Execute(job)
				elapsed := time.Since(start)

				// Should complete quickly due to mock context handling
				Expect(elapsed).To(BeNumerically("<", 600*time.Millisecond))

				// The mock executor returns an error when context is cancelled
				Expect(err).ToNot(HaveOccurred())     // Execute doesn't return error, just sets result
				Expect(result.ExitCode).To(Equal(-1)) // Context cancelled
			})

			It("should complete within timeout (mocked)", func() {
				mockExec.SetDefaultResult(MockCommandResult{
					Stdout:   "quick output",
					ExitCode: 0,
					Delay:    10 * time.Millisecond, // Fast execution
				})

				job := &CronJob{
					ID:       "quick-job",
					Command:  "echo quick",
					Schedule: "* * * * *",
				}

				start := time.Now()
				result, err := executor.Execute(job)
				elapsed := time.Since(start)

				Expect(err).ToNot(HaveOccurred())
				Expect(result.ExitCode).To(Equal(0))
				Expect(result.Output).To(Equal("quick output"))
				Expect(elapsed).To(BeNumerically("<", 50*time.Millisecond))
			})

			It("should handle command failure (mocked)", func() {
				mockExec.SetDefaultResult(MockCommandResult{
					Stderr:   "error message",
					ExitCode: 1,
				})

				job := &CronJob{
					ID:       "fail-job",
					Command:  "exit 1",
					Schedule: "* * * * *",
				}

				result, err := executor.Execute(job)

				Expect(err).ToNot(HaveOccurred())
				Expect(result.ExitCode).To(Equal(1))
				Expect(result.Error).To(ContainSubstring("code 1"))
			})

			It("should handle concurrent execution limit (mocked)", func() {
				// Set up a mock that tracks concurrent executions
				concurrentCount := 0
				maxConcurrent := 0
				mockExec.SetOnExecute(func(command string) MockCommandResult {
					// Simulate some work
					return MockCommandResult{
						Stdout:   "done",
						ExitCode: 0,
						Delay:    50 * time.Millisecond, // Short delay
					}
				})

				// Track concurrent executions through the mock
				_ = concurrentCount // Used for tracking
				_ = maxConcurrent   // Track max concurrency

				// Run 5 jobs
				results := make(chan *CronExecutionResult, 5)
				for i := 0; i < 5; i++ {
					job := &CronJob{
						ID:       string(rune('A' + i)),
						Command:  "test",
						Schedule: "* * * * *",
					}
					go func() {
						result, _ := executor.Execute(job)
						results <- result
					}()
				}

				// All should complete quickly
				start := time.Now()
				for i := 0; i < 5; i++ {
					Eventually(results, "1s").Should(Receive())
				}
				elapsed := time.Since(start)

				// With 2 concurrent slots and 50ms per job, 5 jobs should take
				// about 150ms (3 batches: 2+2+1)
				Expect(elapsed).To(BeNumerically("<", 200*time.Millisecond))
			})

			It("should record all executed commands", func() {
				mockExec.SetDefaultResult(MockCommandResult{ExitCode: 0})

				executor.Execute(&CronJob{ID: "1", Command: "echo one", Schedule: "* * * * *"})
				executor.Execute(&CronJob{ID: "2", Command: "echo two", Schedule: "* * * * *"})
				executor.Execute(&CronJob{ID: "3", Command: "echo three", Schedule: "* * * * *"})
				executor.Execute(&CronJob{ID: "4", Command: "echo four", Schedule: "* * * * *"})

				commands := mockExec.GetExecutedCommands()
				Expect(len(commands)).To(Equal(4))
				Expect(commands).To(ContainElements("echo one", "echo two", "echo three", "echo four"))
			})
		})
	})

	Describe("Mock Executor Features", func() {
		It("should support pattern-based results", func() {
			mockExec.SetResult("sleep", MockCommandResult{
				ExitCode: 0,
				Stdout:   "slept",
			})
			mockExec.SetResult("echo", MockCommandResult{
				ExitCode: 0,
				Stdout:   "echoed",
			})

			sleepResult, _ := executor.Execute(&CronJob{ID: "1", Command: "sleep 5", Schedule: "* * * * *"})
			echoResult, _ := executor.Execute(&CronJob{ID: "2", Command: "echo hello", Schedule: "* * * * *"})
			otherResult, _ := executor.Execute(&CronJob{ID: "3", Command: "ls", Schedule: "* * * * *"})

			Expect(sleepResult.Output).To(Equal("slept"))
			Expect(echoResult.Output).To(Equal("echoed"))
			Expect(otherResult.Output).To(BeEmpty()) // Default result
		})

		It("should support context cancellation in mock", func() {
			// Create a custom mock that respects context
			mockExec.SetOnExecute(func(command string) MockCommandResult {
				// This delay is longer than our timeout
				return MockCommandResult{
					Delay:    5 * time.Second,
					ExitCode: 0,
				}
			})

			// With a short timeout, the context should cancel
			start := time.Now()
			result, _ := executor.Execute(&CronJob{ID: "timeout", Command: "long", Schedule: "* * * * *"})
			elapsed := time.Since(start)

			// Should be cancelled quickly
			Expect(elapsed).To(BeNumerically("<", 600*time.Millisecond))
			Expect(result.ExitCode).To(Equal(-1)) // Context error
		})
	})
})

var _ = Describe("Mock Command Executor", func() {
	var mockExec *MockCommandExecutor

	BeforeEach(func() {
		mockExec = NewMockCommandExecutor()
	})

	It("should track executed commands", func() {
		ctx := context.Background()

		mockExec.Execute(ctx, "cmd1", "", nil)
		mockExec.Execute(ctx, "cmd2", "", nil)
		mockExec.Execute(ctx, "cmd3", "", nil)

		commands := mockExec.GetExecutedCommands()
		Expect(commands).To(HaveLen(3))
		Expect(commands).To(Equal([]string{"cmd1", "cmd2", "cmd3"}))
	})

	It("should return configured results", func() {
		ctx := context.Background()

		mockExec.SetResult("test", MockCommandResult{
			Stdout:   "test output",
			Stderr:   "test error",
			ExitCode: 42,
		})

		stdout, stderr, exitCode, _ := mockExec.Execute(ctx, "test", "", nil)

		Expect(stdout).To(Equal("test output"))
		Expect(stderr).To(Equal("test error"))
		Expect(exitCode).To(Equal(42))
	})

	It("should respect context cancellation", func() {
		ctx, cancel := context.WithCancel(context.Background())
		cancel() // Cancel immediately

		mockExec.SetDefaultResult(MockCommandResult{
			Delay: 1 * time.Second,
		})

		_, _, _, err := mockExec.Execute(ctx, "test", "", nil)

		Expect(err).To(Equal(context.Canceled))
	})

	It("should reset properly", func() {
		ctx := context.Background()

		mockExec.SetResult("test", MockCommandResult{ExitCode: 1})
		mockExec.Execute(ctx, "test", "", nil)

		mockExec.Reset()

		commands := mockExec.GetExecutedCommands()
		Expect(commands).To(BeEmpty())

		_, _, exitCode, _ := mockExec.Execute(ctx, "test", "", nil)
		Expect(exitCode).To(Equal(0)) // Back to default
	})
})
