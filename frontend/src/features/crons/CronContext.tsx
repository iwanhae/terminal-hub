import { createContext, useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import toast from "react-hot-toast";
import type {
  CronExecutionResult,
  CronJob,
  CreateCronRequest,
  UpdateCronRequest,
} from "./api";
import { cronsApi } from "./api";

interface RefreshCronsOptions {
  readonly silent?: boolean;
}

interface CronContextType {
  crons: CronJob[];
  loading: boolean;
  error: string | null;
  refreshCrons: (options?: RefreshCronsOptions) => Promise<void>;
  createCron: (request: CreateCronRequest) => Promise<string>;
  updateCron: (jobId: string, request: UpdateCronRequest) => Promise<void>;
  deleteCron: (jobId: string) => Promise<void>;
  runCronNow: (jobId: string) => Promise<CronExecutionResult>;
  enableCron: (jobId: string) => Promise<void>;
  disableCron: (jobId: string) => Promise<void>;
  getCronHistory: (jobId: string) => Promise<CronExecutionResult[]>;
}

const CronContext = createContext<CronContextType | undefined>(undefined);

function getErrorMessage(error_: unknown, fallback: string): string {
  if (error_ instanceof Error) {
    return error_.message;
  }

  return fallback;
}

function replaceCronJob(list: CronJob[], updatedJob: CronJob): CronJob[] {
  return list.map((item) => {
    if (item.id === updatedJob.id) {
      return updatedJob;
    }

    return item;
  });
}

export function CronProvider({ children }: { readonly children: ReactNode }) {
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshCrons = useCallback(async (options?: RefreshCronsOptions) => {
    const silent = options?.silent === true;

    if (!silent) {
      setLoading(true);
    }

    try {
      const data = await cronsApi.listCrons();
      setCrons(data);
      setError(null);
    } catch (error_) {
      const message = getErrorMessage(error_, "Failed to fetch cron jobs");
      setError(message);

      if (!silent) {
        toast.error(message);
      }

      throw error_;
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  const createCron = useCallback(
    async (request: CreateCronRequest): Promise<string> => {
      try {
        const response = await cronsApi.createCron(request);

        setCrons((previous) => {
          const remaining = previous.filter(
            (job) => job.id !== response.job.id,
          );
          return [response.job, ...remaining];
        });

        setError(null);
        toast.success(`Cron job "${request.name}" created successfully`);
        return response.id;
      } catch (error_) {
        const message = getErrorMessage(error_, "Failed to create cron job");
        toast.error(message);
        throw error_;
      }
    },
    [],
  );

  const updateCron = useCallback(
    async (jobId: string, request: UpdateCronRequest): Promise<void> => {
      try {
        const updatedJob = await cronsApi.updateCron(jobId, request);
        setCrons((previous) => replaceCronJob(previous, updatedJob));
        setError(null);
        toast.success("Cron job updated successfully");
      } catch (error_) {
        const message = getErrorMessage(error_, "Failed to update cron job");
        toast.error(message);
        throw error_;
      }
    },
    [],
  );

  const deleteCron = useCallback(async (jobId: string): Promise<void> => {
    try {
      await cronsApi.deleteCron(jobId);
      setCrons((previous) => previous.filter((job) => job.id !== jobId));
      setError(null);
      toast.success("Cron job deleted successfully");
    } catch (error_) {
      const message = getErrorMessage(error_, "Failed to delete cron job");
      toast.error(message);
      throw error_;
    }
  }, []);

  const runCronNow = useCallback(
    async (jobId: string): Promise<CronExecutionResult> => {
      try {
        const result = await cronsApi.runCronNow(jobId);
        toast.success("Cron job executed successfully");
        await refreshCrons({ silent: true });
        return result;
      } catch (error_) {
        const message = getErrorMessage(error_, "Failed to run cron job");
        toast.error(message);
        throw error_;
      }
    },
    [refreshCrons],
  );

  const enableCron = useCallback(
    async (jobId: string): Promise<void> => {
      try {
        await cronsApi.enableCron(jobId);

        setCrons((previous) =>
          previous.map((job) => {
            if (job.id === jobId) {
              return {
                ...job,
                enabled: true,
              };
            }

            return job;
          }),
        );

        toast.success("Cron job enabled");
        await refreshCrons({ silent: true });
      } catch (error_) {
        const message = getErrorMessage(error_, "Failed to enable cron job");
        toast.error(message);
        throw error_;
      }
    },
    [refreshCrons],
  );

  const disableCron = useCallback(
    async (jobId: string): Promise<void> => {
      try {
        await cronsApi.disableCron(jobId);

        setCrons((previous) =>
          previous.map((job) => {
            if (job.id === jobId) {
              return {
                ...job,
                enabled: false,
              };
            }

            return job;
          }),
        );

        toast.success("Cron job disabled");
        await refreshCrons({ silent: true });
      } catch (error_) {
        const message = getErrorMessage(error_, "Failed to disable cron job");
        toast.error(message);
        throw error_;
      }
    },
    [refreshCrons],
  );

  const getCronHistory = useCallback(
    async (jobId: string): Promise<CronExecutionResult[]> => {
      try {
        return await cronsApi.getCronHistory(jobId);
      } catch (error_) {
        const message = getErrorMessage(error_, "Failed to get cron history");
        toast.error(message);
        throw error_;
      }
    },
    [],
  );

  useEffect(() => {
    void refreshCrons().catch(() => {});
  }, [refreshCrons]);

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
        getCronHistory,
      }}
    >
      {children}
    </CronContext.Provider>
  );
}

export { CronContext };
