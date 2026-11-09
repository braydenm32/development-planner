// People using one Worker, for tests that need more than one account: each has their own
// browser (cookie jar) and passkey, and can save projects and make share links as the app does.

import { createHash } from 'node:crypto'
import { expect } from 'vitest'
import { CSRF_HEADER } from '../src/api'
import { COMMENTER_HEADER } from '../src/comments'
import { PART_MAX, partsFor, type RecordRef } from '../src/projects'
import { newShareToken, SHARE_HEADER } from '../src/shares'
import { softPasskey } from './authenticator'
import { ORIGIN, post, testServer, type TestServer } from './fakes'

export const DAY = 24 * 60 * 60 * 1000
export const hashOf = (text: string) => createHash('sha256').update(text).digest('hex')

export interface Person {
  id: string
  name: string
  fetch: typeof fetch
  key: ReturnType<typeof softPasskey>
  /** Upload a record's text the way the app does, part by part. */
  upload(text: string): Promise<RecordRef>
  /** Save a project at revision 1 with these records. */
  save(id: string, name: string, records: Record<string, RecordRef>): Promise<void>
  /** Make a share link for one of their projects (with comments as asked, off if not); the token. */
  share(id: string, options?: Record<string, unknown>): Promise<{ token: string; id: string }>
  signIn(): Promise<Response>
}

/** A Worker that lets people in with an invite code, as the public launch does. */
export const INVITE = 'test-invite-code'
export const server = (vars = {}) => testServer({ SIGNUP: 'invite', INVITE_CODE: INVITE, ...vars })

export const meta = (name: string, extra = {}) => ({ name, created: 1, updated: 2, archived: false, surveyFileName: 'block.dxf', thumbnail: null, numbers: { siteArea: 600, floorArea: 180, ffl: 10 }, ...extra })

export async function person(s: TestServer, name: string): Promise<Person> {
  const f = s.browser()
  const key = softPasskey(ORIGIN)
  const opts = await (await f('/api/auth/signup/options', post({ name, invite: INVITE }))).json()
  const res = await f('/api/auth/signup/verify', post({ challengeId: opts.challengeId, response: await key.create(opts.options), invite: INVITE }))
  expect(res.status).toBe(200)
  const { user } = await res.json()
  return {
    id: user.id,
    name,
    fetch: f,
    key,
    async upload(text) {
      const bytes = new TextEncoder().encode(text)
      const hash = hashOf(text)
      const parts = partsFor(bytes.length)
      for (let p = 0; p < parts; p++) {
        const put = await f(`/api/blobs/${hash}/${p}?parts=${parts}&size=${bytes.length}`, { method: 'PUT', headers: { [CSRF_HEADER]: '1' }, body: bytes.slice(p * PART_MAX, (p + 1) * PART_MAX) })
        expect(put.status).toBe(200)
      }
      return { hash, size: bytes.length, parts }
    },
    async save(id, projectName, records) {
      expect((await f(`/api/projects/${id}/commit`, post({ base: 0, meta: meta(projectName), records }))).status).toBe(200)
    },
    async share(id, options = {}) {
      const made = await f(`/api/projects/${id}/shares`, post(options))
      expect(made.status).toBe(201)
      const body = await made.json()
      return { token: body.token, id: body.link.id }
    },
    async signIn() {
      const o = await (await f('/api/auth/login/options', post({}))).json()
      return f('/api/auth/login/verify', post({ challengeId: o.challengeId, response: await key.get(o.options) }))
    },
  }
}

/** Open a share link as someone with no account. */
export const openLink = (s: TestServer, token: string, ip = '203.0.113.9') => s.browser()('/api/shared', { headers: { [SHARE_HEADER]: token, 'cf-connecting-ip': ip } })
export const linkBlob = (s: TestServer, token: string, hash: string, ip = '203.0.113.9') =>
  s.browser()(`/api/shared/blobs/${hash}/0`, { headers: { [SHARE_HEADER]: token, 'cf-connecting-ip': ip } })

/** Every row of one account, table by table, and its KV keys: to show that something else left them alone. */
export function rowsOf(s: TestServer, user: string) {
  const db = s.env.DB.sqlite
  const out: Record<string, unknown[]> = {}
  for (const [table, col] of [
    ['users', 'id'],
    ['credentials', 'user_id'],
    ['recovery_codes', 'user_id'],
    ['sessions', 'user_id'],
    ['projects', 'user_id'],
    ['project_records', 'user_id'],
    ['blobs', 'user_id'],
    ['share_links', 'user_id'],
    ['email_codes', 'user_id'],
    ['share_comments', 'user_id'],
  ] as const)
    out[table] = db.prepare(`SELECT * FROM ${table} WHERE ${col} = ? ORDER BY 1, 2`).all(user)
  out.kv = [...s.env.BLOBS.map.keys()].filter(k => k.startsWith(`b:${user}:`)).sort()
  return out
}

/**
 * Someone with a link and no account, commenting from one browser: its own commenter token
 * (as the app keeps one per browser) and address.
 */
export function commenter(s: TestServer, link: string, { ip = '203.0.113.20', token = newShareToken() }: { ip?: string; token?: string | null } = {}) {
  const b = s.browser()
  const headers = (): Record<string, string> => ({ [SHARE_HEADER]: link, 'cf-connecting-ip': ip, ...(token ? { [COMMENTER_HEADER]: token } : {}) })
  return {
    token,
    list: () => b('/api/shared/comments', { headers: headers() }),
    add: (body: unknown) => b('/api/shared/comments', { method: 'POST', headers: { ...headers(), 'content-type': 'application/json', [CSRF_HEADER]: '1' }, body: JSON.stringify(body) }),
    raw: b,
    headers,
  }
}

/** A comment as the app sends one: a spot on the block (easting, northing) on a floor, and the words. */
export const pin = (text = 'Move this wall back a metre?', extra: Record<string, unknown> = {}) => ({ floor: 'level_ground', x: 1012.5, y: 1008.25, text, ...extra })
