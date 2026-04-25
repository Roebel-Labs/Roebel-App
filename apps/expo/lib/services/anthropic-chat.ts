/**
 * Anthropic Chat Service
 * Handles streaming communication with Claude, tool execution, and conversation management
 */

import type {
  AnthropicMessage,
  AnthropicMessagesRequest,
  AnthropicToolDefinition,
  ToolCall,
  ToolResult,
  StreamCallbacks,
} from "../types/anthropic";
import { parseSSEStreamWithLibrary } from "../utils/anthropic-stream-parser";
import {
  retryWithBackoff,
  handleAPIResponse,
  validateConversationHistory,
  NetworkError,
} from "../utils/error-handling";
import { executeToolByName } from "../tools/event-submission-tools";

export interface AnthropicChatServiceOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export class AnthropicChatService {
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private baseUrl = "https://api.anthropic.com/v1/messages";
  private anthropicVersion = "2023-06-01";

  constructor(options: AnthropicChatServiceOptions) {
    if (!options.apiKey) {
      throw new Error("Anthropic API key is required");
    }

    this.apiKey = options.apiKey;
    this.model = options.model || "claude-sonnet-4-20250514";
    this.maxTokens = options.maxTokens || 4096;
    this.temperature = options.temperature || 1.0;
  }

  /**
   * Main entry point: Stream a message with tool support
   */
  async streamMessage(
    messages: AnthropicMessage[],
    systemPrompt: string,
    tools: AnthropicToolDefinition[],
    callbacks: StreamCallbacks,
    toolExecutor?: (name: string, input: any) => Promise<ToolResult>
  ): Promise<void> {
    // Validate conversation history
    if (!validateConversationHistory(messages)) {
      throw new Error("Invalid conversation history");
    }

    // Track conversation history including tool calls
    let conversationHistory = [...messages];

    try {
      await this.streamWithToolLoop(conversationHistory, systemPrompt, tools, callbacks, toolExecutor);
    } catch (error) {
      if (callbacks.onError) {
        callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    }
  }

  /**
   * Stream with tool execution loop
   * Handles multi-turn tool use: Claude → tool → Claude → tool → ... → Claude (final text)
   */
  private async streamWithToolLoop(
    conversationHistory: AnthropicMessage[],
    systemPrompt: string,
    tools: AnthropicToolDefinition[],
    callbacks: StreamCallbacks,
    toolExecutor?: (name: string, input: any) => Promise<ToolResult>
  ): Promise<void> {
    const maxToolIterations = 10; // Prevent infinite loops
    let iteration = 0;

    while (iteration < maxToolIterations) {
      iteration++;

      // Track tool calls in this iteration
      const toolCallsInIteration: ToolCall[] = [];
      let accumulatedText = "";
      let stopReason: string | null = null;

      // Stream from Claude using react-native-sse (fetch ReadableStream not supported in RN)
      await retryWithBackoff(async () => {
        const requestBody: AnthropicMessagesRequest = {
          model: this.model,
          max_tokens: this.maxTokens,
          messages: conversationHistory,
          system: systemPrompt,
          temperature: this.temperature,
          stream: true,
          tools: tools.length > 0 ? tools : undefined,
        };

        await parseSSEStreamWithLibrary(
          this.baseUrl,
          {
            headers: {
              "x-api-key": this.apiKey,
              "anthropic-version": this.anthropicVersion,
              "content-type": "application/json",
            },
            method: "POST",
            body: JSON.stringify(requestBody),
          },
          {
            onTextDelta: (delta: string) => {
              accumulatedText += delta;
              if (callbacks.onTextDelta) {
                callbacks.onTextDelta(delta);
              }
            },

            onToolCallStart: (toolName: string, toolInput: any) => {
              if (callbacks.onToolCallStart) {
                callbacks.onToolCallStart(toolName, toolInput);
              }
            },

            onToolCallComplete: (toolCall: ToolCall) => {
              toolCallsInIteration.push(toolCall);
            },

            onMessageComplete: (reason: string) => {
              stopReason = reason;
            },

            onError: (error: Error) => {
              if (callbacks.onError) {
                callbacks.onError(error);
              }
              throw error;
            },
          }
        );
      });

      // Build assistant's response content blocks
      const assistantContent: any[] = [];

      // Add text if any
      if (accumulatedText) {
        assistantContent.push({
          type: "text",
          text: accumulatedText,
        });
      }

      // Add tool use blocks
      for (const toolCall of toolCallsInIteration) {
        assistantContent.push({
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
        });
      }

      // Add assistant's message to history
      if (assistantContent.length > 0) {
        conversationHistory.push({
          role: "assistant",
          content: assistantContent,
        });
      }

      // If no tool calls, we're done
      if (toolCallsInIteration.length === 0) {
        if (callbacks.onComplete) {
          callbacks.onComplete(conversationHistory);
        }
        return;
      }

      // Execute all tool calls
      const toolResults: any[] = [];

      for (const toolCall of toolCallsInIteration) {
        if (callbacks.onToolCallStart) {
          callbacks.onToolCallStart(toolCall.name, toolCall.input);
        }

        const result = await (toolExecutor ?? executeToolByName)(toolCall.name, toolCall.input);

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: JSON.stringify(result),
          is_error: !result.success,
        });

        if (callbacks.onToolCallComplete) {
          callbacks.onToolCallComplete(toolCall.name, result);
        }
      }

      // Add tool results as a user message
      conversationHistory.push({
        role: "user",
        content: toolResults,
      });

      // Continue the loop - Claude will respond to tool results
      // If stop_reason was "end_turn", this will be the final text response
    }

