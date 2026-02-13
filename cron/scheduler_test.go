package cron

import (
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

var _ = Describe("CronScheduler", func() {

	Describe("ValidateSchedule", func() {
		Context("with valid 5-field cron expressions", func() {
			It("should accept '* * * * *' (every minute)", func() {
				Expect(ValidateSchedule("* * * * *")).To(Succeed())
			})

			It("should accept '0 2 * * *' (daily at 2 AM)", func() {
				Expect(ValidateSchedule("0 2 * * *")).To(Succeed())
			})

			It("should accept '*/5 * * * *' (every 5 minutes)", func() {
				Expect(ValidateSchedule("*/5 * * * *")).To(Succeed())
			})

			It("should accept '0 0 * * 0' (weekly on Sunday)", func() {
				Expect(ValidateSchedule("0 0 * * 0")).To(Succeed())
			})

			It("should accept '0 0 * * 1-5' (weekdays at midnight)", func() {
				Expect(ValidateSchedule("0 0 * * 1-5")).To(Succeed())
			})

			It("should accept '30 9 * * 1' (Mondays at 9:30 AM)", func() {
				Expect(ValidateSchedule("30 9 * * 1")).To(Succeed())
			})

			It("should accept '0 */2 * * *' (every 2 hours)", func() {
				Expect(ValidateSchedule("0 */2 * * *")).To(Succeed())
			})
		})

		Context("with valid 6-field cron expressions (with seconds)", func() {
			It("should accept '* * * * * *' (every second)", func() {
				Expect(ValidateSchedule("* * * * * *")).To(Succeed())
			})

			It("should accept '*/30 * * * * *' (every 30 seconds)", func() {
				Expect(ValidateSchedule("*/30 * * * * *")).To(Succeed())
			})

			It("should accept '0 */5 * * * *' (every 5 minutes at 0 seconds)", func() {
				Expect(ValidateSchedule("0 */5 * * * *")).To(Succeed())
			})

			It("should accept '15,45 * * * * *' (at 15 and 45 seconds)", func() {
				Expect(ValidateSchedule("15,45 * * * * *")).To(Succeed())
			})
		})

		Context("with invalid cron expressions", func() {
			It("should reject empty string", func() {
				err := ValidateSchedule("")
				Expect(err).To(HaveOccurred())
				Expect(err.Error()).To(ContainSubstring("empty"))
			})

			It("should reject malformed expression", func() {
				err := ValidateSchedule("invalid-cron")
				Expect(err).To(HaveOccurred())
				Expect(err.Error()).To(ContainSubstring("invalid"))
			})

			It("should reject expression with wrong field count (too few)", func() {
				err := ValidateSchedule("* * *")
				Expect(err).To(HaveOccurred())
			})

			It("should reject expression with wrong field count (too many)", func() {
				err := ValidateSchedule("* * * * * * *")
				Expect(err).To(HaveOccurred())
			})

			It("should reject out-of-range minute values", func() {
				err := ValidateSchedule("60 * * * *") // minute 60 is invalid (0-59)
				Expect(err).To(HaveOccurred())
			})

			It("should reject out-of-range hour values", func() {
				err := ValidateSchedule("0 24 * * *") // hour 24 is invalid (0-23)
				Expect(err).To(HaveOccurred())
			})

			It("should reject out-of-range day of month values", func() {
				err := ValidateSchedule("0 0 32 * *") // day 32 is invalid (1-31)
				Expect(err).To(HaveOccurred())
			})

			It("should reject out-of-range month values", func() {
				err := ValidateSchedule("0 0 * 13 *") // month 13 is invalid (1-12)
				Expect(err).To(HaveOccurred())
			})

			It("should reject out-of-range weekday values", func() {
				err := ValidateSchedule("0 0 * * 8") // weekday 8 is invalid (0-7)
				Expect(err).To(HaveOccurred())
			})

			It("should reject invalid ranges", func() {
				err := ValidateSchedule("5-3 * * * *") // range 5-3 is invalid (must be low-high)
				Expect(err).To(HaveOccurred())
			})
		})
	})

	Describe("GetNextRunTime", func() {
		var baseTime time.Time

		BeforeEach(func() {
			// Fixed base time for predictable tests: 2025-02-10 12:00:00 UTC (Monday)
			baseTime = time.Date(2025, 2, 10, 12, 0, 0, 0, time.UTC)
		})

		Context("with hourly schedule", func() {
			It("should calculate next hour correctly", func() {
				next, err := GetNextRunTime("0 * * * *", baseTime)
				Expect(err).ToNot(HaveOccurred())
				Expect(next.Hour()).To(Equal(13)) // Next hour
				Expect(next.Minute()).To(Equal(0))
				Expect(next.Second()).To(Equal(0))
			})

			It("should calculate next hour at 30 minutes past", func() {
				next, err := GetNextRunTime("30 * * * *", baseTime)
				Expect(err).ToNot(HaveOccurred())
				Expect(next.Hour()).To(Equal(12))
				Expect(next.Minute()).To(Equal(30))
			})
		})

		Context("with daily schedule", func() {
			It("should calculate next day correctly when time has passed", func() {
				next, err := GetNextRunTime("0 2 * * *", baseTime)
				Expect(err).ToNot(HaveOccurred())
				// 2 AM already passed today, so next is tomorrow
				Expect(next.Day()).To(Equal(11))
				Expect(next.Hour()).To(Equal(2))
				Expect(next.Minute()).To(Equal(0))
			})

			It("should calculate today when time hasn't passed yet", func() {
				earlyTime := time.Date(2025, 2, 10, 1, 0, 0, 0, time.UTC)
				next, err := GetNextRunTime("0 2 * * *", earlyTime)
				Expect(err).ToNot(HaveOccurred())
				// 2 AM hasn't passed yet today
				Expect(next.Day()).To(Equal(10))
				Expect(next.Hour()).To(Equal(2))
			})
		})

		Context("with weekly schedule", func() {
			It("should calculate next Sunday correctly", func() {
				// Monday Feb 10, 2025
				next, err := GetNextRunTime("0 0 * * 0", baseTime)
				Expect(err).ToNot(HaveOccurred())
				Expect(next.Weekday()).To(Equal(time.Sunday))
				Expect(next.Day()).To(Equal(16)) // Next Sunday is Feb 16
			})
		})

		Context("with monthly schedule", func() {
			It("should calculate next 1st of month correctly", func() {
				next, err := GetNextRunTime("0 0 1 * *", baseTime)
				Expect(err).ToNot(HaveOccurred())
				Expect(next.Day()).To(Equal(1))
				Expect(next.Month()).To(Equal(time.March)) // March 1st
			})
		})

		Context("with seconds schedule", func() {
			It("should calculate next 30-second interval", func() {
				next, err := GetNextRunTime("*/30 * * * * *", baseTime)
				Expect(err).ToNot(HaveOccurred())
				Expect(next.Second()).To(Equal(30))
			})

			It("should calculate next 15-second interval from 0", func() {
				next, err := GetNextRunTime("*/15 * * * * *", baseTime)
				Expect(err).ToNot(HaveOccurred())
				Expect(next.Second()).To(Equal(15))
			})
		})

		Context("with complex schedules", func() {
			It("should handle '*/5 * * * *' (every 5 minutes)", func() {
				next, err := GetNextRunTime("*/5 * * * *", baseTime)
				Expect(err).ToNot(HaveOccurred())
				Expect(next.Minute()).To(Equal(5)) // 12:05 is next 5-minute mark
			})

			It("should handle '0,15,30,45 * * * *' (every 15 minutes)", func() {
				next, err := GetNextRunTime("0,15,30,45 * * * *", baseTime)
				Expect(err).ToNot(HaveOccurred())
				Expect(next.Minute()).To(Equal(15)) // 12:15 is next
			})
		})

		Context("with invalid schedule", func() {
			It("should return error for empty schedule", func() {
				_, err := GetNextRunTime("", baseTime)
				Expect(err).To(HaveOccurred())
				Expect(err.Error()).To(ContainSubstring("empty"))
			})

			It("should return error for invalid schedule", func() {
				_, err := GetNextRunTime("invalid", baseTime)
				Expect(err).To(HaveOccurred())
				Expect(err.Error()).To(ContainSubstring("invalid"))
			})
		})
	})

	Describe("CalculateNextRunTimes", func() {
		var baseTime time.Time

		BeforeEach(func() {
			// Fixed base time: 2025-02-10 12:00:00 UTC (Monday)
			baseTime = time.Date(2025, 2, 10, 12, 0, 0, 0, time.UTC)
		})

		Context("with valid count", func() {
			It("should calculate 5 next occurrences for hourly schedule", func() {
				times, err := CalculateNextRunTimes("0 * * * *", baseTime, 5)
				Expect(err).ToNot(HaveOccurred())
				Expect(len(times)).To(Equal(5))

				// Verify 1-hour intervals
				for i := 0; i < 5; i++ {
					Expect(times[i].Hour()).To(Equal(13 + i))
					Expect(times[i].Minute()).To(Equal(0))
				}
			})

			It("should calculate 3 next occurrences for daily schedule", func() {
				times, err := CalculateNextRunTimes("0 2 * * *", baseTime, 3)
				Expect(err).ToNot(HaveOccurred())
				Expect(len(times)).To(Equal(3))

				// Verify day increments
				for i := 0; i < 3; i++ {
					Expect(times[i].Hour()).To(Equal(2))
					Expect(times[i].Minute()).To(Equal(0))
				}
			})

			It("should calculate next occurrences for 30-second schedule", func() {
				times, err := CalculateNextRunTimes("*/30 * * * * *", baseTime, 4)
				Expect(err).ToNot(HaveOccurred())
				Expect(len(times)).To(Equal(4))

				// Verify 30-second intervals
				Expect(times[0].Second()).To(Equal(30))
				Expect(times[1].Second()).To(Equal(0))
				Expect(times[2].Second()).To(Equal(30))
				Expect(times[3].Second()).To(Equal(0))
			})

			It("should handle schedule with specific minutes", func() {
				times, err := CalculateNextRunTimes("15,45 * * * *", baseTime, 4)
				Expect(err).ToNot(HaveOccurred())
				Expect(len(times)).To(Equal(4))

				Expect(times[0].Minute()).To(Equal(15))
				Expect(times[1].Minute()).To(Equal(45))
				Expect(times[2].Minute()).To(Equal(15))
				Expect(times[3].Minute()).To(Equal(45))
			})
		})

		Context("with edge cases", func() {
			It("should return empty slice for count of 0", func() {
				times, err := CalculateNextRunTimes("0 * * * *", baseTime, 0)
				Expect(err).ToNot(HaveOccurred())
				Expect(times).To(BeEmpty())
			})

			It("should return empty slice for negative count", func() {
				times, err := CalculateNextRunTimes("0 * * * *", baseTime, -1)
				Expect(err).ToNot(HaveOccurred())
				Expect(times).To(BeEmpty())
			})

			It("should calculate single occurrence", func() {
				times, err := CalculateNextRunTimes("0 * * * *", baseTime, 1)
				Expect(err).ToNot(HaveOccurred())
				Expect(len(times)).To(Equal(1))
				Expect(times[0].Hour()).To(Equal(13))
			})

			It("should calculate many occurrences", func() {
				times, err := CalculateNextRunTimes("* * * * *", baseTime, 100)
				Expect(err).ToNot(HaveOccurred())
				Expect(len(times)).To(Equal(100))
			})
		})

		Context("with invalid schedule", func() {
			It("should return error for empty schedule", func() {
				_, err := CalculateNextRunTimes("", baseTime, 5)
				Expect(err).To(HaveOccurred())
				Expect(err.Error()).To(ContainSubstring("empty"))
			})

			It("should return error for invalid schedule", func() {
				_, err := CalculateNextRunTimes("invalid", baseTime, 5)
				Expect(err).To(HaveOccurred())
			})
		})
	})

	Describe("IsValidSchedule", func() {
		Context("with valid schedules", func() {
			It("should return true for '* * * * *'", func() {
				Expect(IsValidSchedule("* * * * *")).To(BeTrue())
			})

			It("should return true for '0 2 * * *'", func() {
				Expect(IsValidSchedule("0 2 * * *")).To(BeTrue())
			})

			It("should return true for 6-field format", func() {
				Expect(IsValidSchedule("* * * * * *")).To(BeTrue())
			})
		})

		Context("with invalid schedules", func() {
			It("should return false for empty string", func() {
				Expect(IsValidSchedule("")).To(BeFalse())
			})

			It("should return false for invalid schedule", func() {
				Expect(IsValidSchedule("invalid")).To(BeFalse())
			})

			It("should return false for wrong field count", func() {
				Expect(IsValidSchedule("* *")).To(BeFalse())
			})
		})
	})

	Describe("FormatScheduleDescription", func() {
		Context("with standard schedule examples", func() {
			It("should return 'Every minute' for '* * * * *'", func() {
				Expect(FormatScheduleDescription("* * * * *")).To(Equal("Every minute"))
			})

			It("should return 'Every 5 minutes' for '*/5 * * * *'", func() {
				Expect(FormatScheduleDescription("*/5 * * * *")).To(Equal("Every 5 minutes"))
			})

			It("should return 'Every hour' for '0 * * * *'", func() {
				Expect(FormatScheduleDescription("0 * * * *")).To(Equal("Every hour"))
			})

			It("should return 'Daily at midnight' for '0 0 * * *'", func() {
				Expect(FormatScheduleDescription("0 0 * * *")).To(Equal("Daily at midnight"))
			})

			It("should return 'Daily at 2 AM' for '0 2 * * *'", func() {
				Expect(FormatScheduleDescription("0 2 * * *")).To(Equal("Daily at 2 AM"))
			})

			It("should return 'Weekly on Sunday' for '0 0 * * 0'", func() {
				Expect(FormatScheduleDescription("0 0 * * 0")).To(Equal("Weekly on Sunday"))
			})

			It("should return 'Monthly on 1st' for '0 0 1 * *'", func() {
				Expect(FormatScheduleDescription("0 0 1 * *")).To(Equal("Monthly on 1st"))
			})

			It("should return 'Every 30 seconds' for '*/30 * * * * *'", func() {
				Expect(FormatScheduleDescription("*/30 * * * * *")).To(Equal("Every 30 seconds"))
			})
		})

		Context("with custom schedules", func() {
			It("should return the schedule string for non-standard schedules", func() {
				Expect(FormatScheduleDescription("15 3 * * 1")).To(Equal("15 3 * * 1"))
			})

			It("should return the schedule string for complex expressions", func() {
				Expect(FormatScheduleDescription("*/10 9-17 * * 1-5")).To(Equal("*/10 9-17 * * 1-5"))
			})
		})
	})

	Describe("StandardCronScheduleExamples", func() {
		It("should return a map of example schedules", func() {
			examples := StandardCronScheduleExamples()
			Expect(examples).NotTo(BeNil())
			Expect(len(examples)).To(BeNumerically(">", 0))
		})

		It("should contain common schedule examples", func() {
			examples := StandardCronScheduleExamples()

			Expect(examples).To(HaveKey("Every minute"))
			Expect(examples).To(HaveKey("Every 5 minutes"))
			Expect(examples).To(HaveKey("Every hour"))
			Expect(examples).To(HaveKey("Daily at midnight"))
			Expect(examples).To(HaveKey("Daily at 2 AM"))
			Expect(examples).To(HaveKey("Weekly on Sunday"))
			Expect(examples).To(HaveKey("Monthly on 1st"))
			Expect(examples).To(HaveKey("Every 30 seconds"))
		})

		It("should return valid cron expressions", func() {
			examples := StandardCronScheduleExamples()

			for _, schedule := range examples {
				Expect(IsValidSchedule(schedule)).To(BeTrue(), "Schedule %q should be valid", schedule)
			}
		})

		Context("example schedules are valid", func() {
			It("should validate 'Every minute'", func() {
				examples := StandardCronScheduleExamples()
				Expect(ValidateSchedule(examples["Every minute"])).To(Succeed())
			})

			It("should validate 'Every 5 minutes'", func() {
				examples := StandardCronScheduleExamples()
				Expect(ValidateSchedule(examples["Every 5 minutes"])).To(Succeed())
			})

			It("should validate 'Every hour'", func() {
				examples := StandardCronScheduleExamples()
				Expect(ValidateSchedule(examples["Every hour"])).To(Succeed())
			})

			It("should validate 'Daily at midnight'", func() {
				examples := StandardCronScheduleExamples()
				Expect(ValidateSchedule(examples["Daily at midnight"])).To(Succeed())
			})

			It("should validate 'Daily at 2 AM'", func() {
				examples := StandardCronScheduleExamples()
				Expect(ValidateSchedule(examples["Daily at 2 AM"])).To(Succeed())
			})

			It("should validate 'Weekly on Sunday'", func() {
				examples := StandardCronScheduleExamples()
				Expect(ValidateSchedule(examples["Weekly on Sunday"])).To(Succeed())
			})

			It("should validate 'Monthly on 1st'", func() {
				examples := StandardCronScheduleExamples()
				Expect(ValidateSchedule(examples["Monthly on 1st"])).To(Succeed())
			})

			It("should validate 'Every 30 seconds'", func() {
				examples := StandardCronScheduleExamples()
				Expect(ValidateSchedule(examples["Every 30 seconds"])).To(Succeed())
			})
		})
	})
})
