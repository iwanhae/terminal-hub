package terminal

import (
	"fmt"
	"time"

	"github.com/robfig/cron/v3"
)

// ValidateSchedule validates a cron expression
func ValidateSchedule(schedule string) error {
	if schedule == "" {
		return fmt.Errorf("schedule cannot be empty")
	}

	// Parse the schedule using robfig/cron
	// We support both 5-field (minute hour day month weekday) and 6-field (with seconds) formats
	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.SecondOptional)

	_, err := parser.Parse(schedule)
	if err != nil {
		return fmt.Errorf("invalid cron expression %q: %w", schedule, err)
	}

	return nil
}

// GetNextRunTime calculates the next run time for a given schedule
func GetNextRunTime(schedule string, fromTime time.Time) (time.Time, error) {
	if schedule == "" {
		return time.Time{}, fmt.Errorf("schedule cannot be empty")
	}

	// Parse the schedule
	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.SecondOptional)

	scheduleParser, err := parser.Parse(schedule)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid cron expression %q: %w", schedule, err)
	}

	// Get next run time
	nextRun := scheduleParser.Next(fromTime)

	return nextRun, nil
}

// CalculateNextRunTimes calculates next run times starting from a given time
func CalculateNextRunTimes(schedule string, fromTime time.Time, count int) ([]time.Time, error) {
	if schedule == "" {
		return nil, fmt.Errorf("schedule cannot be empty")
	}

	if count <= 0 {
		return []time.Time{}, nil
	}

	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.SecondOptional)

	scheduleParser, err := parser.Parse(schedule)
	if err != nil {
		return nil, fmt.Errorf("invalid cron expression %q: %w", schedule, err)
	}

	nextRuns := make([]time.Time, count)
	currentTime := fromTime

	for i := 0; i < count; i++ {
		nextRun := scheduleParser.Next(currentTime)
		nextRuns[i] = nextRun
		currentTime = nextRun
	}

	return nextRuns, nil
}

// StandardCronScheduleExamples returns example cron schedules
func StandardCronScheduleExamples() map[string]string {
	return map[string]string{
		"Every minute":       "* * * * *",
		"Every 5 minutes":    "*/5 * * * *",
		"Every hour":         "0 * * * *",
		"Daily at midnight":  "0 0 * * *",
		"Daily at 2 AM":      "0 2 * * *",
		"Weekly on Sunday":   "0 0 * * 0",
		"Monthly on 1st":     "0 0 1 * *",
		"Every 30 seconds":   "*/30 * * * * *", // 6-field format with seconds
	}
}

// IsValidSchedule checks if a schedule is valid (returns bool instead of error)
func IsValidSchedule(schedule string) bool {
	return ValidateSchedule(schedule) == nil
}

// FormatScheduleDescription returns a human-readable description of a cron schedule
func FormatScheduleDescription(schedule string) string {
	// This is a simplified version - a full implementation would use a library
	// like github.com/olebedev/when or similar for more descriptive output
	examples := StandardCronScheduleExamples()
	for desc, example := range examples {
		if schedule == example {
			return desc
		}
	}
	return schedule
}
