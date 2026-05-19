"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import { MessageCircle } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useMessagingContext } from "./MessagingProvider";
import { ChatSheetPanel } from "./ChatSheetPanel";

/**
 * Floating chat button — fixed bottom-right, opens a right-side drawer with
 * the chat preview list. Hidden on the dedicated /app/messages page where
 * the full Messages UI already covers this surface.
 */
export function ChatFab() {
  const pathname = usePathname();
  const account = useActiveAccount();
  const { isReady } = useMessagingContext();
  const { unreadCount } = useUnreadMessages();
  const [open, setOpen] = useState(false);

  if (!account || !isReady) return null;
  if (pathname?.startsWith("/app/messages")) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Chats öffnen"
          className="fixed z-40 bottom-20 right-4 md:bottom-6 md:right-6 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all active:scale-95 flex items-center justify-center"
        >
          <MessageCircle className="h-6 w-6" strokeWidth={2} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex min-w-[20px] h-5 px-1.5 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-semibold border-2 border-background">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        <SheetContent
          side="right"
          className="p-0 w-full sm:max-w-[400px] flex flex-col"
        >
          <ChatSheetPanel open={open} />
        </SheetContent>
      </Sheet>
    </>
  );
}
