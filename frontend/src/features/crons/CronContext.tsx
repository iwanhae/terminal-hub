import { createContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import type {
  CronJob,
  CronExecutionResult,
  CreateCronRequest,
  UpdateCronRequest,
} from "./api";
import { cronsApi } from "./api";
import toast from "react-hot-toast";

interface CronContextType {
  crons: CronJob[];
  loading: boolean;
  error: string | null;
  refreshCrons: () => Promise<void>;
  createCron: (request: CreateCronRequest) => Promise<string>;
  updateCron: (jobId: string, request: UpdateCronRequest) => Promise<void>;
  deleteCron: (jobId: string) => Promise<void>;
  runCronNow: (jobId: string) => Promise<CronExecutionResult>;
  enableCron: (jobId: string) => Promise<void>;
  disableCron: (jobId: string) => Promise<void>;
  getCronHistory: (jobId: string) => Promise<CronExecutionResult[]>;
}

const CronContext = createContext<CronContextType | undefined>(undefined);

async function fetchCronHistory(jobId: string): Promise<CronExecutionResult[]> {
  return cronsApi.getCronHistory(jobId).catch((error_: unknown) => {
    const message =
      error_ instanceof Error ? error_.message : "Failed to get cron history";
    toast.error(message);
    throw error_;
  });
}

export function CronProvider({ children }: { readonly children: ReactNode }) {
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshCrons = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await cronsApi.listCrons();
      setCrons(data);
    } catch (error_) {
      const message =
        error_ instanceof Error ? error_.message : "Failed to fetch cron jobs";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const createCron = async (request: CreateCronRequest): Promise<string> => {
    try {
      const response = await cronsApi.createCron(request);
      toast.success(`Cron job "${request.name}" created successfully`);
      await refreshCrons();
      return response.id;
    } catch (error_) {
      const message =
        error_ instanceof Error ? error_.message : "Failed to create cron job";
      toast.error(message);
      throw error_;
    }
  };

  const updateCron = async (
    jobId: string,
    request: UpdateCronRequest,
  ): Promise<void> => {
    try {
      await cronsApi.updateCron(jobId, request);
      toast.success("Cron job updated successfully");
      await refreshCrons();
    } catch (error_) {
      const message =
        error_ instanceof Error ? error_.message : "Failed to update cron job";
      toast.error(message);
      throw error_;
    }
  };

  const deleteCron = async (jobId: string): Promise<void> => {
    try {
      await cronsApi.deleteCron(jobId);
      toast.success("Cron job deleted successfully");
      await refreshCrons();
    } catch (error_) {
      const message =
        error_ instanceof Error ? error_.message : "Failed to delete cron job";
      toast.error(message);
      throw error_;
    }
  };

  const runCronNow = async (jobId: string): Promise<CronExecutionResult> => {
    try {
      const result = await cronsApi.runCronNow(jobId);
      toast.success("Cron job executed successfully");
      await refreshCrons();
      return result;
    } catch (error_) {
      const message =
        error_ instanceof Error ? error_.message : "Failed to run cron job";
      toast.error(message);
      throw error_;
    }
  };

  const enableCron = async (jobId: string): Promise<void> => {
    try {
      await cronsApi.enableCron(jobId);
      toast.success("Cron job enabled");
      await refreshCrons();
    } catch (error_) {
      const message =
        error_ instanceof Error ? error_.message : "Failed to enable cron job";
      toast.error(message);
      throw error_;
    }
  };

  const disableCron = async (jobId: string): Promise<void> => {
    try {
      await cronsApi.disableCron(jobId);
      toast.success("Cron job disabled");
      await refreshCrons();
    } catch (error_) {
      const message =
        error_ instanceof Error ? error_.message : "Failed to disable cron job";
      toast.error(message);
      throw error_;
    }
  };

  // Auto-refresh every 5 seconds
  useEffect(() => {
    void refreshCrons();
    const interval = setInterval(() => void refreshCrons(), 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <CronContext.Provider
      value={{
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
        getCronHistory: fetchCronHistory,
      }}
    >
      {children}
    </CronContext.Provider>
  );
}

export { CronContext };
