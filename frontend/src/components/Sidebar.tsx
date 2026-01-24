import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSessions } from "../contexts/useSessions";
import type { SessionInfo } from "../services/api";
import CreateSessionDialog from "./CreateSessionDialog";

export default function Sidebar() {
  const { sessions } = useSessions();
  const navigate = useNavigate();
  const location = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Extract current session ID from location
  const currentSessionId = location.pathname.startsWith("/session/")
    ? location.pathname.split("/")[2]
    : null;

  // Keyboard shortcut for creating session
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCreateDialog(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const [duplicateSessionConfig, setDuplicateSessionConfig] = useState<
    | {
        name: string;
        workingDirectory?: string;
        command?: string;
        envVars?: string;
      }
    | undefined
  >();
  const [searchQuery, setSearchQuery] = useState("");

  const handleDuplicate = (e: React.MouseEvent, session: SessionInfo) => {
    e.stopPropagation();

    // Format env vars back to string
    let envString = "";
    if (session.metadata.env_vars) {
      envString = Object.entries(session.metadata.env_vars)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
    }

    setDuplicateSessionConfig({
      name: `${session.metadata.name} (Copy)`,
      workingDirectory: session.metadata.working_directory,
      command: session.metadata.command,
      envVars: envString,
    });
    setShowCreateDialog(true);
  };

  const filteredSessions = sessions.filter((session) =>
    session.metadata.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <>
      <div
        className={`flex flex-col h-full bg-zinc-900 border-r border-zinc-800 transition-all duration-300 ${collapsed ? "w-16" : "w-64"}`}
      >
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-800">
          {!collapsed && (
            <h3 className="font-semibold text-zinc-100 tracking-tight">
              Terminal Hub
            </h3>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>

        {/* Search & Actions */}
        <div className="p-3 space-y-2">
          {!collapsed && (
            <div className="relative">
              <input
                type="text"
                placeholder="Filter sessions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          )}
          <button
            onClick={() => {
              setDuplicateSessionConfig(undefined);
              setShowCreateDialog(true);
            }}
            className={`w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-md shadow-sm transition-all ${collapsed ? "px-0" : ""}`}
            title="Create Session (Cmd+K)"
          >
            <span className="text-lg leading-none">+</span>
            {!collapsed && (
              <span className="text-sm font-medium">New Session</span>
            )}
          </button>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
          {!collapsed && (
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-2 py-2">
              Sessions
            </div>
          )}
          {filteredSessions.length === 0
            ? !collapsed && (
                <p className="text-zinc-600 text-sm text-center py-4">
                  {searchQuery ? "No matches" : "No active sessions"}
                </p>
              )
            : filteredSessions.map((session) => {
                const isActive = session.id === currentSessionId;
                return (
                  <button
                    key={session.id}
                    onClick={() => {
                      void navigate(`/session/${session.id}`);
                    }}
                    className={`w-full flex items-center gap-3 p-2 rounded-md text-left transition-all group relative ${
                      isActive
                        ? "bg-zinc-800 text-zinc-100 shadow-sm ring-1 ring-zinc-700"
                        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                    }`}
                    title={session.metadata.name}
                  >
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-zinc-600"}`}
                    />

                    {!collapsed && (
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-medium">
                          {session.metadata.name}
                        </div>
                      </div>
                    )}

                    {/* Duplicate Action (Only visible on hover or active) */}
                    {!collapsed && (
                      <button
                        onClick={(e) => {
                          void handleDuplicate(e, session);
                        }}
                        className={`p-1 hover:bg-zinc-700 rounded opacity-0 group-hover:opacity-100 transition-opacity ${isActive ? "text-zinc-400" : "text-zinc-500"}`}
                        title="Duplicate Session"
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
                          <rect
                            width="14"
                            height="14"
                            x="8"
                            y="8"
                            rx="2"
                            ry="2"
                          />
                          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                        </svg>
                      </button>
                    )}

                    {isActive && !collapsed && (
                      <div className="w-1 h-4 bg-indigo-500 rounded-full" />
                    )}
                  </button>
                );
              })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800">
          <button
            onClick={() => {
              void navigate("/");
            }}}
            className={`w-full flex items-center gap-3 p-2 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors ${location.pathname === "/" ? "bg-zinc-800 text-zinc-100" : ""}`}
            title="Dashboard"
          >
            <span className="text-lg">☖</span>
            {!collapsed && (
              <span className="text-sm font-medium">Dashboard</span>
            )}
          </button>
        </div>
      </div>

      {showCreateDialog && (
        <CreateSessionDialog
          onClose={() => setShowCreateDialog(false)}
          initialValues={duplicateSessionConfig}
        />
      )}
    </>
  );
}
