import { useState, useEffect, useRef } from "react";
import { X, Loader2, Clock } from "lucide-react";
import CronScheduleInput from "./CronScheduleInput";
import type { CronJob } from "../services/api";

interface EditCronDialogProps {
  readonly job: CronJob;
  readonly onClose: () => void;
  readonly onSubmit: (
    jobId: string,
    updates: {
      name?: string;
      schedule?: string;
      command?: string;
      shell?: string;
      workingDirectory?: string;
      envVars?: string;
      enabled?: boolean;
    },
  ) => Promise<void>;
}

function envVarsToString(envVars: Record<string, string> | undefined): string {
  if (envVars === undefined) return "";
  return Object.entries(envVars)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

export default function EditCronDialog({
  job,
  onClose,
  onSubmit,
}: EditCronDialogProps) {
  const [name, setName] = useState(job.name);
  const [schedule, setSchedule] = useState(job.schedule);
  const [command, setCommand] = useState(job.command);
  const [shell, setShell] = useState(job.shell ?? "");
  const [workingDirectory, setWorkingDirectory] = useState(
    job.working_directory ?? "",
  );
  const [envVars, setEnvVars] = useState(envVarsToString(job.env_vars));
  const [enabled, setEnabled] = useState(job.enabled);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const originalEnvVarsString = envVarsToString(job.env_vars);

  // Auto-focus on mount
  useEffect(() => {
    const timer = setTimeout(() => nameInputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleSubmit = async () => {
    // Build updates object with only changed fields
    const updates: {
      name?: string;
      schedule?: string;
      command?: string;
      shell?: string;
      workingDirectory?: string;
      envVars?: string;
      enabled?: boolean;
    } = {};

    if (name !== job.name) updates.name = name;
    if (schedule !== job.schedule) updates.schedule = schedule;
    if (command !== job.command) updates.command = command;
    if (shell !== (job.shell ?? "")) updates.shell = shell;
    if (workingDirectory !== (job.working_directory ?? ""))
      updates.workingDirectory = workingDirectory;
    if (envVars !== originalEnvVarsString) updates.envVars = envVars;
    if (enabled !== job.enabled) updates.enabled = enabled;

    setIsSubmitting(true);
    try {
      await onSubmit(job.id, updates);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit().catch(console.error);
  };

  const hasChanges =
    name !== job.name ||
    schedule !== job.schedule ||
    command !== job.command ||
    shell !== (job.shell ?? "") ||
    workingDirectory !== (job.working_directory ?? "") ||
    envVars !== originalEnvVarsString ||
    enabled !== job.enabled;

  const isValid =
    name.trim() !== "" && schedule.trim() !== "" && command.trim() !== "";

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="button"
      tabIndex={0}
    >
      <div
        className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Clock className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-zinc-100">
                Edit Cron Job
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">ID: {job.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleFormSubmit} className="p-6 space-y-6">
          {/* Job Name */}
          <div>
            <label
              htmlFor="edit-name"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Job Name <span className="text-red-400">*</span>
            </label>
            <input
              ref={nameInputRef}
              id="edit-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Daily Database Backup"
              className="w-full bg-zinc-950/70 border border-zinc-700/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors"
              disabled={isSubmitting}
            />
          </div>

          {/* Schedule */}
          <div>
            <label
              htmlFor="edit-schedule"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Schedule <span className="text-red-400">*</span>
            </label>
            <CronScheduleInput
              id="edit-schedule"
              value={schedule}
              onChange={setSchedule}
              disabled={isSubmitting}
            />
          </div>

          {/* Command */}
          <div>
            <label
              htmlFor="edit-command"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Command <span className="text-red-400">*</span>
            </label>
            <textarea
              id="edit-command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="e.g., /usr/bin/backup.sh"
              rows={3}
              className="w-full bg-zinc-950/70 border border-zinc-700/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors font-mono resize-none"
              disabled={isSubmitting}
            />
          </div>

          {/* Shell (Optional) */}
          <div>
            <label
              htmlFor="edit-shell"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Shell <span className="text-zinc-500">(optional)</span>
            </label>
            <input
              id="edit-shell"
              type="text"
              value={shell}
              onChange={(e) => setShell(e.target.value)}
              placeholder={job.shell ?? "/bin/bash"}
              className="w-full bg-zinc-950/70 border border-zinc-700/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors font-mono"
              disabled={isSubmitting}
            />
          </div>

          {/* Working Directory (Optional) */}
          <div>
            <label
              htmlFor="edit-workingDir"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Working Directory{" "}
              <span className="text-zinc-500">(optional)</span>
            </label>
            <input
              id="edit-workingDir"
              type="text"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder={job.working_directory ?? "e.g., /home/user/projects"}
              className="w-full bg-zinc-950/70 border border-zinc-700/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors font-mono"
              disabled={isSubmitting}
            />
          </div>

          {/* Environment Variables (Optional) */}
          <div>
            <label
              htmlFor="edit-envVars"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Environment Variables{" "}
              <span className="text-zinc-500">(optional)</span>
            </label>
            <textarea
              id="edit-envVars"
              value={envVars}
              onChange={(e) => setEnvVars(e.target.value)}
              placeholder="KEY=value format, one per line&#10;e.g., BACKUP_DIR=/data/backups&#10;RETENTION_DAYS=7"
              rows={3}
              className="w-full bg-zinc-950/70 border border-zinc-700/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors font-mono resize-none"
              disabled={isSubmitting}
            />
          </div>

          {/* Enable Checkbox */}
          <div>
            <label
              htmlFor="edit-enabled"
              className="flex items-center gap-3 cursor-pointer"
            >
              <input
                id="edit-enabled"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-emerald-400 focus:ring-emerald-500 focus:ring-offset-0"
                disabled={isSubmitting}
              />
              <span className="text-sm font-medium text-zinc-200">
                Job enabled
              </span>
            </label>
            <p className="text-xs text-zinc-500 mt-1">
              Disabled jobs will not run on their schedule
            </p>
          </div>

          {/* Metadata Info */}
          <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4">
            <p className="text-xs text-zinc-400 mb-2">Job Metadata</p>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-zinc-500">Created:</span>
                <span className="text-zinc-300 ml-1">
                  {new Date(job.metadata.created_at * 1000).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Total runs:</span>
                <span className="text-zinc-300 ml-1">
                  {job.metadata.total_runs}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Failed runs:</span>
                <span className="text-zinc-300 ml-1">
                  {job.metadata.failure_count}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Status:</span>
                <span
                  className={`ml-1 ${job.enabled ? "text-emerald-400" : "text-zinc-500"}`}
                >
                  {job.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
          </div>

          {/* Buttons */}
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
              disabled={!hasChanges || !isValid || isSubmitting}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition-colors shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Job"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
