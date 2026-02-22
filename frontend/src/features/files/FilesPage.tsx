import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  ArrowUp,
  Download,
  Eye,
  EyeOff,
  File,
  Folder,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  browseWorkspaceFiles,
  downloadWorkspaceFile,
  isUploadWorkspaceRequestError,
  uploadWorkspaceFile,
  type FilesWorkspaceEntry,
} from "./api";

const maxParallelUploads = 3;
const maxUploadHistoryItems = 150;

type UploadStatus = "queued" | "uploading" | "completed" | "failed" | "skipped";

type UploadItem = Readonly<{
  id: string;
  batchId: number;
  fileName: string;
  destinationPath: string;
  totalBytes: number;
  sentBytes: number;
  progressPercent: number;
  status: UploadStatus;
  message: string;
}>;

type PendingUploadTask = Readonly<{
  id: string;
  batchId: number;
  file: File;
  destinationPath: string;
  fileName: string;
}>;

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${String(size)} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getErrorMessage(error_: unknown, fallback: string): string {
  if (error_ instanceof Error) {
    return error_.message;
  }
  return fallback;
}

function uploadStatusClass(status: UploadStatus): string {
  switch (status) {
    case "completed": {
      return "text-emerald-300 border-emerald-600/40 bg-emerald-700/20";
    }
    case "failed": {
      return "text-red-300 border-red-600/40 bg-red-700/20";
    }
    case "skipped": {
      return "text-amber-300 border-amber-600/40 bg-amber-700/20";
    }
    case "uploading": {
      return "text-blue-300 border-blue-600/40 bg-blue-700/20";
    }
    default: {
      return "text-zinc-300 border-zinc-700 bg-zinc-800/60";
    }
  }
}

function uploadProgressClass(status: UploadStatus): string {
  if (status === "failed") {
    return "bg-red-500";
  }
  if (status === "completed") {
    return "bg-emerald-500";
  }
  if (status === "skipped") {
    return "bg-amber-500";
  }
  return "bg-blue-500";
}

