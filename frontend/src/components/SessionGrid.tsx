import { useNavigate } from "react-router-dom";
import { useSessions } from "../contexts/useSessions";
import type { SessionInfo } from "../services/api";
import TerminalComponent from "./Terminal";

export default function SessionGrid() {
  const { sessions, deleteSession } = useSessions();
  const navigate = useNavigate();

  // Sort sessions by creation time (newest first)
  // eslint-disable-next-line unicorn/no-array-sort -- spread operator creates new array
  const sortedSessions = [...sessions].sort(
    (a, b) =>
      new Date(b.metadata.created_at).getTime() -
      new Date(a.metadata.created_at).getTime(),
  ) satisfies SessionInfo[];

  const handleDelete = async (
    e: React.MouseEvent,
    sessionId: string,
    sessionName: string,
  ) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete session "${sessionName}"?`)) {
      await deleteSession(sessionId);
    }
  };

  const handleNavigate = (sessionId: string) => {
    const result = navigate(`/session/${sessionId}`);
    if (result instanceof Promise) {
      result.catch((error: Error) => {
        console.error(error);
      });
    }
  };

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500">
        <p className="text-lg mb-2">No active sessions</p>
        <p className="text-sm">
          Press{" "}
          <kbd className="px-2 py-1 bg-zinc-800 rounded border border-zinc-700 font-mono text-xs">
            Cmd+K
          </kbd>{" "}
          to create one
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="h-full p-4 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4 h-full min-h-[500px]">
          {sortedSessions.map((session) => {
            const protocol =
              window.location.protocol === "https:" ? "wss://" : "ws://";
            const wsUrl = `${protocol}${window.location.host}/ws/${session.id}`;

            return (
              <div
                key={session.id}
                className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden shadow-sm hover:border-zinc-700 transition-colors"
              >
                {/* Card Header */}
                <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                    <span
                      className="font-medium text-sm text-zinc-200 truncate"
                      title={session.metadata.name}
                    >
                      {session.metadata.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        handleDelete(
                          e,
                          session.id,
                          session.metadata.name,
                        ).catch(console.error);
                      }}
                      className="p-1 hover:bg-red-900/30 rounded text-zinc-500 hover:text-red-400 transition-colors"
                      title="Delete Session"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                    <button
                      onClick={() => handleNavigate(session.id)}
                      className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-indigo-400 transition-colors"
                      title="Maximize"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Terminal Container */}
                <div className="flex-1 relative min-h-0 bg-black">
                  <TerminalComponent wsUrl={wsUrl} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
