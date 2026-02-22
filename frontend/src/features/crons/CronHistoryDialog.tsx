import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Loader2,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useCrons } from "./useCrons";
import type { CronExecutionResult, CronJob } from "./api";

interface CronHistoryDialogProps {
  readonly job: CronJob;
  readonly onClose: () => void;
}

function getExecutionIcon(execution: CronExecutionResult) {
  if (execution.exit_code === 0) {
    return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  }

  return <XCircle className="w-4 h-4 text-red-400" />;
}

function formatDuration(startedAt: number, finishedAt: number): string {
  const durationSeconds = Math.max(0, finishedAt - startedAt);

  if (durationSeconds < 1) {
    return "<1s";
  }

  if (durationSeconds < 60) {
    return `${String(durationSeconds)}s`;
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;

  if (minutes < 60) {
    return `${String(minutes)}m ${String(seconds)}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${String(hours)}h ${String(remainingMinutes)}m`;
}

function truncateContent(content: string, maxLength = 280): string {
  if (content.length <= maxLength) {
    return content;
  }

  return `${content.slice(0, Math.max(0, maxLength))}...`;
}

function hasLongOutput(execution: CronExecutionResult): boolean {
  return execution.output.length > 280 || execution.error.length > 280;
}

export default function CronHistoryDialog({
  job,
  onClose,
}: CronHistoryDialogProps) {
  const { getCronHistory } = useCrons();
  const [history, setHistory] = useState<CronExecutionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchHistory = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const executions = await getCronHistory(job.id);
        setHistory(executions);
      } finally {
        if (silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [getCronHistory, job.id],
  );

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const toggleExpanded = (executionId: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(executionId)) {
        next.delete(executionId);
      } else {
        next.add(executionId);
      }

      return next;
    });
  };

  const successfulRuns = history.filter(
    (execution) => execution.exit_code === 0,
  ).length;
  const failedRuns = history.length - successfulRuns;

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
        className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
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
                Execution History
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">{job.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void fetchHistory({ silent: true });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Refresh
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 p-4 border-b border-zinc-800 bg-zinc-800/30">
          <div className="text-center">
            <p className="text-2xl font-bold text-zinc-100">{history.length}</p>
            <p className="text-xs text-zinc-500">Total Executions</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-400">
              {successfulRuns}
            </p>
            <p className="text-xs text-zinc-500">Successful</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-400">{failedRuns}</p>
            <p className="text-xs text-zinc-500">Failed</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && history.length === 0 && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
          )}

          {!loading && history.length === 0 && (
            <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-12 text-center">
              <Clock3 className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-zinc-100 mb-2">
                No execution history
              </h3>
              <p className="text-zinc-400">
                This cron job has not been executed yet.
              </p>
            </div>
          )}

          {history.length > 0 && (
            <div className="space-y-3">
              {history.map((execution) => {
                const isExpanded = expandedIds.has(execution.execution_id);
                const hasContent =
                  execution.output !== "" || execution.error !== "";

                return (
                  <div
                    key={execution.execution_id}
                    className="bg-zinc-900/70 border border-zinc-800/80 rounded-lg overflow-hidden"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          {getExecutionIcon(execution)}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-200">
                              {formatDistanceToNow(
                                new Date(execution.started_at * 1000),
                                { addSuffix: true },
                              )}
                            </p>
                            <p className="text-xs text-zinc-500 mt-0.5">
                              Duration:{" "}
                              {formatDuration(
                                execution.started_at,
                                execution.finished_at,
                              )}
                              {" • Exit code: "}
                              <span
                                className={
                                  execution.exit_code === 0
                                    ? "text-emerald-400"
                                    : "text-red-400"
                                }
                              >
                                {execution.exit_code}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>

                      {hasContent && (
                        <div className="mt-3 space-y-2">
                          {execution.output !== "" && (
                            <div className="bg-zinc-950/50 border border-zinc-800 rounded px-3 py-2">
                              <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap break-all">
                                {isExpanded
                                  ? execution.output
                                  : truncateContent(execution.output)}
                              </pre>
                            </div>
                          )}
                          {execution.error !== "" && (
                            <div className="bg-red-950/20 border border-red-900/60 rounded px-3 py-2">
                              <pre className="text-xs text-red-300 font-mono whitespace-pre-wrap break-all">
                                {isExpanded
                                  ? execution.error
                                  : truncateContent(execution.error)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}

                      {hasLongOutput(execution) && (
                        <button
                          type="button"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                          onClick={() => toggleExpanded(execution.execution_id)}
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-4 h-4" />
                              Show less
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-4 h-4" />
                              View full output
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end p-4 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
