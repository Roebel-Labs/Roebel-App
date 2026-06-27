"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchMenuItems } from "@/lib/supabase-gastro";
import { formatPrice } from "@/types/restaurant";
import type { MenuItem } from "@/types/restaurant";

interface MenuSearchModalProps {
  open: boolean;
  accountId: string;
  slug: string;
  onClose: () => void;
}

export function MenuSearchModal({
  open,
  accountId,
  slug,
  onClose,
}: MenuSearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await searchMenuItems(accountId, query);
      if (!cancelled) {
        setResults(res);
        setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, accountId]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle>Speisekarte durchsuchen</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="z. B. Pizza, Vegan, Burger…"
              className="pl-10"
            />
          </div>
        </div>
        <div className="max-h-[55vh] overflow-y-auto px-4 pb-4">
          {loading && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Suche…
            </p>
          )}
          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Keine Treffer.
            </p>
          )}
          <div className="flex flex-col">
            {results.map((item) => (
              <Link
                key={item.id}
                href={`/app/orgs/${slug}/menu/${item.id}`}
                onClick={onClose}
                className="flex items-center gap-3 border-b border-border py-3 last:border-0 hover:bg-accent/50"
              >
                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                  {item.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.name}
                  </p>
                  {item.description && (
                    <p className="truncate text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                </div>
                <span className="flex-shrink-0 text-sm text-muted-foreground">
                  {formatPrice(item.price)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
