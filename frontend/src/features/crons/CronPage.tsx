import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import type { CronJob } from "./api";
import { useCrons } from "./useCrons";
import CronFormDialog from "./CronFormDialog";
import CronHistoryDialog from "./CronHistoryDialog";
import CronTable, {
  type CronSortDirection,
  type CronSortKey,
  type CronStatusFilter,
} from "./CronTable";
import {
  formValuesToCreateRequest,
  formValuesToUpdateRequest,
  type CronFormValues,
} from "./cronForm";

function isFailingJob(job: CronJob): boolean {
  return (
    job.metadata.last_run_status === "failed" || job.metadata.failure_count > 0
  );
}

function defaultDirectionForSort(key: CronSortKey): CronSortDirection {
  if (key === "lastRun" || key === "runs" || key === "failures") {
    return "desc";
  }

  return "asc";
}

function getStatusRank(job: CronJob): number {
  if (!job.enabled) {
    return 4;
  }

  if (job.metadata.last_run_status === "failed") {
    return 0;
  }

  if (job.metadata.last_run_status === "running") {
    return 1;
  }

  if (job.metadata.last_run_status === "success") {
    return 2;
  }

  return 3;
}

function compareJobs(
  left: CronJob,
  right: CronJob,
  key: CronSortKey,
  direction: CronSortDirection,
): number {
  let comparison: number;

  switch (key) {
    case "name": {
      comparison = left.name
        .toLowerCase()
        .localeCompare(right.name.toLowerCase());

      break;
    }
    case "schedule": {
      comparison = left.schedule.localeCompare(right.schedule);

      break;
    }
    case "nextRun": {
      const leftNextRun =
        left.enabled && left.metadata.next_run_at > 0
          ? left.metadata.next_run_at
          : Number.MAX_SAFE_INTEGER;
      const rightNextRun =
        right.enabled && right.metadata.next_run_at > 0
          ? right.metadata.next_run_at
          : Number.MAX_SAFE_INTEGER;
      comparison = leftNextRun - rightNextRun;

      break;
    }
    case "lastRun": {
      comparison = left.metadata.last_run_at - right.metadata.last_run_at;

      break;
    }
    case "status": {
      comparison = getStatusRank(left) - getStatusRank(right);

      break;
    }
    case "runs": {
      comparison = left.metadata.total_runs - right.metadata.total_runs;

      break;
    }
    default: {
      comparison = left.metadata.failure_count - right.metadata.failure_count;
    }
  }

  if (direction === "desc") {
    return comparison * -1;
  }

  return comparison;
}

function matchesStatusFilter(job: CronJob, filter: CronStatusFilter): boolean {
  if (filter === "enabled") {
    return job.enabled;
  }

  if (filter === "disabled") {
    return !job.enabled;
  }

  if (filter === "failing") {
    return isFailingJob(job);
  }

  return true;
}

