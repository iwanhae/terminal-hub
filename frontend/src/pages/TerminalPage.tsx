import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import TerminalComponent, { type TerminalHandle } from "../components/Terminal";

export default function TerminalPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const terminalRef = useRef<TerminalHandle>(null);
  const [ctrlActive, setCtrlActive] = useState(false);

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
    },
    [send],
  );

  const pasteFromClipboard = useCallback(() => {
    void terminalRef.current?.pasteFromClipboard();
  }, []);

  if (trimmedSessionId === "") return null;

  return (
    <div className="flex-1 flex flex-col w-full bg-black min-h-0 overflow-hidden">
      <div className="flex-1 relative min-h-0">
        <TerminalComponent ref={terminalRef} wsUrl={wsUrl} />
      </div>

      <div className="md:hidden flex-shrink-0 px-2 pb-2 pt-1 bg-zinc-900 border-t border-zinc-800">
        <div className="flex items-center gap-1 flex-wrap justify-center">
          {/* Esc key */}
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
            data-testid="extra-key-paste"
            onClick={pasteFromClipboard}
          >
            Paste
          </button>

          {/* Tab key */}
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-tab"
            onClick={() => send("\t")}
          >
            Tab
          </button>

          {/* Shift+Tab (Back Tab) */}
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-shift-tab"
            onClick={() => send("\x1b[Z")}
            title="Shift+Tab (Back Tab)"
          >
            ⇧Tab
          </button>

          {/* Sticky Ctrl toggle */}
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
            {ctrlActive ? "Ctrl●" : "Ctrl"}
          </button>

          {/* Dedicated Ctrl+C */}
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-ctrl-c"
            onClick={() => sendCtrl("C")}
          >
            Ctrl+C
          </button>

          {/* Dedicated Ctrl+D */}
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-ctrl-d"
            onClick={() => sendCtrl("D")}
          >
            Ctrl+D
          </button>

          {/* Dedicated Ctrl+Z */}
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-ctrl-z"
            onClick={() => sendCtrl("Z")}
          >
            Ctrl+Z
          </button>

          {/* Home key */}
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-home"
            onClick={() => send("\x1b[H")}
          >
            Home
          </button>

          {/* End key */}
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800"
            data-testid="extra-key-end"
            onClick={() => send("\x1b[F")}
          >
            End
          </button>

          {/* D-pad arrow keys - cross pattern layout */}
          <div className="grid grid-cols-3 gap-0.5">
            {/* Top: Up arrow */}
            <div></div>
            <button
              type="button"
              className="w-10 h-8 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800 flex items-center justify-center"
              data-testid="extra-key-up"
              onClick={() => send("\x1b[A")}
            >
              ↑
            </button>
            <div></div>

            {/* Middle: Left, Down, Right */}
            <button
              type="button"
              className="w-10 h-8 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800 flex items-center justify-center"
              data-testid="extra-key-left"
              onClick={() => send("\x1b[D")}
            >
              ←
            </button>
            <button
              type="button"
              className="w-10 h-8 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800 flex items-center justify-center"
              data-testid="extra-key-down"
              onClick={() => send("\x1b[B")}
            >
              ↓
            </button>
            <button
              type="button"
              className="w-10 h-8 rounded-md bg-zinc-950 text-zinc-200 border border-zinc-800 flex items-center justify-center"
              data-testid="extra-key-right"
              onClick={() => send("\x1b[C")}
            >
              →
            </button>
          </div>

          {/* Dashboard button for navigation */}
          <button
            type="button"
            className="px-3 py-1 rounded-md bg-zinc-800 text-zinc-300 text-sm border border-zinc-700"
            onClick={() => {
              const result = navigate("/");
              if (result instanceof Promise) {
                result.catch((error: Error) => {
                  console.error(error);
                });
              }
            }}
            data-testid="back-to-dashboard"
          >
            ☖ Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
