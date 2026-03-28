export const UNREAD_EVENT = "messaging-unread-update";

let currentCount = 0;

export function emitUnreadUpdate(count: number) {
  currentCount = count;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(UNREAD_EVENT, { detail: count })
    );
  }
}

export function getUnreadCount(): number {
  return currentCount;
}
