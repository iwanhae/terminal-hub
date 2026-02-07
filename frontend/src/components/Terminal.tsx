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

interface TerminalProps {
  wsUrl: string;
}

export type TerminalHandle = {
  focus: () => void;
  sendInput: (data: string) => void;
};

interface FileDownloadMessage {
  type: "file_download";
  path: string;
  filename: string;
}

const TerminalComponent = forwardRef<TerminalHandle, TerminalProps>(
  ({ wsUrl }, ref) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<HTMLDivElement>(null);
    const terminalInstanceRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const sendInputRef = useRef<(data: string) => void>(() => {});

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

    useImperativeHandle(
      ref,
      () => ({
        focus,
        sendInput: (data: string) => sendInputRef.current(data),
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

        if (!fitAddon || !terminal || !ws) return;

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

          // Check for OSC file download sequences
          const downloadMsg = parseOSCFilename(dataToWrite);
          if (downloadMsg) {
            void triggerDownload(downloadMsg);
            const strippedData = stripOSCSequences(dataToWrite);

            // Write to terminal (or skip if empty after stripping)
            if (strippedData.length > 0) {
              terminal.write(strippedData);
            }
            return;
          }

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

      // Parse OSC escape sequences for file downloads
      const parseOSCFilename = (
        data: Uint8Array,
      ): FileDownloadMessage | null => {
        // eslint-disable-next-line unicorn/prefer-code-point
        const str = String.fromCharCode(...data);
        // OSC sequence: ESC ] FILE;download:path=<path>,name=<name> BEL
        const oscPattern =
          // eslint-disable-next-line no-control-regex, sonarjs/no-control-regex
          /\x1b\]FILE;download:path=([^,]+),name=([^\x07]+)\x07/g;
        const match = oscPattern.exec(str);

        if (match && match.length >= 3) {
          return {
            type: "file_download",
            path: match[1],
            filename: match[2],
          };
        }

        return null;
      };

      // Strip OSC sequences from terminal output
      const stripOSCSequences = (data: Uint8Array): Uint8Array => {
        // eslint-disable-next-line unicorn/prefer-code-point
        const str = String.fromCharCode(...data);
        // OSC sequence: ESC ] FILE;download:... BEL
        const cleaned = str.replaceAll(
          // eslint-disable-next-line no-control-regex, sonarjs/no-control-regex
          /\x1b\]FILE;download:[^\x07]+\x07/g,
          "",
        );
        return new TextEncoder().encode(cleaned);
      };

      // Trigger file download via REST API (session-independent)
      const triggerDownload = async (msg: FileDownloadMessage) => {
        try {
          const params = new URLSearchParams({
            path: msg.path,
            filename: msg.filename,
          });

          const response = await fetch(`/api/download?${params.toString()}`, {
            method: "GET",
            credentials: "include",
          });

          if (!response.ok) {
            const errorText = await response.text();
            terminal.write(
              `\r\n\x1b[31m[Download Error] ${errorText}\x1b[0m\r\n`,
            );
            return;
          }

          // Get blob and trigger browser download
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = msg.filename;
          document.body.append(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);

          terminal.write(
            `\r\n\x1b[32m[Download] Downloading: ${msg.filename}\x1b[0m\r\n`,
          );
        } catch (error) {
          console.error("Download error:", error);
          terminal.write(
            `\r\n\x1b[31m[Download Error] Failed to initiate download\x1b[0m\r\n`,
          );
        }
      };

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
