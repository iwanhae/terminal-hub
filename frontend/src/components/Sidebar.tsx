import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { useSessions } from "../contexts/useSessions";
import { useAuth } from "../hooks/useAuth";
import CreateSessionDialog from "./CreateSessionDialog";
import RenameSessionDialog from "./RenameSessionDialog";
import type { SessionInfo } from "../services/api";

type SidebarProps = Readonly<{
  containerClassName?: string;
  onNavigate?: () => void;
  testId?: string;
}>;

type SessionListItemProps = Readonly<{
  session: SessionInfo;
  isActive: boolean;
  collapsed: boolean;
  onNavigate: (id: string) => void;
  onRename: (id: string) => void;
  onCloseMenu?: () => void;
}>;

function SessionListItem({
  session,
  isActive,
  collapsed,
  onNavigate,
  onRename,
  onCloseMenu,
}: SessionListItemProps) {
  return (
    <div
      className={`flex items-center gap-1 p-2 rounded-md transition-all group ${
        isActive
          ? "bg-zinc-800 shadow-sm ring-1 ring-zinc-700"
          : "hover:bg-zinc-800/50"
      }`}
    >
      <button
        onClick={() => {
          onNavigate(session.id);
          onCloseMenu?.();
        }}
        className={`flex-1 flex items-center gap-3 text-left transition-all ${
          isActive ? "text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
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
          <div className="w-1 h-4 bg-emerald-400 rounded-full" />
        )}
      </button>
      {!collapsed && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRename(session.id);
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
}

type MobileFabProps = Readonly<{
  fabOpen: boolean;
  setFabOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredSessions: SessionInfo[];
  currentSessionId: string | null;
  onNavigate: (id: string) => void;
  onNavigateToDashboard: () => void;
  onRename: (id: string) => void;
  onCreateSession: () => void;
  dockToKeyBar: boolean;
}>;

function MobileFab({
  fabOpen,
  setFabOpen,
  searchQuery,
  setSearchQuery,
  filteredSessions,
  currentSessionId,
  onNavigate,
  onNavigateToDashboard,
  onRename,
  onCreateSession,
  dockToKeyBar,
}: MobileFabProps) {
  const fabRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        fabOpen &&
        fabRef.current &&
        !fabRef.current.contains(event.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setFabOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [fabOpen, setFabOpen]);

  const dockEl =
    dockToKeyBar && typeof document !== "undefined"
      ? document.getElementById("mobile-fab-dock")
      : null;

  const wrapperClassName = dockEl
    ? "md:hidden relative"
    : "md:hidden fixed bottom-6 right-6 z-50";
  const menuClassName = dockEl
    ? "absolute bottom-full right-0 mb-3 w-72"
    : "absolute bottom-20 right-0 w-72";
  const fabSizeClass = dockEl ? "w-10 h-10" : "w-14 h-14";
  const iconSizeClass = dockEl ? "w-4 h-4" : "w-6 h-6";

  const content = (
    <div className={wrapperClassName}>
      <div ref={fabRef}>
        <button
          onClick={() => setFabOpen(!fabOpen)}
          className={`${fabSizeClass} rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
            fabOpen
              ? "bg-zinc-700 rotate-45"
              : "bg-emerald-600 hover:bg-emerald-500"
          }`}
          data-testid="fab-button"
          aria-label={fabOpen ? "Close menu" : "Open menu"}
        >
          <svg
            className={`${iconSizeClass} text-white`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 5v14M5 12h14"
            />
          </svg>
        </button>
      </div>

      <div
        ref={menuRef}
        className={`${menuClassName} bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden transition-all duration-300 ${
          fabOpen
            ? "opacity-100 transform translate-y-0 scale-100"
            : "opacity-0 transform translate-y-4 scale-95 pointer-events-none"
        }`}
      >
        <div className="h-12 flex items-center justify-between px-4 border-b border-zinc-800">
          <h3 className="font-semibold text-zinc-100 tracking-tight text-sm">
            Terminal Hub
          </h3>
          <button
            onClick={() => setFabOpen(false)}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Close"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-3 space-y-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Filter sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-400 transition-colors"
            />
          </div>
          <button
            onClick={() => {
              onCreateSession();
              setFabOpen(false);
            }}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-md shadow-sm transition-all"
            title="Create Session"
            data-testid="create-session-mobile"
          >
            <span className="text-lg leading-none">+</span>
            <span className="text-sm font-medium">New Session</span>
          </button>
        </div>

        <div className="max-h-60 overflow-y-auto px-3 pb-3 space-y-1">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-2 py-2">
            Sessions
          </div>
          {filteredSessions.length === 0 ? (
            <p className="text-zinc-600 text-sm text-center py-4">
              {searchQuery ? "No matches" : "No active sessions"}
            </p>
          ) : (
            filteredSessions.map((session) => (
              <SessionListItem
                key={session.id}
                session={session}
                isActive={session.id === currentSessionId}
                collapsed={false}
                onNavigate={onNavigate}
                onRename={onRename}
                onCloseMenu={() => setFabOpen(false)}
              />
            ))
          )}
        </div>

        <div className="p-3 border-t border-zinc-800">
          <button
            onClick={() => {
              onNavigateToDashboard();
              setFabOpen(false);
            }}
            className="w-full flex items-center gap-3 p-2 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors bg-zinc-800 text-zinc-100"
            title="Dashboard"
          >
            <span className="text-lg">☖</span>
            <span className="text-sm font-medium">Dashboard</span>
          </button>
        </div>
      </div>
    </div>
  );

  if (dockEl) {
    return createPortal(content, dockEl);
  }

  return content;
}

export default function Sidebar({
  containerClassName = "",
  onNavigate,
  testId,
}: SidebarProps) {
  const { sessions } = useSessions();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [fabOpen, setFabOpen] = useState(false);

  const currentSessionId = location.pathname.startsWith("/session/")
    ? location.pathname.split("/")[2]
    : null;

  const filteredSessions = sessions.filter((session) =>
    session.metadata.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const dockFabToKeyBar = location.pathname.startsWith("/session/");

  const handleNavigate = (sessionId: string) => {
    const result = navigate(`/session/${sessionId}`);
    onNavigate?.();
    if (result instanceof Promise) {
      result.catch((error: Error) => {
        console.error(error);
      });
    }
  };

  const handleNavigateToDashboard = () => {
    const result = navigate("/");
    onNavigate?.();
    if (result instanceof Promise) {
      result.catch((error: Error) => {
        console.error(error);
      });
    }
  };

  return (
    <>
      <div
        data-testid={testId}
        className={`hidden md:flex flex-col h-[100dvh] min-h-screen bg-zinc-900/70 backdrop-blur-xl border-r border-zinc-800/80 transition-all duration-300 ${collapsed ? "w-16" : "w-64"} ${containerClassName}`}
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
                className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-emerald-400 transition-colors"
              />
            </div>
          )}
          <button
            onClick={() => setShowCreateDialog(true)}
            className={`w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-md shadow-sm transition-all ${collapsed ? "px-0" : ""}`}
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
            : filteredSessions.map((session) => (
                <SessionListItem
                  key={session.id}
                  session={session}
                  isActive={session.id === currentSessionId}
                  collapsed={collapsed}
                  onNavigate={handleNavigate}
                  onRename={setRenameSessionId}
                />
              ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800 space-y-1">
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
          <button
            onClick={() => {
              void logout();
            }}
            className="w-full flex items-center gap-3 p-2 rounded-md text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
            title="Logout"
          >
            <span className="text-lg">⏻</span>
            {!collapsed && <span className="text-sm font-medium">Logout</span>}
          </button>
        </div>
      </div>

      <MobileFab
        fabOpen={fabOpen}
        setFabOpen={setFabOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filteredSessions={filteredSessions}
        currentSessionId={currentSessionId}
        onNavigate={handleNavigate}
        onNavigateToDashboard={handleNavigateToDashboard}
        onRename={setRenameSessionId}
        onCreateSession={() => setShowCreateDialog(true)}
        dockToKeyBar={dockFabToKeyBar}
      />

      {showCreateDialog && (
        <CreateSessionDialog onClose={() => setShowCreateDialog(false)} />
      )}

      {renameSessionId != null && (
        <RenameSessionDialog
          sessionId={renameSessionId}
          currentName={
            sessions.find((s) => s.id === renameSessionId)?.metadata.name ?? ""
          }
          onClose={() => setRenameSessionId(null)}
        />
      )}
    </>
  );
}
