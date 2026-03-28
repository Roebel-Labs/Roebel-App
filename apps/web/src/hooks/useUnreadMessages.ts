"use client";

import { useState, useEffect } from "react";
import { UNREAD_EVENT, getUnreadCount } from "@/lib/messaging/unread";

export function useUnreadMessages() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Read initial value
    setUnreadCount(getUnreadCount());

    // Listen for updates from same tab
    const handleUpdate = (e: Event) => {
      setUnreadCount((e as CustomEvent).detail as number);
    };
    window.addEventListener(UNREAD_EVENT, handleUpdate);

    return () => {
      window.removeEventListener(UNREAD_EVENT, handleUpdate);
    };
  }, []);

  return { unreadCount };
}
