import type { CopilotActivityItem } from "./types";

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createActivityItem(
  item: Omit<CopilotActivityItem, "id" | "timestamp"> & { timestamp?: number }
): CopilotActivityItem {
  return {
    id: uid("activity"),
    timestamp: item.timestamp ?? Date.now(),
    ...item
  };
}

export function parseToolResult(result: string): {
  success: boolean;
  payload: unknown;
  error?: string;
} {
  try {
    const payload = JSON.parse(result) as unknown;

    if (isRecord(payload)) {
      return {
        success: payload.success !== false,
        payload,
        error: typeof payload.error === "string" ? payload.error : undefined
      };
    }

    return { success: true, payload };
  } catch {
    return { success: true, payload: result };
  }
}

export function truncateText(text: string, maxLength = 180): string {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return truncateText(value, 48);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    const preview = value.slice(0, 3).map((entry) => formatValue(entry)).join(", ");
    return value.length > 3 ? `[${preview}, ...]` : `[${preview}]`;
  }

  if (isRecord(value)) {
    const keys = Object.keys(value);

    if (keys.length === 0) {
      return "{}";
    }

    const preview = keys.slice(0, 3).join(", ");
    return keys.length > 3 ? `{${preview}, ...}` : `{${preview}}`;
  }

  return String(value);
}

export function summarizeToolArgs(args: Record<string, unknown>, maxKeys = 3): string {
  const entries = Object.entries(args);

  if (entries.length === 0) {
    return "No arguments";
  }

  const summary = entries
    .slice(0, maxKeys)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join(" | ");

  const withOverflow =
    entries.length > maxKeys ? `${summary} | +${entries.length - maxKeys} more` : summary;

  return truncateText(withOverflow, 180);
}

export function summarizeToolResult(result: string): string {
  const parsed = parseToolResult(result);

  if (parsed.error) {
    return truncateText(parsed.error, 180);
  }

  if (isRecord(parsed.payload)) {
    const entries = Object.entries(parsed.payload).filter(
      ([key]) => key !== "success" && key !== "error"
    );

    if (entries.length === 0) {
      return parsed.success ? "Completed successfully." : "Tool reported a failure.";
    }

    return truncateText(
      entries
        .slice(0, 3)
        .map(([key, value]) => `${key}: ${formatValue(value)}`)
        .join(" | "),
      180
    );
  }

  if (typeof parsed.payload === "string") {
    return truncateText(parsed.payload, 180);
  }

  return truncateText(formatValue(parsed.payload), 180);
}
