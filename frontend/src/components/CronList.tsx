import type { KeyboardEvent, MouseEvent } from "react";
import { useCron } from "../contexts/useCron";

interface CronListProps {
  readonly onSelectJob?: (jobId: string) => void;
}

function getStatusBadgeColor(status: string): string {
  switch (status) {
    case "success": {
      return "bg-green-500 text-white";
    }
    case "failed": {
      return "bg-red-500 text-white";
    }
    case "running": {
      return "bg-blue-500 text-white";
    }
    default: {
      return "bg-zinc-600 text-zinc-300";
    }
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case "success": {
      return "OK";
    }
    case "failed": {
      return "ERR";
    }
    case "running": {
      return "RUN";
    }
    default: {
      return "N/A";
    }
  }
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function CronList({ onSelectJob }: CronListProps) {
  const { jobs, loading, deleteJob, triggerJob, toggleJob } = useCron();

  const handleDelete = async (
    event: MouseEvent<HTMLButtonElement>,
    jobId: string,
    name: string,
  ) => {
    event.stopPropagation();
    if (confirm(`Are you sure you want to delete cron job "${name}"?`)) {
      await deleteJob(jobId);
    }
  };

  const handleToggle = async (
    event: MouseEvent<HTMLButtonElement>,
    jobId: string,
    currentEnabled: boolean,
  ) => {
    event.stopPropagation();
    await toggleJob(jobId, !currentEnabled);
  };

  const handleTrigger = async (
    event: MouseEvent<HTMLButtonElement>,
    jobId: string,
  ) => {
    event.stopPropagation();
    await triggerJob(jobId);
  };

  const handleCardKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    jobId: string,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectJob?.(jobId);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-700 border-t-emerald-400"></div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-8 shadow-2xl">
          <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">
            Cron Jobs
          </div>
          <h2 className="text-2xl font-semibold text-zinc-100 mt-3">
            No cron jobs configured
          </h2>
          <p className="text-sm text-zinc-400 mt-2">
            Create a cron job to schedule scripts at specific intervals.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 md:grid md:grid-cols-2 xl:grid-cols-2">
      {jobs.map((job, index) => (
        <div
          key={job.id}
          role="button"
          tabIndex={0}
          onClick={() => onSelectJob?.(job.id)}
          onKeyDown={(event) => handleCardKeyDown(event, job.id)}
          className="flex flex-col bg-zinc-900/70 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-lg hover:border-zinc-700 transition-colors cursor-pointer"
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <div className="px-4 py-3 bg-zinc-900/80 border-b border-zinc-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  job.enabled ? "bg-emerald-400" : "bg-zinc-600"
                }`}
              />
              <div className="flex-1">
                <h3 className="font-semibold text-zinc-100">{job.name}</h3>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">
                  {job.cron_expression}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeColor(
                  job.last_status ?? "",
                )}`}
              >
                {getStatusIcon(job.last_status ?? "")}
              </span>
              <span className="text-xs text-zinc-500">
                {job.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>

          <div className="flex-1 p-4 bg-zinc-950/60">
            <div className="space-y-3">
              <div>
                <span className="text-xs text-zinc-500 uppercase tracking-wide">
                  Command
                </span>
                <p className="text-sm text-zinc-300 font-mono bg-black/50 rounded px-2 py-1">
                  {job.command}
                </p>
              </div>

              {job.working_directory != null &&
                job.working_directory !== "" && (
                  <div>
                    <span className="text-xs text-zinc-500 uppercase tracking-wide">
                      Working Directory
                    </span>
                    <p className="text-sm text-zinc-300">
                      {job.working_directory}
                    </p>
                  </div>
                )}

              {job.next_run != null && job.next_run !== "" && (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span>Next run: {formatTimestamp(job.next_run)}</span>
                </div>
              )}

              {job.previous_run != null && job.previous_run !== "" && (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span>Last run: {formatTimestamp(job.previous_run)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="px-4 py-3 bg-zinc-900/80 border-t border-zinc-800/80 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={(event) => {
                void handleTrigger(event, job.id);
              }}
              className="p-1.5 hover:bg-zinc-800 rounded text-emerald-400 transition-colors"
              title="Trigger job now"
            >
              Trigger
            </button>
            <button
              type="button"
              onClick={(event) => {
                void handleToggle(event, job.id, job.enabled);
              }}
              className={`p-1.5 rounded transition-colors ${
                job.enabled
                  ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                  : "text-emerald-400 hover:text-emerald-500 hover:bg-emerald-900/20"
              }`}
              title={job.enabled ? "Disable job" : "Enable job"}
            >
              {job.enabled ? "Disable" : "Enable"}
            </button>
            <button
              type="button"
              onClick={(event) => {
                void handleDelete(event, job.id, job.name);
              }}
              className="p-1.5 hover:bg-red-900/30 rounded text-zinc-500 hover:text-red-400 transition-colors"
              title="Delete job"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
