import { useState, useEffect } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface CronScheduleInputProps {
  readonly id?: string;
  readonly value: string;
  readonly onChange: (schedule: string) => void;
  readonly error?: string;
  readonly disabled?: boolean;
}

// Common schedule presets from the backend
const SCHEDULE_PRESETS = [
  { label: "Every minute", schedule: "* * * * *" },
  { label: "Every 5 minutes", schedule: "*/5 * * * *" },
  { label: "Every hour", schedule: "0 * * * *" },
  { label: "Daily at midnight", schedule: "0 0 * * *" },
  { label: "Daily at 2 AM", schedule: "0 2 * * *" },
  { label: "Weekly on Sunday", schedule: "0 0 * * 0" },
  { label: "Monthly on 1st", schedule: "0 0 1 * *" },
];

function getInputBorderClass(
  error: string | undefined,
  isValid: boolean | null,
): string {
  if (error !== undefined && error !== "") {
    return "border-red-500/50 focus:ring-red-500/40";
  }
  if (isValid === true) {
    return "border-emerald-500/50 focus:ring-emerald-500/40";
  }
  if (isValid === false) {
    return "border-red-500/50 focus:ring-red-500/40";
  }
  return "border-zinc-700/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40";
}

export default function CronScheduleInput({
  id,
  value,
  onChange,
  error,
  disabled = false,
}: CronScheduleInputProps) {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customSchedule, setCustomSchedule] = useState("");
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [nextRunTimes, setNextRunTimes] = useState<string[]>([]);
  const [validationError, setValidationError] = useState("");

  // Update schedule when preset is selected
  const handlePresetChange = (schedule: string) => {
    setSelectedPreset(schedule);
    setCustomSchedule("");
    onChange(schedule);
  };

  // Update schedule when custom input changes
  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomSchedule(val);
    setSelectedPreset(null);
    onChange(val);
  };

  // Validate schedule and fetch next run times
  useEffect(() => {
    const validateSchedule = async () => {
      const scheduleToValidate = (selectedPreset ?? customSchedule) || value;
      if (scheduleToValidate === "") {
        setIsValid(null);
        setNextRunTimes([]);
        return;
      }

      try {
        // Validate via backend
        const response = await fetch("/api/crons/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ schedule: scheduleToValidate }),
        });

        if (response.ok) {
          setIsValid(true);
          setValidationError("");

          // Get next run times if valid
          const data = (await response.json()) as {
            next_runs?: string[];
          };
          if (data.next_runs) {
            setNextRunTimes(data.next_runs);
          }
        } else {
          setIsValid(false);
          const errorData = (await response
            .json()
            .catch(() => ({ error: "Invalid schedule" }))) as {
            error?: string;
          };
          setValidationError(errorData.error ?? "Invalid cron schedule");
          setNextRunTimes([]);
        }
      } catch {
        // If validation endpoint doesn't exist, show as neutral
        setIsValid(null);
        setValidationError("");
        setNextRunTimes([]);
      }
    };

    // Debounce validation
    const timer = setTimeout(() => {
      validateSchedule().catch(console.error);
    }, 500);
    return () => clearTimeout(timer);
  }, [selectedPreset, customSchedule, value]);

  const currentSchedule = selectedPreset ?? customSchedule;
  const borderClass = getInputBorderClass(error, isValid);
  const hasError = error !== undefined && error !== "";
  const hasValidationError = validationError !== "" && !hasError;

  return (
    <div className="space-y-4">
      {/* Preset Schedules */}
      <div className="space-y-2">
        <p className="block text-sm font-medium text-zinc-300">
          Schedule Preset
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SCHEDULE_PRESETS.map((preset) => (
            <label
              key={preset.schedule}
              aria-label={preset.label}
              className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                (currentSchedule === preset.schedule ||
                  currentSchedule === "") &&
                selectedPreset === null &&
                customSchedule === ""
                  ? "bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600"
                  : "bg-zinc-800/30 border-zinc-700/30 hover:border-zinc-600"
              } ${
                currentSchedule === preset.schedule
                  ? "ring-2 ring-emerald-500/50"
                  : ""
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input
                type="radio"
                name="schedule-preset"
                className="sr-only"
                checked={currentSchedule === preset.schedule}
                onChange={() => handlePresetChange(preset.schedule)}
                disabled={disabled}
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-zinc-200">
                  {preset.label}
                </div>
                <div className="text-xs text-zinc-500 font-mono mt-0.5">
                  {preset.schedule}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Custom Schedule Input */}
      <div>
        <label
          htmlFor={id ?? "cron-custom-schedule"}
          className="block text-sm font-medium text-zinc-300 mb-2"
        >
          Custom Expression
        </label>
        <div className="relative">
          <input
            id={id ?? "cron-custom-schedule"}
            type="text"
            value={customSchedule}
            onChange={handleCustomChange}
            placeholder="* * * * * or */5 * * * *"
            className={`w-full bg-zinc-950/70 border ${borderClass} rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors ${
              disabled ? "opacity-50 cursor-not-allowed" : ""
            }`}
            disabled={disabled}
          />
          {/* Validation Icon */}
          {!disabled && currentSchedule !== "" && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {isValid === true && (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              )}
              {isValid === false && (
                <AlertCircle className="w-5 h-5 text-red-400" />
              )}
            </div>
          )}
        </div>
        {hasError && <p className="text-sm text-red-400 mt-1">{error}</p>}
        {hasValidationError && (
          <p className="text-sm text-red-400 mt-1">{validationError}</p>
        )}
        {!hasError &&
          !hasValidationError &&
          currentSchedule !== "" &&
          isValid !== null && (
            <p className="text-xs text-zinc-500 mt-1">
              Enter a valid 5-field (minute hour day month weekday) or 6-field
              (with seconds) cron expression
            </p>
          )}
      </div>

      {/* Next Run Times Preview */}
      {isValid === true && nextRunTimes.length > 0 && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3">
          <p className="text-xs font-medium text-zinc-400 mb-2">
            Next 5 scheduled runs:
          </p>
          <ul className="space-y-1">
            {nextRunTimes.slice(0, 5).map((time, index) => (
              <li key={index} className="text-xs text-zinc-300 font-mono">
                {time}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cron Syntax Help */}
      <div className="text-xs text-zinc-500 space-y-1">
        <p className="font-medium">Cron format:</p>
        <p className="font-mono">* * * * * (minute hour day month weekday)</p>
        <p className="font-mono">
          * * * * * * (second minute hour day month weekday)
        </p>
        <p>
          Example:{" "}
          <code className="bg-zinc-800 px-1.5 py-0.5 rounded">0 2 * * *</code> =
          2:00 AM daily
        </p>
      </div>
    </div>
  );
}
