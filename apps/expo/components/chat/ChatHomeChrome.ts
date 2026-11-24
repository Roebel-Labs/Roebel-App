import { createContext, useContext } from 'react';

/**
 * How the chat home is framed. As the org shell's Chat tab it has no back button and must leave
 * room for the floating bottom bar; as the /chat route it keeps its own back button.
 */
export type ChatHomeChrome = { showBack: boolean; bottomExtra: number };

export const ChatHomeChromeContext = createContext<ChatHomeChrome>({ showBack: true, bottomExtra: 0 });

export function useChatHomeChrome(): ChatHomeChrome {
  return useContext(ChatHomeChromeContext);
}
