"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api } from "../_lib/client";

export function TicketCreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("task");
  const [priority, setPriority] = useState("medium");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim()) {
      toast.error("Titel fehlt");
      return;
    }
    setSaving(true);
    try {
      await api("/api/dev-tickets", {
        method: "POST",
        body: JSON.stringify({ title, description, type, priority }),
      });
      toast.success("Ticket erstellt");
      setTitle("");
      setDescription("");
      setType("task");
      setPriority("medium");
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neues Ticket</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dt-title">Titel</Label>
            <Input
              id="dt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Kurz und präzise"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dt-desc">Beschreibung (Markdown)</Label>
            <Textarea
              id="dt-desc"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Was ist zu tun? Was ist das erwartete Verhalten?"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dt-type">Typ</Label>
              <select
                id="dt-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="bug">Bug</option>
                <option value="feature">Feature</option>
                <option value="task">Aufgabe</option>
                <option value="improvement">Verbesserung</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dt-prio">Priorität</Label>
              <select
                id="dt-prio"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="low">Niedrig</option>
                <option value="medium">Mittel</option>
                <option value="high">Hoch</option>
                <option value="urgent">Dringend</option>
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Speichere…" : "Erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
