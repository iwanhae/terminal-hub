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

interface TerminalProps {
  wsUrl: string;
}

export type TerminalHandle = {
  focus: () => void;
  sendInput: (data: string) => void;
};

const TerminalComponent = forwardRef<TerminalHandle, TerminalProps>(
  ({ wsUrl }, ref) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<HTMLDivElement>(null);
    const terminalInstanceRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const sendInputRef = useRef<(data: string) => void>(() => {});

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
        fontFamily: "monospace",
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

      // Initial fit with small delay to ensure container is fully laid out
      const initialFitTimeout = setTimeout(() => {
        sendResize(wsRef.current);
      }, 100);

      // WebSocket connection
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        sendResize(ws);
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          terminal.write(new Uint8Array(event.data));
        } else {
          terminal.write(event.data);
        }
      };

      ws.onclose = () => {
        terminal.write("\r\n\x1b[31m[SYSTEM] Connection Closed\x1b[0m\r\n");
      };

      ws.onerror = (err) => {
        console.error("WebSocket Error:", err);
        terminal.write("\r\n\x1b[31m[SYSTEM] WebSocket Error\x1b[0m\r\n");
      };

      // Terminal input handling
      const sendInput = (data: string) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        ws.send(
          JSON.stringify({
            type: "input",
            data: data,
          }),
        );
      };

      sendInputRef.current = sendInput;

      terminal.onData(sendInput);

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
                sendResize(ws);
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
        clearTimeout(initialFitTimeout);
        clearTimeout(resizeTimeout);
        resizeObserver.disconnect();
        terminal.dispose();
        ws.close();
      };
    }, [wsUrl]);

    const sendExtraKey = (key: string) => {
      if (
        wsRef.current?.readyState === WebSocket.OPEN &&
        terminalInstanceRef.current
      ) {
        terminalInstanceRef.current.paste(key);
      }
    };

    const handlePaste = () => {
      void (async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            sendInputRef.current(text);
          }
        } catch (error) {
          console.error("Paste failed:", error);
        }
      })();
    };

    return (
      <div
        ref={wrapperRef}
        className="w-full h-full relative min-w-0 min-h-0"
        data-testid="terminal-surface"
        onPointerDown={() => focus()}
      >
        <div ref={terminalRef} className="absolute inset-0 overflow-hidden" />
        <div className="md:hidden absolute bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 p-2 flex flex-wrap gap-2 items-center justify-center">
          <button
            data-testid="extra-key-esc"
            onClick={() => sendExtraKey("\x1b")}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-mono transition-colors"
            title="ESC"
          >
            ESC
          </button>
          <button
            data-testid="extra-key-tab"
            onClick={() => sendExtraKey("\t")}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-mono transition-colors"
            title="Tab"
          >
            TAB
          </button>
          <button
            data-testid="extra-key-pgup"
            onClick={() => sendExtraKey("\x1b[5~")}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-mono transition-colors"
            title="Page Up"
          >
            PgUp
          </button>
          <button
            data-testid="extra-key-pgdn"
            onClick={() => sendExtraKey("\x1b[6~")}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-mono transition-colors"
            title="Page Down"
          >
            PgDn
          </button>
          <button
            data-testid="extra-key-ctrl-a"
            onClick={() => sendExtraKey("\x01")}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-mono transition-colors"
            title="Ctrl+A"
          >
            Ctrl+A
          </button>
          <button
            data-testid="extra-key-ctrl-c"
            onClick={() => sendExtraKey("\x03")}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-mono transition-colors"
            title="Ctrl+C"
          >
            Ctrl+C
          </button>
          <button
            data-testid="extra-key-ctrl-l"
            onClick={() => sendExtraKey("\x0c")}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-mono transition-colors"
            title="Ctrl+L (Clear)"
          >
            Ctrl+L
          </button>
          <button
            data-testid="extra-key-paste"
            onClick={() => handlePaste()}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-mono transition-colors"
            title="Paste from clipboard"
          >
            Paste
          </button>
        </div>
      </div>
    );
  },
);

TerminalComponent.displayName = "TerminalComponent";

export default TerminalComponent;
