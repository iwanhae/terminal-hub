import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSessions } from "../sessions/useSessions";
import { useCrons } from "../crons/useCrons";
import { useAuth } from "../auth/useAuth";
import CreateSessionDialog from "../sessions/CreateSessionDialog";
import RenameSessionDialog from "../sessions/RenameSessionDialog";
import type { SessionInfo } from "../sessions/api";
import FileTransferPanel from "../terminal/FileTransferPanel";
import FileTransferDrawer from "../terminal/FileTransferDrawer";
import { useFileTransfer } from "../terminal/useFileTransfer";
import MobileCommandBar from "../../components/ui/MobileCommandBar";
import MobileCommandButton from "../../components/ui/MobileCommandButton";
import MobileCommandSheet from "../../components/ui/MobileCommandSheet";
import { MOBILE_COMMAND_OPEN_EVENT } from "../../shared/mobileCommandEvents";

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
  onDelete: (id: string, name: string) => void;
  onCloseMenu?: () => void;
  actionMode?: "hover" | "always";
}>;

function SessionListItem({
  session,
  isActive,
  collapsed,
  onNavigate,
  onRename,
  onDelete,
  onCloseMenu,
  actionMode = "hover",
}: SessionListItemProps) {
  const actionsClassName =
    actionMode === "always"
      ? "flex items-center gap-1"
      : "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all";

  return (
    <div
      className={`flex items-center p-2 rounded-md transition-all group ${
        collapsed ? "gap-0" : "gap-1"
      } ${
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
        className={`flex-1 flex items-center text-left transition-all ${
          collapsed ? "justify-center gap-0" : "gap-3"
        } ${isActive ? "text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
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
      </button>
      {!collapsed && (
        <div className={actionsClassName}>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onRename(session.id);
              onCloseMenu?.();
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
          <button
            onClick={(event) => {
              event.stopPropagation();
              onDelete(session.id, session.metadata.name);
            }}
            className="p-1 rounded hover:bg-red-900/30 text-zinc-500 hover:text-red-400 transition-all"
            title="Delete session"
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
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      )}
      {isActive && !collapsed && (
        <div className="w-1 h-4 bg-emerald-400 rounded-full" />
      )}
    </div>
  );
}

type MobileCommandMenuProps = Readonly<{
  open: boolean;
  onClose: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredSessions: SessionInfo[];
  cronCount: number;
  currentSessionId: string | null;
  currentPathname: string;
  onNavigate: (id: string) => void;
  onNavigateToDashboard: () => void;
  onNavigateToCrons: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onCreateSession: () => void;
  onOpenFiles: () => void;
  onLogout: () => void;
}>;

function MobileCommandMenu({
  open,
  onClose,
  searchQuery,
  setSearchQuery,
  filteredSessions,
  cronCount,
  currentSessionId,
  currentPathname,
  onNavigate,
  onNavigateToDashboard,
  onNavigateToCrons,
  onRename,
  onDelete,
  onCreateSession,
  onOpenFiles,
  onLogout,
}: MobileCommandMenuProps) {
  const isDashboardActive = currentPathname === "/";
  const isCronsActive = currentPathname === "/crons";
  const cronLabel =
    cronCount > 0 ? `Cron Jobs (${String(cronCount)})` : "Cron Jobs";

  return (
    <MobileCommandSheet open={open} onClose={onClose} title="Terminal Hub">
      <div className="space-y-3">
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Filter sessions..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded-md px-2.5 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-400 transition-colors"
          />
          <MobileCommandButton
            label="New Session"
            icon={<span>+</span>}
            tone="primary"
            size="md"
            className="w-full justify-center"
            testId="create-session-mobile"
            onClick={() => {
              onCreateSession();
              onClose();
            }}
          />
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60">
          <div className="px-2.5 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
            Sessions
          </div>
          <div className="max-h-60 overflow-y-auto p-2 space-y-1">
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
                  actionMode="always"
                  onNavigate={onNavigate}
                  onRename={onRename}
                  onDelete={onDelete}
                  onCloseMenu={onClose}
                />
              ))
            )}
          </div>
        </div>

        <div className="space-y-2">
          <MobileCommandButton
            label="Files"
            icon={<span>[F]</span>}
            className="w-full justify-start"
            size="md"
            onClick={() => {
              onOpenFiles();
              onClose();
            }}
          />
          <MobileCommandButton
            label={cronLabel}
            icon={<span>⏰</span>}
            className="w-full justify-start"
            size="md"
            active={isCronsActive}
            onClick={() => {
              onNavigateToCrons();
              onClose();
            }}
          />
          <MobileCommandButton
            label="Dashboard"
            icon={<span>☖</span>}
            className="w-full justify-start"
            size="md"
            active={isDashboardActive}
            onClick={() => {
              onNavigateToDashboard();
              onClose();
            }}
          />
          <MobileCommandButton
            label="Logout"
            icon={<span>⏻</span>}
            tone="danger"
            size="md"
            className="w-full justify-start"
            onClick={() => {
              onLogout();
              onClose();
            }}
          />
        </div>
      </div>
    </MobileCommandSheet>
  );
}

