import { useEffect } from "react";
import FileTransferPanel from "./FileTransferPanel";
import type { UseFileTransferResult } from "./useFileTransfer";

type FileTransferDrawerProps = Readonly<{
  open: boolean;
  onClose: () => void;
  sessionId: string | null;
  sessionName: string;
  transfer: UseFileTransferResult;
}>;

export default function FileTransferDrawer({
  open,
  onClose,
  sessionId,
  sessionName,
  transfer,
}: FileTransferDrawerProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[75] hidden md:block">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-[2px]"
        aria-label="Close files drawer"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 h-full w-[26rem] border-l border-zinc-700 bg-zinc-950 p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-100">Files</p>
            <p className="truncate text-xs text-zinc-400" title={sessionName}>
              Active session: {sessionName}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="max-h-[calc(100vh-7rem)] overflow-y-auto pr-1">
          <FileTransferPanel
            variant="drawer"
            sessionId={sessionId}
            sessionName={sessionName}
            transfer={transfer}
          />
        </div>
      </div>
    </div>
  );
}
