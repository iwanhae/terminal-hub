import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import TerminalComponent, { type TerminalHandle } from "../components/Terminal";
import { MobileFab } from "../components/Sidebar";
import { useSessions } from "../contexts/useSessions";
import CreateSessionDialog from "../components/CreateSessionDialog";
import RenameSessionDialog from "../components/RenameSessionDialog";

export default function TerminalPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const terminalRef = useRef<TerminalHandle>(null);
  const { sessions, deleteSession } = useSessions();
  const [ctrlActive, setCtrlActive] = useState(false);
  const [isKeyboardExpanded, setIsKeyboardExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [fabOpen, setFabOpen] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);

  const trimmedSessionId =
    typeof sessionId === "string" ? sessionId.trim() : "";

  useEffect(() => {
    if (trimmedSessionId !== "") return;

    const result = navigate("/");
    if (result instanceof Promise) {
      result.catch((error: Error) => {
        console.error(error);
      });
    }
  }, [navigate, trimmedSessionId]);

  // Determine WebSocket URL based on current protocol
  const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
  const wsUrl = `${protocol}${window.location.host}/ws/${trimmedSessionId}`;

  const send = useCallback((data: string) => {
    terminalRef.current?.sendInput(data);
  }, []);

  const sendCtrl = useCallback(
    (letter: string) => {
      const upper = letter.toUpperCase();
      if (upper.length !== 1) return;
      const codePoint = upper.codePointAt(0);
      if (codePoint === undefined) return;
      const code = codePoint - 64;
      if (code < 1 || code > 26) return;
      send(String.fromCodePoint(code));
      setCtrlActive(false);
    },
    [send],
  );

  const paste = useCallback(
    async (withEnter: boolean) => {
      const text = await navigator.clipboard
        .readText()
        .catch(() => prompt("Paste text") ?? "");

      if (text === "") return;
      send(text + (withEnter ? "\r" : ""));
      terminalRef.current?.focus();
    },
    [send],
  );

  const filteredSessions = sessions.filter((session) =>
    session.metadata.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleNavigate = useCallback(
    (navigateSessionId: string) => {
      const result = navigate(`/session/${navigateSessionId}`);
      if (result instanceof Promise) {
        result.catch((error: Error) => {
          console.error(error);
        });
      }
    },
    [navigate],
  );

  const handleNavigateToDashboard = useCallback(() => {
    const result = navigate("/");
    if (result instanceof Promise) {
      result.catch((error: Error) => {
        console.error(error);
      });
    }
  }, [navigate]);

  const handleDeleteSession = useCallback(
    (deleteSessionId: string, sessionName: string) => {
      if (
        !confirm(`Are you sure you want to delete session "${sessionName}"?`)
      ) {
        return;
      }

      deleteSession(deleteSessionId)
        .then(() => {
          if (deleteSessionId === trimmedSessionId) {
            handleNavigateToDashboard();
          }
        })
        .catch((error: Error) => {
          console.error(error);
        });
    },
    [deleteSession, trimmedSessionId, handleNavigateToDashboard],
  );

  if (trimmedSessionId === "") return null;

  return (
    <div className="flex-1 flex flex-col w-full bg-black min-h-0 overflow-hidden">
      <div className="flex-1 relative min-h-0">
        <TerminalComponent ref={terminalRef} wsUrl={wsUrl} />
      </div>

      <div className="md:hidden flex-shrink-0 px-2 pb-2 pt-1 bg-zinc-900 border-t border-zinc-800">
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-esc"
            onClick={() => send("\x1b")}
          >
            Esc
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-tab"
            onClick={() => send("\t")}
          >
            Tab
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-shift-tab"
            onClick={() => send("\x1b[Z")}
            title="Shift+Tab (Back Tab)"
          >
            ⇧Tab
          </button>
          <button
            type="button"
            className={`px-2 py-1 rounded-md border transition-colors ${
              ctrlActive
                ? "bg-emerald-600 text-white border-emerald-500"
                : "bg-zinc-950 text-zinc-200 border-zinc-800"
            }`}
            data-testid="extra-key-ctrl"
            onClick={() => setCtrlActive((v) => !v)}
          >
            Ctrl
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-c"
            onClick={() => (ctrlActive ? sendCtrl("C") : send("c"))}
          >
            C
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-d"
            onClick={() => (ctrlActive ? sendCtrl("D") : send("d"))}
          >
            D
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-z"
            onClick={() => (ctrlActive ? sendCtrl("Z") : send("z"))}
          >
            Z
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-left"
            onClick={() => send("\x1b[D")}
          >
            ←
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-up"
            onClick={() => send("\x1b[A")}
          >
            ↑
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-down"
            onClick={() => send("\x1b[B")}
          >
            ↓
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-right"
            onClick={() => send("\x1b[C")}
          >
            →
          </button>
          {!isKeyboardExpanded && (
            <button
              type="button"
              className="px-2 py-1 rounded-md bg-zinc-800 text-zinc-300 text-xs border border-zinc-700"
              onClick={() => setIsKeyboardExpanded(true)}
            >
              ▶ More
            </button>
          )}

          {/* FAB integrated directly into keystrokes row */}
          <MobileFab
            fabOpen={fabOpen}
            setFabOpen={setFabOpen}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filteredSessions={filteredSessions}
            currentSessionId={trimmedSessionId}
            onNavigate={handleNavigate}
            onNavigateToDashboard={handleNavigateToDashboard}
            onRename={setRenameSessionId}
            onDelete={handleDeleteSession}
            onCreateSession={() => setShowCreateDialog(true)}
            dockToKeyBar={true}
          />
        </div>

        {isKeyboardExpanded && (
          <div className="flex items-center gap-1 flex-wrap mt-1">
            <button
              type="button"
              className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
              data-testid="extra-key-pgup"
              onClick={() => send("\x1b[5~")}
            >
              PgUp
            </button>
            <button
              type="button"
              className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
              data-testid="extra-key-pgdn"
              onClick={() => send("\x1b[6~")}
            >
              PgDn
            </button>
            <button
              type="button"
              className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
              data-testid="extra-key-l"
              onClick={() => (ctrlActive ? sendCtrl("L") : send("l"))}
            >
              L
            </button>
            <button
              type="button"
              className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
              data-testid="paste"
              onClick={() => {
                void paste(false);
              }}
            >
              Paste
            </button>
            <button
              type="button"
              className="px-2 py-1 rounded-md bg-emerald-600 text-white border border-emerald-500"
              data-testid="paste-enter"
              onClick={() => {
                void paste(true);
              }}
            >
              Paste+Enter
            </button>
            <button
              type="button"
              className="px-2 py-1 rounded-md bg-zinc-800 text-zinc-300 text-xs border border-zinc-700"
              onClick={() => setIsKeyboardExpanded(false)}
            >
              ▼ Less
            </button>
          </div>
        )}
      </div>

      {/* Dialogs for FAB functionality */}
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
    </div>
  );
}
