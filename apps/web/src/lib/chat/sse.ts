// Server-Sent Events encoder for the send-message stream (spec §3.5).
import type { ChatStreamEvent } from "./types";

/** Encodes one event as `event: <name>\ndata: <json>\n\n`. */
export function encodeSSE(event: string, data: unknown): string {
  // JSON.stringify never emits raw newlines, so one data line is always enough.
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function encodeChatEvent(e: ChatStreamEvent): string {
  return encodeSSE(e.event, e.data);
}

/** A comment line; keeps proxies from closing an idle stream. */
export const SSE_HEARTBEAT = ": ping\n\n";

export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/**
 * Wraps a producer into a ReadableStream of SSE bytes. The producer gets an
 * `emit` callback; a heartbeat comment goes out every `heartbeatMs`.
 * A client disconnect does NOT stop the producer: the run finishes and its
 * messages are persisted, the app refetches them on focus.
 */
export function createSSEStream(
  producer: (emit: (e: ChatStreamEvent) => void) => Promise<void>,
  opts: { heartbeatMs?: number } = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (s: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(s)); } catch { closed = true; }
      };
      const hb = setInterval(() => write(SSE_HEARTBEAT), opts.heartbeatMs ?? 15_000);
      try {
        await producer((e) => write(encodeChatEvent(e)));
      } catch (err) {
        console.error("[chat/sse] producer failed", err);
        write(encodeChatEvent({ event: "error", data: { code: "internal", message: "Da ist etwas schiefgelaufen. Bitte versuch es noch einmal." } }));
      } finally {
        clearInterval(hb);
        if (!closed) { closed = true; try { controller.close(); } catch { /* already closed */ } }
      }
    },
    cancel() {
      closed = true;
    },
  });
}
