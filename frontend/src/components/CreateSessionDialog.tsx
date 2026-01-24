import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSessions } from "../contexts/useSessions";

interface CreateSessionDialogProps {
  readonly onClose: () => void;
  readonly initialValues?: {
    readonly name?: string;
    readonly workingDirectory?: string;
    readonly command?: string;
    readonly envVars?: string;
  };
}

export default function CreateSessionDialog({
  onClose,
  initialValues,
}: CreateSessionDialogProps) {
  const { createSession } = useSessions();
  const navigate = useNavigate();
  const [name, setName] = useState(initialValues?.name ?? "");
  const [workingDirectory, setWorkingDirectory] = useState(
    initialValues?.workingDirectory ?? "",
  );
  const [command, setCommand] = useState(initialValues?.command ?? "");
  const [envVars, setEnvVars] = useState(initialValues?.envVars ?? "");
  const [loading, setLoading] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    // Small timeout to ensure element is mounted/visible before focusing
    const timer = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async () => {
    if (!name.trim()) return;

    setLoading(true);
    try {
      // Parse environment variables from "KEY=VALUE" format (one per line)
      const envVarsMap: Record<string, string> = {};
      if (envVars.trim()) {
        for (const line of envVars.split("\n")) {
          const [key, ...valueParts] = line.split("=");
          if (key && valueParts.length > 0) {
            envVarsMap[key.trim()] = valueParts.join("=").trim();
          }
        }
      }

      const sessionId = await createSession(
        name.trim(),
        workingDirectory.trim() || undefined,
        command.trim() || undefined,
        Object.keys(envVarsMap).length > 0 ? envVarsMap : undefined,
      );

      // Navigate to the new session using React Router
      const result = navigate(`/session/${sessionId}`);
      if (result instanceof Promise) {
        result.catch((error: Error) => {
          console.error("Navigation error:", error);
        });
      }
    } catch (error) {
      console.error("Failed to create session:", error);
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

  const buttonText = initialValues ? "Duplicate" : "Create Session";

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
        className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <span className="text-indigo-400">⚡</span>{" "}
            {initialValues ? "Duplicate Session" : "Create New Session"}
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
                placeholder="e.g. Backend Server"
              />
            </div>

            <div>
              <label
                htmlFor="working-directory"
                className="block text-sm font-medium text-zinc-400 mb-1"
              >
                Working Directory
              </label>
              <input
                id="working-directory"
                type="text"
                value={workingDirectory}
                onChange={(e) => setWorkingDirectory(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="/path/to/project"
              />
            </div>

            <div>
              <label
                htmlFor="initial-command"
                className="block text-sm font-medium text-zinc-400 mb-1"
              >
                Initial Command
              </label>
              <input
                id="initial-command"
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="npm run dev"
              />
            </div>

            <div>
              <label
                htmlFor="env-vars"
                className="block text-sm font-medium text-zinc-400 mb-1"
              >
                Environment Variables
              </label>
              <textarea
                id="env-vars"
                value={envVars}
                onChange={(e) => setEnvVars(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-200 font-mono text-sm focus:outline-none focus:border-indigo-500 transition-colors h-24"
                placeholder="NODE_ENV=development&#10;PORT=3000"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Key=Value format, one per line
              </p>
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
                disabled={loading || !name.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Creating..." : buttonText}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
