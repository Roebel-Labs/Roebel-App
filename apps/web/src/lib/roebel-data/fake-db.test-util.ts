// Minimal chainable Supabase stand-in for tests: every filter/order call is a
// no-op, awaiting yields all rows of the table, maybeSingle() the first row.
import type { Db } from "./tenant";

export function fakeDb(tables: Record<string, unknown[]>): Db {
  const make = (table: string): unknown => {
    const rows = tables[table] ?? [];
    const result = { data: rows, error: null, count: rows.length };
    const builder: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
          if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve({ data: rows[0] ?? null, error: null });
          return () => builder;
        },
      },
    );
    return builder;
  };
  return { from: (table: string) => make(table) } as unknown as Db;
}
