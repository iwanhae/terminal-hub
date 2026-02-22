import type { CronJob, CreateCronRequest, UpdateCronRequest } from "./api";

export interface CronFormValues {
  name: string;
  schedule: string;
  command: string;
  shell: string;
  workingDirectory: string;
  envVarsText: string;
  enabled: boolean;
}

export interface CronScheduleValidationResult {
  valid: boolean;
  message: string;
}

export interface ParsedEnvVarsResult {
  envVars?: Record<string, string>;
  errors: string[];
}

export const CRON_SCHEDULE_PRESETS = [
  { label: "Every minute", schedule: "* * * * *" },
  { label: "Every 5 minutes", schedule: "*/5 * * * *" },
  { label: "Every 15 minutes", schedule: "*/15 * * * *" },
  { label: "Every hour", schedule: "0 * * * *" },
  { label: "Daily at midnight", schedule: "0 0 * * *" },
  { label: "Daily at 2 AM", schedule: "0 2 * * *" },
  { label: "Weekly on Sunday", schedule: "0 0 * * 0" },
  { label: "Monthly on 1st", schedule: "0 0 1 * *" },
] as const;

const CRON_FIELD_PATTERN = /^[\w*/?,#-]+$/i;
const ENV_VAR_KEY_PATTERN = /^[_A-Za-z]\w*$/;

function normalizeRequiredField(value: string): string {
  return value.trim();
}

function optionalFieldValue(value: string): string | undefined {
  if (value.trim() === "") {
    return undefined;
  }

  return value;
}

function sortKeys(input: Record<string, string>): string[] {
  // eslint-disable-next-line unicorn/no-array-sort -- TS target does not type toSorted reliably
  return Object.keys(input).sort((left, right) => left.localeCompare(right));
}

export function envVarsToText(
  envVars: Record<string, string> | undefined,
): string {
  if (envVars === undefined) {
    return "";
  }

  const keys = sortKeys(envVars);
  return keys.map((key) => `${key}=${envVars[key]}`).join("\n");
}

export function parseEnvVarsText(value: string): ParsedEnvVarsResult {
  const lines = value.split(/\r?\n/);
  const result: Record<string, string> = {};
  const errors: string[] = [];

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    const trimmedLine = line.trim();

    if (trimmedLine === "") {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      errors.push(`Line ${String(lineNumber)}: expected KEY=VALUE format.`);
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const parsedValue = line.slice(separatorIndex + 1);

    if (!ENV_VAR_KEY_PATTERN.test(key)) {
      errors.push(
        `Line ${String(lineNumber)}: invalid key "${key}". Use letters, numbers, and underscores only.`,
      );
      continue;
    }

    if (Object.hasOwn(result, key)) {
      errors.push(`Line ${String(lineNumber)}: duplicate key "${key}".`);
      continue;
    }

    result[key] = parsedValue;
  }

  if (errors.length > 0) {
    return { errors };
  }

  if (Object.keys(result).length === 0) {
    return { envVars: undefined, errors: [] };
  }

  return { envVars: result, errors: [] };
}

export function validateCronScheduleExpression(
  value: string,
): CronScheduleValidationResult {
  const normalized = value.trim();
  if (normalized === "") {
    return {
      valid: false,
      message: "Schedule is required.",
    };
  }

  const fields = normalized.split(/\s+/);
  if (fields.length !== 5 && fields.length !== 6) {
    return {
      valid: false,
      message:
        "Schedule must use 5 fields (minute hour day month weekday) or 6 fields (with seconds).",
    };
  }

  const invalidFieldIndex = fields.findIndex(
    (field) => !CRON_FIELD_PATTERN.test(field),
  );

  if (invalidFieldIndex !== -1) {
    return {
      valid: false,
      message: `Field ${String(invalidFieldIndex + 1)} contains unsupported characters.`,
    };
  }

  return {
    valid: true,
    message: "",
  };
}

export function createCronFormValues(job?: CronJob): CronFormValues {
  return {
    name: job?.name ?? "",
    schedule: job?.schedule ?? "* * * * *",
    command: job?.command ?? "",
    shell: job?.shell ?? "",
    workingDirectory: job?.working_directory ?? "",
    envVarsText: envVarsToText(job?.env_vars),
    enabled: job?.enabled ?? true,
  };
}

export function areCronFormValuesEqual(
  left: CronFormValues,
  right: CronFormValues,
): boolean {
  return (
    left.name === right.name &&
    left.schedule === right.schedule &&
    left.command === right.command &&
    left.shell === right.shell &&
    left.workingDirectory === right.workingDirectory &&
    left.envVarsText === right.envVarsText &&
    left.enabled === right.enabled
  );
}

export function formValuesToCreateRequest(
  values: CronFormValues,
): CreateCronRequest {
  const envVarsResult = parseEnvVarsText(values.envVarsText);

  if (envVarsResult.errors.length > 0) {
    throw new Error(envVarsResult.errors[0]);
  }

  const request: CreateCronRequest = {
    name: normalizeRequiredField(values.name),
    schedule: normalizeRequiredField(values.schedule),
    command: values.command,
    enabled: values.enabled,
  };

  const shell = optionalFieldValue(values.shell);
  if (shell !== undefined) {
    request.shell = shell;
  }

  const workingDirectory = optionalFieldValue(values.workingDirectory);
  if (workingDirectory !== undefined) {
    request.working_directory = workingDirectory;
  }

  if (envVarsResult.envVars !== undefined) {
    request.env_vars = envVarsResult.envVars;
  }

  return request;
}

export function formValuesToUpdateRequest(
  values: CronFormValues,
  job: CronJob,
): UpdateCronRequest {
  const updates: UpdateCronRequest = {};

  const nextName = normalizeRequiredField(values.name);
  const nextSchedule = normalizeRequiredField(values.schedule);

  if (nextName !== job.name) {
    updates.name = nextName;
  }

  if (nextSchedule !== job.schedule) {
    updates.schedule = nextSchedule;
  }

  if (values.command !== job.command) {
    updates.command = values.command;
  }

  const originalShell = job.shell ?? "";
  if (values.shell !== originalShell) {
    updates.shell = values.shell;
  }

  const originalWorkingDirectory = job.working_directory ?? "";
  if (values.workingDirectory !== originalWorkingDirectory) {
    updates.working_directory = values.workingDirectory;
  }

  if (values.enabled !== job.enabled) {
    updates.enabled = values.enabled;
  }

  const envVarsResult = parseEnvVarsText(values.envVarsText);
  if (envVarsResult.errors.length > 0) {
    throw new Error(envVarsResult.errors[0]);
  }

  const nextEnvText = envVarsToText(envVarsResult.envVars);
  const currentEnvText = envVarsToText(job.env_vars);

  if (nextEnvText !== currentEnvText) {
    updates.env_vars = envVarsResult.envVars ?? {};
  }

  return updates;
}