    // Max iterations reached
    throw new Error("Maximum tool call iterations reached. Possible infinite loop.");
  }

  /**
   * Make a streaming HTTP request to Anthropic API
   */
  private async makeStreamingRequest(
    messages: AnthropicMessage[],
    systemPrompt: string,
    tools: AnthropicToolDefinition[]
  ): Promise<Response> {
    const requestBody: AnthropicMessagesRequest = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages,
      system: systemPrompt,
      temperature: this.temperature,
      stream: true,
      tools: tools.length > 0 ? tools : undefined,
    };

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": this.anthropicVersion,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      handleAPIResponse(response);

      return response;
    } catch (error: any) {
      if (error instanceof TypeError || error?.message?.includes("fetch")) {
        throw new NetworkError("Network request failed. Please check your connection.");
      }
      throw error;
    }
  }

  /**
   * Transform UI messages to Anthropic format
   */
  static transformToAnthropicMessages(
    uiMessages: Array<{ role: string; content: string }>
  ): AnthropicMessage[] {
    return uiMessages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));
  }
}

/**
 * Singleton instance factory
 */
let anthropicServiceInstance: AnthropicChatService | null = null;

/**
 * Defense in depth: callers should already gate on consent (see MeckyContext),
 * but if anything reaches this function without explicit allow, refuse.
 * Pass `consented: true` from a code path that has confirmed
 * `consent.preferences.ai_assistant === true`.
 */
export function getAnthropicChatService(consented = false): AnthropicChatService {
  if (!consented) {
    throw new Error(
      'anthropic-chat: caller did not assert consent. The Mecky-KI category must be enabled in the consent context before calling this service.'
    );
  }
  if (!anthropicServiceInstance) {
    const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error("EXPO_PUBLIC_ANTHROPIC_API_KEY is not configured");
    }

    anthropicServiceInstance = new AnthropicChatService({
      apiKey,
      model: "claude-sonnet-4-20250514",
      maxTokens: 4096,
      temperature: 1.0,
    });
  }

  return anthropicServiceInstance;
}

export function disposeAnthropicChatService(): void {
  anthropicServiceInstance = null;
}
