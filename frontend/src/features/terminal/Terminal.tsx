import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useCallback,
} from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import toast from "react-hot-toast";
import {
  DEFAULT_LATCHED_MODIFIERS,
  hasLatchedModifiers,
  sequenceFromLatchedKey,
  type LatchedModifiers,
} from "./mobileKeySequences";

interface TerminalProps {
  wsUrl: string;
  latchedModifiers?: LatchedModifiers;
  onConsumeLatchedModifiers?: () => void;
}

export type TerminalHandle = {
  focus: () => void;
  sendInput: (data: string) => void;
  pasteFromClipboard: () => Promise<void>;
};

type ClipboardShortcutAction = "copy" | "paste";

function getClipboardShortcutAction(
  event: KeyboardEvent,
): ClipboardShortcutAction | null {
  const hasNativeModifier = event.ctrlKey || event.metaKey;
  if (!hasNativeModifier || !event.shiftKey || event.altKey) {
    return null;
  }

  const key = event.key.toLowerCase();
  if (key === "c") {
    return "copy";
  }
  if (key === "v") {
    return "paste";
  }
  return null;
}

function handleLatchedModifierInput(
  event: KeyboardEvent,
  modifiers: LatchedModifiers,
  sendInput: (data: string) => void,
  onConsumed: () => void,
): boolean {
  if (!hasLatchedModifiers(modifiers)) {
    return true;
  }

  const sequence = sequenceFromLatchedKey(event.key, modifiers);
  if (sequence == null) {
    return true;
  }

  event.preventDefault();
  sendInput(sequence);
  onConsumed();
  return false;
}

