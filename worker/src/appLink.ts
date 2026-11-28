// Signing the desktop app in. Passkeys belong to the website's address, so the app can't use
// them; instead it borrows a browser that is (or gets) signed in:
//
// 1. The app asks for a link (start): a short code to show, and a secret only it keeps.
// 2. It opens the website at /?app-link=CODE. The person, signed in there, checks the code
//    matches the one in the app and approves it (approve, with the browser's cookie).
// 3. The app, asking every couple of seconds with its secret (claim), then gets a session token
//    of its own: the same 30-day sessions as browsers have, sent as `Authorization: Bearer`
//    instead of a cookie (./session.ts).
//
// A link lasts ten minutes and is used once. Only a hash of the secret is kept.

import type { Env } from './env'
import { HttpError, json, randomBytes, readJson, sha256Hex } from './http'
import { clientIp, LIVE_ACCOUNT, rateLimit, readSession, sessionInsert } from './session'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
export const LINK_MINUTES = 10

/** No 0/O or 1/I/L, so a code read off the screen can't be misread. */
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** A code like K7QX-3MPA. */
export function newLinkCode(): string {
  const bytes = randomBytes(8)
  let s = ''
  for (let i = 0; i < 8; i++) s += LETTERS[bytes[i] % LETTERS.length]
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

/** The code as typed or pasted: upper case, the dash put back. Null when it can't be one. */
export function cleanLinkCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (s.length !== 8 || [...s].some(c => !LETTERS.includes(c))) return null
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

const GONE = () => new HttpError(404, 'link-gone', 'That sign-in link has run out or was already used. Start again from the desktop app.')

/** The app asks for a link. */
export async function linkStart(env: Env, req: Request, now: number): Promise<Response> {
  await rateLimit(env, `app-link:${clientIp(req)}`, 20, HOUR, now)
  await env.DB.prepare('DELETE FROM app_links WHERE expires < ?').bind(now).run()
  const secretBytes = randomBytes(32)
  const secret = [...secretBytes].map(b => b.toString(16).padStart(2, '0')).join('')
  const code = newLinkCode()
  const expires = now + LINK_MINUTES * MINUTE
  await env.DB.prepare('INSERT INTO app_links (code, secret_hash, user_id, created, expires) VALUES (?, ?, NULL, ?, ?)').bind(code, await sha256Hex(secret), now, expires).run()
  const url = new URL(req.url)
  return json({ code, secret, expires, url: `${url.origin}/?app-link=${encodeURIComponent(code)}` })
}

async function liveLink(env: Env, raw: unknown, now: number) {
  const code = cleanLinkCode(raw)
  if (!code) throw GONE()
  const row = await env.DB.prepare('SELECT code, secret_hash, user_id, expires FROM app_links WHERE code = ?')
    .bind(code)
    .first<{ code: string; secret_hash: string; user_id: string | null; expires: number }>()
  if (!row || row.expires < now) throw GONE()
  return row
}

/** The browser, before approving: is the link still good? */
export async function linkCheck(env: Env, _req: Request, now: number, code: string): Promise<Response> {
  const row = await liveLink(env, code, now)
  return json({ code: row.code, expires: row.expires, approved: !!row.user_id })
}

/** A signed-in browser approves the link (with its cookie; a desktop app's token can't). */
export async function linkApprove(env: Env, req: Request, now: number, code: string): Promise<Response> {
  if (req.headers.get('authorization')) throw new HttpError(403, 'browser-only', 'Approve the desktop app from your browser.')
  await rateLimit(env, `app-approve:${clientIp(req)}`, 30, HOUR, now)
  const user = await readSession(env, req, now)
  if (!user) throw new HttpError(401, 'signed-out', 'Sign in first, then approve the desktop app.')
  const row = await liveLink(env, code, now)
  if (row.user_id && row.user_id !== user.id) throw GONE()
  await env.DB.prepare('UPDATE app_links SET user_id = ? WHERE code = ? AND (user_id IS NULL OR user_id = ?)').bind(user.id, row.code, user.id).run()
  return json({ ok: true })
}

/** The app, asking with its secret: waiting until approved, then a session token, once. */
export async function linkClaim(env: Env, req: Request, now: number): Promise<Response> {
  await rateLimit(env, `app-claim:${clientIp(req)}`, 1000, HOUR, now)
  const body = await readJson<{ code?: unknown; secret?: unknown }>(req)
  const row = await liveLink(env, body.code, now)
  if (typeof body.secret !== 'string' || body.secret.length > 200 || (await sha256Hex(body.secret)) !== row.secret_hash) throw GONE()
  if (!row.user_id) return json({ waiting: true }, 202)
  const user = await env.DB.prepare(`SELECT u.id AS id, u.name AS name, u.delete_after AS delete_after FROM users u WHERE u.id = ? AND ${LIVE_ACCOUNT}`)
    .bind(row.user_id, now)
    .first<{ id: string; name: string; delete_after: number | null }>()
  if (!user) throw GONE()
  // The session is made only while the link is still there, and the link goes in the same batch,
  // so a second claim can't get a second session.
  const { token, stmt } = await sessionInsert(env, user.id, now, { sql: 'EXISTS (SELECT 1 FROM app_links WHERE code = ? AND user_id = ?)', args: [row.code, user.id] })
  const results = await env.DB.batch([stmt, env.DB.prepare('DELETE FROM app_links WHERE code = ?').bind(row.code)])
  if (!results[0].meta.changes) throw GONE()
  return json({ token, user: { id: user.id, name: user.name, deleteAfter: user.delete_after } })
}

/** The hourly clean-up. */
export async function tidyAppLinks(env: Env, now: number): Promise<void> {
  await env.DB.prepare('DELETE FROM app_links WHERE expires < ?').bind(now).run()
}
