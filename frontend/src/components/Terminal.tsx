import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  wsUrl: string;
}

const TerminalComponent = ({ wsUrl }: TerminalProps) => {
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

    // Helper function to send resize events
    const sendResize = (ws: WebSocket | null) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          terminal.resize(dims.cols, dims.rows);
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

    // Initial fit with small delay
    const initialFitTimeout = setTimeout(() => {
      fitAddon.fit();
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

    // Window resize handling
    let resizeTimeout: number;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        fitAddon.fit();
        sendResize(ws);
      }, 100);
    };

    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      clearTimeout(initialFitTimeout);
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handleResize);
      terminal.dispose();
      ws.close();
    };
  }, [wsUrl]);

  return <div ref={terminalRef} style={{ height: "100%", width: "100%" }} />;
};

export default TerminalComponent;
