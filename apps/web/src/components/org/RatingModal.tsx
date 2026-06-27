"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAccountRating } from "@/hooks/useAccountRating";

interface RatingModalProps {
  open: boolean;
  accountId: string;
  accountName: string;
  onClose: () => void;
  /** Called after a successful write so the parent can refetch summaries. */
  onChanged?: () => void;
}

export function RatingModal({
  open,
  accountId,
  accountName,
  onClose,
  onChanged,
}: RatingModalProps) {
  const { userRating, isSignedIn, setRating, removeRating } =
    useAccountRating(accountId);
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStars(userRating?.stars ?? 0);
      setComment(userRating?.comment ?? "");
      setHover(0);
    }
  }, [open, userRating]);

  const handleSave = async () => {
    if (stars < 1) return;
    setSaving(true);
    try {
      await setRating(stars, comment.trim() || null);
      onChanged?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await removeRating();
      onChanged?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{accountName} bewerten</DialogTitle>
        </DialogHeader>

        {!isSignedIn ? (
          <p className="py-4 text-sm text-muted-foreground">
            Melde dich an, um diese Organisation zu bewerten.
          </p>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setStars(n)}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  className="p-1"
                  aria-label={`${n} Sterne`}
                >
                  <Star
                    size={32}
                    className={cn(
                      n <= (hover || stars)
                        ? "fill-amber-400 text-amber-400"
                        : "fill-none text-muted-foreground/40"
                    )}
                  />
                </button>
              ))}
            </div>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Kommentar (optional)"
              rows={3}
            />
          </div>
        )}

        {isSignedIn && (
          <DialogFooter className="gap-2 sm:gap-2">
            {userRating && (
              <Button
                variant="ghost"
                onClick={handleRemove}
                disabled={saving}
                className="text-destructive hover:text-destructive"
              >
                Löschen
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving || stars < 1}>
              {saving ? "Speichern…" : "Speichern"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
