"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import { useAccount } from "@/lib/context/AccountContext";
import { canPublishBlog } from "@/types/account";
import {
  getBlogArticleById,
  type BlogArticle,
} from "@/lib/supabase-blog-articles";
import { updateBlogArticle, deleteBlogArticle } from "@/app/actions/blog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { ImageUploadDropzone } from "@/components/ui/image-upload-dropzone";
import { ArrowLeft, Save, Eye, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
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

const CATEGORIES = [
  "Lokales",
  "Veranstaltungen",
  "Kultur",
  "Politik",
  "Wirtschaft",
  "Sport",
  "Vereinsleben",
];

export default function EditBlogArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { activeAccount } = useAccount();
  const wallet = useActiveAccount();
  const [article, setArticle] = useState<BlogArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getBlogArticleById(id).then((a) => {
      setArticle(a);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!article || !activeAccount || article.account_id !== activeAccount.id) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">
          Artikel nicht gefunden oder gehört nicht zu dieser Organisation.
        </p>
      </div>
    );
  }

  const canWrite = canPublishBlog(activeAccount);

  const save = async (
    e: React.FormEvent,
    status: BlogArticle["status"]
  ) => {
    e.preventDefault();
    if (!wallet?.address) return;
    setSaving(true);
    const t = toast.loading("Wird gespeichert...");
    const fd = new FormData();
    fd.set("account_id", activeAccount.id);
    fd.set("wallet_address", wallet.address);
    fd.set("title", article.title);
    fd.set("excerpt", article.excerpt ?? "");
    fd.set("content", article.content);
    fd.set("cover_image_url", article.cover_image_url ?? "");
    fd.set("category", article.category ?? "");
    fd.set("tags", (article.tags ?? []).join(","));
    fd.set("status", status);
    fd.set("is_featured", String(article.is_featured));
    const res = await updateBlogArticle(article.id, fd);
    if (res.success) {
      toast.success("Gespeichert", { id: t });
      router.push("/dashboard/blog");
    } else {
      toast.error("Fehler", { id: t, description: res.error });
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!wallet?.address) return;
    const t = toast.loading("Wird gelöscht...");
    const res = await deleteBlogArticle(
      article.id,
      activeAccount.id,
      wallet.address
    );
    if (res.success) {
      toast.success("Gelöscht", { id: t });
      router.push("/dashboard/blog");
    } else {
      toast.error("Fehler", { id: t, description: res.error });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-medium">Artikel bearbeiten</h1>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon">
              <Trash2 className="h-5 w-5 text-red-500" />
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
              <AlertDialogAction onClick={handleDelete}>
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <form className="space-y-6">
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <div>
            <Label htmlFor="title">Titel *</Label>
            <Input
              id="title"
              value={article.title}
              onChange={(e) =>
                setArticle({ ...article, title: e.target.value })
              }
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="excerpt">Kurzbeschreibung</Label>
            <Textarea
              id="excerpt"
              value={article.excerpt ?? ""}
              onChange={(e) =>
                setArticle({ ...article, excerpt: e.target.value })
              }
              rows={3}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Titelbild</Label>
            <div className="mt-2">
              <ImageUploadDropzone
                bucketName="blog-images"
                currentImageUrl={article.cover_image_url ?? ""}
                onUploadComplete={(url) =>
                  setArticle({ ...article, cover_image_url: url })
                }
                maxSizeMB={5}
              />
            </div>
          </div>
          <div>
            <Label>Inhalt *</Label>
            <div className="mt-2">
              <RichTextEditor
                content={article.content}
                onChange={(content) => setArticle({ ...article, content })}
                bucket="blog-images"
              />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h3 className="font-medium text-lg">Metadaten</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="category">Kategorie</Label>
              <Select
                value={article.category ?? ""}
                onValueChange={(value) =>
                  setArticle({ ...article, category: value })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Kategorie wählen" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tags">Tags (kommagetrennt)</Label>
              <Input
                id="tags"
                value={(article.tags ?? []).join(", ")}
                onChange={(e) =>
                  setArticle({
                    ...article,
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_featured"
              checked={article.is_featured}
              onChange={(e) =>
                setArticle({ ...article, is_featured: e.target.checked })
              }
              className="rounded border-border"
            />
            <Label htmlFor="is_featured" className="cursor-pointer">
              Als Featured markieren
            </Label>
          </div>
        </div>

        <div className="flex items-center gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            variant="outline"
            onClick={(e) => save(e, "draft")}
            disabled={saving || !article.title || !article.content}
          >
            <Save className="h-4 w-4 mr-2" />
            Als Entwurf speichern
          </Button>
          <Button
            type="submit"
            onClick={(e) => save(e, "published")}
            disabled={
              saving || !canWrite || !article.title || !article.content
            }
            title={!canWrite ? "Externes Konto wartet auf Freigabe" : undefined}
          >
            <Eye className="h-4 w-4 mr-2" />
            Veröffentlichen
          </Button>
        </div>
      </form>
    </div>
  );
}
