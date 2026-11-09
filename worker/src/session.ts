// Signed-in browsers: a random token in an HttpOnly, Secure, SameSite=Lax cookie, with only its
// hash kept in D1. Sessions last 30 days from the last visit (refreshed at most once a day).

import type { Env } from './env'
import { cookie, HttpError, randomId, sha256Hex } from './http'

export const SESSION_COOKIE = '__Host-bhp_session'
const DAY = 24 * 60 * 60 * 1000
export const SESSION_DAYS = 30

export interface User {
  id: string
  name: string
}

/**
 * The statement that starts a session, for a batch that creates the account or passkey with it:
 * it lands only if `guard` (an SQL condition, the user existing by default) holds by then.
 */
export async function sessionInsert(env: Env, userId: string, now: number, guard: { sql: string; args: unknown[] } = { sql: 'EXISTS (SELECT 1 FROM users WHERE id = ?)', args: [userId] }) {
  const token = randomId(32)
  const stmt = env.DB.prepare(`INSERT INTO sessions (token_hash, user_id, created, expires, seen) SELECT ?, ?, ?, ?, ? WHERE ${guard.sql}`).bind(
    await sha256Hex(token),
    userId,
    now,
    now + SESSION_DAYS * DAY,
    now,
    ...guard.args,
  )
  return { token, stmt }
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`
}

export const clearedCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

/** Who this request is signed in as, if anyone. */
export async function readSession(env: Env, req: Request, now: number): Promise<User | null> {
  const token = cookie(req, SESSION_COOKIE)
  if (!token || token.length > 100) return null
  // Now and then, let go of sessions that ran out.
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now).run()
  const hash = await sha256Hex(token)
  const row = await env.DB.prepare('SELECT s.user_id AS id, u.name AS name, s.expires AS expires, s.seen AS seen FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
    .bind(hash)
    .first<{ id: string; name: string; expires: number; seen: number }>()
  if (!row) return null
  if (row.expires < now) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run()
    return null
  }
  if (now - row.seen > DAY) await env.DB.prepare('UPDATE sessions SET seen = ?, expires = ? WHERE token_hash = ?').bind(now, now + SESSION_DAYS * DAY, hash).run()
  return { id: row.id, name: row.name }
}

export async function requireUser(env: Env, req: Request, now: number): Promise<User> {
  const user = await readSession(env, req, now)
  if (!user) throw new HttpError(401, 'signed-out', 'Sign in again to save to the cloud. Your work is still saved on this device.')
  return user
}

export async function endSession(env: Env, req: Request): Promise<void> {
  const token = cookie(req, SESSION_COOKIE)
  if (token && token.length <= 100) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run()
}

// ---------------------------------------------------------------------------
// Rate limits: a fixed window per key, one D1 row each.

export async function rateLimit(env: Env, key: string, limit: number, windowMs: number, now: number): Promise<void> {
  // The window's start, in ms, so one clean-up works for every key's window.
  const win = Math.floor(now / windowMs) * windowMs
  const row = await env.DB.prepare(
    'INSERT INTO rate_limits (key, win, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN rate_limits.win = excluded.win THEN rate_limits.count + 1 ELSE 1 END, win = excluded.win RETURNING count',
  )
    .bind(key, win)
    .first<{ count: number }>()
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM rate_limits WHERE win < ?').bind(now - DAY).run()
  if ((row?.count ?? 0) > limit) {
    const wait = Math.max(1, Math.ceil((win + windowMs - now) / 60000))
    throw new HttpError(429, 'slow-down', `Too many tries. Wait ${wait} minute${wait === 1 ? '' : 's'} and try again.`)
  }
}

/** The address a request came from (Cloudflare sets it; local runs have none). */
export const clientIp = (req: Request) => req.headers.get('cf-connecting-ip') ?? 'local'
