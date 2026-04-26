import type React from "react";

export type RowRecord = { id: string };

export type ColumnType =
  | "text"
  | "longtext"
  | "number"
  | "bool"
  | "enum"
  | "json-array"
  | "csv"
  | "int-array"
  | "fk"
  | "image"
  | "date"
  | "time";

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  required?: boolean;
  hideInList?: boolean;
  hideInForm?: boolean;
  // for `enum`
  options?: Array<{ value: string; label: string }>;
  // for `fk`
  fkOptions?: Array<{ id: string; label: string }>;
  // for `image`
  bucketName?: string;
  folder?: string;
  // optional cell renderer overrides default
  cell?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
  // Tooltip / helper text shown under the input in the editor
  hint?: string;
  // For numeric inputs, allow step (e.g., 0.01)
  step?: number;
}
