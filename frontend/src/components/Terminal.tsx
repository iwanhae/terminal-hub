import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  wsUrl: string;
}

const TerminalComponent = ({ wsUrl }: TerminalProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

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
    const handleData = (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "input",
            data: data,
          }),
        );
      }
    };

    terminal.onData(handleData);

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

  return (
    <div ref={wrapperRef} className="w-full h-full relative min-w-0 min-h-0">
      <div ref={terminalRef} className="absolute inset-0 overflow-hidden" />
    </div>
  );
};

export default TerminalComponent;
