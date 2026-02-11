import { useState, useEffect, useRef } from "react";
import { X, Loader2, Clock } from "lucide-react";
import CronScheduleInput from "./CronScheduleInput";

interface CreateCronDialogProps {
  readonly onClose: () => void;
  readonly onSubmit: (
    name: string,
    schedule: string,
    command: string,
    enabled: boolean,
    shell?: string,
    workingDirectory?: string,
    envVars?: string,
  ) => Promise<void>;
}

export default function CreateCronDialog({
  onClose,
  onSubmit,
}: CreateCronDialogProps) {
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("* * * * *");
  const [command, setCommand] = useState("");
  const [shell, setShell] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [envVars, setEnvVars] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

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
    if (!name.trim() || !schedule.trim() || !command.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(
        name,
        schedule,
        command,
        enabled,
        shell || undefined,
        workingDirectory || undefined,
        envVars || undefined,
      );
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit().catch(console.error);
  };

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
            <h2 className="text-xl font-semibold text-zinc-100">
              Create New Cron Job
            </h2>
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
              htmlFor="cron-name"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Job Name <span className="text-red-400">*</span>
            </label>
            <input
              ref={nameInputRef}
              id="cron-name"
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
              htmlFor="cron-schedule"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Schedule <span className="text-red-400">*</span>
            </label>
            <CronScheduleInput
              id="cron-schedule"
              value={schedule}
              onChange={setSchedule}
              disabled={isSubmitting}
            />
          </div>

          {/* Command */}
          <div>
            <label
              htmlFor="cron-command"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Command <span className="text-red-400">*</span>
            </label>
            <textarea
              id="cron-command"
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
              htmlFor="cron-shell"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Shell <span className="text-zinc-500">(optional)</span>
            </label>
            <input
              id="cron-shell"
              type="text"
              value={shell}
              onChange={(e) => setShell(e.target.value)}
              placeholder="/bin/bash (default)"
              className="w-full bg-zinc-950/70 border border-zinc-700/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors font-mono"
              disabled={isSubmitting}
            />
          </div>

          {/* Working Directory (Optional) */}
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
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder="e.g., /home/user/projects"
              className="w-full bg-zinc-950/70 border border-zinc-700/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors font-mono"
              disabled={isSubmitting}
            />
          </div>

          {/* Environment Variables (Optional) */}
          <div>
            <label
              htmlFor="cron-envvars"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Environment Variables{" "}
              <span className="text-zinc-500">(optional)</span>
            </label>
            <textarea
              id="cron-envvars"
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
              htmlFor="cron-enabled"
              className="flex items-center gap-3 cursor-pointer"
            >
              <input
                id="cron-enabled"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-emerald-400 focus:ring-emerald-500 focus:ring-offset-0"
                disabled={isSubmitting}
              />
              <span className="text-sm font-medium text-zinc-200">
                Enable job immediately
              </span>
            </label>
            <p className="text-xs text-zinc-500 mt-1">
              If unchecked, the job will be created but won&apos;t run until
              enabled
            </p>
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
              disabled={!isValid || isSubmitting}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition-colors shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Job"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
