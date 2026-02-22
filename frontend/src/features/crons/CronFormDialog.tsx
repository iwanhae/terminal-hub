import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Loader2, Save, X } from "lucide-react";
import type { CronJob } from "./api";
import CronScheduleInput from "./CronScheduleInput";
import {
  areCronFormValuesEqual,
  createCronFormValues,
  parseEnvVarsText,
  type CronFormValues,
  validateCronScheduleExpression,
} from "./cronForm";

interface CronFormDialogProps {
  readonly mode: "create" | "edit";
  readonly job?: CronJob;
  readonly onClose: () => void;
  readonly onSubmit: (values: CronFormValues) => Promise<void>;
}

function validateRequired(value: string): boolean {
  return value.trim() !== "";
}

function sectionTitle(mode: "create" | "edit"): string {
  return mode === "create" ? "Create Cron Job" : "Edit Cron Job";
}

function submitLabel(mode: "create" | "edit", isSubmitting: boolean): string {
  if (isSubmitting) {
    return mode === "create" ? "Creating..." : "Saving...";
  }

  return mode === "create" ? "Create Job" : "Save Changes";
}

export default function CronFormDialog({
  mode,
  job,
  onClose,
  onSubmit,
}: CronFormDialogProps) {
  const initialValues = useMemo(() => createCronFormValues(job), [job]);
  const [values, setValues] = useState<CronFormValues>(initialValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [envError, setEnvError] = useState<string>("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  useEffect(() => {
    const timer = setTimeout(() => {
      nameInputRef.current?.focus();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const scheduleValidation = validateCronScheduleExpression(values.schedule);
  const parsedEnvVars = parseEnvVarsText(values.envVarsText);

  const nameValid = validateRequired(values.name);
  const commandValid = validateRequired(values.command);
  const scheduleValid = scheduleValidation.valid;
  const hasEnvErrors = parsedEnvVars.errors.length > 0;

  const hasChanges = !areCronFormValuesEqual(values, initialValues);

  const canSubmit =
    nameValid &&
    commandValid &&
    scheduleValid &&
    !hasEnvErrors &&
    !isSubmitting;

  const handleFieldChange = <K extends keyof CronFormValues>(
    key: K,
    nextValue: CronFormValues[K],
  ) => {
    setValues((previous) => ({
      ...previous,
      [key]: nextValue,
    }));

    if (key === "envVarsText" && envError !== "") {
      setEnvError("");
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    if (mode === "edit" && !hasChanges) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    setEnvError("");

    try {
      await onSubmit(values);
      onClose();
    } catch (error_) {
      if (error_ instanceof Error) {
        setEnvError(error_.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const dialogTitle = sectionTitle(mode);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div
        className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        role="presentation"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Clock3 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-zinc-100">
                {dialogTitle}
              </h2>
              {mode === "edit" && job !== undefined && (
                <p className="text-xs text-zinc-500 mt-0.5">ID: {job.id}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          className="p-6 space-y-6"
        >
          <div>
            <label
              htmlFor="cron-name"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Job Name <span className="text-red-400">*</span>
            </label>
            <input
              id="cron-name"
              ref={nameInputRef}
              type="text"
              value={values.name}
              onChange={(event) => {
                handleFieldChange("name", event.target.value);
              }}
              placeholder="e.g., Daily Database Backup"
              className="w-full bg-zinc-950/70 border border-zinc-700/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors"
              disabled={isSubmitting}
            />
            {!nameValid && (
              <p className="text-sm text-red-400 mt-1">Job name is required.</p>
            )}
          </div>

          <div>
            <label
              htmlFor="cron-schedule"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Schedule <span className="text-red-400">*</span>
            </label>
            <CronScheduleInput
              id="cron-schedule"
              value={values.schedule}
              onChange={(nextValue) => {
                handleFieldChange("schedule", nextValue);
              }}
              disabled={isSubmitting}
            />
            {!scheduleValid && values.schedule.trim() !== "" && (
              <p className="text-sm text-red-400 mt-1">
                {scheduleValidation.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="cron-command"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Command <span className="text-red-400">*</span>
            </label>
            <textarea
              id="cron-command"
              value={values.command}
              onChange={(event) => {
                handleFieldChange("command", event.target.value);
              }}
              placeholder="e.g., /usr/bin/backup.sh"
              rows={3}
              className="w-full bg-zinc-950/70 border border-zinc-700/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors font-mono resize-none"
              disabled={isSubmitting}
            />
            {!commandValid && (
              <p className="text-sm text-red-400 mt-1">Command is required.</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="cron-shell"
                className="block text-sm font-medium text-zinc-300 mb-2"
              >
                Shell <span className="text-zinc-500">(optional)</span>
              </label>
              <input
                id="cron-shell"
                type="text"
                value={values.shell}
                onChange={(event) => {
                  handleFieldChange("shell", event.target.value);
                }}
                placeholder="/bin/bash"
                className="w-full bg-zinc-950/70 border border-zinc-700/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors font-mono"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label
                htmlFor="cron-workdir"
                className="block text-sm font-medium text-zinc-300 mb-2"
              >
                Working Directory{" "}
                <span className="text-zinc-500">(optional)</span>
              </label>
              <input
                id="cron-workdir"
                type="text"
                value={values.workingDirectory}
                onChange={(event) => {
                  handleFieldChange("workingDirectory", event.target.value);
                }}
                placeholder="/home/user/projects"
                className="w-full bg-zinc-950/70 border border-zinc-700/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors font-mono"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="cron-env-vars"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Environment Variables{" "}
              <span className="text-zinc-500">(optional)</span>
            </label>
            <textarea
              id="cron-env-vars"
              value={values.envVarsText}
              onChange={(event) => {
                handleFieldChange("envVarsText", event.target.value);
              }}
              placeholder="KEY=value (one per line)"
              rows={4}
              className="w-full bg-zinc-950/70 border border-zinc-700/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors font-mono resize-y"
              disabled={isSubmitting}
            />
            {parsedEnvVars.errors.length > 0 && (
              <p className="text-sm text-red-400 mt-1">
                {parsedEnvVars.errors[0]}
              </p>
            )}
            {envError !== "" && (
              <p className="text-sm text-red-400 mt-1">{envError}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="cron-enabled"
              className="flex items-center gap-3 cursor-pointer"
            >
              <input
                id="cron-enabled"
                type="checkbox"
                checked={values.enabled}
                onChange={(event) => {
                  handleFieldChange("enabled", event.target.checked);
                }}
                className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-emerald-400 focus:ring-emerald-500 focus:ring-offset-0"
                disabled={isSubmitting}
              />
              <span className="text-sm font-medium text-zinc-200">
                Enable job immediately
              </span>
            </label>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || (mode === "edit" && !hasChanges)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition-colors shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {submitLabel(mode, isSubmitting)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
