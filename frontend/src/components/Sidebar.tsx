import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSessions } from "../contexts/useSessions";
import CreateSessionDialog from "./CreateSessionDialog";
import RenameSessionDialog from "./RenameSessionDialog";
import { Dialog } from "@headlessui/react";

type SidebarProps = Readonly<{
  containerClassName?: string;
  onNavigate?: () => void;
  testId?: string;
}>;

export default function Sidebar({
  containerClassName = "",
  onNavigate,
  testId,
}: SidebarProps) {
  const { sessions } = useSessions();
  const navigate = useNavigate();
  const location = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const [searchQuery, setSearchQuery] = useState("");

  const filteredSessions = sessions.filter((session) =>
    session.metadata.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleNavigate = (sessionId: string) => {
    const result = navigate(`/session/${sessionId}`);
    onNavigate?.();
    setMobileMenuOpen(false);
    if (result instanceof Promise) {
      result.catch((error: Error) => {
        console.error(error);
      });
    }
  };

  const handleNavigateToDashboard = () => {
    const result = navigate("/");
    onNavigate?.();
    setMobileMenuOpen(false);
    if (result instanceof Promise) {
      result.catch((error: Error) => {
        console.error(error);
      });
    }
  };

  return (
    <>
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="md:hidden p-2 text-zinc-400 hover:text-zinc-200"
        title="Open menu"
        data-testid="mobile-menu-button"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      <div
        data-testid={testId}
        className={`hidden md:flex flex-col h-full bg-zinc-900 border-r border-zinc-800 transition-all duration-300 ${collapsed ? "w-16" : "w-64"} ${containerClassName}`}
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
            onClick={() => setShowCreateDialog(true)}
            className={`w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-md shadow-sm transition-all ${collapsed ? "px-0" : ""}`}
            title="Create Session (Cmd+K)"
            data-testid="create-session"
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
                  <div
                    key={session.id}
                    className={`flex items-center gap-1 p-2 rounded-md transition-all group ${
                      isActive
                        ? "bg-zinc-800 shadow-sm ring-1 ring-zinc-700"
                        : "hover:bg-zinc-800/50"
                    }`}
                  >
                    <button
                      onClick={() => handleNavigate(session.id)}
                      className={`flex-1 flex items-center gap-3 text-left transition-all ${
                        isActive
                          ? "text-zinc-100"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                      title={session.metadata.name}
                      data-testid="session-nav-item"
                      data-session-id={session.id}
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

                      {isActive && !collapsed && (
                        <div className="w-1 h-4 bg-indigo-500 rounded-full" />
                      )}
                    </button>

                    {!collapsed && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameSessionId(session.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-all"
                        title="Rename session"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800">
          <button
            onClick={handleNavigateToDashboard}
            className={`w-full flex items-center gap-3 p-2 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors ${location.pathname === "/" ? "bg-zinc-800 text-zinc-100" : ""}`}
            title="Dashboard"
            data-testid="dashboard-nav-item"
          >
            <span className="text-lg">☖</span>
            {!collapsed && (
              <span className="text-sm font-medium">Dashboard</span>
            )}
          </button>
        </div>
      </div>

      <Dialog
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        className="fixed inset-0 z-50 md:hidden"
      >
        <button
          className="fixed inset-0 bg-zinc-950/50 backdrop-blur-md transition-opacity duration-200"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close menu"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className={`fixed inset-y-0 left-0 w-72 max-w-[80vw] bg-zinc-900 border-r border-zinc-800 shadow-2xl flex flex-col pt-[safe-area-inset-top] pl-[safe-area-inset-left] transition-transform duration-300 ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-800 shrink-0">
            <h3 className="font-semibold text-zinc-100 tracking-tight">
              Terminal Hub
            </h3>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Close"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="p-3 space-y-2 shrink-0">
            <div className="relative">
              <input
                type="text"
                placeholder="Filter sessions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-md shadow-sm transition-all"
              title="Create Session"
              data-testid="create-session-mobile"
            >
              <span className="text-lg leading-none">+</span>
              <span className="text-sm font-medium">New Session</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-2 py-2">
              Sessions
            </div>
            {filteredSessions.length === 0 ? (
              <p className="text-zinc-600 text-sm text-center py-4">
                {searchQuery ? "No matches" : "No active sessions"}
              </p>
            ) : (
              filteredSessions.map((session) => {
                const isActive = session.id === currentSessionId;
                return (
                  <div
                    key={session.id}
                    className={`flex items-center gap-1 p-2 rounded-md transition-all ${
                      isActive
                        ? "bg-zinc-800 shadow-sm ring-1 ring-zinc-700"
                        : "hover:bg-zinc-800/50"
                    }`}
                  >
                    <button
                      onClick={() => handleNavigate(session.id)}
                      className="flex-1 flex items-center gap-3 text-left transition-all"
                    >
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-zinc-600"}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className={`truncate text-sm font-medium ${isActive ? "text-zinc-100" : "text-zinc-400"}`}
                        >
                          {session.metadata.name}
                        </div>
                      </div>
                      {isActive && (
                        <div className="w-1 h-4 bg-indigo-500 rounded-full" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameSessionId(session.id);
                      }}
                      className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-all"
                      title="Rename session"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-3 border-t border-zinc-800 shrink-0">
            <button
              onClick={handleNavigateToDashboard}
              className={`w-full flex items-center gap-3 p-2 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors ${location.pathname === "/" ? "bg-zinc-800 text-zinc-100" : ""}`}
              title="Dashboard"
            >
              <span className="text-lg">☖</span>
              <span className="text-sm font-medium">Dashboard</span>
            </button>
          </div>
        </div>
      </Dialog>

      {showCreateDialog && (
        <CreateSessionDialog onClose={() => setShowCreateDialog(false)} />
      )}

      {renameSessionId && (
        <RenameSessionDialog
          sessionId={renameSessionId}
          currentName={
            sessions.find((s) => s.id === renameSessionId)?.metadata.name || ""
          }
          onClose={() => setRenameSessionId(null)}
        />
      )}
    </>
  );
}
