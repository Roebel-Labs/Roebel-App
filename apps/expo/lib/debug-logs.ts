/**
 * On-device debug log capture.
 *
 * Standalone EAS preview/internal builds have no Metro console, so we mirror
 * console.* (and uncaught errors) into a capped in-memory ring buffer that the
 * <DebugLogOverlay /> renders on-device. Import this module FIRST in index.js
 * (before expo-router/entry) so capture starts at launch.
 *
 * Safe by design:
 *   - chains through to the original console fns (existing __DEV__ HMR
 *     suppression in index.js keeps working),
 *   - never calls the patched console inside itself (no feedback loop),
 *   - tolerant arg stringify (objects / Error / bigint / circular),
 *   - install() is idempotent.
 */

export type LogLevel = "log" | "info" | "warn" | "error";

export interface LogEntry {
  id: number;
  t: number; // epoch ms
  level: LogLevel;
  text: string;
}

const MAX_ENTRIES = 500;

const buffer: LogEntry[] = [];
const listeners = new Set<() => void>();
let nextId = 1;
let installed = false;

// A frozen empty snapshot avoids useSyncExternalStore "getServerSnapshot" churn.
let snapshot: LogEntry[] = [];

function emit() {
  // Recompute the immutable snapshot once per change so getSnapshot() is stable
  // between mutations (required by useSyncExternalStore).
  snapshot = buffer.slice();
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // never let a bad subscriber break logging
    }
  });
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return `${value}n`;
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  try {
    const seen = new WeakSet();
    return JSON.stringify(
      value,
      (_k, v) => {
        if (typeof v === "bigint") return `${v}n`;
        if (typeof v === "object" && v !== null) {
          if (seen.has(v)) return "[Circular]";
          seen.add(v);
        }
        return v;
      },
      2,
    );
  } catch {
    try {
      return String(value);
    } catch {
      return "[unstringifiable]";
    }
  }
}

function record(level: LogLevel, args: unknown[]) {
  const text = args.map(safeStringify).join(" ");
  buffer.push({ id: nextId++, t: Date.now(), level, text });
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
  emit();
}

/** Patch console + the global error handler. Call once, as early as possible. */
export function installDebugLogCapture() {
  if (installed) return;
  installed = true;

  const levels: LogLevel[] = ["log", "info", "warn", "error"];
  for (const level of levels) {
    const original = console[level]?.bind(console) ?? (() => {});
    console[level] = (...args: unknown[]) => {
      record(level, args);
      original(...args);
    };
  }

  // Capture uncaught errors too (e.g. unhandled promise rejections surfaced by
  // RN, native crashes routed through ErrorUtils).
  try {
    const ErrorUtilsRef: any = (global as any).ErrorUtils;
    if (ErrorUtilsRef?.getGlobalHandler && ErrorUtilsRef?.setGlobalHandler) {
      const prev = ErrorUtilsRef.getGlobalHandler();
      ErrorUtilsRef.setGlobalHandler((error: any, isFatal?: boolean) => {
        record("error", [
          `[GlobalError${isFatal ? " FATAL" : ""}]`,
          error instanceof Error ? error : safeStringify(error),
        ]);
        if (typeof prev === "function") prev(error, isFatal);
      });
    }
  } catch {
    // non-fatal — console capture still works
  }
}

// ---- Store API consumed by <DebugLogOverlay /> ----

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): LogEntry[] {
  return snapshot;
}

export function clearLogs() {
  buffer.length = 0;
  emit();
}

/** Plain-text dump for Copy / Share. */
export function formatAll(entries: LogEntry[] = snapshot): string {
  return entries
    .map((e) => {
      const ts = new Date(e.t).toISOString().slice(11, 23); // HH:MM:SS.mmm
      return `${ts} ${e.level.toUpperCase().padEnd(5)} ${e.text}`;
    })
    .join("\n");
}