export default function FilesPage() {
  const [rootPath, setRootPath] = useState("");
  const [currentPath, setCurrentPath] = useState("");
  const [parentPath, setParentPath] = useState("");
  const [entries, setEntries] = useState<FilesWorkspaceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [lastCompletedBatchId, setLastCompletedBatchId] = useState(0);

  const showHiddenRef = useRef(showHidden);
  const browseRequestIDRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadItemsRef = useRef<UploadItem[]>([]);
  const pendingUploadsRef = useRef<PendingUploadTask[]>([]);
  const activeUploadCountRef = useRef(0);
  const nextUploadIDRef = useRef(1);
  const nextBatchIDRef = useRef(1);
  const lastCompletedBatchIdRef = useRef(0);

  useEffect(() => {
    showHiddenRef.current = showHidden;
  }, [showHidden]);

  useEffect(() => {
    uploadItemsRef.current = uploadItems;
  }, [uploadItems]);

  const loadDirectory = useCallback(
    async (path?: string, showHiddenOverride?: boolean) => {
      const requestID = browseRequestIDRef.current + 1;
      browseRequestIDRef.current = requestID;

      setLoading(true);
      setError(null);

      try {
        const response = await browseWorkspaceFiles(
          path,
          showHiddenOverride ?? showHiddenRef.current,
        );
        if (requestID !== browseRequestIDRef.current) {
          return;
        }

        setRootPath(response.root);
        setCurrentPath(response.current);
        setParentPath(response.parent ?? "");
        setEntries(response.entries);
      } catch (error_) {
        if (requestID !== browseRequestIDRef.current) {
          return;
        }

        const message = getErrorMessage(error_, "Failed to browse files");
        setError(message);
      } finally {
        if (requestID === browseRequestIDRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void loadDirectory().catch(() => {});
  }, [loadDirectory]);

  const refreshCurrentDirectory = useCallback(() => {
    const targetPath = currentPath.trim() === "" ? undefined : currentPath;
    void loadDirectory(targetPath).catch(() => {});
  }, [currentPath, loadDirectory]);

  const updateUploadItem = useCallback(
    (itemID: string, updater: (item: UploadItem) => UploadItem) => {
      setUploadItems((previous) => {
        const next = previous.map((item) =>
          item.id === itemID ? updater(item) : item,
        );
        uploadItemsRef.current = next;
        return next;
      });
    },
    [],
  );

  const finalizeUploadsIfIdle = useCallback(() => {
    if (
      activeUploadCountRef.current > 0 ||
      pendingUploadsRef.current.length > 0
    ) {
      return;
    }

    const unsummarizedItems = uploadItemsRef.current.filter(
      (item) => item.batchId > lastCompletedBatchIdRef.current,
    );
    if (unsummarizedItems.length === 0) {
      return;
    }

    let maxBatchID = lastCompletedBatchIdRef.current;
    for (const item of unsummarizedItems) {
      maxBatchID = Math.max(maxBatchID, item.batchId);
    }

    const completedCount = unsummarizedItems.filter(
      (item) => item.status === "completed",
    ).length;
    const skippedCount = unsummarizedItems.filter(
      (item) => item.status === "skipped",
    ).length;
    const failedCount = unsummarizedItems.filter(
      (item) => item.status === "failed",
    ).length;

    const summary = `Uploads finished: ${String(completedCount)} uploaded, ${String(skippedCount)} skipped, ${String(failedCount)} failed.`;
    if (failedCount > 0) {
      toast.error(summary);
    } else {
      toast.success(summary);
    }

    lastCompletedBatchIdRef.current = maxBatchID;
    setLastCompletedBatchId(maxBatchID);
    refreshCurrentDirectory();
  }, [refreshCurrentDirectory]);

  const runUploadTask = useCallback(
    async (task: PendingUploadTask) => {
      const updateProgress = (loaded: number, total: number) => {
        const safeTotal = total <= 0 ? task.file.size : total;
        const clampedLoaded = Math.min(Math.max(loaded, 0), safeTotal);
        const percent =
          safeTotal === 0 ? 100 : Math.round((clampedLoaded / safeTotal) * 100);

        updateUploadItem(task.id, (item) => ({
          ...item,
          sentBytes: clampedLoaded,
          totalBytes: safeTotal,
          progressPercent: percent,
          status: "uploading",
          message: "Uploading...",
        }));
      };

      try {
        const initialResponse = await uploadWorkspaceFile({
          file: task.file,
          destinationPath: task.destinationPath,
          filename: task.fileName,
          overwrite: false,
          onProgress: updateProgress,
        });

        updateUploadItem(task.id, (item) => ({
          ...item,
          sentBytes: item.totalBytes,
          progressPercent: 100,
          status: "completed",
          message:
            initialResponse.overwritten === true
              ? "Uploaded (overwritten)"
              : "Uploaded",
        }));
        return;
      } catch (error_) {
        if (
          isUploadWorkspaceRequestError(error_) &&
          error_.status === httpStatusConflict
        ) {
          const shouldOverwrite = window.confirm(
            `File "${task.fileName}" already exists in "${task.destinationPath}". Overwrite it?`,
          );
          if (!shouldOverwrite) {
            updateUploadItem(task.id, (item) => ({
              ...item,
              status: "skipped",
              message: "Skipped (already exists)",
            }));
            return;
          }

          try {
            await uploadWorkspaceFile({
              file: task.file,
              destinationPath: task.destinationPath,
              filename: task.fileName,
              overwrite: true,
              onProgress: updateProgress,
            });

            updateUploadItem(task.id, (item) => ({
              ...item,
              sentBytes: item.totalBytes,
              progressPercent: 100,
              status: "completed",
              message: "Uploaded (overwritten)",
            }));
            return;
          } catch (retryError_) {
            const retryMessage = getErrorMessage(
              retryError_,
              "Failed to upload file",
            );
            updateUploadItem(task.id, (item) => ({
              ...item,
              status: "failed",
              message: retryMessage,
            }));
            return;
          }
        }

        const message = getErrorMessage(error_, "Failed to upload file");
        updateUploadItem(task.id, (item) => ({
          ...item,
          status: "failed",
          message,
        }));
      }
    },
    [updateUploadItem],
  );

  const pumpUploadQueue = useCallback(() => {
    while (activeUploadCountRef.current < maxParallelUploads) {
      const nextTask = pendingUploadsRef.current.shift();
      if (nextTask == null) {
        break;
      }

      activeUploadCountRef.current += 1;

      void runUploadTask(nextTask)
        .catch((error: Error) => {
          console.error(error);
        })
        .finally(() => {
          activeUploadCountRef.current -= 1;
          pumpUploadQueue();
        });
    }

    finalizeUploadsIfIdle();
  }, [finalizeUploadsIfIdle, runUploadTask]);

  const enqueueFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      const destinationPath = currentPath.trim();
      if (destinationPath === "") {
        toast.error("Destination folder is not ready yet.");
        return;
      }

      const batchID = nextBatchIDRef.current;
      nextBatchIDRef.current += 1;

      const tasks: PendingUploadTask[] = files.map((file) => {
        const id = `upload-${String(nextUploadIDRef.current)}`;
        nextUploadIDRef.current += 1;
        return {
          id,
          batchId: batchID,
          file,
          destinationPath,
          fileName: file.name,
        };
      });

      pendingUploadsRef.current.push(...tasks);

      const newItems = tasks.map((task) => ({
        id: task.id,
        batchId: task.batchId,
        fileName: task.fileName,
        destinationPath: task.destinationPath,
        totalBytes: task.file.size,
        sentBytes: 0,
        progressPercent: 0,
        status: "queued",
        message: "Queued",
      })) satisfies UploadItem[];

      setUploadItems((previous) => {
        const next = [...newItems, ...previous].slice(0, maxUploadHistoryItems);
        uploadItemsRef.current = next;
        return next;
      });

      pumpUploadQueue();
    },
    [currentPath, pumpUploadQueue],
  );

  const enqueueFileList = useCallback(
    (fileList: FileList | null) => {
      if (fileList == null || fileList.length === 0) {
        return;
      }
      enqueueFiles([...fileList]);
    },
    [enqueueFiles],
  );

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    enqueueFileList(event.target.files);
    event.target.value = "";
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    enqueueFileList(event.dataTransfer.files);
  };

  const handleEntryClick = (entry: FilesWorkspaceEntry) => {
    if (entry.is_directory) {
      void loadDirectory(entry.path).catch(() => {});
      return;
    }

    setDownloadingPath(entry.path);
    downloadWorkspaceFile(entry.path, entry.name)
      .then(() => {
        toast.success(`Download started: ${entry.name}`);
      })
      .catch((error_: Error) => {
        toast.error(getErrorMessage(error_, "Failed to download file"));
      })
      .finally(() => {
        setDownloadingPath(null);
      });
  };

  const pendingUploadCount = useMemo(
    () =>
      uploadItems.filter(
        (item) => item.status === "queued" || item.status === "uploading",
      ).length,
    [uploadItems],
  );

  const aggregateProgress = useMemo(() => {
    const activeBatchItems = uploadItems.filter(
      (item) => item.batchId > lastCompletedBatchId,
    );
    if (activeBatchItems.length === 0) {
      return null;
    }

    let totalBytes = 0;
    let sentBytes = 0;
    for (const item of activeBatchItems) {
      totalBytes += item.totalBytes;
      sentBytes +=
        item.status === "completed"
          ? item.totalBytes
          : Math.min(item.sentBytes, item.totalBytes);
    }

    const percent =
      totalBytes <= 0
        ? 0
        : Math.min(100, Math.round((sentBytes / totalBytes) * 100));
    return {
      totalBytes,
      sentBytes,
      percent,
    };
  }, [lastCompletedBatchId, uploadItems]);

  const displayedUploadItems = uploadItems.slice(0, 20);

  const directoryBodyContent = (() => {
    if (loading) {
      return (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-zinc-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading files...
        </div>
      );
    }

    if (entries.length === 0) {
      return (
        <p className="px-4 py-6 text-sm text-zinc-400">
          This directory is empty.
        </p>
      );
    }

    return (
      <table className="w-full table-auto text-left text-sm text-zinc-300">
        <thead className="sticky top-0 bg-zinc-900/95 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Size</th>
            <th className="px-4 py-2 font-medium">Modified</th>
            <th className="px-4 py-2 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const isDownloading = downloadingPath === entry.path;
            let actionContent: ReactNode = "Open";
            if (!entry.is_directory) {
              actionContent = isDownloading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Downloading
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Download
                </>
              );
            }

            return (
              <tr
                key={entry.path}
                className="border-t border-zinc-800/70 hover:bg-zinc-800/40"
              >
                <td className="px-4 py-2">
                  <button
                    type="button"
                    className={`inline-flex w-full items-center gap-2 truncate text-left ${
                      entry.is_directory
                        ? "text-zinc-100 hover:text-emerald-300"
                        : "text-zinc-200 hover:text-blue-300"
                    }`}
                    title={entry.path}
                    onClick={() => handleEntryClick(entry)}
                  >
                    {entry.is_directory ? (
                      <Folder className="h-4 w-4 text-amber-300" />
                    ) : (
                      <File className="h-4 w-4 text-zinc-400" />
                    )}
                    <span className="truncate">{entry.name}</span>
                  </button>
                </td>
                <td className="px-4 py-2 text-xs text-zinc-400">
                  {entry.is_directory ? "—" : formatBytes(entry.size)}
                </td>
                <td className="px-4 py-2 text-xs text-zinc-400">
                  {formatDateTime(entry.modified_at)}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                    onClick={() => handleEntryClick(entry)}
                    disabled={isDownloading}
                  >
                    {actionContent}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  })();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">
              Workspace
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-100 md:text-3xl">
              Files Workspace
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Browse directories, click files to download, and upload multiple
              files with live progress.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              onClick={() => {
                if (parentPath.trim() === "") {
                  return;
                }
                void loadDirectory(parentPath).catch(() => {});
              }}
              disabled={loading || parentPath.trim() === ""}
            >
              <ArrowUp className="h-4 w-4" />
              Up
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              onClick={refreshCurrentDirectory}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              onClick={() => {
                const nextValue = !showHidden;
                setShowHidden(nextValue);
                const targetPath =
                  currentPath.trim() === "" ? undefined : currentPath;
                void loadDirectory(targetPath, nextValue).catch(() => {});
              }}
              disabled={loading}
            >
              {showHidden ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              {showHidden ? "Hide Hidden" : "Show Hidden"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Root</p>
          <p className="mt-1 break-all font-mono text-sm text-zinc-200">
            {rootPath === "" ? "Loading..." : rootPath}
          </p>
          <p className="mt-3 text-xs uppercase tracking-wide text-zinc-500">
            Current Directory
          </p>
          <p className="mt-1 break-all font-mono text-sm text-zinc-100">
            {currentPath === "" ? "Loading..." : currentPath}
          </p>
        </div>

        {error != null && error.trim() !== "" && (
          <div className="rounded-xl border border-red-700/50 bg-red-900/20 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/60">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-100">
                Directory Browser
              </h2>
              <p className="text-xs text-zinc-400">
                {loading ? "Loading..." : `${String(entries.length)} items`}
              </p>
            </div>

            <div className="max-h-[34rem] overflow-auto">
              {directoryBodyContent}
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-100">Upload</h2>
                <p className="text-xs text-zinc-400">
                  Parallel limit: {String(maxParallelUploads)}
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileInputChange}
              />

              <button
                type="button"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                onClick={() => fileInputRef.current?.click()}
                disabled={currentPath.trim() === ""}
              >
                <Upload className="h-4 w-4" />
                Select Files
              </button>

              <div
                className={`mt-3 rounded-lg border-2 border-dashed px-3 py-6 text-center text-sm transition-colors ${
                  isDragOver
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-200"
                    : "border-zinc-700 bg-zinc-950/50 text-zinc-400"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                Drag and drop files here
              </div>

              {aggregateProgress != null && (
                <div className="mt-4 space-y-2 rounded-md border border-zinc-700 bg-zinc-950/60 p-3">
                  <div className="flex items-center justify-between text-xs text-zinc-300">
                    <span>Batch progress</span>
                    <span>{String(aggregateProgress.percent)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-zinc-800">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${String(aggregateProgress.percent)}%` }}
                    />
                  </div>
                  <div className="text-xs text-zinc-400">
                    {formatBytes(aggregateProgress.sentBytes)} /{" "}
                    {formatBytes(aggregateProgress.totalBytes)}
                  </div>
                </div>
              )}

              <p className="mt-3 text-xs text-zinc-500">
                Destination:{" "}
                <span className="font-mono text-zinc-300">{currentPath}</span>
              </p>
              {pendingUploadCount > 0 && (
                <p className="mt-1 text-xs text-zinc-400">
                  {String(pendingUploadCount)} file(s) in queue.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <h3 className="text-sm font-semibold text-zinc-100">
                  Upload Activity
                </h3>
                {uploadItems.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-zinc-400 hover:text-zinc-200"
                    onClick={() => {
                      setUploadItems([]);
                      uploadItemsRef.current = [];
                      lastCompletedBatchIdRef.current = 0;
                      setLastCompletedBatchId(0);
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="max-h-[22rem] space-y-2 overflow-y-auto p-3">
                {displayedUploadItems.length === 0 ? (
                  <p className="text-sm text-zinc-500">No uploads yet.</p>
                ) : (
                  displayedUploadItems.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p
                            className="truncate text-sm font-medium text-zinc-200"
                            title={item.fileName}
                          >
                            {item.fileName}
                          </p>
                          <p
                            className="truncate text-xs text-zinc-500"
                            title={item.destinationPath}
                          >
                            {item.destinationPath}
                          </p>
                        </div>
                        <span
                          className={`rounded border px-2 py-0.5 text-[11px] uppercase tracking-wide ${uploadStatusClass(item.status)}`}
                        >
                          {item.status}
                        </span>
                      </div>

                      <div className="mt-2 h-1.5 overflow-hidden rounded bg-zinc-800">
                        <div
                          className={`h-full transition-all ${uploadProgressClass(item.status)}`}
                          style={{ width: `${String(item.progressPercent)}%` }}
                        />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-zinc-400">
                        <span>
                          {formatBytes(item.sentBytes)} /{" "}
                          {formatBytes(item.totalBytes)}
                        </span>
                        <span>{String(item.progressPercent)}%</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {item.message}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const httpStatusConflict = 409;
