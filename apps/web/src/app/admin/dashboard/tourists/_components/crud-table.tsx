"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { ColumnDef, RowRecord } from "./types";
import { RowEditor } from "./row-editor";

interface CrudTableProps<T extends RowRecord> {
  rows: T[];
  columns: ColumnDef[];
  title: string;
  searchKeys?: (keyof T & string)[];
  onUpsert: (row: Partial<T>) => Promise<{ success: boolean; error?: string }>;
  onDelete: (id: string) => Promise<{ success: boolean; error?: string }>;
  // Used when creating a new row (e.g., default tour_id).
  defaultRow?: Partial<T>;
  rowActions?: (row: T) => React.ReactNode;
  emptyHint?: string;
}

export function CrudTable<T extends RowRecord>({
  rows,
  columns,
  title,
  searchKeys,
  onUpsert,
  onDelete,
  defaultRow,
  rowActions,
  emptyHint,
}: CrudTableProps<T>) {
  const router = useRouter();
  const [editingRow, setEditingRow] = useState<Partial<T> | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const visibleColumns = useMemo(
    () => columns.filter((c) => !c.hideInList),
    [columns],
  );

  const filteredRows = useMemo(() => {
    if (!search.trim() || !searchKeys?.length) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      searchKeys.some((k) => {
        const v = (r as unknown as Record<string, unknown>)[k];
        return typeof v === "string" && v.toLowerCase().includes(q);
      }),
    );
  }, [rows, search, searchKeys]);

  const handleSave = async (row: Partial<T>) => {
    const result = await onUpsert(row);
    if (result.success) {
      toast({ title: "Gespeichert" });
      setEditingRow(null);
      startTransition(() => router.refresh());
    } else {
      toast({
        title: "Fehler",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const result = await onDelete(deletingId);
    if (result.success) {
      toast({ title: "Gelöscht" });
      setDeletingId(null);
      startTransition(() => router.refresh());
    } else {
      toast({
        title: "Fehler",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium">{title}</h2>
          <Badge variant="secondary">{rows.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {searchKeys && searchKeys.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suchen…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-[200px]"
              />
            </div>
          )}
          <Button
            size="sm"
            onClick={() => setEditingRow(defaultRow ?? ({} as Partial<T>))}
          >
            <Plus className="h-4 w-4 mr-1" />
            Neu
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                {visibleColumns.map((c) => (
                  <th key={c.key} className="text-left font-medium px-3 py-2 whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
                <th className="text-right font-medium px-3 py-2 w-px whitespace-nowrap">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleColumns.length + 1}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    {emptyHint ?? "Noch keine Einträge"}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-t border-border align-top">
                    {visibleColumns.map((c) => (
                      <td key={c.key} className="px-3 py-2 max-w-[260px] truncate">
                        {renderCell(c, row as unknown as Record<string, unknown>)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {rowActions?.(row)}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditingRow(row)}
                          title="Bearbeiten"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeletingId(row.id)}
                          title="Löschen"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingRow && (
        <RowEditor
          open={editingRow !== null}
          row={editingRow}
          columns={columns}
          title={editingRow.id ? "Bearbeiten" : "Neu anlegen"}
          onSave={handleSave}
          onClose={() => setEditingRow(null)}
        />
      )}

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(o) => !o && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function renderCell(col: ColumnDef, row: Record<string, unknown>) {
  const value = row[col.key];
  if (col.cell) return col.cell(value, row);
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  switch (col.type) {
    case "bool":
      return (
        <Badge variant={value ? "default" : "secondary"}>
          {value ? "Ja" : "Nein"}
        </Badge>
      );
    case "image":
      return typeof value === "string" && value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt=""
          className="h-10 w-10 object-cover rounded"
        />
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "json-array":
    case "csv":
      return Array.isArray(value) ? (
        <span className="text-xs">{value.join(", ") || "—"}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "int-array":
      return Array.isArray(value) ? (
        <span className="text-xs">{value.join(", ")}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "enum": {
      const opt = col.options?.find((o) => o.value === value);
      return <span>{opt?.label ?? String(value)}</span>;
    }
    case "fk": {
      const opt = col.fkOptions?.find((o) => o.id === value);
      return <span>{opt?.label ?? String(value).slice(0, 8)}</span>;
    }
    case "date":
      return <span>{String(value)}</span>;
    case "time":
      return <span>{String(value).slice(0, 5)}</span>;
    case "longtext": {
      const s = String(value);
      return (
        <span title={s}>{s.length > 60 ? `${s.slice(0, 60)}…` : s}</span>
      );
    }
    default:
      return <span>{String(value)}</span>;
  }
}
