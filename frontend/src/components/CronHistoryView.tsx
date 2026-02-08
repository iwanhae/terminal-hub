import { Fragment, useState, useEffect } from "react";
import { useCron } from "../contexts/useCron";
import type { CronJobExecution } from "../services/cronApi";

interface CronHistoryViewProps {
  readonly jobId: string;
  readonly onClose: () => void;
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatDuration(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function getStatusBadge(status: string): string {
  switch (status) {
    case "success": {
      return "bg-green-500/20 text-white";
    }
    case "failed": {
      return "bg-red-500/20 text-white";
    }
    case "running": {
      return "bg-blue-500/20 text-white animate-pulse";
    }
    default: {
      return "bg-zinc-600 text-white";
    }
  }
}

export default function CronHistoryView({
  jobId,
  onClose,
}: CronHistoryViewProps) {
  const { getJobHistory } = useCron();
  const [executions, setExecutions] = useState<CronJobExecution[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<
    "all" | "success" | "failed" | "running"
  >("all");
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      try {
        const data = await getJobHistory(jobId, 50);
        setExecutions(data);
      } catch (error) {
        console.error("Failed to load cron history:", error);
      } finally {
        setLoading(false);
      }
    };

    void loadHistory();
  }, [getJobHistory, jobId]);

  const toggleLogExpansion = (executionId: string) => {
    setExpandedLogs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(executionId)) {
        newSet.delete(executionId);
      } else {
        newSet.add(executionId);
      }
      return newSet;
    });
  };

  const filteredExecutions = executions.filter((exec) => {
    if (filter === "all") return true;
    return exec.status === filter;
  });

  let content;
  if (loading) {
    content = (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-700 border-t-emerald-400"></div>
      </div>
    );
  } else if (filteredExecutions.length === 0) {
    content = (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-zinc-400">No execution history</div>
      </div>
    );
  } else {
    content = (
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/50 sticky top-0">
            <tr>
              <th className="px-4 py-3 text-left text-zinc-500 font-medium">
                Status
              </th>
              <th className="px-4 py-3 text-left text-zinc-500 font-medium">
                Timestamp
              </th>
              <th className="px-4 py-3 text-left text-zinc-500 font-medium">
                Duration
              </th>
              <th className="px-4 py-3 text-left text-zinc-500 font-medium">
                Exit Code
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredExecutions.map((execution) => (
              <Fragment key={execution.execution_id}>
                <tr className="border-b border-zinc-800/80 hover:bg-zinc-900/30 transition-colors">
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadge(
                        execution.status,
                      )}`}
                    >
                      {execution.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {formatTimestamp(execution.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {formatDuration(execution.duration_ms)}
                  </td>
                  <td
                    className={`px-4 py-3 ${
                      execution.exit_code === 0
                        ? "text-zinc-300"
                        : "text-red-400"
                    }`}
                  >
                    {execution.exit_code}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => toggleLogExpansion(execution.execution_id)}
                      className="text-emerald-400 hover:text-emerald-500 transition-colors"
                      title={
                        expandedLogs.has(execution.execution_id)
                          ? "Collapse"
                          : "Expand"
                      }
                    >
                      {expandedLogs.has(execution.execution_id) ? "▼" : "▶"}
                    </button>
                  </td>
                </tr>
                <tr
                  className={
                    expandedLogs.has(execution.execution_id) ? "" : "hidden"
                  }
                >
                  <td colSpan={5} className="px-4 py-2 bg-zinc-950/50">
                    <div className="text-xs">
                      <span className="text-zinc-500 mb-1 block">Output:</span>
                      <pre className="bg-black/50 text-zinc-200 p-3 rounded overflow-x-auto whitespace-pre-wrap break-all">
                        {execution.output || "(No output)"}
                      </pre>
                    </div>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

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
        className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="h-full flex flex-col">
          <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Execution History</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Close
            </button>
          </div>

          <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center gap-3">
            <span className="text-sm text-zinc-500 font-medium">Filter:</span>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                filter === "all"
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilter("success")}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                filter === "success"
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              Success
            </button>
            <button
              type="button"
              onClick={() => setFilter("failed")}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                filter === "failed"
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              Failed
            </button>
            <button
              type="button"
              onClick={() => setFilter("running")}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                filter === "running"
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              Running
            </button>
          </div>

          {content}
        </div>
      </div>
    </div>
  );
}
