/**
 * Tracks which direct-message conversation is currently on screen, so the
 * push-notification handler can suppress the foreground banner for a DM the
 * user is already looking at. Set on focus / cleared on blur by the chat screen.
 */
let activeConversationId: string | null = null;

export function setActiveConversationId(id: string | null): void {
  activeConversationId = id;
}

export function getActiveConversationId(): string | null {
  return activeConversationId;
}
