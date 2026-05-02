"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import { useAccount } from "@/lib/context/AccountContext";
import { canPublishBlog } from "@/types/account";
import { createBlogArticle } from "@/app/actions/blog";
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
import { ArrowLeft, Save, Eye } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  "Lokales",
  "Veranstaltungen",
  "Kultur",
  "Politik",
  "Wirtschaft",
  "Sport",
  "Vereinsleben",
];

export default function NewBlogArticlePage() {
  const router = useRouter();
  const { activeAccount } = useAccount();
  const wallet = useActiveAccount();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    excerpt: "",
    content: "",
    cover_image_url: "",
    category: "",
    tags: "",
    is_featured: false,
  });

  if (!activeAccount) return null;
  const canWrite = canPublishBlog(activeAccount);

  const submit = async (
    e: React.FormEvent,
    status: "draft" | "published"
  ) => {
    e.preventDefault();
    if (!wallet?.address) {
      toast.error("Wallet nicht verbunden");
      return;
    }
    setLoading(true);
    const t = toast.loading(
      status === "published" ? "Wird veröffentlicht..." : "Entwurf wird gespeichert..."
    );
    const fd = new FormData();
    fd.set("account_id", activeAccount.id);
    fd.set("wallet_address", wallet.address);
    Object.entries({ ...form, status }).forEach(([k, v]) => {
      fd.set(k, String(v));
    });
    const res = await createBlogArticle(fd);
    if (res.success) {
      toast.success(
        status === "published" ? "Veröffentlicht" : "Entwurf gespeichert",
        { id: t }
      );
      router.push("/dashboard/blog");
    } else {
      toast.error("Fehler", { id: t, description: res.error });
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-medium">Neuer Artikel</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Schreibe einen neuen Beitrag für{" "}
            <span className="font-medium">{activeAccount.name}</span>.
          </p>
        </div>
      </div>

      {!canWrite && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg p-4 text-sm text-amber-900 dark:text-amber-200">
          Veröffentlichen ist erst nach Freigabe deines externen Kontos möglich.
          Entwürfe kannst du bereits speichern.
        </div>
      )}

      <form className="space-y-6">
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <div>
            <Label htmlFor="title">Titel *</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="excerpt">Kurzbeschreibung</Label>
            <Textarea
              id="excerpt"
              value={form.excerpt}
              onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
              rows={3}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Titelbild</Label>
            <div className="mt-2">
              <ImageUploadDropzone
                bucketName="blog-images"
                currentImageUrl={form.cover_image_url}
                onUploadComplete={(url) =>
                  setForm({ ...form, cover_image_url: url })
                }
                maxSizeMB={5}
              />
            </div>
          </div>
          <div>
            <Label>Inhalt *</Label>
            <div className="mt-2">
              <RichTextEditor
                content={form.content}
                onChange={(content) => setForm({ ...form, content })}
                bucket="blog-images"
                placeholder="Schreibe deinen Artikel..."
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
                value={form.category}
                onValueChange={(value) =>
                  setForm({ ...form, category: value })
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
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="Tag1, Tag2"
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_featured"
              checked={form.is_featured}
              onChange={(e) =>
                setForm({ ...form, is_featured: e.target.checked })
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
            onClick={(e) => submit(e, "draft")}
            disabled={loading || !form.title || !form.content}
          >
            <Save className="h-4 w-4 mr-2" />
            Als Entwurf speichern
          </Button>
          <Button
            type="submit"
            onClick={(e) => submit(e, "published")}
            disabled={loading || !canWrite || !form.title || !form.content}
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
