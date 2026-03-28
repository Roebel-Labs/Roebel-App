/**
 * Server-Sent Events (SSE) parser for Anthropic streaming API
 * Handles parsing, buffering, and error recovery for streaming responses
 */

import type {
  AnthropicStreamEvent,
  AnthropicContentBlock,
  ToolCall,
} from "../types/anthropic";

export interface StreamState {
  messageId: string;
  accumulatedContent: string;
  toolCallsInProgress: Map<number, Partial<ToolCall>>;
  contentBlocks: AnthropicContentBlock[];
  lastEventType: string;
}

export interface StreamEventHandlers {
  onTextDelta: (delta: string) => void;
  onToolCallStart: (toolName: string, toolInput: any) => void;
  onToolCallComplete: (toolCall: ToolCall) => void;
  onMessageComplete: (stopReason: string) => void;
  onError: (error: Error) => void;
}

/**
 * Parse Server-Sent Events from a fetch Response
 */
export async function parseSSEStream(
  response: Response,
  handlers: StreamEventHandlers
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const streamState: StreamState = {
    messageId: "",
    accumulatedContent: "",
    toolCallsInProgress: new Map(),
    contentBlocks: [],
    lastEventType: "",
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Decode chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();

          // Skip empty data or done signals
          if (!data || data === "[DONE]") {
            continue;
          }

          try {
            const event = JSON.parse(data) as AnthropicStreamEvent;
            handleStreamEvent(event, streamState, handlers);
          } catch (error) {
            console.warn("Failed to parse SSE data:", data, error);
          }
        }
      }
    }
  } catch (error) {
    handlers.onError(
      error instanceof Error ? error : new Error("Stream parsing failed")
    );
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Handle individual stream events
 */
function handleStreamEvent(
  event: AnthropicStreamEvent,
  state: StreamState,
  handlers: StreamEventHandlers
): void {
  if (!validateStreamEvent(event)) {
    return;
  }

  state.lastEventType = event.type;

  switch (event.type) {
    case "message_start":
      state.messageId = event.message.id;
      break;

    case "content_block_start":
      if (event.content_block.type === "text") {
        // New text block starting
        state.contentBlocks.push({
          type: "text",
          text: "",
        });
      } else if (event.content_block.type === "tool_use") {
        // New tool call starting
        state.toolCallsInProgress.set(event.index, {
          id: event.content_block.id,
          name: event.content_block.name,
          input: {},
        });

        state.contentBlocks.push({
          type: "tool_use",
          id: event.content_block.id,
          name: event.content_block.name,
          input: {},
        });

        handlers.onToolCallStart(event.content_block.name, {});
      }
      break;

    case "content_block_delta":
      if (event.delta.type === "text_delta") {
        // Text delta - update UI
        const textDelta = event.delta.text;
        state.accumulatedContent += textDelta;

        // Update content block
        const block = state.contentBlocks[event.index];
        if (block && block.type === "text") {
          block.text += textDelta;
        }

        handlers.onTextDelta(textDelta);
      } else if (event.delta.type === "input_json_delta") {
        // Tool input is streaming
        const toolCall = state.toolCallsInProgress.get(event.index);
        if (toolCall) {
          // Accumulate JSON (we'll parse it when complete)
          const existingInput =
            typeof toolCall.input === "string" ? toolCall.input : "";
          toolCall.input = existingInput + event.delta.partial_json;
        }
      }
      break;

    case "content_block_stop":
      // Check if this was a tool call
      const toolCall = state.toolCallsInProgress.get(event.index);
      if (toolCall && toolCall.id && toolCall.name) {
        try {
          // Parse the accumulated JSON input
          const input =
            typeof toolCall.input === "string"
              ? JSON.parse(toolCall.input)
              : toolCall.input;

          const completeToolCall: ToolCall = {
            id: toolCall.id,
            name: toolCall.name,
            input,
          };

          // Update content block
          const block = state.contentBlocks[event.index];
          if (block && block.type === "tool_use") {
            block.input = input;
          }

          handlers.onToolCallComplete(completeToolCall);
          state.toolCallsInProgress.delete(event.index);
        } catch (error) {
          console.error("Failed to parse tool call input:", toolCall.input, error);
          handlers.onError(
            new Error(`Failed to parse tool call input: ${error}`)
          );
        }
      }
      break;

    case "message_delta":
      if (event.delta.stop_reason) {
        handlers.onMessageComplete(event.delta.stop_reason);
      }
      break;

    case "message_stop":
      // Fully done
      break;

    case "ping":
      // Heartbeat - ignore
      break;

    case "error":
      handlers.onError(new Error(event.error.message));
      break;

    default:
      console.warn("Unknown event type:", (event as any).type);
  }
}

/**
 * Validate stream event has required fields
 */
function validateStreamEvent(event: any): boolean {
  if (!event || typeof event !== "object") {
    console.warn("Invalid event received:", event);
    return false;
  }

  if (!event.type) {
    console.warn("Event missing type:", event);
    return false;
  }

  return true;
}

/**
 * Parse tool input safely
 */
export function parseToolInput(input: string | Record<string, any>): any {
  if (typeof input !== "string") {
    return input;
  }

  try {
    return JSON.parse(input);
  } catch (error) {
    console.error("Failed to parse tool input:", input);
    return null;
  }
}

/**
 * Alternative SSE parser using react-native-sse
 * Use this if the fetch-based approach has issues
 */
export async function parseSSEStreamWithLibrary(
  url: string,
  options: {
    headers: Record<string, string>;
    method: string;
    body: string;
  },
  handlers: StreamEventHandlers
): Promise<void> {
  // Note: Import EventSource dynamically to avoid issues if react-native-sse isn't installed
  const EventSource = require("react-native-sse").default;

  const streamState: StreamState = {
    messageId: "",
    accumulatedContent: "",
    toolCallsInProgress: new Map(),
    contentBlocks: [],
    lastEventType: "",
  };

  return new Promise((resolve, reject) => {
    const eventSource = new EventSource(url, {
      ...options,
      pollingInterval: 0, // Disable polling, use true streaming
    });

    // Helper: parse and handle an SSE event
    const onEvent = (event: any) => {
      try {
        const parsed = JSON.parse(event.data) as AnthropicStreamEvent;
        handleStreamEvent(parsed, streamState, handlers);
      } catch (error) {
        console.warn("Failed to parse SSE event:", event.data, error);
      }
    };

    // Anthropic sends typed SSE events — listen for each type individually
    // (react-native-sse fires listeners matching the SSE `event:` field)
    eventSource.addEventListener("message_start", onEvent);
    eventSource.addEventListener("content_block_start", onEvent);
    eventSource.addEventListener("content_block_delta", onEvent);
    eventSource.addEventListener("content_block_stop", onEvent);
    eventSource.addEventListener("message_delta", onEvent);
    eventSource.addEventListener("ping", () => {}); // heartbeat — ignore

    // message_stop = stream complete → resolve
    eventSource.addEventListener("message_stop", (event: any) => {
      onEvent(event);
      eventSource.close();
      resolve();
    });

    eventSource.addEventListener("error", (error: any) => {
      console.error("SSE error:", error);
      eventSource.close();
      handlers.onError(
        error instanceof Error ? error : new Error("SSE connection error")
      );
      reject(error);
    });
  });
}
