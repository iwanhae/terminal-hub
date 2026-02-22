import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Clock3,
  History,
  Pause,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { CronJob } from "./api";

export type CronStatusFilter = "all" | "enabled" | "disabled" | "failing";

export type CronSortKey =
  | "name"
  | "schedule"
  | "nextRun"
  | "lastRun"
  | "status"
  | "runs"
  | "failures";

export type CronSortDirection = "asc" | "desc";

interface CronTableProps {
  readonly crons: CronJob[];
  readonly pendingJobIds: Set<string>;
  readonly sortKey: CronSortKey;
  readonly sortDirection: CronSortDirection;
  readonly onSortChange: (key: CronSortKey) => void;
  readonly onRunNow: (jobId: string) => void;
  readonly onToggleEnabled: (jobId: string, enabled: boolean) => void;
  readonly onEdit: (job: CronJob) => void;
  readonly onViewHistory: (job: CronJob) => void;
  readonly onDelete: (job: CronJob) => void;
}

interface SortableHeaderProps {
  readonly label: string;
  readonly sortColumn: CronSortKey;
  readonly activeSort: CronSortKey;
  readonly direction: CronSortDirection;
  readonly onSortChange: (key: CronSortKey) => void;
}

function getStatusLabel(job: CronJob): string {
  if (!job.enabled) {
    return "Disabled";
  }

  if (job.metadata.last_run_status === "running") {
    return "Running";
  }

  if (job.metadata.last_run_status === "failed") {
    return "Failing";
  }

  if (job.metadata.last_run_status === "success") {
    return "Healthy";
  }

  return "Scheduled";
}

function statusClassName(label: string): string {
  if (label === "Healthy") {
    return "bg-emerald-900/40 text-emerald-300 border border-emerald-800/50";
  }

  if (label === "Failing") {
    return "bg-red-900/30 text-red-300 border border-red-800/50";
  }

  if (label === "Running") {
    return "bg-sky-900/30 text-sky-300 border border-sky-800/50";
  }

  if (label === "Disabled") {
    return "bg-zinc-800 text-zinc-300 border border-zinc-700";
  }

  return "bg-zinc-900/70 text-zinc-300 border border-zinc-700/80";
}

function formatRelativeUnix(timestamp: number): string {
  if (timestamp <= 0) {
    return "Never";
  }

  return formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true });
}

function formatAbsoluteUnix(timestamp: number): string {
  if (timestamp <= 0) {
    return "Not scheduled";
  }

  return new Date(timestamp * 1000).toLocaleString();
}

function rowActionClassName(isBusy: boolean): string {
  let className =
    "p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors";

  if (isBusy) {
    className += " opacity-60 cursor-not-allowed";
  }

  return className;
}

function SortableHeader({
  label,
  sortColumn,
  activeSort,
  direction,
  onSortChange,
}: SortableHeaderProps) {
  const isActive = activeSort === sortColumn;

  return (
    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 hover:text-zinc-200 transition-colors"
        onClick={() => onSortChange(sortColumn)}
      >
        <span>{label}</span>
        {!isActive && <ArrowUpDown className="h-3.5 w-3.5" />}
        {isActive && direction === "asc" && (
          <ChevronUp className="h-3.5 w-3.5" />
        )}
        {isActive && direction === "desc" && (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>
    </th>
  );
}

export default function CronTable({
  crons,
  pendingJobIds,
  sortKey,
  sortDirection,
  onSortChange,
  onRunNow,
  onToggleEnabled,
  onEdit,
  onViewHistory,
  onDelete,
}: CronTableProps) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse">
          <thead className="bg-zinc-950/60 border-b border-zinc-800">
            <tr>
              <SortableHeader
                label="Name"
                sortColumn="name"
                activeSort={sortKey}
                direction={sortDirection}
                onSortChange={onSortChange}
              />
              <SortableHeader
                label="Schedule"
                sortColumn="schedule"
                activeSort={sortKey}
                direction={sortDirection}
                onSortChange={onSortChange}
              />
              <SortableHeader
                label="Next Run"
                sortColumn="nextRun"
                activeSort={sortKey}
                direction={sortDirection}
                onSortChange={onSortChange}
              />
              <SortableHeader
                label="Last Run"
                sortColumn="lastRun"
                activeSort={sortKey}
                direction={sortDirection}
                onSortChange={onSortChange}
              />
              <SortableHeader
                label="Status"
                sortColumn="status"
                activeSort={sortKey}
                direction={sortDirection}
                onSortChange={onSortChange}
              />
              <SortableHeader
                label="Runs"
                sortColumn="runs"
                activeSort={sortKey}
                direction={sortDirection}
                onSortChange={onSortChange}
              />
              <SortableHeader
                label="Failures"
                sortColumn="failures"
                activeSort={sortKey}
                direction={sortDirection}
                onSortChange={onSortChange}
              />
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {crons.map((job) => {
              const statusLabel = getStatusLabel(job);
              const isBusy = pendingJobIds.has(job.id);

              return (
                <tr
                  key={job.id}
                  className="border-b border-zinc-800/70 last:border-b-0 hover:bg-zinc-900/70"
                >
                  <td className="px-3 py-3 align-top">
                    <div className="min-w-0">
                      <p
                        className="font-medium text-zinc-100 truncate"
                        title={job.name}
                      >
                        {job.name}
                      </p>
                      <p
                        className="text-xs text-zinc-500 font-mono mt-1 truncate"
                        title={job.command}
                      >
                        {job.command}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span className="text-sm text-zinc-200 font-mono">
                      {job.schedule}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span
                      className="text-sm text-zinc-200"
                      title={formatAbsoluteUnix(job.metadata.next_run_at)}
                    >
                      {job.enabled
                        ? formatRelativeUnix(job.metadata.next_run_at)
                        : "Disabled"}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span
                      className="text-sm text-zinc-200"
                      title={formatAbsoluteUnix(job.metadata.last_run_at)}
                    >
                      {formatRelativeUnix(job.metadata.last_run_at)}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${statusClassName(
                        statusLabel,
                      )}`}
                    >
                      {statusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-top text-sm text-zinc-200">
                    {job.metadata.total_runs}
                  </td>
                  <td className="px-3 py-3 align-top text-sm text-zinc-200">
                    {job.metadata.failure_count}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        className={rowActionClassName(isBusy || !job.enabled)}
                        onClick={() => onRunNow(job.id)}
                        disabled={isBusy || !job.enabled}
                        title="Run now"
                      >
                        <Play className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className={rowActionClassName(isBusy)}
                        onClick={() => onToggleEnabled(job.id, !job.enabled)}
                        disabled={isBusy}
                        title={job.enabled ? "Disable" : "Enable"}
                      >
                        {job.enabled ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Clock3 className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        className={rowActionClassName(isBusy)}
                        onClick={() => onEdit(job)}
                        disabled={isBusy}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className={rowActionClassName(isBusy)}
                        onClick={() => onViewHistory(job)}
                        disabled={isBusy}
                        title="History"
                      >
                        <History className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className={rowActionClassName(isBusy)}
                        onClick={() => onDelete(job)}
                        disabled={isBusy}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
