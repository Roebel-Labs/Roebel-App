"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Calendar } from "lucide-react";

const TICKET_URLS = {
  saturday: "https://buy.stripe.com/00w3cv4R9gLydKi3yAasg07",
  sunday: "https://buy.stripe.com/14A5kD0AT3YM6hQ6KMasg06",
} as const;

const DAY_OPTIONS = [
  { key: "saturday" as const, label: "Samstag", date: "7. März 2026" },
  { key: "sunday" as const, label: "Sonntag", date: "8. März 2026" },
];

interface TicketDayModalProps {
  children: React.ReactNode;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);

    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [query]);

  return matches;
}

export function TicketDayModal({ children }: TicketDayModalProps) {
  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const handleSelect = (day: keyof typeof TICKET_URLS) => {
    window.open(TICKET_URLS[day], "_blank");
    setOpen(false);
  };

  const modalContent = (
    <div className="space-y-4 py-4 px-4">
      <p className="text-center text-gray-400 text-sm">
        Wählen Sie Ihren Veranstaltungstag:
      </p>
      <div className="grid gap-3">
        {DAY_OPTIONS.map((option) => (
          <button
            key={option.key}
            onClick={() => handleSelect(option.key)}
            className="flex items-center gap-4 w-full p-4 bg-gray-900 hover:bg-gray-800 rounded-xl transition-colors text-left"
          >
            <div className="p-3 bg-gray-800 rounded-lg">
              <Calendar className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="font-semibold text-white">
                {option.label}
              </p>
              <p className="text-sm text-gray-400">{option.date}</p>
            </div>
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-gray-500 pb-4">
        Beginn jeweils um 12:00 Uhr
      </p>
    </div>
  );

  // Single trigger that opens the modal
  const trigger = (
    <div onClick={() => setOpen(true)}>
      {children}
    </div>
  );

  if (isDesktop) {
    return (
      <>
        {trigger}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md bg-black border-gray-800 text-white">
            <DialogHeader>
              <DialogTitle className="text-white">Ticket kaufen</DialogTitle>
            </DialogHeader>
            {modalContent}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      {trigger}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="bg-black border-gray-800">
          <DrawerHeader>
            <DrawerTitle>Ticket kaufen</DrawerTitle>
          </DrawerHeader>
          {modalContent}
        </DrawerContent>
      </Drawer>
    </>
  );
}
