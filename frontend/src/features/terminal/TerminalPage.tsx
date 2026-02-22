import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MobileCommandBar from "../../components/ui/MobileCommandBar";
import MobileCommandButton from "../../components/ui/MobileCommandButton";
import { MOBILE_COMMAND_OPEN_EVENT } from "../../shared/mobileCommandEvents";
import TerminalComponent, { type TerminalHandle } from "./Terminal";

export default function TerminalPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const terminalRef = useRef<TerminalHandle>(null);
  const [ctrlActive, setCtrlActive] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
    const promise = terminalRef.current?.pasteFromClipboard();
    if (promise != null) {
      promise.catch((error: Error) => {
        console.error(error);
      });
    }
  }, []);

  const navigateToDashboard = useCallback(() => {
    const result = navigate("/");
    if (result instanceof Promise) {
      result.catch((error: Error) => {
        console.error(error);
      });
    }
  }, [navigate]);

  const openMobileMenu = useCallback(() => {
    window.dispatchEvent(new Event(MOBILE_COMMAND_OPEN_EVENT));
  }, []);

  if (trimmedSessionId === "") return null;

  return (
    <div className="flex-1 flex flex-col w-full bg-black min-h-0 overflow-hidden">
      <div className="flex-1 relative min-h-0">
        <TerminalComponent ref={terminalRef} wsUrl={wsUrl} />
      </div>

      <MobileCommandBar>
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          <MobileCommandButton
            label="Esc"
            testId="extra-key-esc"
            onClick={() => send("\x1b")}
          />
          <MobileCommandButton
            label="Tab"
            testId="extra-key-tab"
            onClick={() => send("\t")}
          />
          <MobileCommandButton
            label={ctrlActive ? "Ctrl●" : "Ctrl"}
            active={ctrlActive}
            testId="extra-key-ctrl"
            onClick={() => setCtrlActive((value) => !value)}
          />
          <MobileCommandButton
            label="↑"
            testId="extra-key-up"
            onClick={() => send("\x1b[A")}
          />
          <MobileCommandButton
            label="←"
            testId="extra-key-left"
            onClick={() => send("\x1b[D")}
          />
          <MobileCommandButton
            label="↓"
            testId="extra-key-down"
            onClick={() => send("\x1b[B")}
          />
          <MobileCommandButton
            label="→"
            testId="extra-key-right"
            onClick={() => send("\x1b[C")}
          />
          <MobileCommandButton
            label="Menu"
            icon={<span>☰</span>}
            tone="primary"
            onClick={openMobileMenu}
            testId="mobile-menu-button"
          />
          <MobileCommandButton
            label={advancedOpen ? "Less" : "More"}
            active={advancedOpen}
            onClick={() => setAdvancedOpen((value) => !value)}
          />
        </div>

        {advancedOpen && (
          <div className="mt-2 border-t border-zinc-800 pt-2 flex items-center gap-1.5 flex-wrap justify-center">
            <MobileCommandButton
              label="Paste"
              testId="extra-key-paste"
              onClick={pasteFromClipboard}
            />
            <MobileCommandButton
              label="⇧Tab"
              testId="extra-key-shift-tab"
              title="Shift+Tab (Back Tab)"
              onClick={() => send("\x1b[Z")}
            />
            <MobileCommandButton
              label="Ctrl+C"
              testId="extra-key-ctrl-c"
              onClick={() => sendCtrl("C")}
            />
            <MobileCommandButton
              label="Ctrl+D"
              testId="extra-key-ctrl-d"
              onClick={() => sendCtrl("D")}
            />
            <MobileCommandButton
              label="Ctrl+Z"
              testId="extra-key-ctrl-z"
              onClick={() => sendCtrl("Z")}
            />
            <MobileCommandButton
              label="Home"
              testId="extra-key-home"
              onClick={() => send("\x1b[H")}
            />
            <MobileCommandButton
              label="End"
              testId="extra-key-end"
              onClick={() => send("\x1b[F")}
            />
            <MobileCommandButton
              label="Dashboard"
              icon={<span>☖</span>}
              onClick={navigateToDashboard}
              testId="back-to-dashboard"
            />
          </div>
        )}
      </MobileCommandBar>
    </div>
  );
}
