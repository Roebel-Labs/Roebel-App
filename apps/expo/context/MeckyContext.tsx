/**
 * Context for Mecky AI chatbot state management.
 * Handles conversation messages, streaming, and tool result extraction.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { useActiveAccount } from 'thirdweb/react';
import { getAnthropicChatService } from '@/lib/services/anthropic-chat';
import { meckyToolDefinitions, executeMeckyTool } from '@/lib/tools/mecky-tools';
import { getMeckySystemPrompt } from '@/lib/prompts/mecky-system-prompt';
import type { AnthropicMessage } from '@/lib/types/anthropic';
import type { MeckyMessage, RichCardData, NavigationLink } from '@/lib/types/mecky';

interface MeckyContextValue {
  messages: MeckyMessage[];
  isStreaming: boolean;
  streamingText: string;
  sendMessage: (text: string) => Promise<void>;
  clearConversation: () => void;
}

const MeckyContext = createContext<MeckyContextValue | undefined>(undefined);

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function MeckyProvider({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const [messages, setMessages] = useState<MeckyMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');

  // Anthropic conversation history (includes tool calls/results)
  const historyRef = useRef<AnthropicMessage[]>([]);
  // Collected tool results during current stream
  const toolResultsRef = useRef<{ richCards: RichCardData[]; navLinks: NavigationLink[] }>({
    richCards: [],
    navLinks: [],
  });

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      // Add user message to UI
      const userMsg: MeckyMessage = {
        id: generateId(),
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Add to Anthropic history
      historyRef.current.push({ role: 'user', content: text.trim() });

      // Trim to last 20 messages for API calls to manage token budget
      if (historyRef.current.length > 40) {
        historyRef.current = historyRef.current.slice(-40);
      }

      // Reset streaming state
      setIsStreaming(true);
      setStreamingText('');
      toolResultsRef.current = { richCards: [], navLinks: [] };

      try {
        const service = getAnthropicChatService();
        const systemPrompt = getMeckySystemPrompt({
          walletAddress: account?.address,
          userRole: undefined, // Could be enhanced with useUser() but keeping it simple
          today: new Date().toISOString().split('T')[0],
        });

        let finalText = '';

        await service.streamMessage(
          [...historyRef.current],
          systemPrompt,
          meckyToolDefinitions,
          {
            onTextDelta: (delta: string) => {
              finalText += delta;
              setStreamingText(finalText);
            },
            onToolCallComplete: (toolName: string, result: any) => {
              if (!result?.data) return;
              const { displayType, items, route, label } = result.data;

              if (displayType === 'navigation' && route && label) {
                toolResultsRef.current.navLinks.push({ route, label });
              } else if (displayType && items?.length > 0) {
                toolResultsRef.current.richCards.push({
                  type: displayType as RichCardData['type'],
                  items,
                });
              }
            },
            onComplete: (history: AnthropicMessage[]) => {
              // Update full history with tool calls included
              historyRef.current = history;

              // Build the assistant message
              const assistantMsg: MeckyMessage = {
                id: generateId(),
                role: 'assistant',
                content: finalText,
                timestamp: Date.now(),
              };

              // Attach rich cards (use the last one if multiple tool calls)
              const { richCards, navLinks } = toolResultsRef.current;
              if (richCards.length > 0) {
                assistantMsg.richCards = richCards[richCards.length - 1];
              }
              if (navLinks.length > 0) {
                assistantMsg.navigationLinks = navLinks;
              }

              setMessages((prev) => [...prev, assistantMsg]);
              setStreamingText('');
              setIsStreaming(false);
            },
            onError: (error: Error) => {
              console.error('Mecky stream error:', error);
              const errorMsg: MeckyMessage = {
                id: generateId(),
                role: 'assistant',
                content: 'Entschuldigung, da ist etwas schiefgelaufen. Bitte versuche es noch einmal.',
                timestamp: Date.now(),
              };
              setMessages((prev) => [...prev, errorMsg]);
              setStreamingText('');
              setIsStreaming(false);
            },
          },
          executeMeckyTool
        );
      } catch (error) {
        console.error('Mecky sendMessage error:', error);
        setStreamingText('');
        setIsStreaming(false);
      }
    },
    [isStreaming, account?.address]
  );

  const clearConversation = useCallback(() => {
    setMessages([]);
    historyRef.current = [];
    setStreamingText('');
  }, []);

  const value = useMemo(
    () => ({
      messages,
      isStreaming,
      streamingText,
      sendMessage,
      clearConversation,
    }),
    [messages, isStreaming, streamingText, sendMessage, clearConversation]
  );

  return (
    <MeckyContext.Provider value={value}>{children}</MeckyContext.Provider>
  );
}

export function useMecky(): MeckyContextValue {
  const context = useContext(MeckyContext);
  if (!context) {
    throw new Error('useMecky must be used within MeckyProvider');
  }
  return context;
}
