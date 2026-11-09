// What the Worker is given: its D1 database, its KV namespace, the built app, and its settings.
// Only the parts of Cloudflare's D1 and KV interfaces this Worker uses, so the tests can hand it
// an in-memory stand-in (worker/test/fakes.ts) and nothing here needs Cloudflare's own types.

export interface D1Result<T = Record<string, unknown>> {
  results: T[]
  success: boolean
  meta: { changes: number; [k: string]: unknown }
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
  run(): Promise<D1Result>
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement
  /** Runs the statements in order as one transaction: all of them land, or none. */
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>
}

export interface KVNamespace {
  get(key: string, type: 'stream'): Promise<ReadableStream<Uint8Array> | null>
  get(key: string, type: 'text'): Promise<string | null>
  put(key: string, value: string | ArrayBuffer | Uint8Array): Promise<void>
  delete(key: string): Promise<void>
}

export interface Fetcher {
  fetch(request: Request): Promise<Response>
}

export interface Env {
  DB: D1Database
  BLOBS: KVNamespace
  /** The built app (Workers static assets). */
  ASSETS?: Fetcher
  /**
   * Who may create an account:
   *   first   (default) only while there is no account yet, so the first person in owns it
   *   invite  anyone with INVITE_CODE
   *   open    anyone (not for a public deployment)
   *   closed  nobody
   * Setting INVITE_CODE makes it `invite` unless it is `closed`.
   */
  SIGNUP?: string
  /**
   * The secret codes that let someone create an account (wrangler secret put INVITE_CODE): one, or
   * several separated by commas or new lines, each optionally `label:CODE` ("builders:oak-door-17").
   * Each account notes the label it came in with (users.invite; `#` and a short hash for a code
   * without one), so one code can be taken out of the list without the others changing.
   */
  INVITE_CODE?: string
  /** The passkeys' relying party id; defaults to the hostname the Worker is reached on. */
  RP_ID?: string
  /** The most one person may keep, in MB (default 50, so 20 people fit in the free plan's 1 GB of KV). */
  QUOTA_MB?: string
}
