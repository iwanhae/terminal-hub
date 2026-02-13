import { useState } from "react";
import FilePickerDialog from "./FilePickerDialog";
import type { UseFileTransferResult } from "./useFileTransfer";

type FileTransferPanelVariant = "sidebar" | "popover" | "mobile-sheet";

type FileTransferPanelProps = Readonly<{
  variant: FileTransferPanelVariant;
  sessionId: string | null;
  sessionName: string;
  transfer: UseFileTransferResult;
}>;

function basename(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/");
  return parts.at(-1) ?? path;
}

export default function FileTransferPanel({
  variant,
  sessionId,
  sessionName,
  transfer,
}: FileTransferPanelProps) {
  const [uploadPickerOpen, setUploadPickerOpen] = useState(false);
  const [downloadPickerOpen, setDownloadPickerOpen] = useState(false);
  const hasSession = sessionId != null && sessionId.trim() !== "";

  const panelClassName =
    variant === "sidebar"
      ? "rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 space-y-3"
      : "rounded-lg border border-zinc-700 bg-zinc-900 p-3 space-y-3";

  return (
    <>
      <div className={panelClassName}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-zinc-100">File Transfers</p>
          <p
            className="text-[11px] text-zinc-400 truncate max-w-[55%]"
            title={sessionName}
          >
            Session: {sessionName}
          </p>
        </div>

        {!hasSession && (
          <p className="text-xs text-amber-200 rounded-md border border-amber-700/50 bg-amber-900/20 px-2 py-1">
            No session context available. Open a session to
            browse/upload/download files.
          </p>
        )}

        <div className="rounded-md border border-zinc-800 bg-zinc-900/80 p-2 space-y-2">
          <p className="text-xs uppercase tracking-wide text-zinc-400">
            Upload
          </p>
          <input
            type="file"
            className="block w-full text-xs text-zinc-200 file:mr-2 file:rounded-md file:border-0 file:bg-zinc-800 file:px-2 file:py-1.5 file:text-zinc-100"
            onChange={transfer.handleFileSelect}
            disabled={transfer.uploading || !hasSession}
          />
          <div className="flex gap-2">
            <input
              type="text"
              className="w-full rounded-md bg-black border border-zinc-700 px-2 py-1.5 text-zinc-100 text-xs"
              placeholder="/absolute/destination/directory"
              value={transfer.uploadPath}
              onChange={(event) => transfer.setUploadPath(event.target.value)}
              disabled={transfer.uploading || !hasSession}
            />
            <button
              type="button"
              className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 disabled:opacity-40"
              disabled={transfer.uploading || !hasSession}
              onClick={() => setUploadPickerOpen(true)}
            >
              Browse
            </button>
          </div>
          <input
            type="text"
            className="w-full rounded-md bg-black border border-zinc-700 px-2 py-1.5 text-zinc-100 text-xs"
            placeholder="filename.ext"
            value={transfer.uploadFilename}
            onChange={(event) => transfer.setUploadFilename(event.target.value)}
            disabled={transfer.uploading || !hasSession}
          />
          <button
            type="button"
            className="w-full rounded-md bg-emerald-700 hover:bg-emerald-600 text-white px-2 py-1.5 text-xs disabled:opacity-50"
            onClick={transfer.uploadSelectedFile}
            disabled={
              transfer.uploading ||
              transfer.selectedFile === null ||
              !hasSession
            }
          >
            {transfer.uploading ? "Uploading..." : "Upload File"}
          </button>
        </div>

        <div className="rounded-md border border-zinc-800 bg-zinc-900/80 p-2 space-y-2">
          <p className="text-xs uppercase tracking-wide text-zinc-400">
            Download
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              className="w-full rounded-md bg-black border border-zinc-700 px-2 py-1.5 text-zinc-100 text-xs"
              placeholder="/absolute/path/to/file.ext"
              value={transfer.downloadPath}
              onChange={(event) => transfer.setDownloadPath(event.target.value)}
              disabled={transfer.downloading || !hasSession}
            />
            <button
              type="button"
              className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 disabled:opacity-40"
              disabled={transfer.downloading || !hasSession}
              onClick={() => setDownloadPickerOpen(true)}
            >
              Browse
            </button>
          </div>
          <input
            type="text"
            className="w-full rounded-md bg-black border border-zinc-700 px-2 py-1.5 text-zinc-100 text-xs"
            placeholder="optional-download-name.ext"
            value={transfer.downloadFilename}
            onChange={(event) =>
              transfer.setDownloadFilename(event.target.value)
            }
            disabled={transfer.downloading || !hasSession}
          />
          <button
            type="button"
            className="w-full rounded-md bg-blue-700 hover:bg-blue-600 text-white px-2 py-1.5 text-xs disabled:opacity-50"
            onClick={transfer.downloadFile}
            disabled={transfer.downloading || !hasSession}
          >
            {transfer.downloading ? "Downloading..." : "Download File"}
          </button>
        </div>

        {transfer.transferStatus !== "" && (
          <p className="text-xs text-zinc-300 rounded-md border border-zinc-800 bg-black/40 px-2 py-1.5">
            {transfer.transferStatus}
          </p>
        )}
      </div>

      <FilePickerDialog
        open={uploadPickerOpen}
        title="Choose Upload Destination"
        mode="directory"
        sessionId={sessionId}
        initialPath={transfer.uploadPath}
        onClose={() => setUploadPickerOpen(false)}
        onSelect={(path) => {
          transfer.setUploadPath(path);
          transfer.setTransferStatus(`Upload destination selected: ${path}`);
        }}
      />

      <FilePickerDialog
        open={downloadPickerOpen}
        title="Choose File to Download"
        mode="file"
        sessionId={sessionId}
        initialPath={transfer.downloadPath}
        onClose={() => setDownloadPickerOpen(false)}
        onSelect={(path) => {
          transfer.setDownloadPath(path);
          if (transfer.downloadFilename.trim() === "") {
            transfer.setDownloadFilename(basename(path));
          }
          transfer.setTransferStatus(`Download source selected: ${path}`);
        }}
      />
    </>
  );
}
