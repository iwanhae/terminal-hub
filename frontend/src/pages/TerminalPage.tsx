import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import TerminalComponent, { type TerminalHandle } from "../components/Terminal";

export default function TerminalPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const terminalRef = useRef<TerminalHandle>(null);
  const [ctrlActive, setCtrlActive] = useState(false);
  const [filesPanelOpen, setFilesPanelOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadPath, setUploadPath] = useState("/tmp");
  const [uploadFilename, setUploadFilename] = useState("");
  const [downloadPath, setDownloadPath] = useState("");
  const [downloadFilename, setDownloadFilename] = useState("");
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [transferStatus, setTransferStatus] = useState("");

  const trimmedSessionId =
    typeof sessionId === "string" ? sessionId.trim() : "";

  useEffect(() => {
    if (trimmedSessionId !== "") return;

    const result = navigate("/");
    if (result instanceof Promise) {
      result.catch((error: Error) => {
        console.error(error);
      });
    }
  }, [navigate, trimmedSessionId]);

  // Determine WebSocket URL based on current protocol
  const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
  const wsUrl = `${protocol}${window.location.host}/ws/${trimmedSessionId}`;

  const send = useCallback((data: string) => {
    terminalRef.current?.sendInput(data);
  }, []);

  const sendCtrl = useCallback(
    (letter: string) => {
      const upper = letter.toUpperCase();
      if (upper.length !== 1) return;
      const codePoint = upper.codePointAt(0);
      if (codePoint === undefined) return;
      const code = codePoint - 64;
      if (code < 1 || code > 26) return;
      send(String.fromCodePoint(code));
    },
    [send],
  );

  const pasteFromClipboard = useCallback(() => {
    const promise = terminalRef.current?.pasteFromClipboard();
    if (promise != null) {
      promise.catch((error: Error) => {
        console.error(error);
      });
    }
  }, []);

  const handleFileSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      setSelectedFile(file);
      if (file) {
        setUploadFilename(file.name);
      }
    },
    [],
  );

  const uploadSelectedFile = useCallback(() => {
    const runUpload = async () => {
      if (selectedFile === null) {
        setTransferStatus("Select a file before uploading.");
        return;
      }

      const trimmedUploadPath = uploadPath.trim();
      const trimmedUploadFilename = uploadFilename.trim();
      if (trimmedUploadPath === "" || trimmedUploadFilename === "") {
        setTransferStatus("Upload path and filename are required.");
        return;
      }

      setUploading(true);
      setTransferStatus("Uploading...");

      let overwrite = false;
      try {
        for (;;) {
          const params = new URLSearchParams({
            path: trimmedUploadPath,
            filename: trimmedUploadFilename,
          });
          if (overwrite) {
            params.set("overwrite", "true");
          }

          const response = await fetch(`/api/upload?${params.toString()}`, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": selectedFile.type || "application/octet-stream",
            },
            body: selectedFile,
          });

          if (response.status === 409 && !overwrite) {
            const shouldOverwrite = window.confirm(
              `File "${trimmedUploadFilename}" already exists. Overwrite it?`,
            );
            if (!shouldOverwrite) {
              setTransferStatus("Upload canceled.");
              return;
            }
            overwrite = true;
            continue;
          }

          if (!response.ok) {
            const errorText = await response.text();
            setTransferStatus(`Upload failed: ${errorText}`);
            return;
          }

          const result = (await response.json()) as { size?: number };
          const sizeLabel =
            typeof result.size === "number"
              ? `${result.size} bytes`
              : "success";
          setTransferStatus(
            `Upload complete: ${trimmedUploadFilename} (${sizeLabel}).`,
          );
          return;
        }
      } catch (error) {
        console.error("Upload failed:", error);
        setTransferStatus("Upload failed: network or server error.");
      } finally {
        setUploading(false);
      }
    };

    runUpload().catch((error: Error) => {
      console.error("Upload failed:", error);
      setTransferStatus("Upload failed: network or server error.");
      setUploading(false);
    });
  }, [selectedFile, uploadFilename, uploadPath]);

  const downloadFile = useCallback(() => {
    const runDownload = async () => {
      const trimmedDownloadPath = downloadPath.trim();
      if (trimmedDownloadPath === "") {
        setTransferStatus("Download path is required.");
        return;
      }

      setDownloading(true);
      setTransferStatus("Preparing download...");
      try {
        const params = new URLSearchParams({ path: trimmedDownloadPath });
        const trimmedDownloadFilename = downloadFilename.trim();
        if (trimmedDownloadFilename !== "") {
          params.set("filename", trimmedDownloadFilename);
        }

        const response = await fetch(`/api/download?${params.toString()}`, {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok) {
          const errorText = await response.text();
          setTransferStatus(`Download failed: ${errorText}`);
          return;
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        if (trimmedDownloadFilename !== "") {
          anchor.download = trimmedDownloadFilename;
        }
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);

        const statusName =
          trimmedDownloadFilename === ""
            ? "requested file"
            : trimmedDownloadFilename;
        setTransferStatus(`Download started: ${statusName}.`);
      } catch (error) {
        console.error("Download failed:", error);
        setTransferStatus("Download failed: network or server error.");
      } finally {
        setDownloading(false);
      }
    };

    runDownload().catch((error: Error) => {
      console.error("Download failed:", error);
      setTransferStatus("Download failed: network or server error.");
      setDownloading(false);
    });
  }, [downloadFilename, downloadPath]);

  if (trimmedSessionId === "") return null;

  return (
    <div className="flex-1 flex flex-col w-full bg-black min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-2 py-2 bg-zinc-900 border-b border-zinc-800">
        <button
          type="button"
          className="px-3 py-1.5 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-700 text-sm"
          onClick={() => setFilesPanelOpen((current) => !current)}
        >
          {filesPanelOpen ? "Hide Files" : "Files"}
        </button>

        {transferStatus !== "" && (
          <p className="text-xs md:text-sm text-zinc-300 truncate max-w-[70%]">
            {transferStatus}
          </p>
        )}
      </div>

      {filesPanelOpen && (
        <div className="px-2 py-2 bg-zinc-950 border-b border-zinc-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-2">
              <p className="text-sm text-zinc-200 mb-2">Upload</p>
              <div className="space-y-2">
                <input
                  type="file"
                  className="block w-full text-sm text-zinc-200 file:mr-2 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-zinc-100"
                  onChange={handleFileSelect}
                  disabled={uploading}
                />
                <input
                  type="text"
                  className="w-full rounded-md bg-black border border-zinc-700 px-3 py-2 text-zinc-100 text-sm"
                  placeholder="/absolute/destination/directory"
                  value={uploadPath}
                  onChange={(event) => setUploadPath(event.target.value)}
                  disabled={uploading}
                />
                <input
                  type="text"
                  className="w-full rounded-md bg-black border border-zinc-700 px-3 py-2 text-zinc-100 text-sm"
                  placeholder="filename.ext"
                  value={uploadFilename}
                  onChange={(event) => setUploadFilename(event.target.value)}
                  disabled={uploading}
                />
                <button
                  type="button"
                  className="w-full rounded-md bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-2 text-sm disabled:opacity-50"
                  onClick={uploadSelectedFile}
                  disabled={uploading || selectedFile === null}
                >
                  {uploading ? "Uploading..." : "Upload File"}
                </button>
              </div>
            </div>

            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-2">
              <p className="text-sm text-zinc-200 mb-2">Download</p>
              <div className="space-y-2">
                <input
                  type="text"
                  className="w-full rounded-md bg-black border border-zinc-700 px-3 py-2 text-zinc-100 text-sm"
                  placeholder="/absolute/path/to/file.ext"
                  value={downloadPath}
                  onChange={(event) => setDownloadPath(event.target.value)}
                  disabled={downloading}
                />
                <input
                  type="text"
                  className="w-full rounded-md bg-black border border-zinc-700 px-3 py-2 text-zinc-100 text-sm"
                  placeholder="optional-download-name.ext"
                  value={downloadFilename}
                  onChange={(event) => setDownloadFilename(event.target.value)}
                  disabled={downloading}
                />
                <button
                  type="button"
                  className="w-full rounded-md bg-blue-700 hover:bg-blue-600 text-white px-3 py-2 text-sm disabled:opacity-50"
                  onClick={downloadFile}
                  disabled={downloading}
                >
                  {downloading ? "Downloading..." : "Download File"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 relative min-h-0">
        <TerminalComponent ref={terminalRef} wsUrl={wsUrl} />
      </div>

      <div className="md:hidden flex-shrink-0 px-2 pb-2 pt-1 bg-zinc-900 border-t border-zinc-800">
        <div className="flex items-center gap-1 flex-wrap justify-center">
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-800 text-zinc-100 border border-zinc-700"
            onClick={() => setFilesPanelOpen((current) => !current)}
          >
            Files
          </button>

          {/* Esc key */}
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-esc"
            onClick={() => send("\x1b")}
          >
            Esc
          </button>

          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-paste"
            onClick={pasteFromClipboard}
          >
            Paste
          </button>

          {/* Tab key */}
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-tab"
            onClick={() => send("\t")}
          >
            Tab
          </button>

          {/* Shift+Tab (Back Tab) */}
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-shift-tab"
            onClick={() => send("\x1b[Z")}
            title="Shift+Tab (Back Tab)"
          >
            ⇧Tab
          </button>

          {/* Sticky Ctrl toggle */}
          <button
            type="button"
            className={`px-2 py-1 rounded-md border transition-colors ${
              ctrlActive
                ? "bg-emerald-600 text-white border-emerald-500"
                : "bg-zinc-950 text-zinc-200 border-zinc-800"
            }`}
            data-testid="extra-key-ctrl"
            onClick={() => setCtrlActive((v) => !v)}
          >
            {ctrlActive ? "Ctrl●" : "Ctrl"}
          </button>

          {/* Dedicated Ctrl+C */}
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-ctrl-c"
            onClick={() => sendCtrl("C")}
          >
            Ctrl+C
          </button>

          {/* Dedicated Ctrl+D */}
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-ctrl-d"
            onClick={() => sendCtrl("D")}
          >
            Ctrl+D
          </button>

          {/* Dedicated Ctrl+Z */}
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-ctrl-z"
            onClick={() => sendCtrl("Z")}
          >
            Ctrl+Z
          </button>

          {/* Home key */}
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-home"
            onClick={() => send("\x1b[H")}
          >
            Home
          </button>

          {/* End key */}
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-end"
            onClick={() => send("\x1b[F")}
          >
            End
          </button>

          {/* D-pad arrow keys - cross pattern layout */}
          <div className="grid grid-cols-3 gap-0.5">
            {/* Top: Up arrow */}
            <div></div>
            <button
              type="button"
              className="w-10 h-8 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800 flex items-center justify-center"
              data-testid="extra-key-up"
              onClick={() => send("\x1b[A")}
            >
              ↑
            </button>
            <div></div>

            {/* Middle: Left, Down, Right */}
            <button
              type="button"
              className="w-10 h-8 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800 flex items-center justify-center"
              data-testid="extra-key-left"
              onClick={() => send("\x1b[D")}
            >
              ←
            </button>
            <button
              type="button"
              className="w-10 h-8 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800 flex items-center justify-center"
              data-testid="extra-key-down"
              onClick={() => send("\x1b[B")}
            >
              ↓
            </button>
            <button
              type="button"
              className="w-10 h-8 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800 flex items-center justify-center"
              data-testid="extra-key-right"
              onClick={() => send("\x1b[C")}
            >
              →
            </button>
          </div>

          {/* Dashboard button for navigation */}
          <button
            type="button"
            className="px-3 py-1 rounded-md bg-zinc-800 text-zinc-300 text-sm border border-zinc-700"
            onClick={() => {
              const result = navigate("/");
              if (result instanceof Promise) {
                result.catch((error: Error) => {
                  console.error(error);
                });
              }
            }}
            data-testid="back-to-dashboard"
          >
            ☖ Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
