// Stand-ins for D1 and KV, for running the Worker in a test: D1 is a real SQLite database in
// memory (node:sqlite) with the Worker's migrations applied, so the SQL is the SQL that runs on
// Cloudflare; KV is a Map that counts its writes.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite'
import type { D1Database, D1PreparedStatement, D1Result, Env, KVNamespace } from '../src/env'
import { CSRF_HEADER, handleApi } from '../src/api'
import worker from '../src/index'

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations')

function toSql(v: unknown): SQLInputValue {
  if (v === undefined) throw new Error('D1_TYPE_ERROR: Type undefined is not supported')
  if (typeof v === 'boolean') return v ? 1 : 0
  return v as SQLInputValue
}

export function fakeD1(): D1Database & { sqlite: DatabaseSync } {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))

  const exec = (sql: string, args: unknown[]): D1Result => {
    const stmt: StatementSync = db.prepare(sql)
    const params = args.map(toSql)
    if (stmt.columns().length) {
      const results = stmt.all(...params) as Record<string, unknown>[]
      const changes = Number((db.prepare('SELECT changes() AS c').get() as { c: number }).c)
      return { results, success: true, meta: { changes: /^\s*select/i.test(sql) ? 0 : changes } }
    }
    const r = stmt.run(...params)
    return { results: [], success: true, meta: { changes: Number(r.changes) } }
  }

  const statement = (sql: string, args: unknown[] = []): D1PreparedStatement & { exec: () => D1Result } => ({
    bind: (...values: unknown[]) => statement(sql, values),
    exec: () => exec(sql, args),
    first: async <T,>() => (exec(sql, args).results[0] as T | undefined) ?? null,
    all: async <T,>() => exec(sql, args) as D1Result<T>,
    run: async () => exec(sql, args),
  })

  return {
    sqlite: db,
    prepare: sql => statement(sql),
    batch: async statements => {
      db.exec('BEGIN')
      try {
        const out = statements.map(s => (s as ReturnType<typeof statement>).exec())
        db.exec('COMMIT')
        return out
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
  }
}

export function fakeKV(): KVNamespace & { map: Map<string, Uint8Array>; writes: number; deletes: number } {
  const map = new Map<string, Uint8Array>()
  const kv = {
    map,
    writes: 0,
    deletes: 0,
    get: (async (key: string, type: 'stream' | 'text') => {
      const v = map.get(key)
      if (!v) return null
      if (type === 'text') return new TextDecoder().decode(v)
      return new Blob([v as Uint8Array<ArrayBuffer>]).stream()
    }) as KVNamespace['get'],
    put: async (key: string, value: string | ArrayBuffer | Uint8Array) => {
      kv.writes++
      map.set(key, typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value instanceof Uint8Array ? value.slice() : value.slice(0)))
    },
    delete: async (key: string) => {
      kv.deletes++
      map.delete(key)
    },
  }
  return kv
}

export const ORIGIN = 'https://planner.example.workers.dev'

export interface TestServer {
  env: Env & { DB: ReturnType<typeof fakeD1>; BLOBS: ReturnType<typeof fakeKV> }
  /** The time the Worker sees (ms). Move it on to expire things. */
  clock: { now: number }
  /** A fetch to the Worker, as the app's browser sends it: same origin, with a cookie jar. */
  fetch: typeof fetch
  /** The same, from another browser with its own cookies. */
  browser(): typeof fetch
}

/** The Worker with fresh D1 and KV, and browsers to call it with. */
export function testServer(vars: Partial<Omit<Env, 'DB' | 'BLOBS'>> = {}): TestServer {
  const env = { DB: fakeD1(), BLOBS: fakeKV(), ...vars }
  const clock = { now: Date.UTC(2026, 10, 8, 9, 0, 0) }
  const browser = (): typeof fetch => {
    const jar = new Map<string, string>()
    return async (input, init) => {
      const req = new Request(new URL(String(input instanceof Request ? input.url : input), ORIGIN), init)
      const headers = new Headers(req.headers)
      if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '))
      const sent = new Request(req, { headers })
      const url = new URL(sent.url)
      const res = url.pathname.startsWith('/api/') ? await handleApi(sent, env, clock.now) : await worker.fetch(sent, env)
      for (const c of res.headers.getSetCookie()) {
        const [pair, ...attrs] = c.split(';')
        const i = pair.indexOf('=')
        const name = pair.slice(0, i).trim()
        if (attrs.some(a => /max-age=0/i.test(a.trim())) || !pair.slice(i + 1)) jar.delete(name)
        else jar.set(name, pair.slice(i + 1))
      }
      return res
    }
  }
  return { env, clock, fetch: browser(), browser }
}

/** JSON request options as the app sends them (with the CSRF header). */
export function post(body: unknown, method = 'POST'): RequestInit {
  return { method, headers: { 'content-type': 'application/json', [CSRF_HEADER]: '1' }, body: JSON.stringify(body) }
}
