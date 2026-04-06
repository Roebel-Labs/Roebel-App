"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/lib/context/AccountContext";
import { useActiveAccount } from "thirdweb/react";
import { deleteEvent } from "@/app/actions/manage-events";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface EventOwnerActionsProps {
  eventId: string;
  eventTitle: string;
  accountId: string | null;
}

export function EventOwnerActions({
  eventId,
  eventTitle,
  accountId,
}: EventOwnerActionsProps) {
  const { isOwnerOf } = useAccount();
  const thirdwebAccount = useActiveAccount();
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  if (!isOwnerOf(accountId)) {
    return null;
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const result = await deleteEvent(eventId, thirdwebAccount?.address);
      if (result.success) {
        toast({
          title: "Veranstaltung gelöscht",
          description: "Die Veranstaltung wurde erfolgreich gelöscht.",
        });
        router.push("/app/events");
      } else {
        toast({
          title: "Fehler",
          description: result.error || "Löschen fehlgeschlagen.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Fehler",
        description: "Ein unerwarteter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex gap-2 pt-2 border-t border-border">
      <Button variant="outline" size="sm" asChild className="flex-1 bg-transparent">
        <a href={`/admin/dashboard/events/${eventId}/edit`}>
          <Pencil className="h-4 w-4 mr-2" />
          Bearbeiten
        </a>
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="destructive"
            size="sm"
            className="flex-1"
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Löschen
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Veranstaltung löschen</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie &quot;{eventTitle}&quot; wirklich löschen? Diese Aktion
              kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
