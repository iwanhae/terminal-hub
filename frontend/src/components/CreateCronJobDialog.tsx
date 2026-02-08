import { useState, useEffect, useRef } from "react";
import { useCron } from "../contexts/useCron";

interface CreateCronJobDialogProps {
  readonly onClose: () => void;
}

export default function CreateCronJobDialog({
  onClose,
}: CreateCronJobDialogProps) {
  const { createJob } = useCron();
  const [name, setName] = useState("");
  const [cronExpression, setCronExpression] = useState("* * * * *");
  const [command, setCommand] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [envVars, setEnvVars] = useState("");
  const [shellPath, setShellPath] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async () => {
    if (!name.trim() || !cronExpression.trim() || !command.trim()) return;

    setLoading(true);
    try {
      const envVarsMap: Record<string, string> = {};
      if (envVars.trim()) {
        for (const line of envVars.split("\n")) {
          const [key, ...valueParts] = line.split("=");
          if (key && valueParts.length > 0) {
            envVarsMap[key.trim()] = valueParts.join("=");
          }
        }
      }

      await createJob(
        name.trim(),
        cronExpression.trim(),
        command.trim(),
        workingDirectory.trim() || undefined,
        Object.keys(envVarsMap).length > 0 ? envVarsMap : undefined,
        shellPath.trim() || undefined,
      );
      onClose();
    } catch (error) {
      console.error("Failed to create cron job:", error);
    } finally {
      setLoading(false);
    }
  };

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
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <span className="text-emerald-300">⚡</span> Create New Cron Job
          </h2>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            className="space-y-4"
          >
            <div>
              <label
                htmlFor="cron-name"
                className="block text-sm font-medium text-zinc-400 mb-1"
              >
                Job Name <span className="text-red-400">*</span>
              </label>
              <input
                id="cron-name"
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 transition-colors"
                placeholder="e.g. Daily Backup"
              />
            </div>

            <div>
              <label
                htmlFor="cron-expression"
                className="block text-sm font-medium text-zinc-400 mb-1"
              >
                Cron Expression <span className="text-red-400">*</span>
              </label>
              <input
                id="cron-expression"
                type="text"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                required
                className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded px-3 py-2 text-zinc-200 font-mono focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 transition-colors"
                placeholder="* * * * *"
              />
            </div>

            <div>
              <label
                htmlFor="cron-command"
                className="block text-sm font-medium text-zinc-400 mb-1"
              >
                Command <span className="text-red-400">*</span>
              </label>
              <input
                id="cron-command"
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                required
                className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded px-3 py-2 text-zinc-200 font-mono focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 transition-colors"
                placeholder="/path/to/backup.sh"
              />
            </div>

            <div>
              <label
                htmlFor="working-directory"
                className="block text-sm font-medium text-zinc-400 mb-1"
              >
                Working Directory
              </label>
              <input
                id="working-directory"
                type="text"
                value={workingDirectory}
                onChange={(e) => setWorkingDirectory(e.target.value)}
                className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-400 transition-colors"
                placeholder="/path/to/project"
              />
            </div>

            <div>
              <label
                htmlFor="shell-path"
                className="block text-sm font-medium text-zinc-400 mb-1"
              >
                Shell Path
              </label>
              <input
                id="shell-path"
                type="text"
                value={shellPath}
                onChange={(e) => setShellPath(e.target.value)}
                className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded px-3 py-2 text-zinc-200 font-mono focus:outline-none focus:border-emerald-400 transition-colors"
                placeholder="/bin/bash"
              />
            </div>

            <div>
              <label
                htmlFor="env-vars"
                className="block text-sm font-medium text-zinc-400 mb-1"
              >
                Environment Variables
              </label>
              <textarea
                id="env-vars"
                value={envVars}
                onChange={(e) => setEnvVars(e.target.value)}
                className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded px-3 py-2 text-zinc-200 font-mono text-sm focus:outline-none focus:border-emerald-400 transition-colors h-24"
                placeholder="NODE_ENV=production&#10;PORT=3000"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Key=Value format, one per line
              </p>
            </div>

            <div className="flex gap-3 justify-end mt-8">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={(e) => e.stopPropagation()}
                disabled={
                  loading ||
                  !name.trim() ||
                  !cronExpression.trim() ||
                  !command.trim()
                }
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium shadow-lg shadow-emerald-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Creating..." : "Create Cron Job"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
