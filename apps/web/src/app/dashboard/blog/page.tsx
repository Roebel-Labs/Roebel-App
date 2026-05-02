"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import { useAccount } from "@/lib/context/AccountContext";
import { canPublishBlog } from "@/types/account";
import { listForAccount, type BlogArticle } from "@/lib/supabase-blog-articles";
import { deleteBlogArticle, setBlogArticleStatus } from "@/app/actions/blog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Plus, Search, Edit, Trash2, FileText, Send } from "lucide-react";
import { toast } from "sonner";

export default function OrgBlogListPage() {
  const router = useRouter();
  const { activeAccount } = useAccount();
  const wallet = useActiveAccount();
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const load = useCallback(async () => {
    if (!activeAccount) return;
    setLoading(true);
    const list = await listForAccount(activeAccount.id);
    setArticles(list);
    setLoading(false);
  }, [activeAccount]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = articles.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.title.toLowerCase().includes(q) ||
        a.excerpt?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (!activeAccount) return null;

  const canWrite = canPublishBlog(activeAccount);

  const handleDelete = async (id: string) => {
    if (!wallet?.address) return;
    const t = toast.loading("Wird gelöscht...");
    const res = await deleteBlogArticle(id, activeAccount.id, wallet.address);
    if (res.success) {
      toast.success("Gelöscht", { id: t });
      await load();
    } else {
      toast.error("Fehler", { id: t, description: res.error });
    }
  };

  const handlePublish = async (id: string) => {
    if (!wallet?.address) return;
    const t = toast.loading("Wird veröffentlicht...");
    const res = await setBlogArticleStatus(
      id,
      activeAccount.id,
      wallet.address,
      "published"
    );
    if (res.success) {
      toast.success("Veröffentlicht", { id: t });
      await load();
    } else {
      toast.error("Fehler", { id: t, description: res.error });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">Blog</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Eigene Artikel und Beiträge dieser Organisation.
          </p>
        </div>
        <Button
          disabled={!canWrite}
          onClick={() => router.push("/dashboard/blog/new")}
        >
          <Plus className="h-4 w-4 mr-2" />
          Neuer Artikel
        </Button>
      </div>

      {!canWrite && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg p-4 text-sm text-amber-900 dark:text-amber-200">
          Veröffentlichen ist erst nach Freigabe deines externen Kontos möglich.
        </div>
      )}

      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Artikel suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="draft">Entwurf</SelectItem>
            <SelectItem value="published">Veröffentlicht</SelectItem>
            <SelectItem value="archived">Archiviert</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-[10px]" />
          ))
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-[10px]">
            <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Noch keine Artikel.
            </p>
            {canWrite && (
              <Button
                variant="link"
                onClick={() => router.push("/dashboard/blog/new")}
                className="mt-2"
              >
                Ersten Artikel schreiben
              </Button>
            )}
          </div>
        ) : (
          filtered.map((article) => (
            <div
              key={article.id}
              className="bg-card border border-border rounded-[10px] p-5"
            >
              <div className="flex gap-4">
                {article.cover_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={article.cover_image_url}
                    alt=""
                    className="w-24 h-24 rounded-[8px] object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-medium">{article.title}</h3>
                    <StatusBadge status={article.status} />
                    {article.category && (
                      <Badge variant="outline" className="text-xs">
                        {article.category}
                      </Badge>
                    )}
                  </div>
                  {article.excerpt && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {article.excerpt}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>
                      {new Date(article.created_at).toLocaleDateString("de-DE")}
                    </span>
                    <span>•</span>
                    <span>{article.view_count} Aufrufe</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {article.status === "draft" && canWrite && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePublish(article.id)}
                    >
                      <Send className="h-4 w-4 mr-1.5" />
                      Veröffentlichen
                    </Button>
                  )}
                  <Link
                    href={`/dashboard/blog/${article.id}/edit`}
                    className="inline-flex items-center px-3 py-1.5 text-sm hover:bg-accent rounded-md"
                  >
                    <Edit className="h-4 w-4 mr-1.5" />
                    Bearbeiten
                  </Link>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Artikel löschen?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Diese Aktion kann nicht rückgängig gemacht werden.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(article.id)}
                        >
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

function StatusBadge({ status }: { status: BlogArticle["status"] }) {
  switch (status) {
    case "published":
      return <Badge className="bg-green-100 text-green-800">Veröffentlicht</Badge>;
    case "draft":
      return <Badge variant="secondary">Entwurf</Badge>;
    case "archived":
      return <Badge variant="outline">Archiviert</Badge>;
  }
}
