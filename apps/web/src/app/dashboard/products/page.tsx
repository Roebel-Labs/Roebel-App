"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "@/lib/context/AccountContext";
import { createClient } from "@/lib/supabase/client";
import { Package, Plus } from "lucide-react";

interface Listing {
  id: string;
  title: string | null;
  price: number | null;
  status: string | null;
  created_at: string;
}

export default function OrgProductsPage() {
  const { activeAccount } = useAccount();
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeAccount) return;
    const supabase = createClient();
    supabase
      .from("marketplace_listings")
      .select("id, title, price, status, created_at")
      .eq("account_id", activeAccount.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setItems((data as Listing[]) || []);
        setLoading(false);
      });
  }, [activeAccount]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium">Produkte & Angebote</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Listings dieser Organisation im Marktplatz.
          </p>
        </div>
        <Link
          href="/app/marktplatz/erstellen"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Neu erstellen
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-16 bg-muted rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-[10px]">
          <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Noch keine Produkte oder Angebote.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div
              key={it.id}
              className="flex items-center justify-between bg-card border border-border rounded-lg p-4"
            >
              <div>
                <p className="text-sm font-medium">{it.title ?? "Ohne Titel"}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(it.created_at).toLocaleDateString("de-DE")} ·{" "}
                  {it.status ?? "—"}
                </p>
              </div>
              {it.price != null && (
                <span className="text-sm font-medium">{it.price} €</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
