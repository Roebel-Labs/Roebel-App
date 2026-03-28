"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle, XCircle, AlertCircle, Loader2, Ticket, MapPin, Calendar, Clock, User } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";

interface TicketData {
  ticket_code: string;
  event_name: string;
  event_day: "saturday" | "sunday" | null;
  event_date: string;
  event_location: string;
  buyer_email: string;
  buyer_name: string | null;
  status: "active" | "redeemed" | "cancelled" | "refunded";
  redeemed_at: string | null;
  created_at: string;
}

const DAY_LABELS: Record<string, string> = {
  saturday: "Samstag",
  sunday: "Sonntag",
};

type PageState = "loading" | "valid" | "redeemed" | "invalid" | "redeeming" | "success";

export default function TicketVerificationPage() {
  const params = useParams();
  const code = params.code as string;

  const [state, setState] = useState<PageState>("loading");
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [error, setError] = useState<string>("");
  const [redeemedAt, setRedeemedAt] = useState<string>("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fetch ticket data on mount
  useEffect(() => {
    async function fetchTicket() {
      try {
        const response = await fetch(`/api/tickets/verify?code=${encodeURIComponent(code)}`);
        const data = await response.json();

        if (!data.success) {
          setState("invalid");
          setError(data.error || "Ticket nicht gefunden");
          return;
        }

        setTicket(data.ticket);

        if (data.ticket.status === "redeemed") {
          setState("redeemed");
          setRedeemedAt(
            new Date(data.ticket.redeemed_at).toLocaleString("de-DE", {
              dateStyle: "medium",
              timeStyle: "short",
            })
          );
        } else if (data.ticket.status === "cancelled" || data.ticket.status === "refunded") {
          setState("invalid");
          setError(
            data.ticket.status === "cancelled"
              ? "Dieses Ticket wurde storniert"
              : "Dieses Ticket wurde erstattet"
          );
        } else {
          setState("valid");
        }
      } catch (err) {
        console.error("Error fetching ticket:", err);
        setState("invalid");
        setError("Fehler beim Laden des Tickets");
      }
    }

    if (code) {
      fetchTicket();
    }
  }, [code]);

  // Handle redemption
  const handleRedeem = async () => {
    setState("redeeming");

    try {
      const response = await fetch("/api/tickets/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (data.success) {
        setState("success");
        setRedeemedAt(
          new Date().toLocaleString("de-DE", {
            dateStyle: "medium",
            timeStyle: "short",
          })
        );
      } else {
        // Check if already redeemed
        if (data.ticket?.status === "redeemed") {
          setState("redeemed");
          setRedeemedAt(
            data.ticket.redeemed_at
              ? new Date(data.ticket.redeemed_at).toLocaleString("de-DE", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "Unbekannt"
          );
        } else {
          setState("invalid");
          setError(data.message || "Fehler beim Einlösen");
        }
      }
    } catch (err) {
      console.error("Error redeeming ticket:", err);
      setState("invalid");
      setError("Netzwerkfehler beim Einlösen");
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Loading State */}
        {state === "loading" && (
          <div className="bg-gray-900 rounded-2xl p-8 text-center">
            <Loader2 className="h-12 w-12 text-gray-400 animate-spin mx-auto" />
            <p className="mt-4 text-gray-400">Ticket wird überprüft...</p>
          </div>
        )}

        {/* Valid Ticket — clickable card */}
        {state === "valid" && ticket && (
          <>
            <div
              className="bg-gray-900 rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
              onClick={() => setDrawerOpen(true)}
            >
              {/* Header */}
              <div className="bg-green-600 p-6 text-center">
                <CheckCircle className="h-16 w-16 text-white mx-auto" />
                <h1 className="mt-3 text-2xl font-bold text-white">Ticket Gültig</h1>
              </div>

              {/* Ticket Info */}
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3 text-gray-300">
                  <Ticket className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Ticket-Code</p>
                    <p className="font-mono font-bold text-lg">{ticket.ticket_code}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-gray-300">
                  <Calendar className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Event</p>
                    <p className="font-semibold">{ticket.event_name}</p>
                    <p className="text-sm text-gray-400">
                      {ticket.event_day && DAY_LABELS[ticket.event_day]
                        ? `${DAY_LABELS[ticket.event_day]}, ${ticket.event_date}`
                        : ticket.event_date}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-gray-300">
                  <MapPin className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Ort</p>
                    <p className="text-sm">{ticket.event_location}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-gray-300">
                  <Clock className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Beginn</p>
                    <p className="text-sm">12:00 Uhr</p>
                  </div>
                </div>

                {ticket.buyer_name && (
                  <div className="pt-2 border-t border-gray-800">
                    <p className="text-xs text-gray-500 uppercase">Käufer</p>
                    <p className="text-gray-300">{ticket.buyer_name}</p>
                    <p className="text-sm text-gray-500">{ticket.buyer_email}</p>
                  </div>
                )}
              </div>

              <div className="p-6 pt-0">
                <p className="text-center text-sm text-gray-500">
                  Zum Einlösen antippen
                </p>
              </div>
            </div>

            {/* Redeem Drawer */}
            <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
              <DrawerContent className="bg-black border-gray-800">
                <DrawerHeader>
                  <DrawerTitle>Ticket Details</DrawerTitle>
                </DrawerHeader>
                <div className="px-4 pb-2 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-800">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-white">
                        {ticket.buyer_name || "Unbekannt"}
                      </p>
                      <p className="text-sm text-gray-500">{ticket.buyer_email}</p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-gray-900 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 uppercase">Ticket-Code</span>
                      <span className="font-mono font-bold text-white">{ticket.ticket_code}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 uppercase">Tag</span>
                      <span className="text-white">
                        {ticket.event_day && DAY_LABELS[ticket.event_day]
                          ? `${DAY_LABELS[ticket.event_day]}, ${ticket.event_date}`
                          : ticket.event_date}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 uppercase">Ort</span>
                      <span className="text-white text-sm">{ticket.event_location}</span>
                    </div>
                  </div>
                </div>
                <DrawerFooter>
                  <button
                    onClick={() => {
                      setDrawerOpen(false);
                      handleRedeem();
                    }}
                    className="w-full rounded-xl bg-green-600 py-3 text-base font-semibold text-white transition-colors hover:bg-green-700"
                  >
                    Ticket einlösen
                  </button>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          </>
        )}

        {/* Redeeming State */}
        {state === "redeeming" && (
          <div className="bg-gray-900 rounded-2xl p-8 text-center">
            <Loader2 className="h-12 w-12 text-green-500 animate-spin mx-auto" />
            <p className="mt-4 text-gray-300 font-semibold">Ticket wird eingelöst...</p>
          </div>
        )}

        {/* Success State */}
        {state === "success" && (
          <div className="bg-gray-900 rounded-2xl overflow-hidden">
            <div className="bg-green-600 p-8 text-center">
              <CheckCircle className="h-20 w-20 text-white mx-auto" />
              <h1 className="mt-4 text-3xl font-bold text-white">Erfolgreich!</h1>
              <p className="mt-2 text-green-100">Ticket wurde eingelöst</p>
            </div>
            <div className="p-6 text-center">
              <p className="text-gray-400">Eingelöst am</p>
              <p className="text-xl font-semibold text-white">{redeemedAt}</p>
              {ticket && (
                <p className="mt-4 font-mono text-gray-500">{ticket.ticket_code}</p>
              )}
            </div>
          </div>
        )}

        {/* Already Redeemed */}
        {state === "redeemed" && ticket && (
          <div className="bg-gray-900 rounded-2xl overflow-hidden">
            <div className="bg-red-600 p-6 text-center">
              <XCircle className="h-16 w-16 text-white mx-auto" />
              <h1 className="mt-3 text-2xl font-bold text-white">Bereits Eingelöst</h1>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-center">
                <p className="text-red-300">Dieses Ticket wurde bereits verwendet</p>
                <p className="mt-2 text-red-400 font-semibold">{redeemedAt}</p>
              </div>

              <div className="pt-2">
                <p className="text-xs text-gray-500 uppercase">Ticket-Code</p>
                <p className="font-mono font-bold text-gray-300">{ticket.ticket_code}</p>
              </div>

              <div>
                <p className="text-xs text-gray-500 uppercase">Event</p>
                <p className="text-gray-300">{ticket.event_name}</p>
              </div>
            </div>
          </div>
        )}

        {/* Invalid/Not Found */}
        {state === "invalid" && (
          <div className="bg-gray-900 rounded-2xl overflow-hidden">
            <div className="bg-gray-700 p-6 text-center">
              <AlertCircle className="h-16 w-16 text-gray-400 mx-auto" />
              <h1 className="mt-3 text-2xl font-bold text-white">Ungültiges Ticket</h1>
            </div>
            <div className="p-6 text-center">
              <p className="text-gray-400">{error}</p>
              <p className="mt-4 font-mono text-gray-600 text-sm">{code}</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
