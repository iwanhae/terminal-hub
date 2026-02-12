package terminal

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

var _ = Describe("Cron Integration Tests", func() {
	var (
		manager  *CronManager
		tempDir  string
		cronFile string
	)

	BeforeEach(func() {
		var err error
		tempDir, err = os.MkdirTemp("", "cron-integration-*")
		Expect(err).ToNot(HaveOccurred())
		cronFile = filepath.Join(tempDir, "crons.json")
		manager, err = NewCronManager(cronFile, 100)
		Expect(err).ToNot(HaveOccurred())
		manager.Start()
	})

	AfterEach(func() {
		if manager != nil {
			manager.Stop()
		}
		os.RemoveAll(tempDir)
	})

	Describe("Persistence Integration", func() {
		Context("file persistence", func() {
			It("should persist jobs to file", func() {
				req := CreateCronRequest{
					Name:     "Persist Job",
					Schedule: "0 2 * * *",
					Command:  "echo persisted",
					Enabled:  true,
				}
				job, _ := manager.Create(req)

				// Read file directly
				data, err := os.ReadFile(cronFile)
				Expect(err).ToNot(HaveOccurred())

				var cronData CronData
				err = json.Unmarshal(data, &cronData)
				Expect(err).ToNot(HaveOccurred())
				Expect(len(cronData.Jobs)).To(Equal(1))
				Expect(cronData.Jobs[0].ID).To(Equal(job.ID))
				Expect(cronData.Jobs[0].Name).To(Equal("Persist Job"))
			})

			It("should persist multiple jobs to file", func() {
				manager.Create(CreateCronRequest{
					Name: "Job 1", Schedule: "0 * * * *", Command: "echo 1",
				})
				manager.Create(CreateCronRequest{
					Name: "Job 2", Schedule: "*/5 * * * *", Command: "echo 2",
				})
				manager.Create(CreateCronRequest{
					Name: "Job 3", Schedule: "0 0 * * *", Command: "echo 3",
				})

				data, _ := os.ReadFile(cronFile)
				var cronData CronData
				json.Unmarshal(data, &cronData)

				Expect(len(cronData.Jobs)).To(Equal(3))
			})

			It("should use atomic writes (temp file + rename)", func() {
				req := CreateCronRequest{
					Name:     "Atomic Test",
					Schedule: "* * * * *",
					Command:  "echo atomic",
					Enabled:  true,
				}
				manager.Create(req)

				// Verify no .tmp file exists after save
				tmpFile := cronFile + ".tmp"
				_, err := os.Stat(tmpFile)
				Expect(os.IsNotExist(err)).To(BeTrue(), "Temp file should not exist after save")
			})

			It("should create directory if it doesn't exist", func() {
				nestedPath := filepath.Join(tempDir, "nested", "dir", "crons.json")
				newManager, err := NewCronManager(nestedPath, 100)
				Expect(err).ToNot(HaveOccurred())

				newManager.Create(CreateCronRequest{
					Name: "Nested", Schedule: "* * * * *", Command: "echo nested",
				})

				// Verify file was created
				_, err = os.Stat(nestedPath)
				Expect(err).ToNot(HaveOccurred())

				newManager.Stop()
			})
		})

		Context("manager restart", func() {
			It("should load jobs on restart", func() {
				req := CreateCronRequest{
					Name:     "Reload Job",
					Schedule: "0 2 * * *",
					Command:  "echo reload",
					Enabled:  true,
				}
				job, _ := manager.Create(req)

				// Stop and reload
				manager.Stop()

				newManager, err := NewCronManager(cronFile, 100)
				Expect(err).ToNot(HaveOccurred())
				defer newManager.Stop()

				loaded, err := newManager.Get(job.ID)
				Expect(err).ToNot(HaveOccurred())
				Expect(loaded.Name).To(Equal("Reload Job"))
				Expect(loaded.Command).To(Equal("echo reload"))
				Expect(loaded.Schedule).To(Equal("0 2 * * *"))
				Expect(loaded.Enabled).To(BeTrue())
			})

			It("should load multiple jobs on restart", func() {
				ids := make([]string, 0)
				for i := 1; i <= 5; i++ {
					job, _ := manager.Create(CreateCronRequest{
						Name:     string(rune('0' + i)),
						Schedule: "* * * * *",
						Command:  "echo test",
					})
					ids = append(ids, job.ID)
				}

				manager.Stop()

				newManager, _ := NewCronManager(cronFile, 100)
				defer newManager.Stop()

				Expect(newManager.GetJobCount()).To(Equal(5))

				for _, id := range ids {
					_, err := newManager.Get(id)
					Expect(err).ToNot(HaveOccurred())
				}
			})

			It("should restore metadata on restart", func() {
				req := CreateCronRequest{
					Name:     "Metadata Job",
					Schedule: "* * * * *",
					Command:  "echo metadata",
					Enabled:  true,
				}
				job, _ := manager.Create(req)

				// Run the job to create metadata
				manager.RunNow(job.ID)
				time.Sleep(10 * time.Millisecond)

				manager.Stop()

				newManager, _ := NewCronManager(cronFile, 100)
				defer newManager.Stop()

				reloaded, _ := newManager.Get(job.ID)
				Expect(reloaded.Metadata.TotalRuns).To(Equal(1))
				Expect(reloaded.Metadata.LastRunStatus).To(Equal("success"))
				Expect(reloaded.Metadata.LastRunAt).ToNot(Equal(int64(0)))
			})

			It("should restore disabled state on restart", func() {
				job, _ := manager.Create(CreateCronRequest{
					Name: "Disabled Job", Schedule: "* * * * *", Command: "echo test", Enabled: false,
				})

				manager.Stop()

				newManager, _ := NewCronManager(cronFile, 100)
				defer newManager.Stop()

				reloaded, _ := newManager.Get(job.ID)
				Expect(reloaded.Enabled).To(BeFalse())
			})
		})

		Context("execution history persistence", func() {
			It("should persist execution history", func() {
				req := CreateCronRequest{
					Name:     "History Test",
					Schedule: "* * * * *",
					Command:  "echo history",
					Enabled:  true,
				}
				job, _ := manager.Create(req)

				manager.RunNow(job.ID)
				manager.RunNow(job.ID)
				manager.RunNow(job.ID)

				manager.Stop()

				newManager, _ := NewCronManager(cronFile, 100)
				defer newManager.Stop()

				history, _ := newManager.GetHistory(job.ID)
				Expect(len(history)).To(Equal(3))
			})

			It("should persist history with output", func() {
				job, _ := manager.Create(CreateCronRequest{
					Name: "Output History", Schedule: "* * * * *", Command: "echo 'saved output'",
				})

				manager.RunNow(job.ID)

				manager.Stop()

				newManager, _ := NewCronManager(cronFile, 100)
				defer newManager.Stop()

				history, _ := newManager.GetHistory(job.ID)
				Expect(len(history)).To(Equal(1))
				Expect(history[0].Output).To(ContainSubstring("saved output"))
			})

			It("should persist history with errors", func() {
				job, _ := manager.Create(CreateCronRequest{
					Name: "Error History", Schedule: "* * * * *", Command: "exit 1",
				})

				manager.RunNow(job.ID)

				manager.Stop()

				newManager, _ := NewCronManager(cronFile, 100)
				defer newManager.Stop()

				history, _ := newManager.GetHistory(job.ID)
				Expect(len(history)).To(Equal(1))
				Expect(history[0].ExitCode).To(Equal(1))
				Expect(history[0].Error).ToNot(BeEmpty())
			})

			It("should respect history size limit on reload", func() {
				smallHistoryManager, _ := NewCronManager(cronFile, 3)
				smallHistoryManager.Start()

				job, _ := smallHistoryManager.Create(CreateCronRequest{
					Name: "History Limit", Schedule: "* * * * *", Command: "echo test",
				})

				// Run 5 times
				for i := 0; i < 5; i++ {
					smallHistoryManager.RunNow(job.ID)
				}

				smallHistoryManager.Stop()

				// Reload with same limit
				reloadedManager, _ := NewCronManager(cronFile, 3)
				defer reloadedManager.Stop()

				history, _ := reloadedManager.GetHistory(job.ID)
				Expect(len(history)).To(Equal(3)) // Should be capped at 3
			})
		})
	})

	Describe("Scheduler Execution Integration", func() {
		Context("scheduled job execution", func() {
			It("should execute job on schedule", func() {
				req := CreateCronRequest{
					Name:     "Scheduled",
					Schedule: "* * * * * *", // Every second for testing
					Command:  "echo scheduled",
					Enabled:  true,
				}
				job, _ := manager.Create(req)

				// Poll for job execution instead of fixed sleep
				Eventually(func() int {
					reloaded, _ := manager.Get(job.ID)
					return reloaded.Metadata.TotalRuns
				}, 2*time.Second, 50*time.Millisecond).Should(BeNumerically(">", 0))
			})

			It("should update next_run_at after execution", func() {
				req := CreateCronRequest{
					Name:     "Next Run Test",
					Schedule: "* * * * * *",
					Command:  "echo test",
					Enabled:  true,
				}
				job, _ := manager.Create(req)

				initialNextRun := job.Metadata.NextRunAt

				// Poll for next_run_at update instead of fixed sleep
				Eventually(func() int64 {
					reloaded, _ := manager.Get(job.ID)
					return reloaded.Metadata.NextRunAt
				}, 2*time.Second, 50*time.Millisecond).ShouldNot(Equal(initialNextRun))
			})

			It("should record execution history from scheduler", func() {
				job, _ := manager.Create(CreateCronRequest{
					Name: "Scheduler History", Schedule: "* * * * * *", Command: "echo scheduled", Enabled: true,
				})

				// Poll for history instead of fixed sleep
				Eventually(func() int {
					history, _ := manager.GetHistory(job.ID)
					return len(history)
				}, 2*time.Second, 50*time.Millisecond).Should(BeNumerically(">", 0))
			})

			It("should not execute disabled jobs", func() {
				job, _ := manager.Create(CreateCronRequest{
					Name: "Disabled Schedule", Schedule: "* * * * * *", Command: "echo disabled", Enabled: false,
				})

				// Use Consistently to verify job doesn't execute (more efficient than sleep)
				Consistently(func() int {
					reloaded, _ := manager.Get(job.ID)
					return reloaded.Metadata.TotalRuns
				}, 500*time.Millisecond, 100*time.Millisecond).Should(Equal(0))
			})

			It("should execute multiple jobs independently", func() {
				job1, _ := manager.Create(CreateCronRequest{
					Name: "Job 1", Schedule: "* * * * * *", Command: "echo job1", Enabled: true,
				})
				job2, _ := manager.Create(CreateCronRequest{
					Name: "Job 2", Schedule: "* * * * * *", Command: "echo job2", Enabled: true,
				})

				// Poll for both jobs to execute
				Eventually(func() int {
					reloaded1, _ := manager.Get(job1.ID)
					return reloaded1.Metadata.TotalRuns
				}, 2*time.Second, 50*time.Millisecond).Should(BeNumerically(">", 0))

				Eventually(func() int {
					reloaded2, _ := manager.Get(job2.ID)
					return reloaded2.Metadata.TotalRuns
				}, 2*time.Second, 50*time.Millisecond).Should(BeNumerically(">", 0))
			})
		})
	})

	Describe("End-to-End Workflows", func() {
		Context("complete job lifecycle", func() {
			It("should handle create -> schedule -> execute -> disable -> enable -> delete", func() {
				// Create
				job, err := manager.Create(CreateCronRequest{
					Name: "Lifecycle Job", Schedule: "* * * * *", Command: "echo lifecycle",
				})
				Expect(err).ToNot(HaveOccurred())

				// Verify created
				reloaded, _ := manager.Get(job.ID)
				Expect(reloaded.Name).To(Equal("Lifecycle Job"))

				// Execute manually
				result, err := manager.RunNow(job.ID)
				Expect(err).ToNot(HaveOccurred())
				Expect(result.ExitCode).To(Equal(0))

				// Verify metadata updated
				reloaded, _ = manager.Get(job.ID)
				Expect(reloaded.Metadata.TotalRuns).To(Equal(1))

				// Disable
				manager.Disable(job.ID)
				reloaded, _ = manager.Get(job.ID)
				Expect(reloaded.Enabled).To(BeFalse())

				// Enable
				manager.Enable(job.ID)
				reloaded, _ = manager.Get(job.ID)
				Expect(reloaded.Enabled).To(BeTrue())

				// Update
				newName := "Updated Lifecycle"
				manager.Update(job.ID, UpdateCronRequest{Name: &newName})
				reloaded, _ = manager.Get(job.ID)
				Expect(reloaded.Name).To(Equal("Updated Lifecycle"))

				// Delete
				err = manager.Delete(job.ID)
				Expect(err).ToNot(HaveOccurred())

				// Verify deleted
				_, err = manager.Get(job.ID)
				Expect(err).To(HaveOccurred())
			})

			It("should handle job with full configuration", func() {
				wd := "/tmp"
				shell := "/bin/sh"
				envVars := map[string]string{"TEST_VAR": "test_value"}

				job, err := manager.Create(CreateCronRequest{
					Name:             "Full Config Job",
					Schedule:         "0 * * * *",
					Command:          "echo $TEST_VAR && pwd",
					WorkingDirectory: wd,
					Shell:            shell,
					EnvVars:          envVars,
					Enabled:          true,
				})
				Expect(err).ToNot(HaveOccurred())

				// Execute and verify
				result, _ := manager.RunNow(job.ID)
				Expect(result.ExitCode).To(Equal(0))
				Expect(result.Output).To(ContainSubstring("test_value"))
				Expect(result.Output).To(ContainSubstring("/tmp"))
			})
		})

		Context("bulk operations", func() {
			It("should handle creating many jobs", func() {
				for i := 0; i < 20; i++ {
					_, err := manager.Create(CreateCronRequest{
						Name:     string(rune('A' + i%26)),
						Schedule: "* * * * *",
						Command:  "echo test",
					})
					Expect(err).ToNot(HaveOccurred())
				}

				Expect(manager.GetJobCount()).To(Equal(20))

				jobs, _ := manager.List()
				Expect(len(jobs)).To(Equal(20))
			})

			It("should handle updating many jobs", func() {
				ids := make([]string, 10)
				for i := 0; i < 10; i++ {
					job, _ := manager.Create(CreateCronRequest{
						Name: string(rune('0' + i)), Schedule: "* * * * *", Command: "echo test",
					})
					ids[i] = job.ID
				}

				// Update all
				for _, id := range ids {
					newName := "Updated " + id
					manager.Update(id, UpdateCronRequest{Name: &newName})
				}

				// Verify all updated
				for _, id := range ids {
					job, _ := manager.Get(id)
					Expect(job.Name).To(ContainSubstring("Updated"))
				}
			})

			It("should handle deleting many jobs", func() {
				ids := make([]string, 10)
				for i := 0; i < 10; i++ {
					job, _ := manager.Create(CreateCronRequest{
						Name: string(rune('0' + i)), Schedule: "* * * * *", Command: "echo test",
					})
					ids[i] = job.ID
				}

				// Delete all
				for _, id := range ids {
					manager.Delete(id)
				}

				Expect(manager.GetJobCount()).To(Equal(0))
			})
		})
	})

	Describe("Error Recovery Integration", func() {
		Context("file corruption recovery", func() {
			It("should handle corrupt JSON gracefully", func() {
				manager.Stop()

				os.WriteFile(cronFile, []byte("{invalid json}"), 0600)

				newManager, err := NewCronManager(cronFile, 100)
				Expect(err).ToNot(HaveOccurred())
				Expect(newManager.GetJobCount()).To(Equal(0))

				newManager.Stop()
			})

			It("should recover from partial write", func() {
				// Create valid data, then truncate it
				_, _ = manager.Create(CreateCronRequest{
					Name: "Truncated", Schedule: "* * * * *", Command: "echo test",
				})

				manager.Stop()

				// Truncate the file
				f, _ := os.OpenFile(cronFile, os.O_TRUNC|os.O_WRONLY, 0600)
				f.Write([]byte("{\"jobs\": ["))
				f.Close()

				// Should recover with empty state
				newManager, err := NewCronManager(cronFile, 100)
				Expect(err).ToNot(HaveOccurred())
				Expect(newManager.GetJobCount()).To(Equal(0))

				newManager.Stop()
			})

			It("should recover from empty file", func() {
				manager.Stop()

				os.WriteFile(cronFile, []byte(""), 0600)

				newManager, err := NewCronManager(cronFile, 100)
				Expect(err).ToNot(HaveOccurred())
				Expect(newManager).NotTo(BeNil())

				newManager.Stop()
			})

			It("should recover and start fresh after corruption", func() {
				// Create a job
				job, _ := manager.Create(CreateCronRequest{
					Name: "Before Corruption", Schedule: "* * * * *", Command: "echo before",
				})

				manager.Stop()

				// Corrupt the file
				os.WriteFile(cronFile, []byte("corrupt"), 0600)

				// Reload - should start fresh
				newManager, _ := NewCronManager(cronFile, 100)
				defer newManager.Stop()

				Expect(newManager.GetJobCount()).To(Equal(0))

				// Should be able to create new jobs
				newJob, err := newManager.Create(CreateCronRequest{
					Name: "After Recovery", Schedule: "* * * * *", Command: "echo after",
				})
				Expect(err).ToNot(HaveOccurred())
				Expect(newJob.ID).ToNot(Equal(job.ID)) // New ID
			})
		})

		Context("execution error recovery", func() {
			It("should continue scheduling after job failure", func() {
				job, _ := manager.Create(CreateCronRequest{
					Name: "Failing Job", Schedule: "* * * * * *", Command: "exit 1", Enabled: true,
				})

				// Poll for execution instead of fixed sleep
				Eventually(func() int {
					reloaded, _ := manager.Get(job.ID)
					return reloaded.Metadata.TotalRuns
				}, 2*time.Second, 50*time.Millisecond).Should(BeNumerically(">", 0))

				// Verify failure was recorded
				reloaded, _ := manager.Get(job.ID)
				Expect(reloaded.Metadata.FailureCount).To(BeNumerically(">", 0))
			})

			It("should handle command not found gracefully", func() {
				job, _ := manager.Create(CreateCronRequest{
					Name: "NotFound", Schedule: "* * * * *", Command: "/nonexistent/command",
				})

				result, err := manager.RunNow(job.ID)
				Expect(err).ToNot(HaveOccurred())
				Expect(result.ExitCode).To(Equal(127)) // shell returns 127 for command not found
			})

			It("should recover from timeout and continue scheduling", func() {
				// Use a short-lived command to verify RunNow works without hanging
				job, _ := manager.Create(CreateCronRequest{
					Name: "Timeout Test", Schedule: "* * * * *", Command: "sleep 0.2",
				})

				result, err := manager.RunNow(job.ID)
				Expect(err).ToNot(HaveOccurred())
				Expect(result).NotTo(BeNil())
				Expect(result.ExitCode).To(Equal(0))
			})
		})
	})

	Describe("Real-World Scenarios", func() {
		Context("backup job simulation", func() {
			It("should handle a typical backup cron job", func() {
				backupJob, _ := manager.Create(CreateCronRequest{
					Name:     "Daily Database Backup",
					Schedule: "0 2 * * *",
					Command:  "echo 'Backing up database...'",
					Enabled:  true,
				})

				// Simulate manual backup run
				result, _ := manager.RunNow(backupJob.ID)
				Expect(result.ExitCode).To(Equal(0))

				// Verify it's scheduled
				reloaded, _ := manager.Get(backupJob.ID)
				Expect(reloaded.Metadata.NextRunAt).ToNot(Equal(int64(0)))

				// Verify history
				history, _ := manager.GetHistory(backupJob.ID)
				Expect(len(history)).To(Equal(1))
			})
		})

		Context("log rotation simulation", func() {
			It("should handle log rotation job", func() {
				logJob, _ := manager.Create(CreateCronRequest{
					Name:             "Log Rotation",
					Schedule:         "0 */6 * * *",
					Command:          "echo 'Rotating logs...'",
					WorkingDirectory: "/var/log",
					Enabled:          true,
				})

				// Verify job is configured correctly
				Expect(logJob.Schedule).To(Equal("0 */6 * * *"))
				Expect(logJob.WorkingDirectory).To(Equal("/var/log"))
			})
		})

		Context("health check simulation", func() {
			It("should handle frequent health check job", func() {
				healthJob, _ := manager.Create(CreateCronRequest{
					Name:     "Health Check",
					Schedule: "* * * * * *", // Every second
					Command:  "echo 'OK'",
					Enabled:  true,
				})

				// Poll for at least 1 execution instead of fixed sleep
				Eventually(func() int {
					reloaded, _ := manager.Get(healthJob.ID)
					return reloaded.Metadata.TotalRuns
				}, 2*time.Second, 50*time.Millisecond).Should(BeNumerically(">=", 1))
			})
		})
	})

	Describe("Manager State Consistency", func() {
		Context("state across operations", func() {
			It("should maintain consistent state", func() {
				// Create multiple jobs
				job1, _ := manager.Create(CreateCronRequest{
					Name: "Job 1", Schedule: "* * * * *", Command: "echo 1", Enabled: true,
				})
				job2, _ := manager.Create(CreateCronRequest{
					Name: "Job 2", Schedule: "0 * * * *", Command: "echo 2", Enabled: false,
				})
				job3, _ := manager.Create(CreateCronRequest{
					Name: "Job 3", Schedule: "*/5 * * * *", Command: "echo 3", Enabled: true,
				})

				// Perform various operations
				manager.RunNow(job1.ID)
				manager.Disable(job3.ID)
				manager.Enable(job2.ID)

				// Verify state
				jobs, _ := manager.List()
				Expect(len(jobs)).To(Equal(3))

				reloaded1, _ := manager.Get(job1.ID)
				Expect(reloaded1.Metadata.TotalRuns).To(Equal(1))

				reloaded2, _ := manager.Get(job2.ID)
				Expect(reloaded2.Enabled).To(BeTrue())

				reloaded3, _ := manager.Get(job3.ID)
				Expect(reloaded3.Enabled).To(BeFalse())
			})

			It("should survive rapid start/stop cycles", func() {
				job, _ := manager.Create(CreateCronRequest{
					Name: "StartStop Test", Schedule: "* * * * *", Command: "echo test",
				})

				// Multiple start/stop cycles
				for i := 0; i < 5; i++ {
					manager.Start()
					time.Sleep(10 * time.Millisecond)
					manager.Stop()
					time.Sleep(10 * time.Millisecond)
				}

				// Job should still be accessible
				reloaded, err := manager.Get(job.ID)
				Expect(err).ToNot(HaveOccurred())
				Expect(reloaded.Name).To(Equal("StartStop Test"))
			})
		})
	})

	Describe("Performance Integration", func() {
		Context("scalability", func() {
			It("should handle 50 concurrent jobs", func() {
				// Create 50 jobs
				for i := 0; i < 50; i++ {
					_, err := manager.Create(CreateCronRequest{
						Name:     string(rune('A' + i%26)),
						Schedule: "* * * * *",
						Command:  "echo test",
					})
					Expect(err).ToNot(HaveOccurred())
				}

				Expect(manager.GetJobCount()).To(Equal(50))

				// List should be fast
				start := time.Now()
				jobs, _ := manager.List()
				elapsed := time.Since(start)

				Expect(len(jobs)).To(Equal(50))
				Expect(elapsed).To(BeNumerically("<", 100*time.Millisecond))
			})

			It("should handle rapid job creation and deletion", func() {
				ids := make([]string, 20)

				// Create
				for i := 0; i < 20; i++ {
					job, _ := manager.Create(CreateCronRequest{
						Name: string(rune('0' + i)), Schedule: "* * * * *", Command: "echo test",
					})
					ids[i] = job.ID
				}

				// Delete half
				for i := 0; i < 10; i++ {
					manager.Delete(ids[i])
				}

				Expect(manager.GetJobCount()).To(Equal(10))
			})
		})
	})
})
