import { useCallback, useRef, useState } from "react";
import { browseFiles, type FileBrowserEntry } from "./fileBrowserApi";

export interface UseFileBrowserResult {
  rootPath: string;
  currentPath: string;
  parentPath: string;
  entries: FileBrowserEntry[];
  loading: boolean;
  error: string;
  showHidden: boolean;
  setShowHidden: (value: boolean) => void;
  browsePath: (path?: string, showHiddenOverride?: boolean) => Promise<void>;
  openDirectory: (path: string) => void;
  goUp: () => void;
  refresh: () => void;
  reset: () => void;
}

export function useFileBrowser(sessionId: string | null): UseFileBrowserResult {
  const [rootPath, setRootPath] = useState("");
  const [currentPath, setCurrentPath] = useState("");
  const [parentPath, setParentPath] = useState("");
  const [entries, setEntries] = useState<FileBrowserEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showHidden, setShowHiddenState] = useState(false);
  const showHiddenRef = useRef(false);

  const setShowHidden = useCallback((value: boolean) => {
    showHiddenRef.current = value;
    setShowHiddenState(value);
  }, []);

  const reset = useCallback(() => {
    setRootPath("");
    setCurrentPath("");
    setParentPath("");
    setEntries([]);
    setError("");
    setLoading(false);
  }, []);

  const browsePath = useCallback(
    async (path?: string, showHiddenOverride?: boolean) => {
      if (sessionId == null || sessionId.trim() === "") {
        setError("No session context available.");
        setEntries([]);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const response = await browseFiles(
          sessionId,
          path,
          showHiddenOverride ?? showHiddenRef.current,
        );
        setRootPath(response.root);
        setCurrentPath(response.current);
        setParentPath(response.parent ?? "");
        setEntries(response.entries);
      } catch (error_) {
        const message =
          error_ instanceof Error ? error_.message : "Failed to browse files";
        setError(message);
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [sessionId],
  );

  const openDirectory = useCallback(
    (path: string) => {
      void browsePath(path);
    },
    [browsePath],
  );

  const goUp = useCallback(() => {
    if (parentPath === "") return;
    void browsePath(parentPath);
  }, [browsePath, parentPath]);

  const refresh = useCallback(() => {
    const target = currentPath.trim() === "" ? undefined : currentPath;
    void browsePath(target);
  }, [browsePath, currentPath]);

  return {
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
  };
}
