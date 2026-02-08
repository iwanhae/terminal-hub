import { useState, useEffect } from "react";
import { useCron } from "../contexts/useCron";
import CronList from "../components/CronList";
import CreateCronJobDialog from "../components/CreateCronJobDialog";
import EditCronJobDialog from "../components/EditCronJobDialog";
import CronHistoryView from "../components/CronHistoryView";
import type { CronJob } from "../services/cronApi";

export default function CronManagement() {
  const { jobs, loading, error } = useCron();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedJob, setSelectedJob] = useState<CronJob | null>(null);
  const [showHistoryView, setShowHistoryView] = useState(false);

  useEffect(() => {
    const handleShortcut = () => {
      setSelectedJob(null);
      setShowCreateDialog(true);
    };

    window.addEventListener("create-session-shortcut", handleShortcut);
    return () =>
      window.removeEventListener("create-session-shortcut", handleShortcut);
  }, []);

  const handleCreateJob = () => {
    setSelectedJob(null);
    setShowCreateDialog(true);
  };

  const handleViewHistory = (jobId: string) => {
    const job = jobs.find((entry) => entry.id === jobId) ?? null;
    setSelectedJob(job);
    setShowHistoryView(true);
  };

  const handleCloseCreateDialog = () => {
    setShowCreateDialog(false);
  };

  const handleCloseEditDialog = () => {
    setShowEditDialog(false);
    setSelectedJob(null);
  };

  const handleCloseHistory = () => {
    setShowHistoryView(false);
    setSelectedJob(null);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-6 pb-4 fade-up">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">
              Cron Jobs
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold text-zinc-100 mt-2">
              Cron Schedule
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Manage automated script execution with cron expressions.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCreateJob}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium shadow-lg shadow-emerald-900/20 transition-all"
            >
              Create Cron Job
            </button>
            {selectedJob != null && (
              <button
                type="button"
                onClick={() => setShowEditDialog(true)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg font-medium transition-all"
              >
                Edit Selected
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 pb-6 overflow-y-auto">
        {error != null && error !== "" && (
          <div className="bg-red-900/20 border border-red-500/80 rounded-lg p-4 mb-4">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {loading && jobs.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-700 border-t-emerald-400"></div>
          </div>
        ) : (
          <CronList onSelectJob={handleViewHistory} />
        )}
      </div>

      {showCreateDialog && (
        <CreateCronJobDialog onClose={handleCloseCreateDialog} />
      )}

      {showEditDialog && selectedJob != null && (
        <EditCronJobDialog job={selectedJob} onClose={handleCloseEditDialog} />
      )}

      {showHistoryView && selectedJob != null && (
        <CronHistoryView jobId={selectedJob.id} onClose={handleCloseHistory} />
      )}
    </div>
  );
}
