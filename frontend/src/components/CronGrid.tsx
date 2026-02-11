import { useState, useCallback } from "react";
import { Plus, Search, Clock, Loader2 } from "lucide-react";
import { useCrons } from "../contexts/useCrons";
import CronCard from "./CronCard";
import CreateCronDialog from "./CreateCronDialog";
import CronHistoryDialog from "./CronHistoryDialog";
import EditCronDialog from "./EditCronDialog";
import type { CronJob } from "../services/api";

export default function CronGrid() {
  const {
    crons,
    loading,
    refreshCrons,
    createCron,
    updateCron,
    deleteCron,
    runCronNow,
    enableCron,
    disableCron,
  } = useCrons();

  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [selectedJob, setSelectedJob] = useState<CronJob | null>(null);

  // Filter cron jobs based on search query
  const filteredCrons = crons.filter(
    (job) =>
      job.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.command.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.schedule.includes(searchQuery),
  );

  // Sort: enabled first, then by creation time (newest first)
  // eslint-disable-next-line unicorn/no-array-sort -- spread operator creates new array
  const sortedCrons = [...filteredCrons].sort((a, b) => {
    if (a.enabled !== b.enabled) {
      return a.enabled ? -1 : 1;
    }
    return b.metadata.created_at - a.metadata.created_at;
  });

  const handleRunNow = useCallback(
    async (jobId: string) => {
      await runCronNow(jobId);
      await refreshCrons();
    },
    [runCronNow, refreshCrons],
  );

  const handleEdit = useCallback((job: CronJob) => {
    setSelectedJob(job);
    setShowEditDialog(true);
  }, []);

  const handleDelete = useCallback(
    async (jobId: string) => {
      if (window.confirm("Are you sure you want to delete this cron job?")) {
        await deleteCron(jobId);
      }
    },
    [deleteCron],
  );

  const handleToggleEnable = useCallback(
    async (jobId: string, enabled: boolean) => {
      await (enabled ? enableCron(jobId) : disableCron(jobId));
    },
    [enableCron, disableCron],
  );

  const handleViewHistory = useCallback((job: CronJob) => {
    setSelectedJob(job);
    setShowHistoryDialog(true);
  }, []);

  const handleCreateJob = async (
    name: string,
    schedule: string,
    command: string,
    enabled: boolean,
    shell?: string,
    workingDirectory?: string,
    envVars?: string,
  ) => {
    // Parse env vars from string format to Record<string, string>
    let parsedEnvVars: Record<string, string> | undefined;
    if (envVars !== undefined && envVars.trim() !== "") {
      parsedEnvVars = {};
      for (const line of envVars.trim().split("\n")) {
        const [key, ...valueParts] = line.split("=");
        if (key && valueParts.length > 0) {
          parsedEnvVars[key.trim()] = valueParts.join("=").trim();
        }
      }
    }

    await createCron({
      name,
      schedule,
      command,
      shell,
      working_directory: workingDirectory,
      env_vars: parsedEnvVars,
      enabled,
    });
    setShowCreateDialog(false);
  };

  const handleRefresh = () => {
    refreshCrons().catch(console.error);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <Clock className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-zinc-100">Cron Jobs</h1>
            <p className="text-zinc-400 mt-1">
              Manage scheduled tasks and view execution history
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search cron jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950/70 border border-zinc-700/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors"
            />
          </div>

          {/* Create Button */}
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition-colors shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-5 h-5" />
            Create Cron Job
          </button>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            className="p-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/80 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Refresh"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 8.001 8.001M20.49 19.5a8 8 0 11-8 8v-4"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && sortedCrons.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!loading && sortedCrons.length === 0 && searchQuery === "" && (
        <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-12 text-center">
          <Clock className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-zinc-100 mb-2">
            No cron jobs configured
          </h2>
          <p className="text-zinc-400 mb-6">
            Create your first scheduled task to get started
          </p>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition-colors shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-5 h-5" />
            Create Your First Cron Job
          </button>
          <p className="text-xs text-zinc-500 mt-6">
            Tip: Use common schedules like &ldquo;Every 5 minutes&rdquo; or
            create custom cron expressions
          </p>
        </div>
      )}

      {/* Cron Jobs Grid */}
      {!loading && sortedCrons.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedCrons.map((job) => (
            <CronCard
              key={job.id}
              job={job}
              onRunNow={(id) => {
                handleRunNow(id).catch(console.error);
              }}
              onEdit={handleEdit}
              onDelete={(id) => {
                handleDelete(id).catch(console.error);
              }}
              onToggleEnable={(id, enabled) => {
                handleToggleEnable(id, enabled).catch(console.error);
              }}
              onViewHistory={handleViewHistory}
            />
          ))}
        </div>
      )}

      {/* No Results State */}
      {sortedCrons.length === 0 && !loading && searchQuery !== "" && (
        <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-12 text-center">
          <Search className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-zinc-100 mb-2">
            No cron jobs found
          </h2>
          <p className="text-zinc-400">Try adjusting your search query</p>
        </div>
      )}

      {/* Dialogs */}
      {showCreateDialog && (
        <CreateCronDialog
          onClose={() => setShowCreateDialog(false)}
          onSubmit={handleCreateJob}
        />
      )}

      {showEditDialog && selectedJob && (
        <EditCronDialog
          job={selectedJob}
          onClose={() => {
            setShowEditDialog(false);
            setSelectedJob(null);
          }}
          onSubmit={async (jobId, updates) => {
            await updateCron(jobId, updates);
            setShowEditDialog(false);
            setSelectedJob(null);
          }}
        />
      )}

      {showHistoryDialog && selectedJob && (
        <CronHistoryDialog
          job={selectedJob}
          onClose={() => {
            setShowHistoryDialog(false);
            setSelectedJob(null);
          }}
        />
      )}
    </div>
  );
}
