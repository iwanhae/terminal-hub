import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSessions } from "./useSessions";
import type { SessionInfo } from "./api";
import TerminalComponent from "../terminal/Terminal";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export default function SessionGrid() {
  const { sessions, deleteSession } = useSessions();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  let totalClients = 0;
  let lastActivityTimestamp = 0;
  for (const session of sessions) {
    totalClients += session.metadata.client_count;
    const time = new Date(session.metadata.last_activity_at).getTime();
    if (!Number.isNaN(time)) {
      lastActivityTimestamp = Math.max(lastActivityTimestamp, time);
    }
  }
  const formatTimestamp = (value: string) =>
    new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });

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
      <div className="h-full flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-8 shadow-2xl">
          <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">
            Dashboard
          </div>
          <h2 className="text-2xl font-semibold text-zinc-100 mt-3">
            No active sessions
          </h2>
          <p className="text-sm text-zinc-400 mt-2">
            Create a session to start streaming your terminals, then pin them to
            this grid.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-950/70 px-3 py-1 text-xs text-zinc-300">
            <span className="text-emerald-300 font-medium">Tip</span>
            <span>Press</span>
            <kbd className="px-2 py-1 bg-zinc-900/80 rounded border border-zinc-700 font-mono text-xs">
              Cmd/Ctrl+K
            </kbd>
            <span>to create one</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden">
        <div className="px-6 pt-6 pb-4 fade-up">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                Dashboard
              </div>
              <h1 className="text-2xl md:text-3xl font-semibold text-zinc-100 mt-2">
                Active Sessions
              </h1>
              <p className="text-sm text-zinc-400 mt-1">
                Monitor live terminals and jump into any session instantly.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-3 bg-zinc-900/70 border border-zinc-800/80 rounded-xl px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-zinc-500">
                  Sessions
                </div>
                <div className="text-lg font-semibold text-zinc-100">
                  {sessions.length}
                </div>
              </div>
              <div className="flex items-center gap-3 bg-zinc-900/70 border border-zinc-800/80 rounded-xl px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-zinc-500">
                  Clients
                </div>
                <div className="text-lg font-semibold text-zinc-100">
                  {totalClients}
                </div>
              </div>
              <div className="flex items-center gap-3 bg-zinc-900/70 border border-zinc-800/80 rounded-xl px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-zinc-500">
                  Last Activity
                </div>
                <div className="text-sm font-medium text-zinc-200">
                  {lastActivityTimestamp
                    ? new Date(lastActivityTimestamp).toLocaleString(
                        undefined,
                        {
                          dateStyle: "medium",
                          timeStyle: "short",
                        },
                      )
                    : "—"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 px-6 pb-6 overflow-y-auto">
          <div
            className={`flex flex-col gap-6 ${isDesktop ? "md:grid md:grid-cols-2 xl:grid-cols-2" : ""} min-h-[500px]`}
          >
            {sortedSessions.map((session, index) => {
              const protocol =
                window.location.protocol === "https:" ? "wss://" : "ws://";
              const wsUrl = `${protocol}${window.location.host}/ws/${session.id}`;
              const workingDirectory = session.metadata.working_directory;
              const hasWorkingDirectory =
                typeof workingDirectory === "string" &&
                workingDirectory.trim() !== "";
              const backend = session.metadata.backend ?? "pty";
              const backendFallback = session.metadata.backend_fallback;

              return (
                <div
                  key={session.id}
                  className="flex flex-col bg-zinc-900/70 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.35)] hover:border-zinc-700 transition-colors fade-up"
                  style={{ animationDelay: `${index * 60}ms` }}
                  data-testid="session-card"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/80 border-b border-zinc-800/80">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
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
                        className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-emerald-300 transition-colors"
                        title="Maximize"
                        data-testid="session-card-open"
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

                  {isDesktop && (
                    <div className="flex-1 relative min-h-0 bg-black">
                      <TerminalComponent wsUrl={wsUrl} />
                    </div>
                  )}
                  {!isDesktop && (
                    <div className="flex-1 min-h-0 p-4 bg-zinc-950/80 flex items-center justify-center">
                      <button
                        onClick={() => handleNavigate(session.id)}
                        className="text-zinc-400 hover:text-emerald-300 text-sm font-medium transition-colors"
                        data-testid="session-card-open-mobile"
                      >
                        Open Session →
                      </button>
                    </div>
                  )}
                  <div className="px-3 py-2 bg-zinc-950/60 border-t border-zinc-800/80 flex flex-wrap gap-2 text-xs text-zinc-400">
                    <span className="rounded-full border border-zinc-800/80 bg-zinc-900/70 px-2 py-0.5">
                      Clients:{" "}
                      <span className="text-zinc-200">
                        {session.metadata.client_count}
                      </span>
                    </span>
                    <span className="rounded-full border border-zinc-800/80 bg-zinc-900/70 px-2 py-0.5">
                      Backend: <span className="text-zinc-200">{backend}</span>
                    </span>
                    {backendFallback !== undefined &&
                      backendFallback !== "" && (
                        <span className="rounded-full border border-amber-800/50 bg-amber-900/20 px-2 py-0.5 text-amber-300">
                          Fallback: {backendFallback}
                        </span>
                      )}
                    <span className="rounded-full border border-zinc-800/80 bg-zinc-900/70 px-2 py-0.5">
                      Created:{" "}
                      <span className="text-zinc-200">
                        {formatTimestamp(session.metadata.created_at)}
                      </span>
                    </span>
                    <span className="rounded-full border border-zinc-800/80 bg-zinc-900/70 px-2 py-0.5">
                      Active:{" "}
                      <span className="text-zinc-200">
                        {formatTimestamp(session.metadata.last_activity_at)}
                      </span>
                    </span>
                    {hasWorkingDirectory && (
                      <span
                        className="rounded-full border border-zinc-800/80 bg-zinc-900/70 px-2 py-0.5 truncate max-w-[260px]"
                        title={workingDirectory}
                      >
                        {workingDirectory}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
