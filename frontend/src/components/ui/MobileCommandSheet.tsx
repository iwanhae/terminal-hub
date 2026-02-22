import { useEffect, useId, type ReactNode } from "react";
import MobileCommandButton from "./MobileCommandButton";

type MobileCommandSheetProps = Readonly<{
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  zIndexClassName?: string;
}>;

export default function MobileCommandSheet({
  open,
  title,
  onClose,
  children,
  zIndexClassName = "z-[85]",
}: MobileCommandSheetProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className={`fixed inset-0 md:hidden ${zIndexClassName}`}>
      <button
        type="button"
        aria-label={`Close ${title}`}
        className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-hidden rounded-t-2xl border border-zinc-700 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
          <div>
            <div className="mb-1 h-1 w-10 rounded-full bg-zinc-700" />
            <p id={titleId} className="text-sm font-semibold text-zinc-100">
              {title}
            </p>
          </div>
          <MobileCommandButton
            label="Close"
            onClick={onClose}
            tone="neutral"
            size="sm"
          />
        </div>
        <div className="max-h-[calc(88vh-4rem)] overflow-y-auto p-3">
          {children}
        </div>
      </div>
    </div>
  );
}