export default function Sidebar({
  containerClassName = "",
  onNavigate,
  testId,
}: SidebarProps) {
  const { sessions, deleteSession } = useSessions();
  const { crons } = useCrons();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showFilesDrawer, setShowFilesDrawer] = useState(false);
  const [showFilesSheet, setShowFilesSheet] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const transfer = useFileTransfer("/tmp");

  const currentSessionId = location.pathname.startsWith("/session/")
    ? location.pathname.split("/")[2]
    : null;
  const isTerminalRoute = location.pathname.startsWith("/session/");

  useEffect(() => {
    const handleShortcut = () => setShowCreateDialog(true);
    window.addEventListener("create-session-shortcut", handleShortcut);
    return () =>
      window.removeEventListener("create-session-shortcut", handleShortcut);
  }, []);

  useEffect(() => {
    const handleMobileMenuOpen = () => setMobileMenuOpen(true);
    window.addEventListener(MOBILE_COMMAND_OPEN_EVENT, handleMobileMenuOpen);
    return () =>
      window.removeEventListener(
        MOBILE_COMMAND_OPEN_EVENT,
        handleMobileMenuOpen,
      );
  }, []);

  const filteredSessions = sessions.filter((session) =>
    session.metadata.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const activeTransferSession =
    sessions.find((session) => session.id === currentSessionId) ?? sessions[0];
  const transferSessionId = activeTransferSession?.id ?? null;
  const transferSessionName = activeTransferSession?.metadata.name ?? "None";

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

  const handleNavigateToCrons = () => {
    const result = navigate("/crons");
    onNavigate?.();
    if (result instanceof Promise) {
      result.catch((error: Error) => {
        console.error(error);
      });
    }
  };

  const handleDeleteSession = (sessionId: string, sessionName: string) => {
    if (!confirm(`Are you sure you want to delete session "${sessionName}"?`)) {
      return;
    }

    deleteSession(sessionId)
      .then(() => {
        if (sessionId !== currentSessionId) return;
        const result = navigate("/");
        onNavigate?.();
        if (result instanceof Promise) {
          result.catch((error: Error) => {
            console.error(error);
          });
        }
      })
      .catch((error: Error) => {
        console.error(error);
      });
  };

  return (
    <>
      <div
        data-testid={testId}
        className={`hidden md:flex relative flex-col h-[100dvh] min-h-screen bg-zinc-900/70 backdrop-blur-xl border-r border-zinc-800/80 transition-all duration-300 ${collapsed ? "w-16" : "w-64"} ${containerClassName}`}
      >
        {/* Header */}
        <div
          className={`h-14 flex items-center border-b border-zinc-800 ${
            collapsed ? "justify-center px-0" : "justify-between px-4"
          }`}
        >
          {!collapsed && (
            <button
              onClick={handleNavigateToDashboard}
              className="font-semibold text-zinc-100 tracking-tight hover:text-emerald-300 transition-colors"
              title="Go to Dashboard"
            >
              Terminal Hub
            </button>
          )}
          <button
            onClick={() => {
              setCollapsed(!collapsed);
            }}
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
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-emerald-400 transition-colors"
              />
            </div>
          )}
          <button
            onClick={() => setShowCreateDialog(true)}
            className={`w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-md shadow-sm transition-all ${collapsed ? "px-0" : ""}`}
            title="Create Session (Cmd/Ctrl+K)"
            data-testid="create-session"
          >
            <span className="text-lg leading-none">+</span>
            {!collapsed && (
              <span className="text-sm font-medium">New Session</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowFilesDrawer(true)}
            className={`w-full flex items-center rounded-md border border-zinc-700 bg-zinc-950 text-zinc-300 p-2 hover:bg-zinc-800 transition-colors ${
              collapsed ? "justify-center" : "justify-between"
            }`}
            title="Open Files Workspace"
            data-testid="files-nav-item"
          >
            <span className="text-sm">[F]</span>
            {!collapsed && (
              <span className="text-xs uppercase tracking-wide text-zinc-300">
                Open Files Workspace
              </span>
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
                  onDelete={handleDeleteSession}
                />
              ))}

          {/* Cron Jobs Section */}
          {!collapsed && (
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-2 py-2 mt-4">
              Cron Jobs
            </div>
          )}
          <button
            onClick={handleNavigateToCrons}
            className={`w-full flex items-center p-2 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors ${
              collapsed ? "justify-center gap-0 px-0" : "gap-3"
            } ${location.pathname === "/crons" ? "bg-zinc-800 text-zinc-100" : ""}`}
            title="Cron Jobs"
            data-testid="crons-nav-item"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center text-lg leading-none">
              ⏰
            </span>
            {!collapsed && (
              <span className="text-sm font-medium flex-1 text-left">
                Cron Jobs
              </span>
            )}
            {!collapsed && crons.length > 0 && (
              <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
                {crons.length}
              </span>
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800 space-y-1">
          <button
            onClick={handleNavigateToDashboard}
            className={`w-full flex items-center p-2 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors ${
              collapsed ? "justify-center gap-0 px-0" : "gap-3"
            } ${location.pathname === "/" ? "bg-zinc-800 text-zinc-100" : ""}`}
            title="Dashboard"
            data-testid="dashboard-nav-item"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center text-lg leading-none">
              ☖
            </span>
            {!collapsed && (
              <span className="text-sm font-medium">Dashboard</span>
            )}
          </button>
          <button
            onClick={() => {
              void logout();
            }}
            className={`w-full flex items-center p-2 rounded-md text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors ${
              collapsed ? "justify-center gap-0 px-0" : "gap-3"
            }`}
            title="Logout"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center text-lg leading-none">
              ⏻
            </span>
            {!collapsed && <span className="text-sm font-medium">Logout</span>}
          </button>
        </div>
      </div>

      <FileTransferDrawer
        open={showFilesDrawer}
        onClose={() => setShowFilesDrawer(false)}
        sessionId={transferSessionId}
        sessionName={transferSessionName}
        transfer={transfer}
      />

      {!isTerminalRoute && (
        <MobileCommandBar floating>
          <MobileCommandButton
            label="Menu"
            icon={<span>☰</span>}
            tone="primary"
            size="md"
            className="w-full justify-center"
            testId="mobile-menu-button"
            onClick={() => setMobileMenuOpen(true)}
          />
        </MobileCommandBar>
      )}

      <MobileCommandMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filteredSessions={filteredSessions}
        cronCount={crons.length}
        currentSessionId={currentSessionId}
        currentPathname={location.pathname}
        onNavigate={handleNavigate}
        onNavigateToDashboard={handleNavigateToDashboard}
        onNavigateToCrons={handleNavigateToCrons}
        onRename={setRenameSessionId}
        onDelete={handleDeleteSession}
        onCreateSession={() => setShowCreateDialog(true)}
        onOpenFiles={() => setShowFilesSheet(true)}
        onLogout={() => {
          void logout();
        }}
      />

      <MobileCommandSheet
        open={showFilesSheet}
        onClose={() => setShowFilesSheet(false)}
        title="Files"
        zIndexClassName="z-[86]"
      >
        <FileTransferPanel
          variant="mobile-sheet"
          sessionId={transferSessionId}
          sessionName={transferSessionName}
          transfer={transfer}
        />
      </MobileCommandSheet>

      {showCreateDialog && (
        <CreateSessionDialog onClose={() => setShowCreateDialog(false)} />
      )}

      {renameSessionId != null && (
        <RenameSessionDialog
          sessionId={renameSessionId}
          currentName={
            sessions.find((session) => session.id === renameSessionId)?.metadata
              .name ?? ""
          }
          onClose={() => setRenameSessionId(null)}
        />
      )}
    </>
  );
}
