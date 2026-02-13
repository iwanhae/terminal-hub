import { useEffect, type ChangeEvent } from "react";
import { useFileBrowser } from "./useFileBrowser";

type FilePickerMode = "directory" | "file";

type FilePickerDialogProps = Readonly<{
  open: boolean;
  title: string;
  mode: FilePickerMode;
  sessionId: string | null;
  initialPath: string;
  onClose: () => void;
  onSelect: (path: string) => void;
}>;

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  if (size < 1024 * 1024 * 1024)
    return `${Math.round(size / (1024 * 1024))} MB`;
  return `${Math.round(size / (1024 * 1024 * 1024))} GB`;
}

export default function FilePickerDialog({
  open,
  title,
  mode,
  sessionId,
  initialPath,
  onClose,
  onSelect,
}: FilePickerDialogProps) {
  const {
    rootPath,
    currentPath,
    parentPath,
    entries,
    loading,
    error,
    showHidden,
    setShowHidden,
    browsePath,
    openDirectory,
    goUp,
    refresh,
    reset,
  } = useFileBrowser(sessionId);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }

    const targetPath =
      initialPath.trim() === "" ? undefined : initialPath.trim();
    void browsePath(targetPath);
  }, [browsePath, initialPath, open, reset]);

  const handleToggleHidden = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.checked;
    setShowHidden(nextValue);
    const targetPath = currentPath.trim() === "" ? undefined : currentPath;
    void browsePath(targetPath, nextValue);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close file picker dialog"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-zinc-100">{title}</p>
            <p className="text-xs text-zinc-400 truncate">
              {currentPath === "" ? "Loading..." : currentPath}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="border-b border-zinc-800 px-4 py-3 flex flex-wrap gap-2 items-center">
          <button
            type="button"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1 text-sm text-zinc-200 disabled:opacity-40"
            onClick={goUp}
            disabled={loading || parentPath === ""}
          >
            Up
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1 text-sm text-zinc-200 disabled:opacity-40"
            onClick={refresh}
            disabled={loading}
          >
            Refresh
          </button>
          {mode === "directory" && (
            <button
              type="button"
              className="rounded-md border border-emerald-600/60 bg-emerald-700/20 px-3 py-1 text-sm text-emerald-200 disabled:opacity-40"
              onClick={() => {
                if (currentPath === "") return;
                onSelect(currentPath);
                onClose();
              }}
              disabled={loading || currentPath === ""}
            >
              Use Current Folder
            </button>
          )}
          <label className="ml-auto inline-flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={handleToggleHidden}
              disabled={loading}
            />
            Show hidden
          </label>
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {error !== "" && (
            <p className="px-4 py-3 text-sm text-red-300 border-b border-zinc-800 bg-red-900/20">
              {error}
            </p>
          )}

          {rootPath !== "" && (
            <div className="px-4 py-2 text-xs text-zinc-500 border-b border-zinc-800">
              Root: {rootPath}
            </div>
          )}

          {loading && (
            <p className="px-4 py-4 text-sm text-zinc-400">Loading...</p>
          )}

          {!loading && entries.length === 0 && (
            <p className="px-4 py-4 text-sm text-zinc-500">No entries</p>
          )}

          {!loading &&
            entries.map((entry) => {
              const isFileSelectable = mode === "file" && !entry.is_directory;
              return (
                <div
                  key={entry.path}
                  className="flex items-center gap-3 border-b border-zinc-800/60 px-4 py-2 text-sm"
                >
                  <span className="text-[11px] text-zinc-500">
                    {entry.is_directory ? "[DIR]" : "[FILE]"}
                  </span>
                  <button
                    type="button"
                    className={`min-w-0 flex-1 truncate text-left ${
                      entry.is_directory
                        ? "text-zinc-100 hover:text-emerald-300"
                        : "text-zinc-300"
                    }`}
                    onClick={() => {
                      if (!entry.is_directory) return;
                      openDirectory(entry.path);
                    }}
                    disabled={loading || !entry.is_directory}
                    title={entry.path}
                  >
                    {entry.name}
                  </button>
                  {!entry.is_directory && (
                    <span className="text-xs text-zinc-500">
                      {formatSize(entry.size)}
                    </span>
                  )}
                  {isFileSelectable && (
                    <button
                      type="button"
                      className="rounded-md border border-blue-600/70 bg-blue-700/20 px-2 py-1 text-xs text-blue-200 hover:bg-blue-700/35"
                      onClick={() => {
                        onSelect(entry.path);
                        onClose();
                      }}
                    >
                      Select
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
