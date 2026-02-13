import { useState, useEffect, useCallback } from "react";
import {
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useCrons } from "./useCrons";
import type { CronJob, CronExecutionResult } from "./api";

interface CronHistoryDialogProps {
  readonly job: CronJob;
  readonly onClose: () => void;
}

function getStatusIcon(exitCode: number) {
  if (exitCode === 0) {
    return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
  }
  return <XCircle className="w-5 h-5 text-red-400" />;
}

function formatDuration(startedAt: number, finishedAt: number) {
  const duration = finishedAt - startedAt;
  if (duration < 1000) {
    return `${String(duration)}ms`;
  }
  return `${(duration / 1000).toFixed(2)}s`;
}

function truncateOutput(output: string, maxLength = 200) {
  if (output.length <= maxLength) return output;
  return output.slice(0, Math.max(0, maxLength)) + "...";
}

function hasLongContent(execution: CronExecutionResult): boolean {
  return (
    (execution.output !== "" && execution.output.length > 200) ||
    (execution.error !== "" && execution.error.length > 200)
  );
}

export default function CronHistoryDialog({
  job,
  onClose,
}: CronHistoryDialogProps) {
  const { getCronHistory } = useCrons();
  const [history, setHistory] = useState<CronExecutionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const results = await getCronHistory(job.id);
      setHistory(results);
    } finally {
      setLoading(false);
    }
  }, [job.id, getCronHistory]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchHistory().catch(console.error);
    const interval = setInterval(() => {
      fetchHistory().catch(console.error);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

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

  const toggleExpanded = (executionId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(executionId)) {
        next.delete(executionId);
      } else {
        next.add(executionId);
      }
      return next;
    });
  };

  // Calculate statistics
  const successfulRuns = history.filter((h) => h.exit_code === 0).length;
  const failedRuns = history.filter((h) => h.exit_code !== 0).length;

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
        className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
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
                Execution History
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">{job.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Stats */}
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

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && history.length === 0 && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
          )}
          {!loading && history.length === 0 && (
            <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-12 text-center">
              <Clock className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-zinc-100 mb-2">
                No execution history
              </h2>
              <p className="text-zinc-400">
                This cron job hasn&apos;t been executed yet
              </p>
            </div>
          )}
          {history.length > 0 && (
            <div className="space-y-3">
              {history.map((execution) => {
                const isExpanded = expandedItems.has(execution.execution_id);
                return (
                  <div
                    key={execution.execution_id}
                    className="bg-zinc-900/70 border border-zinc-800/80 rounded-lg overflow-hidden"
                  >
                    {/* Header */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          {getStatusIcon(execution.exit_code)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-200">
                              {formatDistanceToNow(
                                new Date(execution.started_at * 1000),
                                {
                                  addSuffix: true,
                                },
                              )}
                            </p>
                            <p className="text-xs text-zinc-500 mt-0.5">
                              Duration:{" "}
                              {formatDuration(
                                execution.started_at,
                                execution.finished_at,
                              )}
                              {" \u2022 Exit code: "}
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

                      {/* Output/Error Preview */}
                      {(execution.output !== "" || execution.error !== "") && (
                        <div className="mt-3">
                          {execution.output !== "" && (
                            <div className="bg-zinc-950/50 border border-zinc-800 rounded px-3 py-2">
                              <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap">
                                {isExpanded
                                  ? execution.output
                                  : truncateOutput(execution.output)}
                              </pre>
                            </div>
                          )}
                          {execution.error !== "" && (
                            <div className="bg-red-950/30 border border-red-900/50 rounded px-3 py-2 mt-2">
                              <pre className="text-xs text-red-400 font-mono whitespace-pre-wrap">
                                {isExpanded
                                  ? execution.error
                                  : truncateOutput(execution.error)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Expand Button */}
                      {hasLongContent(execution) && (
                        <button
                          onClick={() => toggleExpanded(execution.execution_id)}
                          className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
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

        {/* Footer with pagination */}
        {history.length > 0 && (
          <div className="flex items-center justify-between p-4 border-t border-zinc-800">
            <p className="text-xs text-zinc-500">
              Showing {history.length} execution
              {history.length === 1 ? "" : "s"}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium text-sm transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
