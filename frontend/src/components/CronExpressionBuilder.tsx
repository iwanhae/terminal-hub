import { useEffect, useState } from "react";

interface CronExpressionBuilderProps {
  value: string;
  onChange: (value: string) => void;
  onError?: (error: string) => void;
}

const commonPresets = [
  { label: "Every minute", expression: "* * * * * *" },
  { label: "Every 5 minutes", expression: "*/5 * * * *" },
  { label: "Every 15 minutes", expression: "*/15 * * * *" },
  { label: "Every 30 minutes", expression: "0,30 * * * *" },
  { label: "Every hour", expression: "0 * * * *" },
  { label: "Every day at midnight", expression: "0 0 * * *" },
  { label: "Every day at 6am", expression: "0 6 * * *" },
  { label: "Every week (Sunday)", expression: "0 0 * * 0" },
  { label: "Every week (Monday)", expression: "0 0 * * 1" },
  { label: "Every month (1st)", expression: "0 0 1 * *" },
];

function isCronExpressionValid(expression: string): boolean {
  const cronRegex = /^(\S+\s+){4}\S+$/;
  return cronRegex.test(expression);
}

function getNextRuns(expression: string, count = 5): string[] {
  try {
    if (!isCronExpressionValid(expression)) {
      return [];
    }

    const [min, hour, day, month, dow] = expression.split(" ");
    let now = new Date();
    const runs: string[] = [];
    const setters = [
      {
        value: min,
        apply: (date: Date, parsed: number) => {
          date.setMinutes(parsed);
        },
      },
      {
        value: hour,
        apply: (date: Date, parsed: number) => {
          date.setHours(parsed);
        },
      },
      {
        value: day,
        apply: (date: Date, parsed: number) => {
          date.setDate(parsed);
        },
      },
      {
        value: month,
        apply: (date: Date, parsed: number) => {
          date.setMonth(parsed - 1);
        },
      },
    ];

    for (let i = 0; i < count; i++) {
      const nextRun = new Date(now);
      for (const setter of setters) {
        if (setter.value !== "*") {
          setter.apply(nextRun, Number.parseInt(setter.value, 10));
        }
      }
      if (dow !== "*") {
        const dayOfWeek = Number.parseInt(dow, 10);
        let diff = dayOfWeek - nextRun.getDay();
        if (diff <= 0) {
          diff += 7;
        }
        nextRun.setDate(nextRun.getDate() + diff);
      }

      nextRun.setSeconds(0);
      nextRun.setMilliseconds(0);

      if (nextRun <= now) {
        nextRun.setHours(nextRun.getHours() + 1);
      }

      runs.push(nextRun.toLocaleString());
      now = nextRun;
    }

    return runs;
  } catch {
    return [];
  }
}

export default function CronExpressionBuilder({
  value,
  onChange,
  onError,
}: Readonly<CronExpressionBuilderProps>) {
  const [customMode, setCustomMode] = useState(value !== "");
  const isValid = isCronExpressionValid(value);
  const errorMessage =
    !isValid && value.trim() !== "" ? "Invalid cron expression" : "";

  useEffect(() => {
    if (onError != null) {
      onError(errorMessage);
    }
  }, [errorMessage, onError]);

  const handlePresetClick = (expression: string) => {
    onChange(expression);
    setCustomMode(false);
  };

  const handleCustomChange = (newValue: string) => {
    onChange(newValue);
    setCustomMode(true);
  };

  return (
    <div className="space-y-4">
      <div className="block text-sm font-medium text-zinc-400 mb-1">
        Cron Expression <span className="text-red-400">*</span>
      </div>

      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setCustomMode(false)}
          className={`px-3 py-2 rounded font-medium text-sm transition-colors ${
            customMode
              ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              : "bg-emerald-600 hover:bg-emerald-500 text-white"
          }`}
        >
          Presets
        </button>
        <button
          type="button"
          onClick={() => setCustomMode(true)}
          className={`px-3 py-2 rounded font-medium text-sm transition-colors ${
            customMode
              ? "bg-emerald-600 hover:bg-emerald-500 text-white"
              : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
          }`}
        >
          Custom
        </button>
      </div>

      {!customMode && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {commonPresets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handlePresetClick(preset.expression)}
              className="px-3 py-2 bg-zinc-900/70 border border-zinc-700/80 rounded text-sm hover:border-emerald-400 transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {customMode && (
        <input
          type="text"
          value={value}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder="* * * * * *"
          className={`w-full bg-zinc-950/70 border rounded px-3 py-2 text-zinc-200 focus:outline-none transition-colors ${
            isValid
              ? "border-emerald-400 focus:ring-2 focus:ring-emerald-500/40"
              : "border-red-400 focus:ring-2 focus:ring-red-500/40"
          }`}
        />
      )}

      {errorMessage !== "" && (
        <p className="mt-2 text-sm text-red-400">{errorMessage}</p>
      )}

      {isValid && (
        <div className="mt-4 bg-zinc-900/50 border border-zinc-800/80 rounded-lg p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">
            Next 5 Runs
          </div>
          <ul className="space-y-1 text-sm text-zinc-300 font-mono">
            {getNextRuns(value, 5).map((run, i) => (
              <li key={i}>
                <span className="text-zinc-500">{i + 1}.</span> {run}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
