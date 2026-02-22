import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  TERMINAL_KEY_SEQUENCES,
  type LatchedModifierKey,
  type LatchedModifiers,
} from "../../features/terminal/mobileKeySequences";
import MobileCommandButton from "./MobileCommandButton";

type Position = Readonly<{
  x: number;
  y: number;
}>;

type PaletteSize = Readonly<{
  width: number;
  height: number;
}>;

type MobileTerminalPaletteProps = Readonly<{
  latchedModifiers: LatchedModifiers;
  onToggleModifier: (modifier: LatchedModifierKey) => void;
  onSend: (data: string) => void;
  onPaste: () => void;
  onCopy: () => void;
  onOpenMenu: () => void;
}>;

const EDGE_MARGIN = 8;
const DEFAULT_SIZE: PaletteSize = {
  width: 360,
  height: 132,
};

function getViewportRect() {
  const viewport = window.visualViewport;
  if (viewport != null) {
    return {
      left: viewport.offsetLeft,
      top: viewport.offsetTop,
      width: viewport.width,
      height: viewport.height,
    };
  }

  return {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function clampPosition(position: Position, size: PaletteSize): Position {
  const viewport = getViewportRect();
  const minX = viewport.left + EDGE_MARGIN;
  const maxX = Math.max(
    minX,
    viewport.left + viewport.width - size.width - EDGE_MARGIN,
  );
  const minY = viewport.top + EDGE_MARGIN;
  const maxY = Math.max(
    minY,
    viewport.top + viewport.height - size.height - EDGE_MARGIN,
  );

  return {
    x: Math.min(Math.max(position.x, minX), maxX),
    y: Math.min(Math.max(position.y, minY), maxY),
  };
}

function getDefaultPosition(size: PaletteSize): Position {
  const viewport = getViewportRect();
  const centeredX = viewport.left + (viewport.width - size.width) / 2;
  const bottomY = viewport.top + viewport.height - size.height - EDGE_MARGIN;

  return clampPosition(
    {
      x: centeredX,
      y: bottomY,
    },
    size,
  );
}

export default function MobileTerminalPalette({
  latchedModifiers,
  onToggleModifier,
  onSend,
  onPaste,
  onCopy,
  onOpenMenu,
}: MobileTerminalPaletteProps) {
  const paletteRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    pointerOffsetX: number;
    pointerOffsetY: number;
  } | null>(null);

  const [position, setPosition] = useState<Position | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const getPaletteSize = useCallback((): PaletteSize => {
    const element = paletteRef.current;
    if (element == null) {
      return DEFAULT_SIZE;
    }

    return {
      width: element.offsetWidth,
      height: element.offsetHeight,
    };
  }, []);

  const keepPaletteInViewport = useCallback(() => {
    const size = getPaletteSize();
    setPosition((currentPosition) => {
      if (currentPosition == null) {
        return getDefaultPosition(size);
      }

      return clampPosition(currentPosition, size);
    });
  }, [getPaletteSize]);

  useEffect(() => {
    const initFrame = window.requestAnimationFrame(() => {
      keepPaletteInViewport();
    });

    const viewport = window.visualViewport;
    const resizeObserver = new ResizeObserver(() => keepPaletteInViewport());

    if (paletteRef.current != null) {
      resizeObserver.observe(paletteRef.current);
    }

    window.addEventListener("resize", keepPaletteInViewport);
    window.addEventListener("orientationchange", keepPaletteInViewport);
    viewport?.addEventListener("resize", keepPaletteInViewport);
    viewport?.addEventListener("scroll", keepPaletteInViewport);

    return () => {
      window.cancelAnimationFrame(initFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", keepPaletteInViewport);
      window.removeEventListener("orientationchange", keepPaletteInViewport);
      viewport?.removeEventListener("resize", keepPaletteInViewport);
      viewport?.removeEventListener("scroll", keepPaletteInViewport);
    };
  }, [keepPaletteInViewport]);

  const preventFocusSteal = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
    },
    [],
  );

  const handleDragStart = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    const element = paletteRef.current;
    if (element == null) return;

    event.preventDefault();

    const rect = element.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: event.pointerId,
      pointerOffsetX: event.clientX - rect.left,
      pointerOffsetY: event.clientY - rect.top,
    };

    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handleDragMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (dragState == null || dragState.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();

      const size = getPaletteSize();
      setPosition(
        clampPosition(
          {
            x: event.clientX - dragState.pointerOffsetX,
            y: event.clientY - dragState.pointerOffsetY,
          },
          size,
        ),
      );
    },
    [getPaletteSize],
  );

  const handleDragEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (dragState == null || dragState.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <div
      className="fixed md:hidden z-[90] touch-none"
      style={{
        left: position?.x ?? EDGE_MARGIN,
        top: position?.y ?? EDGE_MARGIN,
        visibility: position == null ? "hidden" : "visible",
      }}
      data-testid="mobile-key-palette"
    >
      <div
        ref={paletteRef}
        className="max-w-[calc(100vw-1rem)] rounded-xl border border-zinc-800 bg-zinc-900/95 p-2 shadow-2xl backdrop-blur"
      >
        <div
          className={`mb-2 flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950/70 px-2 py-1 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="text-zinc-500">⠿</span>
            <span>Keys</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MobileCommandButton
              label="Copy"
              size="sm"
              testId="extra-key-copy"
              onPointerDown={preventFocusSteal}
              onClick={onCopy}
            />
            <MobileCommandButton
              label="Paste"
              size="sm"
              testId="extra-key-paste"
              onPointerDown={preventFocusSteal}
              onClick={onPaste}
            />
            <MobileCommandButton
              label="Menu"
              icon={<span>☰</span>}
              tone="primary"
              size="sm"
              testId="mobile-menu-button"
              onPointerDown={preventFocusSteal}
              onClick={onOpenMenu}
            />
          </div>
        </div>

        <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1.5">
          <MobileCommandButton
            label={latchedModifiers.ctrl ? "Ctrl●" : "Ctrl"}
            active={latchedModifiers.ctrl}
            testId="extra-key-ctrl"
            onPointerDown={preventFocusSteal}
            onClick={() => onToggleModifier("ctrl")}
          />
          <MobileCommandButton
            label={latchedModifiers.alt ? "Alt●" : "Alt"}
            active={latchedModifiers.alt}
            testId="extra-key-alt"
            onPointerDown={preventFocusSteal}
            onClick={() => onToggleModifier("alt")}
          />
          <MobileCommandButton
            label={latchedModifiers.shift ? "Shift●" : "Shift"}
            active={latchedModifiers.shift}
            testId="extra-key-shift"
            onPointerDown={preventFocusSteal}
            onClick={() => onToggleModifier("shift")}
          />
          <MobileCommandButton
            label="Esc"
            testId="extra-key-esc"
            onPointerDown={preventFocusSteal}
            onClick={() => onSend(TERMINAL_KEY_SEQUENCES.escape)}
          />
          <MobileCommandButton
            label="Tab"
            testId="extra-key-tab"
            onPointerDown={preventFocusSteal}
            onClick={() => onSend(TERMINAL_KEY_SEQUENCES.tab)}
          />
          <MobileCommandButton
            label="⇧Tab"
            testId="extra-key-shift-tab"
            title="Shift+Tab (Back Tab)"
            onPointerDown={preventFocusSteal}
            onClick={() => onSend(TERMINAL_KEY_SEQUENCES.backTab)}
          />
          <MobileCommandButton
            label="↑"
            testId="extra-key-up"
            onPointerDown={preventFocusSteal}
            onClick={() => onSend(TERMINAL_KEY_SEQUENCES.arrowUp)}
          />
          <MobileCommandButton
            label="←"
            testId="extra-key-left"
            onPointerDown={preventFocusSteal}
            onClick={() => onSend(TERMINAL_KEY_SEQUENCES.arrowLeft)}
          />
          <MobileCommandButton
            label="↓"
            testId="extra-key-down"
            onPointerDown={preventFocusSteal}
            onClick={() => onSend(TERMINAL_KEY_SEQUENCES.arrowDown)}
          />
          <MobileCommandButton
            label="→"
            testId="extra-key-right"
            onPointerDown={preventFocusSteal}
            onClick={() => onSend(TERMINAL_KEY_SEQUENCES.arrowRight)}
          />
          <MobileCommandButton
            label="Home"
            testId="extra-key-home"
            onPointerDown={preventFocusSteal}
            onClick={() => onSend(TERMINAL_KEY_SEQUENCES.home)}
          />
          <MobileCommandButton
            label="End"
            testId="extra-key-end"
            onPointerDown={preventFocusSteal}
            onClick={() => onSend(TERMINAL_KEY_SEQUENCES.end)}
          />
          <MobileCommandButton
            label="PgUp"
            testId="extra-key-page-up"
            onPointerDown={preventFocusSteal}
            onClick={() => onSend(TERMINAL_KEY_SEQUENCES.pageUp)}
          />
          <MobileCommandButton
            label="PgDn"
            testId="extra-key-page-down"
            onPointerDown={preventFocusSteal}
            onClick={() => onSend(TERMINAL_KEY_SEQUENCES.pageDown)}
          />
        </div>
      </div>
    </div>
  );
}
