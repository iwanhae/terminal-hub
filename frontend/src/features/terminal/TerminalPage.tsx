import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MobileTerminalPalette from "../../components/ui/MobileTerminalPalette";
import { MOBILE_COMMAND_OPEN_EVENT } from "../../shared/mobileCommandEvents";
import {
  DEFAULT_LATCHED_MODIFIERS,
  type LatchedModifierKey,
  type LatchedModifiers,
} from "./mobileKeySequences";
import CopyTextModal from "./CopyTextModal";
import TerminalComponent, { type TerminalHandle } from "./Terminal";

export default function TerminalPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const terminalRef = useRef<TerminalHandle>(null);
  const [latchedModifiers, setLatchedModifiers] = useState<LatchedModifiers>(
    DEFAULT_LATCHED_MODIFIERS,
  );
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copyModalContent, setCopyModalContent] = useState("");

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

  const focusTerminal = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  const send = useCallback(
    (data: string) => {
      terminalRef.current?.sendInput(data);
      focusTerminal();
    },
    [focusTerminal],
  );

  const resetLatchedModifiers = useCallback(() => {
    setLatchedModifiers(DEFAULT_LATCHED_MODIFIERS);
  }, []);

  const toggleModifier = useCallback(
    (modifier: LatchedModifierKey) => {
      setLatchedModifiers((current) => ({
        ...current,
        [modifier]: !current[modifier],
      }));
      focusTerminal();
    },
    [focusTerminal],
  );

  const pasteFromClipboard = useCallback(() => {
    const promise = terminalRef.current?.pasteFromClipboard();
    if (promise != null) {
      promise.catch((error: Error) => {
        console.error(error);
      });
    }
    focusTerminal();
  }, [focusTerminal]);

  const openCopyTextModal = useCallback(() => {
    const snapshot = terminalRef.current?.getVisiblePlainTextSnapshot() ?? "";
    setCopyModalContent(snapshot);
    setCopyModalOpen(true);
  }, []);

  const closeCopyTextModal = useCallback(() => {
    setCopyModalOpen(false);
    focusTerminal();
  }, [focusTerminal]);

  const openMobileMenu = useCallback(() => {
    window.dispatchEvent(new Event(MOBILE_COMMAND_OPEN_EVENT));
  }, []);

  if (trimmedSessionId === "") return null;

  return (
    <div className="flex-1 flex flex-col w-full bg-black min-h-0 overflow-hidden">
      <div className="flex-1 relative min-h-0">
        <button
          type="button"
          className="absolute right-3 top-3 z-20 hidden rounded-md border border-zinc-700 bg-zinc-900/90 px-3 py-1.5 text-sm text-zinc-100 shadow-lg transition-colors hover:bg-zinc-800 md:inline-flex"
          data-testid="terminal-copy-text-button"
          onClick={openCopyTextModal}
        >
          Copy Text
        </button>
        <TerminalComponent
          ref={terminalRef}
          wsUrl={wsUrl}
          latchedModifiers={latchedModifiers}
          onConsumeLatchedModifiers={resetLatchedModifiers}
        />
      </div>
      <MobileTerminalPalette
        latchedModifiers={latchedModifiers}
        onToggleModifier={toggleModifier}
        onSend={send}
        onCopy={openCopyTextModal}
        onPaste={pasteFromClipboard}
        onOpenMenu={openMobileMenu}
      />
      <CopyTextModal
        open={copyModalOpen}
        content={copyModalContent}
        onClose={closeCopyTextModal}
      />
    </div>
  );
}
