// Minimal ambient types for `oidc-provider`.
//
// The installed `oidc-provider` package (8.8.1) ships no type declarations
// and there is no `@types/oidc-provider` matching this major version wired
// into the workspace yet, so `import type { ... } from 'oidc-provider'`
// resolves to implicit `any` under `strict`/`noImplicitAny`. This declares
// just the surface this package currently consumes (the storage Adapter
// contract). Safe to delete/replace once real upstream types are adopted.
declare module 'oidc-provider' {
  export interface AdapterPayload {
    [key: string]: unknown
    accountId?: string
    grantId?: string
    userCode?: string
    uid?: string
    consumed?: number
  }

  export interface Adapter {
    upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void>
    find(id: string): Promise<AdapterPayload | undefined>
    findByUid(uid: string): Promise<AdapterPayload | undefined>
    findByUserCode(userCode: string): Promise<AdapterPayload | undefined>
    consume(id: string): Promise<void>
    destroy(id: string): Promise<void>
    revokeByGrantId(grantId: string): Promise<void>
  }
}
