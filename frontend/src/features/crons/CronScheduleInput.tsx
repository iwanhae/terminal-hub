import { AlertCircle, CheckCircle2 } from "lucide-react";
import {
  CRON_SCHEDULE_PRESETS,
  validateCronScheduleExpression,
} from "./cronForm";

interface CronScheduleInputProps {
  readonly id?: string;
  readonly value: string;
  readonly onChange: (schedule: string) => void;
  readonly error?: string;
  readonly disabled?: boolean;
}

function getPresetClass(isSelected: boolean, disabled: boolean): string {
  let className =
    "flex items-center gap-2 p-3 rounded-lg border transition-colors bg-zinc-800/30 border-zinc-700/30 hover:border-zinc-600";

  if (isSelected) {
    className =
      "flex items-center gap-2 p-3 rounded-lg border transition-colors bg-zinc-800/60 border-emerald-500/40 ring-1 ring-emerald-500/50";
  }

  className += disabled ? " opacity-50 cursor-not-allowed" : " cursor-pointer";

  return className;
}

function getInputClass(
  hasExternalError: boolean,
  showValidationError: boolean,
): string {
  if (hasExternalError || showValidationError) {
    return "w-full bg-zinc-950/70 border border-red-500/50 focus:ring-red-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors";
  }

  return "w-full bg-zinc-950/70 border border-zinc-700/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors";
}

export default function CronScheduleInput({
  id,
  value,
  onChange,
  error,
  disabled = false,
}: CronScheduleInputProps) {
  const normalizedValue = value.trim();
  const validation = validateCronScheduleExpression(value);
  const hasExternalError = error !== undefined && error !== "";
  const showValidationError = normalizedValue !== "" && !validation.valid;
  const showValidationSuccess = normalizedValue !== "" && validation.valid;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="block text-sm font-medium text-zinc-300">Presets</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CRON_SCHEDULE_PRESETS.map((preset) => {
            const isSelected = normalizedValue === preset.schedule;

            return (
              <button
                key={preset.schedule}
                type="button"
                className={getPresetClass(isSelected, disabled)}
                disabled={disabled}
                onClick={() => {
                  onChange(preset.schedule);
                }}
              >
                <span className="flex-1 text-left">
                  <span className="block text-sm font-medium text-zinc-200">
                    {preset.label}
                  </span>
                  <span className="block text-xs text-zinc-500 font-mono mt-0.5">
                    {preset.schedule}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label
          htmlFor={id ?? "cron-custom-schedule"}
          className="block text-sm font-medium text-zinc-300 mb-2"
        >
          Cron Expression
        </label>
        <div className="relative">
          <input
            id={id ?? "cron-custom-schedule"}
            type="text"
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
            }}
            placeholder="* * * * *"
            className={getInputClass(hasExternalError, showValidationError)}
            disabled={disabled}
          />
          {!disabled && normalizedValue !== "" && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {showValidationSuccess ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400" />
              )}
            </div>
          )}
        </div>

        {hasExternalError && (
          <p className="text-sm text-red-400 mt-1">{error}</p>
        )}
        {!hasExternalError && showValidationError && (
          <p className="text-sm text-red-400 mt-1">{validation.message}</p>
        )}
        {!hasExternalError && showValidationSuccess && (
          <p className="text-xs text-zinc-500 mt-1">
            Use 5 fields (minute hour day month weekday) or 6 fields (with
            seconds).
          </p>
        )}
      </div>

      <div className="text-xs text-zinc-500 space-y-1">
        <p className="font-medium">Format reference:</p>
        <p className="font-mono">* * * * * (minute hour day month weekday)</p>
        <p className="font-mono">
          * * * * * * (second minute hour day month weekday)
        </p>
      </div>
    </div>
  );
}
