import type { ReactNode } from "react";

type MobileCommandBarProps = Readonly<{
  children: ReactNode;
  floating?: boolean;
  className?: string;
}>;

export default function MobileCommandBar({
  children,
  floating = false,
  className = "",
}: MobileCommandBarProps) {
  const wrapperClassName = floating
    ? "md:hidden fixed inset-x-0 bottom-0 z-[70] px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
    : "md:hidden flex-shrink-0 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]";

  return (
    <div className={wrapperClassName}>
      <div
        className={`rounded-xl border border-zinc-800 bg-zinc-900/95 p-2 shadow-2xl backdrop-blur ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
