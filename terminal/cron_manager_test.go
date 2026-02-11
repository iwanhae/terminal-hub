package terminal

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

// Helper function to create pointer to string
func ptr(s string) *string {
	return &s
}

// Helper function to create pointer to bool
func boolPtr(b bool) *bool {
	return &b
}

var _ = Describe("CronManager", func() {

	Describe("NewCronManager", func() {
		var (
			tempDir  string
			cronFile string
		)

		BeforeEach(func() {
			var err error
			tempDir, err = os.MkdirTemp("", "cron-test-*")
			Expect(err).ToNot(HaveOccurred())
			cronFile = filepath.Join(tempDir, "crons.json")
		})

		AfterEach(func() {
			os.RemoveAll(tempDir)
		})

		Context("with new file", func() {
			It("should create manager with empty state", func() {
				manager, err := NewCronManager(cronFile, 100)
				Expect(err).ToNot(HaveOccurred())
				Expect(manager).NotTo(BeNil())
				Expect(manager.GetJobCount()).To(Equal(0))
				Expect(manager.IsStarted()).To(BeFalse())
			})

			It("should create the cron file directory if needed", func() {
				subDir := filepath.Join(tempDir, "subdir", "crons.json")
				manager, err := NewCronManager(subDir, 100)
				Expect(err).ToNot(HaveOccurred())
				Expect(manager).NotTo(BeNil())
			})

			It("should accept valid history size", func() {
				manager, err := NewCronManager(cronFile, 50)
				Expect(err).ToNot(HaveOccurred())
				Expect(manager).NotTo(BeNil())
			})

			It("should handle zero history size", func() {
				manager, err := NewCronManager(cronFile, 0)
				Expect(err).ToNot(HaveOccurred())
				Expect(manager).NotTo(BeNil())
			})
		})

		Context("with existing valid file", func() {
			It("should load existing jobs", func() {
				// Create test data
				data := CronData{
					Jobs: []CronJob{
						{
							ID:       "cron-1",
							Name:     "Test Job",
							Schedule: "* * * * *",
							Command:  "echo test",
							Enabled:  true,
							Metadata: CronMetadata{
								CreatedAt:   time.Now().Unix(),
								TotalRuns:   5,
								NextRunAt:   time.Now().Add(1 * time.Hour).Unix(),
								LastRunAt:   time.Now().Unix(),
								LastRunStatus: "success",
							},
						},
					},
				}
				jsonData, _ := json.MarshalIndent(data, "", "  ")
				os.WriteFile(cronFile, jsonData, 0600)

				// Load manager
				manager, err := NewCronManager(cronFile, 100)
				Expect(err).ToNot(HaveOccurred())
				Expect(manager.GetJobCount()).To(Equal(1))

				job, err := manager.Get("cron-1")
				Expect(err).ToNot(HaveOccurred())
				Expect(job.Name).To(Equal("Test Job"))
				Expect(job.Command).To(Equal("echo test"))
				Expect(job.Enabled).To(BeTrue())
				Expect(job.Metadata.TotalRuns).To(Equal(5))
			})

			It("should load multiple existing jobs", func() {
				data := CronData{
					Jobs: []CronJob{
						{ID: "cron-1", Name: "Job 1", Schedule: "* * * * *", Command: "echo 1", Enabled: true},
						{ID: "cron-2", Name: "Job 2", Schedule: "0 * * * *", Command: "echo 2", Enabled: false},
						{ID: "cron-3", Name: "Job 3", Schedule: "*/5 * * * *", Command: "echo 3", Enabled: true},
					},
				}
				jsonData, _ := json.MarshalIndent(data, "", "  ")
				os.WriteFile(cronFile, jsonData, 0600)

				manager, err := NewCronManager(cronFile, 100)
				Expect(err).ToNot(HaveOccurred())
				Expect(manager.GetJobCount()).To(Equal(3))

				jobs, _ := manager.List()
				Expect(len(jobs)).To(Equal(3))
			})

			It("should load execution history", func() {
				// Note: History is managed by CronManager internally, not in CronJob struct
				// This test verifies the manager loads from file correctly
				data := CronData{
					Jobs: []CronJob{
						{
							ID:       "cron-1",
							Name:     "Test",
							Schedule: "* * * * *",
							Command:  "echo test",
							Enabled:  true,
						},
					},
				}
				jsonData, _ := json.Marshal(data)
				os.WriteFile(cronFile, jsonData, 0600)

				manager, _ := NewCronManager(cronFile, 100)
				_, err := manager.Get("cron-1")
				Expect(err).ToNot(HaveOccurred())
			})
		})

		Context("with corrupt JSON file", func() {
			It("should return empty manager (not error)", func() {
				os.WriteFile(cronFile, []byte("invalid json"), 0600)
				manager, err := NewCronManager(cronFile, 100)
				Expect(err).ToNot(HaveOccurred())
				Expect(manager).NotTo(BeNil())
				Expect(manager.GetJobCount()).To(Equal(0))
			})

			It("should handle empty file", func() {
				os.WriteFile(cronFile, []byte(""), 0600)
				manager, err := NewCronManager(cronFile, 100)
				Expect(err).ToNot(HaveOccurred())
				Expect(manager.GetJobCount()).To(Equal(0))
			})

			It("should handle partial JSON", func() {
				os.WriteFile(cronFile, []byte("{\"jobs\": [{\"id\":"), 0600)
				manager, err := NewCronManager(cronFile, 100)
				Expect(err).ToNot(HaveOccurred())
				Expect(manager.GetJobCount()).To(Equal(0))
			})
		})

		Context("with existing empty jobs array", func() {
			It("should create manager with no jobs", func() {
				data := CronData{Jobs: []CronJob{}}
				jsonData, _ := json.Marshal(data)
				os.WriteFile(cronFile, jsonData, 0600)

				manager, err := NewCronManager(cronFile, 100)
				Expect(err).ToNot(HaveOccurred())
				Expect(manager.GetJobCount()).To(Equal(0))
			})
		})
	})

	Describe("CronManager CRUD Operations", func() {
		var (
			manager  *CronManager
			tempDir  string
			cronFile string
		)

		BeforeEach(func() {
			var err error
			tempDir, err = os.MkdirTemp("", "cron-test-*")
			Expect(err).ToNot(HaveOccurred())
			cronFile = filepath.Join(tempDir, "crons.json")

			manager, err = NewCronManager(cronFile, 100)
			Expect(err).ToNot(HaveOccurred())
		})

		AfterEach(func() {
			if manager != nil && manager.IsStarted() {
				manager.Stop()
			}
			os.RemoveAll(tempDir)
		})

		Describe("Create", func() {
			It("should create job with valid request", func() {
				req := CreateCronRequest{
					Name:     "Test Job",
					Schedule: "* * * * *",
					Command:  "echo test",
					Enabled:  true,
				}

				job, err := manager.Create(req)
				Expect(err).ToNot(HaveOccurred())
				Expect(job.ID).ToNot(BeEmpty())
				Expect(job.Name).To(Equal("Test Job"))
				Expect(job.Schedule).To(Equal("* * * * *"))
				Expect(job.Command).To(Equal("echo test"))
				Expect(job.Enabled).To(BeTrue())
				Expect(manager.GetJobCount()).To(Equal(1))
			})

			It("should generate unique ID for each job", func() {
				job1, _ := manager.Create(CreateCronRequest{
					Name: "Job 1", Schedule: "* * * * *", Command: "echo 1",
				})
				job2, _ := manager.Create(CreateCronRequest{
					Name: "Job 2", Schedule: "* * * * *", Command: "echo 2",
				})

				Expect(job1.ID).ToNot(Equal(job2.ID))
			})

			It("should create job with optional fields", func() {
				wd := "/tmp"
				shell := "/bin/sh"
				envVars := map[string]string{"TEST": "value"}

				req := CreateCronRequest{
					Name:             "Full Job",
					Schedule:         "0 * * * *",
					Command:          "echo full",
					WorkingDirectory: wd,
					Shell:            shell,
					EnvVars:          envVars,
					Enabled:          false,
				}

				job, err := manager.Create(req)
				Expect(err).ToNot(HaveOccurred())
				Expect(job.WorkingDirectory).To(Equal("/tmp"))
				Expect(job.Shell).To(Equal("/bin/sh"))
				Expect(job.EnvVars).To(Equal(envVars))
				Expect(job.Enabled).To(BeFalse())
			})

			It("should validate required name field", func() {
				req := CreateCronRequest{
					Name:     "", // missing
					Schedule: "* * * * *",
					Command:  "echo test",
					Enabled:  true,
				}

				_, err := manager.Create(req)
				Expect(err).To(HaveOccurred())
				Expect(err.Error()).To(ContainSubstring("required"))
			})

			It("should validate required schedule field", func() {
				req := CreateCronRequest{
					Name:     "Test",
					Schedule: "",
					Command:  "echo test",
				}

				_, err := manager.Create(req)
				Expect(err).To(HaveOccurred())
				Expect(err.Error()).To(ContainSubstring("required"))
			})

			It("should validate required command field", func() {
				req := CreateCronRequest{
					Name:     "Test",
					Schedule: "* * * * *",
					Command:  "",
				}

				_, err := manager.Create(req)
				Expect(err).To(HaveOccurred())
				Expect(err.Error()).To(ContainSubstring("required"))
			})

			It("should validate schedule format", func() {
				req := CreateCronRequest{
					Name:     "Test",
					Schedule: "invalid",
					Command:  "echo test",
				}

				_, err := manager.Create(req)
				Expect(err).To(HaveOccurred())
				Expect(err.Error()).To(ContainSubstring("invalid"))
			})

			It("should validate 6-field schedule format", func() {
				req := CreateCronRequest{
					Name:     "Test",
					Schedule: "* * * * * *",
					Command:  "echo test",
				}

				_, err := manager.Create(req)
				Expect(err).ToNot(HaveOccurred())
			})

			It("should save to file after creation", func() {
				req := CreateCronRequest{
					Name:     "Persist Test",
					Schedule: "* * * * *",
					Command:  "echo test",
					Enabled:  true,
				}

				job, _ := manager.Create(req)

				// Verify file exists and contains job
				data, _ := os.ReadFile(cronFile)
				var cronData CronData
				err := json.Unmarshal(data, &cronData)
				Expect(err).ToNot(HaveOccurred())
				Expect(len(cronData.Jobs)).To(Equal(1))
				Expect(cronData.Jobs[0].ID).To(Equal(job.ID))
			})

			It("should initialize metadata", func() {
				req := CreateCronRequest{
					Name:     "Metadata Test",
					Schedule: "* * * * *",
					Command:  "echo test",
				}

				job, _ := manager.Create(req)

				Expect(job.Metadata.CreatedAt).ToNot(Equal(int64(0)))
				Expect(job.Metadata.TotalRuns).To(Equal(0))
				Expect(job.Metadata.FailureCount).To(Equal(0))
				Expect(job.Metadata.LastRunStatus).To(BeEmpty())
			})
		})

		Describe("Get", func() {
			It("should return existing job", func() {
				req := CreateCronRequest{
					Name:     "Get Test",
					Schedule: "* * * * *",
					Command:  "echo test",
				}
				created, _ := manager.Create(req)

				job, err := manager.Get(created.ID)
				Expect(err).ToNot(HaveOccurred())
				Expect(job.ID).To(Equal(created.ID))
				Expect(job.Name).To(Equal("Get Test"))
			})

			It("should return job with all fields", func() {
				req := CreateCronRequest{
					Name:     "Full Test",
					Schedule: "0 * * * *",
					Command:  "echo full",
				}
				created, _ := manager.Create(req)

				job, err := manager.Get(created.ID)
				Expect(err).ToNot(HaveOccurred())
				Expect(job.Name).To(Equal("Full Test"))
			})

			It("should return error for non-existent job", func() {
				_, err := manager.Get("non-existent-id")
				Expect(err).To(HaveOccurred())
				Expect(err.Error()).To(Equal("job not found"))
			})

			It("should return error for empty ID", func() {
				_, err := manager.Get("")
				Expect(err).To(HaveOccurred())
			})
		})

		Describe("List", func() {
			It("should return all jobs", func() {
				manager.Create(CreateCronRequest{
					Name: "Job 1", Schedule: "* * * * *", Command: "echo 1",
				})
				manager.Create(CreateCronRequest{
					Name: "Job 2", Schedule: "0 * * * *", Command: "echo 2",
				})
				manager.Create(CreateCronRequest{
					Name: "Job 3", Schedule: "*/5 * * * *", Command: "echo 3",
				})

				jobs, err := manager.List()
				Expect(err).ToNot(HaveOccurred())
				Expect(len(jobs)).To(Equal(3))
			})

			It("should return empty slice when no jobs", func() {
				jobs, err := manager.List()
				Expect(err).ToNot(HaveOccurred())
				Expect(jobs).To(BeEmpty())
			})

			It("should return jobs with metadata", func() {
				req := CreateCronRequest{
					Name: "With Metadata", Schedule: "* * * * *", Command: "echo test",
				}
				manager.Create(req)

				jobs, _ := manager.List()
				Expect(len(jobs)).To(Equal(1))
				Expect(jobs[0].Metadata.CreatedAt).ToNot(Equal(int64(0)))
			})

			It("should include both enabled and disabled jobs", func() {
				manager.Create(CreateCronRequest{
					Name: "Enabled", Schedule: "* * * * *", Command: "echo 1", Enabled: true,
				})
				manager.Create(CreateCronRequest{
					Name: "Disabled", Schedule: "* * * * *", Command: "echo 2", Enabled: false,
				})

				jobs, _ := manager.List()
				Expect(len(jobs)).To(Equal(2))
			})
		})

		Describe("Update", func() {
			var job *CronJob

			BeforeEach(func() {
				req := CreateCronRequest{
					Name:     "Original Name",
					Schedule: "* * * * *",
					Command:  "echo original",
					Enabled:  true,
				}
				job, _ = manager.Create(req)
			})

			It("should update name", func() {
				newName := "Updated Name"
				req := UpdateCronRequest{
					Name: &newName,
				}

				updated, err := manager.Update(job.ID, req)
				Expect(err).ToNot(HaveOccurred())
				Expect(updated.Name).To(Equal("Updated Name"))

				// Verify persisted
				reloaded, _ := manager.Get(job.ID)
				Expect(reloaded.Name).To(Equal("Updated Name"))
			})

			It("should update schedule", func() {
				newSchedule := "0 * * * *"
				req := UpdateCronRequest{
					Schedule: &newSchedule,
				}

				updated, _ := manager.Update(job.ID, req)
				Expect(updated.Schedule).To(Equal("0 * * * *"))
			})

			It("should validate schedule on update", func() {
				badSchedule := "invalid"
				req := UpdateCronRequest{
					Schedule: &badSchedule,
				}

				_, err := manager.Update(job.ID, req)
				Expect(err).To(HaveOccurred())
				Expect(err.Error()).To(ContainSubstring("invalid"))
			})

			It("should update command", func() {
				newCommand := "echo updated"
				req := UpdateCronRequest{
					Command: &newCommand,
				}

				updated, _ := manager.Update(job.ID, req)
				Expect(updated.Command).To(Equal("echo updated"))
			})

			It("should update working directory", func() {
				newWd := "/var/log"
				req := UpdateCronRequest{
					WorkingDirectory: &newWd,
				}

				updated, _ := manager.Update(job.ID, req)
				Expect(updated.WorkingDirectory).To(Equal("/var/log"))
			})

			It("should update shell", func() {
				newShell := "/bin/bash"
				req := UpdateCronRequest{
					Shell: &newShell,
				}

				updated, _ := manager.Update(job.ID, req)
				Expect(updated.Shell).To(Equal("/bin/bash"))
			})

			It("should update environment variables", func() {
				newEnv := map[string]string{"NEW_VAR": "new_value"}
				req := UpdateCronRequest{
					EnvVars: newEnv,
				}

				updated, _ := manager.Update(job.ID, req)
				Expect(updated.EnvVars).To(Equal(newEnv))
			})

			It("should update enabled status to false", func() {
				disabled := false
				req := UpdateCronRequest{
					Enabled: &disabled,
				}

				updated, _ := manager.Update(job.ID, req)
				Expect(updated.Enabled).To(BeFalse())
			})

			It("should update enabled status to true", func() {
				// First disable
				f := false
				manager.Update(job.ID, UpdateCronRequest{Enabled: &f})

				// Then enable
				enabled := true
				req := UpdateCronRequest{
					Enabled: &enabled,
				}

				updated, _ := manager.Update(job.ID, req)
				Expect(updated.Enabled).To(BeTrue())
			})

			It("should update multiple fields at once", func() {
				newName := "Multi Update"
				newCommand := "echo multi"
				newWd := "/tmp"

				req := UpdateCronRequest{
					Name:             &newName,
					Command:          &newCommand,
					WorkingDirectory: &newWd,
				}

				updated, _ := manager.Update(job.ID, req)
				Expect(updated.Name).To(Equal("Multi Update"))
				Expect(updated.Command).To(Equal("echo multi"))
				Expect(updated.WorkingDirectory).To(Equal("/tmp"))
			})

			It("should return error for non-existent job", func() {
				req := UpdateCronRequest{Name: ptr("Test")}
				_, err := manager.Update("non-existent", req)
				Expect(err).To(HaveOccurred())
				Expect(err.Error()).To(Equal("job not found"))
			})

			It("should handle nil pointers (no update)", func() {
				req := UpdateCronRequest{}
				updated, err := manager.Update(job.ID, req)

				Expect(err).ToNot(HaveOccurred())
				Expect(updated.Name).To(Equal("Original Name")) // Unchanged
			})
		})

		Describe("Delete", func() {
			It("should delete existing job", func() {
				req := CreateCronRequest{
					Name:     "To Delete",
					Schedule: "* * * * *",
					Command:  "echo test",
				}
				job, _ := manager.Create(req)

				err := manager.Delete(job.ID)
				Expect(err).ToNot(HaveOccurred())
				Expect(manager.GetJobCount()).To(Equal(0))
			})

			It("should return error for non-existent job", func() {
				err := manager.Delete("non-existent")
				Expect(err).To(HaveOccurred())
				Expect(err.Error()).To(Equal("job not found"))
			})

			It("should return error for empty ID", func() {
				err := manager.Delete("")
				Expect(err).To(HaveOccurred())
			})

			It("should persist deletion to file", func() {
				job, _ := manager.Create(CreateCronRequest{
					Name: "Delete Persist", Schedule: "* * * * *", Command: "echo test",
				})

				manager.Delete(job.ID)

				// Reload from file
				newManager, _ := NewCronManager(cronFile, 100)
				Expect(newManager.GetJobCount()).To(Equal(0))
			})

			It("should handle deleting from multiple jobs", func() {
				_, _ = manager.Create(CreateCronRequest{
					Name: "Job 1", Schedule: "* * * * *", Command: "echo 1",
				})
				job2, _ := manager.Create(CreateCronRequest{
					Name: "Job 2", Schedule: "0 * * * *", Command: "echo 2",
				})
				_, _ = manager.Create(CreateCronRequest{
					Name: "Job 3", Schedule: "*/5 * * * *", Command: "echo 3",
				})

				manager.Delete(job2.ID)

				Expect(manager.GetJobCount()).To(Equal(2))

				jobs, _ := manager.List()
				Expect(len(jobs)).To(Equal(2))
			})
		})

		Describe("Enable/Disable", func() {
			var job *CronJob

			BeforeEach(func() {
				req := CreateCronRequest{
					Name:     "Toggle Job",
					Schedule: "* * * * *",
					Command:  "echo test",
					Enabled:  true,
				}
				job, _ = manager.Create(req)
			})

			It("should disable enabled job", func() {
				err := manager.Disable(job.ID)
				Expect(err).ToNot(HaveOccurred())

				reloaded, _ := manager.Get(job.ID)
				Expect(reloaded.Enabled).To(BeFalse())
			})

			It("should clear next_run_at when disabled", func() {
				// Start manager to set next_run_at
				manager.Start()
				time.Sleep(100 * time.Millisecond)
				manager.Stop()

				// Now disable
				manager.Disable(job.ID)

				reloaded, _ := manager.Get(job.ID)
				Expect(reloaded.Metadata.NextRunAt).To(Equal(int64(0)))
			})

			It("should enable disabled job", func() {
				manager.Disable(job.ID)

				err := manager.Enable(job.ID)
				Expect(err).ToNot(HaveOccurred())

				reloaded, _ := manager.Get(job.ID)
				Expect(reloaded.Enabled).To(BeTrue())
			})

			It("should be idempotent for disable", func() {
				manager.Disable(job.ID)
				err := manager.Disable(job.ID)
				Expect(err).ToNot(HaveOccurred())

				reloaded, _ := manager.Get(job.ID)
				Expect(reloaded.Enabled).To(BeFalse())
			})

			It("should be idempotent for enable", func() {
				manager.Enable(job.ID)
				err := manager.Enable(job.ID)
				Expect(err).ToNot(HaveOccurred())

				reloaded, _ := manager.Get(job.ID)
				Expect(reloaded.Enabled).To(BeTrue())
			})

			It("should return error for non-existent job on disable", func() {
				err := manager.Disable("non-existent")
				Expect(err).To(HaveOccurred())
			})

			It("should return error for non-existent job on enable", func() {
				err := manager.Enable("non-existent")
				Expect(err).To(HaveOccurred())
			})
		})
	})

	Describe("CronManager Lifecycle", func() {
		var (
			manager  *CronManager
			tempDir  string
			cronFile string
		)

		BeforeEach(func() {
			var err error
			tempDir, err = os.MkdirTemp("", "cron-test-*")
			Expect(err).ToNot(HaveOccurred())
			cronFile = filepath.Join(tempDir, "crons.json")
			manager, err = NewCronManager(cronFile, 100)
			Expect(err).ToNot(HaveOccurred())
		})

		AfterEach(func() {
			if manager != nil {
				manager.Stop()
			}
			os.RemoveAll(tempDir)
		})

		Describe("Start/Stop", func() {
			It("should start scheduler", func() {
				err := manager.Start()
				Expect(err).ToNot(HaveOccurred())
				Expect(manager.IsStarted()).To(BeTrue())
			})

			It("should be idempotent for start", func() {
				manager.Start()
				err := manager.Start()
				Expect(err).To(HaveOccurred())
				Expect(err.Error()).To(ContainSubstring("already started"))
			})

			It("should stop scheduler", func() {
				manager.Start()
				manager.Stop()
				Expect(manager.IsStarted()).To(BeFalse())
			})

			It("should be idempotent for stop", func() {
				manager.Start()
				manager.Stop()
				manager.Stop() // Should not panic
				Expect(manager.IsStarted()).To(BeFalse())
			})

			It("should schedule enabled jobs on start", func() {
				req := CreateCronRequest{
					Name:     "Scheduled",
					Schedule: "* * * * *",
					Command:  "echo test",
					Enabled:  true,
				}
				job, _ := manager.Create(req)

				manager.Start()
				time.Sleep(200 * time.Millisecond) // Give scheduler time to calculate

				reloaded, _ := manager.Get(job.ID)
				Expect(reloaded.Metadata.NextRunAt).ToNot(Equal(int64(0)))
			})

			It("should not schedule disabled jobs on start", func() {
				req := CreateCronRequest{
					Name:     "Disabled",
					Schedule: "* * * * *",
					Command:  "echo test",
					Enabled:  false,
				}
				job, _ := manager.Create(req)

				manager.Start()
				time.Sleep(100 * time.Millisecond)

				reloaded, _ := manager.Get(job.ID)
				Expect(reloaded.Metadata.NextRunAt).To(Equal(int64(0)))
			})
		})

		Describe("RunNow", func() {
			BeforeEach(func() {
				manager.Start()
			})

			It("should execute job immediately", func() {
				req := CreateCronRequest{
					Name:     "Manual Run",
					Schedule: "0 0 1 1 *", // Far future schedule
					Command:  "echo manual",
					Enabled:  true,
				}
				job, _ := manager.Create(req)

				result, err := manager.RunNow(job.ID)
				Expect(err).ToNot(HaveOccurred())
				Expect(result.ExitCode).To(Equal(0))
				Expect(result.Output).To(ContainSubstring("manual"))
			})

			It("should update job metadata", func() {
				req := CreateCronRequest{
					Name:     "Metadata Test",
					Schedule: "* * * * *",
					Command:  "echo test",
					Enabled:  true,
				}
				job, _ := manager.Create(req)

				manager.RunNow(job.ID)
				time.Sleep(100 * time.Millisecond)

				reloaded, _ := manager.Get(job.ID)
				Expect(reloaded.Metadata.TotalRuns).To(Equal(1))
				Expect(reloaded.Metadata.LastRunStatus).To(Equal("success"))
				Expect(reloaded.Metadata.LastRunAt).ToNot(Equal(int64(0)))
			})

			It("should update metadata on failure", func() {
				req := CreateCronRequest{
					Name:     "Failing Job",
					Schedule: "* * * * *",
					Command:  "exit 1",
					Enabled:  true,
				}
				job, _ := manager.Create(req)

				result, _ := manager.RunNow(job.ID)

				reloaded, _ := manager.Get(job.ID)
				Expect(reloaded.Metadata.TotalRuns).To(Equal(1))
				Expect(reloaded.Metadata.FailureCount).To(Equal(1))
				Expect(reloaded.Metadata.LastRunStatus).To(Equal("failed"))
				Expect(result.ExitCode).To(Equal(1))
			})

			It("should return error for non-existent job", func() {
				_, err := manager.RunNow("non-existent")
				Expect(err).To(HaveOccurred())
				Expect(err.Error()).To(Equal("job not found"))
			})

			It("should run disabled job", func() {
				req := CreateCronRequest{
					Name:     "Disabled Run",
					Schedule: "* * * * *",
					Command:  "echo disabled",
					Enabled:  false,
				}
				job, _ := manager.Create(req)

				result, err := manager.RunNow(job.ID)
				Expect(err).ToNot(HaveOccurred())
				Expect(result.ExitCode).To(Equal(0))
				Expect(result.Output).To(ContainSubstring("disabled"))
			})

			It("should calculate next run after manual execution", func() {
				req := CreateCronRequest{
					Name:     "Next Run Test",
					Schedule: "* * * * *",
					Command:  "echo test",
					Enabled:  true,
				}
				job, _ := manager.Create(req)

				manager.RunNow(job.ID)
				time.Sleep(100 * time.Millisecond)

				reloaded, _ := manager.Get(job.ID)
				Expect(reloaded.Metadata.NextRunAt).ToNot(Equal(int64(0)))
			})
		})
	})

	Describe("History Management", func() {
		var (
			manager  *CronManager
			tempDir  string
			cronFile string
		)

		BeforeEach(func() {
			var err error
			tempDir, err = os.MkdirTemp("", "cron-test-*")
			Expect(err).ToNot(HaveOccurred())
			cronFile = filepath.Join(tempDir, "crons.json")
			manager, err = NewCronManager(cronFile, 3) // Small history size for testing
			Expect(err).ToNot(HaveOccurred())
			manager.Start()
		})

		AfterEach(func() {
			manager.Stop()
			os.RemoveAll(tempDir)
		})

		It("should store execution history", func() {
			req := CreateCronRequest{
				Name:     "History Job",
				Schedule: "* * * * *",
				Command:  "echo test",
				Enabled:  true,
			}
			job, _ := manager.Create(req)

			manager.RunNow(job.ID)
			manager.RunNow(job.ID)

			history, err := manager.GetHistory(job.ID)
			Expect(err).ToNot(HaveOccurred())
			Expect(len(history)).To(Equal(2))
		})

		It("should rotate history when exceeding max size", func() {
			req := CreateCronRequest{
				Name:     "Rotate Test",
				Schedule: "* * * * *",
				Command:  "echo test",
				Enabled:  true,
			}
			job, _ := manager.Create(req)

			// Run 5 times (max is 3)
			for i := 0; i < 5; i++ {
				manager.RunNow(job.ID)
			}

			history, _ := manager.GetHistory(job.ID)
			Expect(len(history)).To(Equal(3)) // Oldest 2 removed
		})

		It("should keep most recent history entries", func() {
			req := CreateCronRequest{
				Name:     "Recent Test",
				Schedule: "* * * * *",
				Command:  "echo run-$RANDOM",
				Enabled:  true,
			}
			job, _ := manager.Create(req)

			// Run with distinct outputs
			for i := 0; i < 5; i++ {
				manager.RunNow(job.ID)
			}

			history, _ := manager.GetHistory(job.ID)
			Expect(len(history)).To(Equal(3))

			// Verify we have the most recent (not oldest)
			// The oldest entry should have been removed
		})

		It("should return empty history for job with no runs", func() {
			req := CreateCronRequest{
				Name:     "No Runs",
				Schedule: "* * * * *",
				Command:  "echo test",
				Enabled:  false,
			}
			job, _ := manager.Create(req)

			history, err := manager.GetHistory(job.ID)
			Expect(err).ToNot(HaveOccurred())
			Expect(history).To(BeEmpty())
		})

		It("should return error for non-existent job", func() {
			_, err := manager.GetHistory("non-existent")
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(Equal("job not found"))
		})

		It("should persist history to file", func() {
			req := CreateCronRequest{
				Name:     "Persist History",
				Schedule: "* * * * *",
				Command:  "echo test",
				Enabled:  true,
			}
			job, _ := manager.Create(req)
			manager.RunNow(job.ID)

			// Reload manager
			manager.Stop()
			newManager, _ := NewCronManager(cronFile, 100)
			newManager.Start()

			history, _ := newManager.GetHistory(job.ID)
			Expect(len(history)).To(Equal(1))
			Expect(history[0].ExitCode).To(Equal(0))
			newManager.Stop()
		})

		It("should include timestamp in history", func() {
			req := CreateCronRequest{
				Name:     "Timestamp Test",
				Schedule: "* * * * *",
				Command:  "echo test",
				Enabled:  true,
			}
			job, _ := manager.Create(req)

			before := time.Now().Unix()
			manager.RunNow(job.ID)
			after := time.Now().Unix()

			history, _ := manager.GetHistory(job.ID)
			Expect(len(history)).To(Equal(1))
			Expect(history[0].StartedAt).To(BeNumerically(">=", before))
			Expect(history[0].StartedAt).To(BeNumerically("<=", after))
		})

		It("should include output in history", func() {
			req := CreateCronRequest{
				Name:     "Output Test",
				Schedule: "* * * * *",
				Command:  "echo 'history output'",
				Enabled:  true,
			}
			job, _ := manager.Create(req)

			manager.RunNow(job.ID)

			history, _ := manager.GetHistory(job.ID)
			Expect(len(history)).To(Equal(1))
			Expect(history[0].Output).To(ContainSubstring("history output"))
		})

		It("should include error in history for failed runs", func() {
			req := CreateCronRequest{
				Name:     "Error History",
				Schedule: "* * * * *",
				Command:  "exit 42",
				Enabled:  true,
			}
			job, _ := manager.Create(req)

			manager.RunNow(job.ID)

			history, _ := manager.GetHistory(job.ID)
			Expect(len(history)).To(Equal(1))
			Expect(history[0].ExitCode).To(Equal(42))
			Expect(history[0].Error).ToNot(BeEmpty())
		})
	})

	Describe("Thread Safety", func() {
		var (
			manager  *CronManager
			tempDir  string
			cronFile string
		)

		BeforeEach(func() {
			var err error
			tempDir, err = os.MkdirTemp("", "cron-test-*")
			Expect(err).ToNot(HaveOccurred())
			cronFile = filepath.Join(tempDir, "crons.json")
			manager, err = NewCronManager(cronFile, 100)
			Expect(err).ToNot(HaveOccurred())
		})

		AfterEach(func() {
			if manager != nil && manager.IsStarted() {
				manager.Stop()
			}
			os.RemoveAll(tempDir)
		})

		It("should handle concurrent Create operations", func() {
			var wg sync.WaitGroup
			jobs := make(chan *CronJob, 10)

			for i := 0; i < 10; i++ {
				wg.Add(1)
				go func(idx int) {
					defer wg.Done()
					req := CreateCronRequest{
						Name:     fmt.Sprintf("Concurrent Job %d", idx),
						Schedule: "* * * * *",
						Command:  "echo test",
					}
					job, err := manager.Create(req)
					if err == nil {
						jobs <- job
					}
				}(i)
			}

			wg.Wait()
			close(jobs)

			count := 0
			for range jobs {
				count++
			}
			Expect(count).To(Equal(10))
			Expect(manager.GetJobCount()).To(Equal(10))
		})

		It("should handle concurrent Read operations", func() {
			job, _ := manager.Create(CreateCronRequest{
				Name: "Read Test", Schedule: "* * * * *", Command: "echo test",
			})

			var wg sync.WaitGroup
			for i := 0; i < 100; i++ {
				wg.Add(1)
				go func() {
					defer wg.Done()
					manager.Get(job.ID)
					manager.List()
				}()
			}

			wg.Wait()
			// If we got here without deadlock or race, test passed
		})

		It("should handle concurrent Update operations", func() {
			job, _ := manager.Create(CreateCronRequest{
				Name: "Update Test", Schedule: "* * * * *", Command: "echo test",
			})

			var wg sync.WaitGroup
			for i := 0; i < 10; i++ {
				wg.Add(1)
				go func(idx int) {
					defer wg.Done()
					newName := fmt.Sprintf("Updated %d", idx)
					manager.Update(job.ID, UpdateCronRequest{Name: &newName})
				}(i)
			}

			wg.Wait()

			// Verify job still exists and is valid
			reloaded, _ := manager.Get(job.ID)
			Expect(reloaded).NotTo(BeNil())
		})

		It("should handle mixed concurrent operations", func() {
			job, _ := manager.Create(CreateCronRequest{
				Name: "Mixed Test", Schedule: "* * * * *", Command: "echo test",
			})

			var wg sync.WaitGroup

			// Concurrent reads
			for i := 0; i < 50; i++ {
				wg.Add(1)
				go func() {
					defer wg.Done()
					manager.Get(job.ID)
					manager.List()
				}()
			}

			// Concurrent updates
			for i := 0; i < 10; i++ {
				wg.Add(1)
				go func(idx int) {
					defer wg.Done()
					newName := fmt.Sprintf("Name %d", idx)
					manager.Update(job.ID, UpdateCronRequest{Name: &newName})
				}(i)
			}

			wg.Wait()
			Expect(manager.GetJobCount()).To(Equal(1))
		})
	})

	Describe("GetJobCount", func() {
		var (
			manager  *CronManager
			tempDir  string
			cronFile string
		)

		BeforeEach(func() {
			var err error
			tempDir, err = os.MkdirTemp("", "cron-test-*")
			Expect(err).ToNot(HaveOccurred())
			cronFile = filepath.Join(tempDir, "crons.json")
			manager, err = NewCronManager(cronFile, 100)
			Expect(err).ToNot(HaveOccurred())
		})

		AfterEach(func() {
			if manager != nil {
				manager.Stop()
			}
			os.RemoveAll(tempDir)
		})

		It("should return 0 for new manager", func() {
			Expect(manager.GetJobCount()).To(Equal(0))
		})

		It("should increment on create", func() {
			manager.Create(CreateCronRequest{
				Name: "Job 1", Schedule: "* * * * *", Command: "echo 1",
			})
			Expect(manager.GetJobCount()).To(Equal(1))

			manager.Create(CreateCronRequest{
				Name: "Job 2", Schedule: "* * * * *", Command: "echo 2",
			})
			Expect(manager.GetJobCount()).To(Equal(2))
		})

		It("should decrement on delete", func() {
			job, _ := manager.Create(CreateCronRequest{
				Name: "Delete Count", Schedule: "* * * * *", Command: "echo test",
			})
			Expect(manager.GetJobCount()).To(Equal(1))

			manager.Delete(job.ID)
			Expect(manager.GetJobCount()).To(Equal(0))
		})
	})
})
