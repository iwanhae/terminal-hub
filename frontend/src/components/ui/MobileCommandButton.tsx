import type { ButtonHTMLAttributes, ReactNode } from "react";

type MobileCommandButtonTone = "neutral" | "primary" | "danger";
type MobileCommandButtonSize = "sm" | "md";

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "className" | "onClick"
>;

type MobileCommandButtonProps = Readonly<{
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  tone?: MobileCommandButtonTone;
  size?: MobileCommandButtonSize;
  className?: string;
  testId?: string;
}> &
  NativeButtonProps;

function classesForTone(
  tone: MobileCommandButtonTone,
  active: boolean,
): string {
  if (active) {
    return "border-emerald-500/80 bg-emerald-600 text-white";
  }

  if (tone === "primary") {
    return "border-emerald-700/70 bg-emerald-700/25 text-emerald-100 hover:bg-emerald-700/40";
  }

  if (tone === "danger") {
    return "border-red-800/70 bg-red-900/25 text-red-200 hover:bg-red-900/40";
  }

  return "border-zinc-700 bg-zinc-950 text-zinc-200 hover:bg-zinc-800";
}

function classesForSize(size: MobileCommandButtonSize): string {
  if (size === "md") {
    return "h-9 px-3 text-sm";
  }

  return "h-8 px-2.5 text-xs";
}

export default function MobileCommandButton({
  label,
  icon,
  onClick,
  active = false,
  tone = "neutral",
  size = "sm",
  className = "",
  disabled = false,
  testId,
  type = "button",
  ...nativeProps
}: MobileCommandButtonProps) {
  const toneClassName = classesForTone(tone, active);
  const sizeClassName = classesForSize(size);

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-45 ${sizeClassName} ${toneClassName} ${className}`}
      {...nativeProps}
    >
      {icon != null && (
        <span className="inline-flex items-center justify-center text-sm leading-none">
          {icon}
        </span>
      )}
      <span>{label}</span>
    </button>
  );
}
