"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUploadDropzone } from "@/components/ui/image-upload-dropzone";
import type { ColumnDef, RowRecord } from "./types";

interface Props<T extends RowRecord> {
  open: boolean;
  row: Partial<T>;
  columns: ColumnDef[];
  title: string;
  onSave: (row: Partial<T>) => Promise<void> | void;
  onClose: () => void;
}

export function RowEditor<T extends RowRecord>({
  open,
  row,
  columns,
  title,
  onSave,
  onClose,
}: Props<T>) {
  const [draft, setDraft] = useState<Partial<T>>(row);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(row), [row]);

  const formColumns = useMemo(
    () => columns.filter((c) => !c.hideInForm),
    [columns],
  );

  const setField = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value } as Partial<T>));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {formColumns.map((col) => (
            <Field
              key={col.key}
              col={col}
              value={(draft as Record<string, unknown>)[col.key]}
              onChange={(v) => setField(col.key, v)}
            />
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Speichern…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  col,
  value,
  onChange,
}: {
  col: ColumnDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `field-${col.key}`;
  const required = col.required ? <span className="text-destructive ml-1">*</span> : null;

  if (col.type === "bool") {
    return (
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <div>
          <Label htmlFor={id} className="cursor-pointer">
            {col.label}
            {required}
          </Label>
          {col.hint && (
            <p className="text-xs text-muted-foreground mt-0.5">{col.hint}</p>
          )}
        </div>
        <Switch
          id={id}
          checked={Boolean(value)}
          onCheckedChange={(v) => onChange(v)}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {col.label}
        {required}
      </Label>
      {renderInput(col, value, onChange, id)}
      {col.hint && <p className="text-xs text-muted-foreground">{col.hint}</p>}
    </div>
  );
}

function renderInput(
  col: ColumnDef,
  value: unknown,
  onChange: (v: unknown) => void,
  id: string,
) {
  switch (col.type) {
    case "longtext":
      return (
        <Textarea
          id={id}
          rows={4}
          value={(value as string | null) ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case "number": {
      const num = value === "" || value == null ? "" : String(value);
      return (
        <Input
          id={id}
          type="number"
          step={col.step ?? "any"}
          value={num}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? null : Number(v));
          }}
        />
      );
    }
    case "enum":
      return (
        <Select
          value={(value as string) ?? ""}
          onValueChange={(v) => onChange(v || null)}
        >
          <SelectTrigger id={id}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {col.options?.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "fk":
      return (
        <Select
          value={(value as string) ?? ""}
          onValueChange={(v) => onChange(v || null)}
        >
          <SelectTrigger id={id}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {col.fkOptions?.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "json-array":
    case "csv": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <Input
          id={id}
          placeholder="Mit Komma trennen"
          value={arr.join(", ")}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      );
    }
    case "int-array": {
      const arr = Array.isArray(value) ? (value as number[]) : [];
      return (
        <Input
          id={id}
          placeholder="z. B. 3, 4, 5"
          value={arr.join(", ")}
          onChange={(e) => {
            const parts = e.target.value
              .split(",")
              .map((s) => Number(s.trim()))
              .filter((n) => Number.isFinite(n));
            onChange(parts);
          }}
        />
      );
    }
    case "image":
      return (
        <ImageUploadDropzone
          currentImageUrl={(value as string) ?? ""}
          onUploadComplete={(url) => onChange(url || null)}
          bucketName={col.bucketName}
          folder={col.folder}
        />
      );
    case "date":
      return (
        <Input
          id={id}
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case "time":
      return (
        <Input
          id={id}
          type="time"
          step={1}
          value={((value as string) ?? "").slice(0, 8)}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    default:
      return (
        <Input
          id={id}
          value={(value as string | null) ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
  }
}
