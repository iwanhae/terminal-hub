import { createContext, useState, useEffect, type ReactNode } from "react";
import { api } from "../services/api";
import toast from "react-hot-toast";
import type { CronJob, CronJobExecution } from "../services/cronApi";

interface CronContextType {
  jobs: CronJob[];
  loading: boolean;
  error: string | null;
  refreshJobs: () => Promise<void>;
  createJob: (
    name: string,
    cronExpression: string,
    command: string,
    workingDirectory?: string,
    envVars?: Record<string, string>,
    shellPath?: string,
  ) => Promise<CronJob>;
  updateJob: (
    jobId: string,
    request: {
      name?: string;
      cron_expression?: string;
      command?: string;
      working_directory?: string;
      env_vars?: Record<string, string>;
      shell_path?: string;
    },
  ) => Promise<void>;
  deleteJob: (jobId: string) => Promise<void>;
  triggerJob: (jobId: string) => Promise<void>;
  toggleJob: (jobId: string, enabled: boolean) => Promise<void>;
  getJobHistory: (jobId: string, limit?: number) => Promise<CronJobExecution[]>;
}

const CronContext = createContext<CronContextType | undefined>(undefined);

export function CronProvider({ children }: { readonly children: ReactNode }) {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshJobs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listCronJobs();
      setJobs(data);
    } catch (error_) {
      const message =
        error_ instanceof Error ? error_.message : "Failed to fetch cron jobs";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const createJob = async (
    name: string,
    cronExpression: string,
    command: string,
    workingDirectory?: string,
    envVars?: Record<string, string>,
    shellPath?: string,
  ): Promise<CronJob> => {
    try {
      const response = await api.createCronJob({
        name,
        cron_expression: cronExpression,
        command,
        working_directory: workingDirectory,
        env_vars: envVars,
        shell_path: shellPath,
      });
      toast.success(`Cron job "${name}" created successfully`);
      await refreshJobs();
      return response;
    } catch (error_) {
      const message =
        error_ instanceof Error ? error_.message : "Failed to create cron job";
      toast.error(message);
      throw error_;
    }
  };

  const updateJob = async (
    jobId: string,
    request: {
      name?: string;
      cron_expression?: string;
      command?: string;
      working_directory?: string;
      env_vars?: Record<string, string>;
      shell_path?: string;
    },
  ): Promise<void> => {
    try {
      await api.updateCronJob(jobId, request);
      toast.success("Job updated successfully");
      await refreshJobs();
    } catch (error_) {
      const message =
        error_ instanceof Error ? error_.message : "Failed to update cron job";
      toast.error(message);
      throw error_;
    }
  };

  const deleteJob = async (jobId: string): Promise<void> => {
    try {
      await api.deleteCronJob(jobId);
      toast.success("Job deleted successfully");
      await refreshJobs();
    } catch (error_) {
      const message =
        error_ instanceof Error ? error_.message : "Failed to delete cron job";
      toast.error(message);
      throw error_;
    }
  };

  const triggerJob = async (jobId: string): Promise<void> => {
    try {
      await api.triggerCronJob(jobId);
      toast.success("Job triggered successfully");
      await refreshJobs();
    } catch (error_) {
      const message =
        error_ instanceof Error ? error_.message : "Failed to trigger cron job";
      toast.error(message);
      throw error_;
    }
  };

  const toggleJob = async (jobId: string, enabled: boolean): Promise<void> => {
    try {
      await api.toggleCronJob(jobId, enabled);
      toast.success(`Job ${enabled ? "enabled" : "disabled"}`);
      await refreshJobs();
    } catch (error_) {
      const message =
        error_ instanceof Error ? error_.message : "Failed to toggle cron job";
      toast.error(message);
      throw error_;
    }
  };

  const getJobHistory = async (
    jobId: string,
    limit?: number,
  ): Promise<CronJobExecution[]> => {
    try {
      const data = await api.listCronHistory(jobId, limit);
      return data;
    } catch (error_) {
      const message =
        error_ instanceof Error
          ? error_.message
          : "Failed to fetch cron history";
      setError(message);
      toast.error(message);
      throw error_;
    }
  };

  useEffect(() => {
    void refreshJobs();
    const interval = setInterval(() => void refreshJobs(), 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <CronContext.Provider
      value={{
        jobs,
        loading,
        error,
        refreshJobs,
        createJob,
        updateJob,
        deleteJob,
        triggerJob,
        toggleJob,
        getJobHistory,
      }}
    >
      {children}
    </CronContext.Provider>
  );
}

export { CronContext };
