import { useState } from "react";
import {
  Play,
  Pause,
  Pencil,
  Trash2,
  BarChart3,
  MoreHorizontal,
  ChevronUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { CronJob } from "./api";

interface CronCardProps {
  readonly job: CronJob;
  readonly onRunNow: (jobId: string) => void;
  readonly onEdit: (job: CronJob) => void;
  readonly onDelete: (jobId: string) => void;
  readonly onToggleEnable: (jobId: string, enabled: boolean) => void;
  readonly onViewHistory: (job: CronJob) => void;
}

function formatSchedule(schedule: string): string {
  const descriptions: Record<string, string> = {
    "* * * * *": "Every minute",
    "*/5 * * * *": "Every 5 minutes",
    "*/15 * * * *": "Every 15 minutes",
    "0 * * * *": "Every hour",
    "0 */2 * * *": "Every 2 hours",
    "0 0 * * *": "Daily at midnight",
    "0 2 * * *": "Daily at 2 AM",
    "0 0 * * 0": "Weekly on Sunday",
    "0 0 * * 1": "Weekly on Monday",
    "0 0 1 * *": "Monthly on 1st",
    "*/30 * * * * *": "Every 30 seconds",
  };
  return descriptions[schedule] ?? schedule;
}

function formatTimestamp(timestamp: number): string {
  if (!timestamp) return "Never";
  return formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true });
}

function truncateCommand(command: string, maxLength = 60): string {
  if (command.length <= maxLength) return command;
  return command.slice(0, Math.max(0, maxLength)) + "...";
}

function getStatusIcon(status: string): string {
  if (status === "success") return "\u2713";
  if (status === "failed") return "\u2717";
  if (status === "running") return "\u27F3";
  return "\u25CB";
}

function getLastRunClass(status: string): string {
  if (status === "success") return "text-emerald-400";
  if (status === "failed") return "text-red-400";
  return "text-zinc-500";
}

export default function CronCard({
  job,
  onRunNow,
  onEdit,
  onDelete,
  onToggleEnable,
  onViewHistory,
}: CronCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  const statusColor = job.enabled ? "bg-emerald-400" : "bg-zinc-500";
  const statusIcon = getStatusIcon(job.metadata.last_run_status);
  const lastRunClass = getLastRunClass(job.metadata.last_run_status);

  const handleRunNow = () => {
    onRunNow(job.id);
  };

  const handleToggle = () => {
    onToggleEnable(job.id, !job.enabled);
  };

  return (
    <div className="group bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-5 hover:border-zinc-700/50 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${statusColor} ${
              job.enabled ? "shadow-lg shadow-emerald-400/20" : ""
            }`}
          />
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">{job.name}</h3>
            <p className="text-sm text-zinc-500 font-mono mt-0.5">
              {formatSchedule(job.schedule)}
            </p>
          </div>
        </div>

        {/* Actions Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            {showMenu ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <MoreHorizontal className="w-5 h-5" />
            )}
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[160px]">
              <button
                onClick={() => {
                  onEdit(job);
                  setShowMenu(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={() => {
                  onToggleEnable(job.id, !job.enabled);
                  setShowMenu(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2"
              >
                {job.enabled ? (
                  <>
                    <Pause className="w-4 h-4" />
                    Disable
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Enable
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  onViewHistory(job);
                  setShowMenu(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2"
              >
                <BarChart3 className="w-4 h-4" />
                History ({job.metadata.total_runs})
              </button>
              <div className="border-t border-zinc-700 my-1" />
              <button
                onClick={() => {
                  onDelete(job.id);
                  setShowMenu(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Command */}
      <div className="mb-4">
        <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-sm text-zinc-300">
          <code title={job.command}>{truncateCommand(job.command)}</code>
        </div>
      </div>

      {/* Metadata */}
      <div className="space-y-2 text-sm mb-4">
        <div className="flex items-center justify-between text-zinc-400">
          <span>Last run:</span>
          <span className={lastRunClass}>
            {statusIcon} {formatTimestamp(job.metadata.last_run_at)}
          </span>
        </div>
        <div className="flex items-center justify-between text-zinc-400">
          <span>Next run:</span>
          <span className="text-zinc-300">
            {job.metadata.next_run_at > 0
              ? formatTimestamp(job.metadata.next_run_at)
              : "Disabled"}
          </span>
        </div>
        <div className="flex items-center justify-between text-zinc-400">
          <span>Runs:</span>
          <span className="text-zinc-300">
            {job.metadata.total_runs}
            {job.metadata.failure_count > 0 && (
              <span className="text-red-400 ml-1">
                ({job.metadata.failure_count} failed)
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
        <button
          onClick={handleRunNow}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition-colors shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!job.enabled}
        >
          <Play className="w-4 h-4" />
          Run Now
        </button>
        <button
          onClick={handleToggle}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
            job.enabled
              ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
          }`}
        >
          {job.enabled ? "Disable" : "Enable"}
        </button>
      </div>
    </div>
  );
}
