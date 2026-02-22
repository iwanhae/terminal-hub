import { useEffect, useId, useRef } from "react";
import toast from "react-hot-toast";

type CopyTextModalProps = Readonly<{
  open: boolean;
  content: string;
  onClose: () => void;
}>;

const AUTO_FOCUS_DELAY_MS = 75;

export default function CopyTextModal({
  open,
  content,
  onClose,
}: CopyTextModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const focusTimeout = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, AUTO_FOCUS_DELAY_MS);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(focusTimeout);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  const handleCopyAll = async () => {
    if (content.length === 0) {
      toast.error("No visible terminal text to copy");
      return;
    }

    if (
      navigator.clipboard == null ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      toast.error("Clipboard API is not available in this browser");
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      toast.success("Copied terminal text");
    } catch (error) {
      console.error("Clipboard copy error:", error);
      toast.error("Failed to copy terminal text");
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[110] p-4">
      <button
        type="button"
        aria-label="Close copy text modal"
        className="absolute inset-0 h-full w-full bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-testid="copy-text-modal"
        className="relative z-10 mx-auto mt-10 flex max-h-[calc(100vh-5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-zinc-100">
              Copy Text
            </h2>
            <p id={descriptionId} className="text-sm text-zinc-400">
              Plain snapshot of the visible terminal viewport.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
              onClick={() => {
                void handleCopyAll();
              }}
              data-testid="copy-text-copy-all"
            >
              Copy All
            </button>
            <button
              type="button"
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
        <div className="p-4">
          <textarea
            ref={textareaRef}
            readOnly
            value={content}
            placeholder="No visible terminal text yet. Run a command, then reopen Copy Text."
            spellCheck={false}
            data-testid="copy-text-content"
            className="h-[min(60vh,38rem)] w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 p-3 font-mono text-sm leading-6 text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500/60"
          />
        </div>
      </div>
    </div>
  );
}