export default function CronPage() {
  const {
    crons,
    loading,
    error,
    refreshCrons,
    createCron,
    updateCron,
    deleteCron,
    runCronNow,
    enableCron,
    disableCron,
  } = useCrons();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CronStatusFilter>("all");
  const [sortKey, setSortKey] = useState<CronSortKey>("nextRun");
  const [sortDirection, setSortDirection] = useState<CronSortDirection>("asc");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [historyJob, setHistoryJob] = useState<CronJob | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingJobIds, setPendingJobIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handleWindowFocus = () => {
      void refreshCrons({ silent: true }).catch(() => {});
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshCrons({ silent: true }).catch(() => {});
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshCrons]);

  const markPending = useCallback((jobId: string, pending: boolean) => {
    setPendingJobIds((previous) => {
      const next = new Set(previous);

      if (pending) {
        next.add(jobId);
      } else {
        next.delete(jobId);
      }

      return next;
    });
  }, []);

  const runJobAction = useCallback(
    async (jobId: string, action: () => Promise<void>) => {
      markPending(jobId, true);

      try {
        await action();
      } finally {
        markPending(jobId, false);
      }
    },
    [markPending],
  );

  const handleSortChange = (nextSortKey: CronSortKey) => {
    if (nextSortKey === sortKey) {
      setSortDirection((previous) => (previous === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(defaultDirectionForSort(nextSortKey));
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);

    try {
      await refreshCrons();
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreateSubmit = async (values: CronFormValues) => {
    const request = formValuesToCreateRequest(values);
    await createCron(request);
  };

  const handleEditSubmit = async (values: CronFormValues) => {
    if (editingJob === null) {
      return;
    }

    const updates = formValuesToUpdateRequest(values, editingJob);
    if (Object.keys(updates).length === 0) {
      return;
    }

    await updateCron(editingJob.id, updates);
  };

  const filteredAndSortedCrons = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const filtered = crons.filter((job) => {
      if (!matchesStatusFilter(job, statusFilter)) {
        return false;
      }

      if (normalizedQuery === "") {
        return true;
      }

      return (
        job.name.toLowerCase().includes(normalizedQuery) ||
        job.command.toLowerCase().includes(normalizedQuery) ||
        job.schedule.toLowerCase().includes(normalizedQuery)
      );
    });

    // eslint-disable-next-line unicorn/no-array-sort -- spread creates a cloned array
    return [...filtered].sort((left, right) =>
      compareJobs(left, right, sortKey, sortDirection),
    );
  }, [crons, searchQuery, sortDirection, sortKey, statusFilter]);

  const totalJobs = crons.length;
  const enabledJobs = crons.filter((job) => job.enabled).length;
  const disabledJobs = totalJobs - enabledJobs;
  const failingJobs = crons.filter((job) => isFailingJob(job)).length;

  const showGlobalEmptyState =
    !loading &&
    totalJobs === 0 &&
    searchQuery.trim() === "" &&
    statusFilter === "all";
  const showFilteredEmptyState =
    !loading && filteredAndSortedCrons.length === 0 && !showGlobalEmptyState;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">
              Workspace
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold text-zinc-100 mt-2">
              Cron Jobs
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Manage schedules, inspect execution history, and keep job health
              visible.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/80 rounded-lg text-zinc-200 text-sm transition-colors"
              onClick={() => {
                void handleManualRefresh();
              }}
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
              className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-sm font-medium transition-colors"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="w-4 h-4" />
              New Job
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Total
            </p>
            <p className="text-2xl font-semibold text-zinc-100 mt-1">
              {totalJobs}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Enabled
            </p>
            <p className="text-2xl font-semibold text-emerald-300 mt-1">
              {enabledJobs}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Disabled
            </p>
            <p className="text-2xl font-semibold text-zinc-200 mt-1">
              {disabledJobs}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Failing
            </p>
            <p className="text-2xl font-semibold text-red-300 mt-1">
              {failingJobs}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3 flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              placeholder="Search by name, command, or schedule"
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-400 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="cron-status-filter"
              className="text-xs text-zinc-400 uppercase tracking-wide"
            >
              Filter
            </label>
            <select
              id="cron-status-filter"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as CronStatusFilter);
              }}
              className="bg-zinc-950/70 border border-zinc-700/80 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-400 transition-colors"
            >
              <option value="all">All jobs</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
              <option value="failing">Failing</option>
            </select>
          </div>
        </div>

        {error !== null && (
          <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 px-4 py-3 text-sm text-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-300 flex-shrink-0" />
            <p>Latest sync issue: {error}</p>
          </div>
        )}

        {loading && totalJobs === 0 && (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-12 flex items-center justify-center">
            <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
          </div>
        )}

        {showGlobalEmptyState && (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-12 text-center">
            <Clock3 className="w-14 h-14 text-zinc-600 mx-auto" />
            <h2 className="text-xl font-semibold text-zinc-100 mt-4">
              No cron jobs yet
            </h2>
            <p className="text-zinc-400 mt-2 mb-6">
              Add your first scheduled command to start automating tasks.
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition-colors"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="w-4 h-4" />
              Create Your First Job
            </button>
          </div>
        )}

        {showFilteredEmptyState && (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-10 text-center">
            <Search className="w-10 h-10 text-zinc-600 mx-auto" />
            <h2 className="text-lg font-semibold text-zinc-100 mt-4">
              No matching jobs
            </h2>
            <p className="text-zinc-400 mt-2">
              Adjust your query or status filter.
            </p>
          </div>
        )}

        {!showGlobalEmptyState &&
          !showFilteredEmptyState &&
          filteredAndSortedCrons.length > 0 && (
            <CronTable
              crons={filteredAndSortedCrons}
              pendingJobIds={pendingJobIds}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSortChange={handleSortChange}
              onRunNow={(jobId) => {
                void runJobAction(jobId, async () => {
                  await runCronNow(jobId);
                }).catch(() => {});
              }}
              onToggleEnabled={(jobId, enabled) => {
                void runJobAction(jobId, async () => {
                  await (enabled ? enableCron(jobId) : disableCron(jobId));
                }).catch(() => {});
              }}
              onEdit={(job) => setEditingJob(job)}
              onViewHistory={(job) => setHistoryJob(job)}
              onDelete={(job) => {
                if (
                  !confirm(
                    `Are you sure you want to delete cron job "${job.name}"?`,
                  )
                ) {
                  return;
                }

                void runJobAction(job.id, async () => {
                  await deleteCron(job.id);
                }).catch(() => {});
              }}
            />
          )}
      </div>

      {showCreateDialog && (
        <CronFormDialog
          mode="create"
          onClose={() => setShowCreateDialog(false)}
          onSubmit={handleCreateSubmit}
        />
      )}

      {editingJob !== null && (
        <CronFormDialog
          mode="edit"
          job={editingJob}
          onClose={() => setEditingJob(null)}
          onSubmit={handleEditSubmit}
        />
      )}

      {historyJob !== null && (
        <CronHistoryDialog
          job={historyJob}
          onClose={() => setHistoryJob(null)}
        />
      )}
    </div>
  );
}
