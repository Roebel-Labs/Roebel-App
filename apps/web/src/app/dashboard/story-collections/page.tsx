"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import { useAccount } from "@/lib/context/AccountContext";
import { subTypeFeatures } from "@/types/account";
import {
  listForAccount,
  type StoryCollection,
} from "@/lib/supabase-story-collections";
import {
  deleteStoryCollection,
  setStoryCollectionFlags,
} from "@/app/actions/story-collections";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
import { Plus, Edit, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";

export default function StoryCollectionsListPage() {
  const router = useRouter();
  const { activeAccount } = useAccount();
  const wallet = useActiveAccount();
  const [collections, setCollections] = useState<StoryCollection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeAccount) return;
    setLoading(true);
    const list = await listForAccount(activeAccount.id);
    setCollections(list);
    setLoading(false);
  }, [activeAccount]);

  useEffect(() => {
    load();
  }, [load]);

  if (!activeAccount) return null;

  const canWrite = subTypeFeatures(activeAccount.sub_type).storyCollections;

  const handleDelete = async (id: string) => {
    if (!wallet?.address) return;
    const t = toast.loading("Wird gelöscht...");
    const res = await deleteStoryCollection(id, activeAccount.id, wallet.address);
    if (res.success) {
      toast.success("Gelöscht", { id: t });
      await load();
    } else {
      toast.error("Fehler", { id: t, description: res.error });
    }
  };

  const toggleFlag = async (
    c: StoryCollection,
    field: "show_on_profile" | "show_on_home_feed" | "is_published",
    value: boolean
  ) => {
    if (!wallet?.address) return;
    const res = await setStoryCollectionFlags(c.id, activeAccount.id, wallet.address, {
      [field]: value,
    });
    if (res.success) {
      setCollections((cs) =>
        cs.map((x) => (x.id === c.id ? { ...x, [field]: value } : x))
      );
    } else {
      toast.error("Fehler", { description: res.error });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">Stories</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Story-Sammlungen für das Bürger-Profil und den Home-Feed.
          </p>
        </div>
        <Button
          disabled={!canWrite}
          onClick={() => router.push("/dashboard/story-collections/new")}
        >
          <Plus className="h-4 w-4 mr-2" />
          Neue Sammlung
        </Button>
      </div>

      {!canWrite && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg p-4 text-sm text-amber-900 dark:text-amber-200">
          Stories sind aktuell nur für das Stadt-Konto verfügbar.
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-[10px]" />
          ))
        ) : collections.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-[10px]">
            <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Noch keine Story-Sammlungen.
            </p>
            {canWrite && (
              <Button
                variant="link"
                onClick={() => router.push("/dashboard/story-collections/new")}
                className="mt-2"
              >
                Erste Sammlung anlegen
              </Button>
            )}
          </div>
        ) : (
          collections.map((c) => (
            <div
              key={c.id}
              className="bg-card border border-border rounded-[10px] p-5"
            >
              <div className="flex gap-4">
                {c.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.cover_image_url}
                    alt=""
                    className="w-24 h-32 rounded-[8px] object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-24 h-32 rounded-[8px] bg-muted flex-shrink-0 flex items-center justify-center">
                    <BookOpen className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-medium">{c.title}</h3>
                    {!c.is_published && (
                      <Badge variant="secondary">Entwurf</Badge>
                    )}
                  </div>
                  {c.subtitle && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {c.subtitle}
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-xs">
                    <FlagToggle
                      label="Im Profil zeigen"
                      checked={c.show_on_profile}
                      onChange={(v) => toggleFlag(c, "show_on_profile", v)}
                      disabled={!canWrite}
                    />
                    <FlagToggle
                      label="Im Home-Feed zeigen"
                      checked={c.show_on_home_feed}
                      onChange={(v) => toggleFlag(c, "show_on_home_feed", v)}
                      disabled={!canWrite}
                    />
                    <FlagToggle
                      label="Veröffentlicht"
                      checked={c.is_published}
                      onChange={(v) => toggleFlag(c, "is_published", v)}
                      disabled={!canWrite}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Link
                    href={`/dashboard/story-collections/${c.id}/edit`}
                    className="inline-flex items-center px-3 py-1.5 text-sm hover:bg-accent rounded-md"
                  >
                    <Edit className="h-4 w-4 mr-1.5" />
                    Bearbeiten
                  </Link>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" disabled={!canWrite}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Sammlung löschen?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Alle Slides dieser Sammlung werden ebenfalls entfernt.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(c.id)}>
                          Löschen
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function FlagToggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <span className="text-muted-foreground">{label}</span>
    </label>
  );
}
