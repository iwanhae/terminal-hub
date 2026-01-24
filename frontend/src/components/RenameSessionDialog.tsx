import React, { useState } from "react";
import { useSessions } from "../contexts/useSessions";

interface RenameSessionDialogProps {
  readonly sessionId: string;
  readonly currentName: string;
  readonly onClose: () => void;
}

export default function RenameSessionDialog({
  sessionId,
  currentName,
  onClose,
}: RenameSessionDialogProps) {
  const { updateSessionName } = useSessions();
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    // Small timeout to ensure element is mounted/visible before focusing
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 200);
    return () => clearTimeout(timer);
  }, [currentName]);

  const handleSubmit = async () => {
    if (!name.trim() || name.trim() === currentName) return;

    setLoading(true);
    try {
      await updateSessionName(sessionId, name.trim());
      onClose();
    } catch (error) {
      console.error("Failed to rename session:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void handleSubmit().catch((error: Error) => {
      console.error("Failed to submit form:", error);
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="button"
      tabIndex={0}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl w-full max-w-md"
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <span className="text-indigo-400">✏️</span> Rename Session
          </h2>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="session-name"
                className="block text-sm font-medium text-zinc-400 mb-1"
              >
                Session Name <span className="text-red-400">*</span>
              </label>
              <input
                id="session-name"
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                placeholder="Enter new session name"
              />
            </div>

            <div className="flex gap-3 justify-end mt-8">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={(e) => e.stopPropagation()}
                disabled={
                  loading || !name.trim() || name.trim() === currentName
                }
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Renaming..." : "Rename"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
