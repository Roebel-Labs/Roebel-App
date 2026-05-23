"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import { useAccount } from "@/lib/context/AccountContext";
import { subTypeFeatures } from "@/types/account";
import {
  createStoryCollection,
  updateStoryCollection,
  type SlideInput,
} from "@/app/actions/story-collections";
import type {
  StoryCollection,
  StorySlide,
} from "@/lib/supabase-story-collections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ImageUploadDropzone } from "@/components/ui/image-upload-dropzone";
import { ArrowLeft, Save, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";

type SlideDraft = {
  background_image_url: string;
  overlay_text: string;
  text_color: string;
};

const blankSlide = (): SlideDraft => ({
  background_image_url: "",
  overlay_text: "",
  text_color: "#FFFFFF",
});

export function StoryCollectionForm({
  mode,
  existing,
}: {
  mode: "create" | "edit";
  existing?: StoryCollection & { slides: StorySlide[] };
}) {
  const router = useRouter();
  const { activeAccount } = useAccount();
  const wallet = useActiveAccount();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    title: existing?.title ?? "",
    subtitle: existing?.subtitle ?? "",
    cover_image_url: existing?.cover_image_url ?? "",
    show_on_profile: existing?.show_on_profile ?? true,
    show_on_home_feed: existing?.show_on_home_feed ?? false,
    is_published: existing?.is_published ?? true,
  });

  const [slides, setSlides] = useState<SlideDraft[]>(
    existing?.slides && existing.slides.length > 0
      ? existing.slides.map((s) => ({
          background_image_url: s.background_image_url,
          overlay_text: s.overlay_text,
          text_color: s.text_color ?? "#FFFFFF",
        }))
      : [blankSlide()]
  );

  if (!activeAccount) return null;
  const canWrite = subTypeFeatures(activeAccount.sub_type).storyCollections;

  const updateSlide = (idx: number, patch: Partial<SlideDraft>) => {
    setSlides((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const removeSlide = (idx: number) => {
    setSlides((arr) => (arr.length === 1 ? arr : arr.filter((_, i) => i !== idx)));
  };

  const moveSlide = (idx: number, dir: -1 | 1) => {
    setSlides((arr) => {
      const next = idx + dir;
      if (next < 0 || next >= arr.length) return arr;
      const copy = [...arr];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  };

  const addSlide = () => setSlides((arr) => [...arr, blankSlide()]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet?.address) {
      toast.error("Wallet nicht verbunden");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Titel fehlt");
      return;
    }
    const validSlides: SlideInput[] = slides
      .filter((s) => s.background_image_url && s.overlay_text.trim())
      .map((s) => ({
        background_image_url: s.background_image_url,
        overlay_text: s.overlay_text.trim(),
        text_color: s.text_color || null,
      }));
    if (validSlides.length === 0) {
      toast.error("Mindestens ein vollständiges Slide ist erforderlich");
      return;
    }

    setLoading(true);
    const t = toast.loading(
      mode === "create" ? "Wird angelegt..." : "Wird gespeichert..."
    );

    const payload = {
      account_id: activeAccount.id,
      wallet_address: wallet.address,
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      cover_image_url: form.cover_image_url || null,
      show_on_profile: form.show_on_profile,
      show_on_home_feed: form.show_on_home_feed,
      is_published: form.is_published,
      slides: validSlides,
    };

    const res =
      mode === "create"
        ? await createStoryCollection(payload)
        : await updateStoryCollection(existing!.id, payload);

    if (res.success) {
      toast.success(
        mode === "create" ? "Angelegt" : "Gespeichert",
        { id: t }
      );
      router.push("/dashboard/story-collections");
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
          <h1 className="text-2xl font-medium">
            {mode === "create" ? "Neue Story-Sammlung" : "Sammlung bearbeiten"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Eine Sammlung erscheint als Story-Bubble im Bürger-Profil und optional
            im Home-Feed direkt nach den Events.
          </p>
        </div>
      </div>

      {!canWrite && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg p-4 text-sm text-amber-900 dark:text-amber-200">
          Stories sind aktuell nur für das Stadt-Konto verfügbar.
        </div>
      )}

      <form className="space-y-6" onSubmit={submit}>
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <div>
            <Label htmlFor="title">Titel *</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="z. B. Über die Röbel App"
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="subtitle">Untertitel</Label>
            <Input
              id="subtitle"
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              placeholder="optional"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Bubble-Hintergrund (Cover)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Wird in der horizontalen Story-Leiste angezeigt.
            </p>
            <ImageUploadDropzone
              bucketName="blog-images"
              folder="story-collections"
              currentImageUrl={form.cover_image_url}
              onUploadComplete={(url) =>
                setForm({ ...form, cover_image_url: url })
              }
              maxSizeMB={5}
            />
          </div>
        </div>

        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-lg">Slides</h3>
            <Button type="button" variant="outline" size="sm" onClick={addSlide}>
              <Plus className="h-4 w-4 mr-1.5" />
              Slide hinzufügen
            </Button>
          </div>

          <div className="space-y-6">
            {slides.map((s, idx) => (
              <div
                key={idx}
                className="border border-border rounded-[10px] p-4 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Slide {idx + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => moveSlide(idx, -1)}
                      disabled={idx === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => moveSlide(idx, 1)}
                      disabled={idx === slides.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSlide(idx)}
                      disabled={slides.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <Label>Hintergrundbild *</Label>
                  <div className="mt-2">
                    <ImageUploadDropzone
                      bucketName="blog-images"
                      folder="story-collections"
                      currentImageUrl={s.background_image_url}
                      onUploadComplete={(url) =>
                        updateSlide(idx, { background_image_url: url })
                      }
                      maxSizeMB={5}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor={`text-${idx}`}>Overlay-Text *</Label>
                  <Textarea
                    id={`text-${idx}`}
                    value={s.overlay_text}
                    onChange={(e) =>
                      updateSlide(idx, { overlay_text: e.target.value })
                    }
                    placeholder='z. B. "Bots grab rewards and spots before you do."'
                    rows={2}
                    className="mt-1"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Label htmlFor={`color-${idx}`} className="text-sm">
                    Textfarbe
                  </Label>
                  <input
                    id={`color-${idx}`}
                    type="color"
                    value={s.text_color}
                    onChange={(e) =>
                      updateSlide(idx, { text_color: e.target.value })
                    }
                    className="h-9 w-16 rounded border border-border bg-transparent cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground">
                    {s.text_color}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-[10px] p-6 space-y-4">
          <h3 className="font-medium text-lg">Sichtbarkeit</h3>
          <FlagRow
            label="Im Bürger-Profil zeigen"
            description='Erscheint im Slider "Lerne mehr über die Röbel App".'
            checked={form.show_on_profile}
            onChange={(v) => setForm({ ...form, show_on_profile: v })}
          />
          <FlagRow
            label="Im Home-Feed zeigen"
            description="Erscheint direkt unter der Event-Story-Leiste."
            checked={form.show_on_home_feed}
            onChange={(v) => setForm({ ...form, show_on_home_feed: v })}
          />
          <FlagRow
            label="Veröffentlicht"
            description="Deaktivieren, um die Sammlung temporär zu verstecken."
            checked={form.is_published}
            onChange={(v) => setForm({ ...form, is_published: v })}
          />
        </div>

        <div className="flex items-center gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={loading || !canWrite}>
            <Save className="h-4 w-4 mr-2" />
            {mode === "create" ? "Anlegen" : "Speichern"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function FlagRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