const TerminalComponent = forwardRef<TerminalHandle, TerminalProps>(
  ({ wsUrl, latchedModifiers, onConsumeLatchedModifiers }, ref) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<HTMLDivElement>(null);
    const terminalInstanceRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const sendInputRef = useRef<(data: string) => void>(() => {});
    const pasteFromClipboardRef = useRef<() => Promise<void>>(async () => {});
    const latchedModifiersRef = useRef<LatchedModifiers>(
      latchedModifiers ?? DEFAULT_LATCHED_MODIFIERS,
    );
    const onConsumeLatchedModifiersRef = useRef<(() => void) | undefined>(
      onConsumeLatchedModifiers,
    );

    // Touch state tracking for scroll handling
    const touchStateRef = useRef<{
      isTracking: boolean;
      startX: number;
      startY: number;
      lastY: number;
      startTime: number;
      isScroll: boolean;
      pendingWheelDelta: number;
      lastWheelSentAt: number;
    }>({
      isTracking: false,
      startX: 0,
      startY: 0,
      lastY: 0,
      startTime: 0,
      isScroll: false,
      pendingWheelDelta: 0,
      lastWheelSentAt: 0,
    });

    // Reconnection state refs
    const reconnectAttemptsRef = useRef<number>(0);
    const reconnectTimeoutRef = useRef<number | null>(null);
    const isReconnectingRef = useRef<boolean>(false);
    const isManuallyClosedRef = useRef<boolean>(false);

    // Constants
    const MAX_RECONNECT_ATTEMPTS = 10;
    const BASE_RECONNECT_DELAY = 1000;
    const MAX_RECONNECT_DELAY = 30_000;

    const focus = useCallback(() => {
      terminalInstanceRef.current?.focus();
    }, []);

    useEffect(() => {
      latchedModifiersRef.current =
        latchedModifiers ?? DEFAULT_LATCHED_MODIFIERS;
    }, [latchedModifiers]);

    useEffect(() => {
      onConsumeLatchedModifiersRef.current = onConsumeLatchedModifiers;
    }, [onConsumeLatchedModifiers]);

    useImperativeHandle(
      ref,
      () => ({
        focus,
        sendInput: (data: string) => sendInputRef.current(data),
        pasteFromClipboard: () => pasteFromClipboardRef.current(),
      }),
      [focus],
    );

    useEffect(() => {
      if (!terminalRef.current) return;

      // Theme configuration
      const theme = {
        background: "#000000",
        foreground: "#ffffff",
        cursor: "#ffffff",
        selection: "rgba(255, 255, 255, 0.3)",
        black: "#000000",
        red: "#e06c75",
        green: "#98c379",
        yellow: "#d19a66",
        blue: "#61afef",
        magenta: "#c678dd",
        cyan: "#56b6c2",
        white: "#abb2bf",
        brightBlack: "#5c6370",
        brightRed: "#e06c75",
        brightGreen: "#98c379",
        brightYellow: "#d19a66",
        brightBlue: "#61afef",
        brightMagenta: "#c678dd",
        brightCyan: "#56b6c2",
        brightWhite: "#ffffff",
      };

      // Initialize Terminal
      const terminal = new Terminal({
        cursorBlink: true,
        macOptionIsMeta: true,
        scrollback: 1000,
        fontSize: 14,
        fontFamily:
          "JetBrains Mono, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        theme: theme,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      terminal.open(terminalRef.current);
      terminalInstanceRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Capture terminalRef for cleanup (stable reference)
      const terminalDomNode = terminalRef.current;
      const xtermViewport = terminalDomNode.querySelector(
        ".xterm-viewport",
      ) as HTMLElement | null;

      const TOUCH_SCROLL_THRESHOLD = 12;
      const WHEEL_FLUSH_INTERVAL_MS = 16;
      const WHEEL_DELTA_MULTIPLIER = 3;

      const dispatchSyntheticWheel = (deltaY: number, touch: Touch) => {
        if (xtermViewport == null) {
          return;
        }

        const wheelEvent = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaY,
          clientX: touch.clientX,
          clientY: touch.clientY,
        });
        xtermViewport.dispatchEvent(wheelEvent);
      };

      // Touch event handlers for scroll support
      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        touchStateRef.current = {
          isTracking: true,
          startX: touch.pageX,
          startY: touch.pageY,
          lastY: touch.pageY,
          startTime: Date.now(),
          isScroll: false,
          pendingWheelDelta: 0,
          lastWheelSentAt: 0,
        };
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (!touchStateRef.current.isTracking || e.touches.length !== 1) return;

        const state = touchStateRef.current;
        const touch = e.touches[0];
        const deltaY = touch.pageY - state.lastY;
        const totalDeltaY = touch.pageY - state.startY;

        if (!state.isScroll && Math.abs(totalDeltaY) > TOUCH_SCROLL_THRESHOLD) {
          state.isScroll = true;
        }

        if (state.isScroll) {
          e.preventDefault();

          state.pendingWheelDelta += -deltaY * WHEEL_DELTA_MULTIPLIER;
          state.lastY = touch.pageY;

          const now = Date.now();
          if (now - state.lastWheelSentAt >= WHEEL_FLUSH_INTERVAL_MS) {
            if (Math.abs(state.pendingWheelDelta) > 0) {
              dispatchSyntheticWheel(state.pendingWheelDelta, touch);
              state.pendingWheelDelta = 0;
            }
            state.lastWheelSentAt = now;
          }
        }
      };

      const handleTouchEnd = (e: TouchEvent) => {
        if (!touchStateRef.current.isTracking) return;

        const { startX, startY, startTime, isScroll, pendingWheelDelta } =
          touchStateRef.current;
        const endTime = Date.now();
        const duration = endTime - startTime;

        if (
          isScroll &&
          pendingWheelDelta !== 0 &&
          e.changedTouches.length > 0
        ) {
          dispatchSyntheticWheel(pendingWheelDelta, e.changedTouches[0]);
        }

        // Quick tap focuses terminal
        if (!isScroll && duration < 300 && e.changedTouches.length > 0) {
          const touch = e.changedTouches[0];
          const deltaX = Math.abs(touch.pageX - startX);
          const deltaY = Math.abs(touch.pageY - startY);
          if (deltaX < 10 && deltaY < 10) {
            terminalInstanceRef.current?.focus();
          }
        }

        touchStateRef.current.isTracking = false;
      };

      // Register touch event listeners
      if (terminalDomNode != null) {
        terminalDomNode.addEventListener("touchstart", handleTouchStart, {
          passive: false,
        });
        terminalDomNode.addEventListener("touchmove", handleTouchMove, {
          passive: false,
        });
        terminalDomNode.addEventListener("touchend", handleTouchEnd);
        terminalDomNode.addEventListener("touchcancel", handleTouchEnd);
        terminalDomNode.addEventListener("paste", handlePasteEvent);
      }

      terminal.attachCustomKeyEventHandler(handleCustomKeyEvent);

      if (window.innerWidth < 768) {
        setTimeout(() => terminal.focus(), 200);
      }

      // Initial fit immediately to avoid 80x24 default
      try {
        const dims = fitAddon.proposeDimensions();
        if (dims && dims.cols >= 2 && dims.rows >= 2) {
          fitAddon.fit();
        }
      } catch (error) {
        console.warn("Initial fit failed", error);
      }

      // Helper function to send resize events
      const sendResize = (ws: WebSocket | null) => {
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          terminal.resize(dims.cols, dims.rows);
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "resize",
                cols: dims.cols,
                rows: dims.rows,
              }),
            );
          }
        }
      };

      // Helper function to trigger TUI refresh by sending resize events
      const triggerTUIRefresh = (ws: WebSocket) => {
        const fitAddon = fitAddonRef.current;
        const terminal = terminalInstanceRef.current;

        if (fitAddon == null || terminal == null) return;

        const dims = fitAddon.proposeDimensions();
        if (!dims || dims.cols < 2 || dims.rows < 2) return;

        // Step 1: Temporarily resize to cols-1 to force SIGWINCH
        terminal.resize(dims.cols - 1, dims.rows);
        ws.send(
          JSON.stringify({
            type: "resize",
            cols: dims.cols - 1,
            rows: dims.rows,
          }),
        );

        // Step 2: Restore original dimensions after 75ms
        setTimeout(() => {
          // Check if component is still mounted and refs are valid
          if (
            isManuallyClosedRef.current ||
            !terminalInstanceRef.current ||
            !fitAddonRef.current ||
            ws.readyState !== WebSocket.OPEN
          ) {
            return;
          }

          terminalInstanceRef.current.resize(dims.cols, dims.rows);
          ws.send(
            JSON.stringify({
              type: "resize",
              cols: dims.cols,
              rows: dims.rows,
            }),
          );
        }, 75);
      };

      const copySelectionToClipboard = async () => {
        try {
          let selectedText = terminal.getSelection();
          if (selectedText.length === 0) {
            selectedText = window.getSelection()?.toString() ?? "";
          }

          if (selectedText.length === 0) {
            toast.error("No text selected to copy");
            return;
          }

          if (
            navigator.clipboard == null ||
            typeof navigator.clipboard.writeText !== "function"
          ) {
            toast.error("Clipboard API is not available in this browser");
            return;
          }

          await navigator.clipboard.writeText(selectedText);
          toast.success("Copied to clipboard");
        } catch (error) {
          console.error("Clipboard copy error:", error);
          toast.error("Failed to copy to clipboard");
        }
      };

      const pasteFromClipboard = async () => {
        try {
          if (
            navigator.clipboard == null ||
            typeof navigator.clipboard.readText !== "function"
          ) {
            toast.error("Clipboard API is not available in this browser");
            return;
          }

          const text = await navigator.clipboard.readText();
          if (text.length === 0) {
            return;
          }

          sendInputRef.current(text);
        } catch (error) {
          console.error("Clipboard paste error:", error);
          toast.error("Failed to paste from clipboard");
        }
      };

      function handlePasteEvent(event: ClipboardEvent) {
        event.preventDefault();

        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (text.length > 0) {
          sendInputRef.current(text);
        }
      }

      function handleCustomKeyEvent(event: KeyboardEvent): boolean {
        const clipboardAction = getClipboardShortcutAction(event);
        if (clipboardAction != null) {
          if (event.type === "keydown") {
            event.preventDefault();
            if (clipboardAction === "copy") {
              void copySelectionToClipboard();
            } else {
              void pasteFromClipboard();
            }
          }
          return false;
        }

        if (
          event.type !== "keydown" ||
          event.ctrlKey ||
          event.altKey ||
          event.metaKey
        ) {
          return true;
        }

        return handleLatchedModifierInput(
          event,
          latchedModifiersRef.current,
          sendInputRef.current,
          () => {
            latchedModifiersRef.current = DEFAULT_LATCHED_MODIFIERS;
            onConsumeLatchedModifiersRef.current?.();
          },
        );
      }

      // Calculate exponential backoff delay with max cap
      const calculateBackoffDelay = (attempt: number): number => {
        return Math.min(
          BASE_RECONNECT_DELAY * Math.pow(2, attempt),
          MAX_RECONNECT_DELAY,
        );
      };

      // Schedule a reconnection attempt
      const scheduleReconnect = () => {
        const attempt = reconnectAttemptsRef.current;

        if (attempt >= MAX_RECONNECT_ATTEMPTS) {
          isReconnectingRef.current = false;
          toast.error("Failed to reconnect. Refresh the page.", {
            id: "reconnect-toast",
            duration: 5000,
          });
          return;
        }

        const delay = calculateBackoffDelay(attempt);

        toast.loading(
          `Reconnecting... (${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})`,
          {
            id: "reconnect-toast",
          },
        );

        // Clear any existing timeout before scheduling a new one
        if (reconnectTimeoutRef.current !== null) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        reconnectTimeoutRef.current = window.setTimeout(() => {
          reconnectTimeoutRef.current = null;
          reconnectAttemptsRef.current++;
          connectWebSocket();
        }, delay);
      };

      // Main WebSocket connection function
      const connectWebSocket = () => {
        const ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        ws.onopen = () => {
          const wasReconnecting = isReconnectingRef.current;
          isReconnectingRef.current = false;
          reconnectAttemptsRef.current = 0;

          sendResize(ws);

          // Always trigger TUI refresh for apps like htop, vim, etc.
          triggerTUIRefresh(ws);

          // Show success message only when reconnecting
          if (wasReconnecting) {
            toast.success("Reconnected to terminal", {
              id: "reconnect-toast",
              duration: 2000,
            });
          }
        };

        ws.onmessage = (event) => {
          // Convert data to Uint8Array
          const dataToWrite = new Uint8Array(event.data);

          // Write to terminal
          terminal.write(dataToWrite);
        };

        ws.onclose = () => {
          // Don't reconnect if manually closed (e.g., component unmount)
          if (isManuallyClosedRef.current) {
            return;
          }

          // Only start reconnection if not already reconnecting
          if (isReconnectingRef.current) {
            // Connection closed while reconnecting, trigger next attempt
            scheduleReconnect();
          } else {
            isReconnectingRef.current = true;
            terminal.write(
              "\r\n\x1b[31m[SYSTEM] Connection lost. Reconnecting...\x1b[0m\r\n",
            );
            scheduleReconnect();
          }
        };

        ws.onerror = (err) => {
          console.error("WebSocket Error:", err);
          // Note: We don't write to terminal here as onclose will handle it
        };
      };

      // Initial fit with small delay to ensure container is fully laid out
      const initialFitTimeout = setTimeout(() => {
        sendResize(wsRef.current);
      }, 100);

      // Initial WebSocket connection
      connectWebSocket();

      // Terminal input handling
      const sendInput = (data: string) => {
        // Block input if reconnecting
        if (isReconnectingRef.current) {
          return;
        }

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          return;
        }

        wsRef.current.send(
          JSON.stringify({
            type: "input",
            data: data,
          }),
        );
      };

      sendInputRef.current = sendInput;
      pasteFromClipboardRef.current = pasteFromClipboard;

      terminal.onData((data) => sendInputRef.current(data));

      // Container resize handling with ResizeObserver
      let resizeTimeout: number;
      const resizeObserver = new ResizeObserver(() => {
        // Debounce resize
        clearTimeout(resizeTimeout);
        resizeTimeout = window.setTimeout(() => {
          if (wrapperRef.current && terminalRef.current) {
            try {
              const dims = fitAddon.proposeDimensions();
              if (dims && dims.cols >= 2 && dims.rows >= 2) {
                fitAddon.fit();
                sendResize(wsRef.current);
              }
            } catch (error) {
              console.error("Resize error:", error);
            }
          }
        }, 100);
      });

      if (wrapperRef.current) {
        resizeObserver.observe(wrapperRef.current);
      }

      // Cleanup
      return () => {
        // Prevent reconnection attempts after unmount
        isManuallyClosedRef.current = true;

        // Remove touch event listeners
        if (terminalDomNode != null) {
          terminalDomNode.removeEventListener("touchstart", handleTouchStart);
          terminalDomNode.removeEventListener("touchmove", handleTouchMove);
          terminalDomNode.removeEventListener("touchend", handleTouchEnd);
          terminalDomNode.removeEventListener("touchcancel", handleTouchEnd);
          terminalDomNode.removeEventListener("paste", handlePasteEvent);
        }

        terminal.attachCustomKeyEventHandler(() => true);

        // Clear any pending reconnection timeout
        if (reconnectTimeoutRef.current !== null) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        // Dismiss reconnection toast if active
        toast.dismiss("reconnect-toast");

        clearTimeout(initialFitTimeout);
        clearTimeout(resizeTimeout);
        resizeObserver.disconnect();
        terminal.dispose();
        wsRef.current?.close();
      };
    }, [wsUrl]);

    return (
      <div
        ref={wrapperRef}
        className="w-full h-full relative min-w-0 min-h-0"
        style={{ touchAction: "none" }}
        data-testid="terminal-surface"
        onPointerDown={() => focus()}
      >
        <div ref={terminalRef} className="absolute inset-0 overflow-hidden" />
      </div>
    );
  },
);

TerminalComponent.displayName = "TerminalComponent";

export default TerminalComponent;
