// Minimal in-memory fake of the supabase query surface the oidc adapter uses (one shared `rows`
// array backs every oidc payload type — Session, Interaction, Grant, AuthorizationCode, …). Shared
// by the adapter unit test and every in-process end-to-end flow so state persists within a single
// process without a real Postgres. Extracted from test/e2e-flow.test.ts so multiple suites (e2e +
// agent-token) can stand up an identical persistent adapter.
export function fakeClient() {
  const rows: any[] = []
  return {
    _rows: rows,
    from() {
      const state: any = { filters: {} }
      const api: any = {
        upsert(r: any) {
          const i = rows.findIndex((x) => x.type === r.type && x.id === r.id)
          if (i >= 0) rows[i] = r
          else rows.push(r)
          return Promise.resolve({ error: null })
        },
        select() { return api },
        eq(k: string, v: any) { state.filters[k] = v; return api },
        maybeSingle() {
          return Promise.resolve({
            data: rows.find((x) => Object.entries(state.filters).every(([k, v]) => x[k] === v)) ?? null,
            error: null,
          })
        },
        delete() { state.del = true; return api },
        then(res: any) {
          const matched = rows.filter((x) => Object.entries(state.filters).every(([k, v]) => x[k] === v))
          for (const m of matched) rows.splice(rows.indexOf(m), 1)
          return Promise.resolve({ error: null }).then(res)
        },
      }
      return api
    },
  }
}
