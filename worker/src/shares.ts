// Read-only share links. A link is a random token (32 bytes, base64url) that opens one project,
// read-only, at the revision the cloud has now. Only the token's SHA-256 is kept (as sessions
// do), so the owner's list can't show a link again: it says when each was made, last opened and
// ends, and each can be extended or turned off, which works at once. A link lasts 30 days unless
// the owner picks 90 days or a year; links made before links had an end keep working until
// they are turned off.
//
// The owner's side (make, list, turn off, undo turning off) needs their session, like the rest of
// the API. The public side needs only the token, sent in the X-BHP-Share header so it stays out
// of addresses and logs: GET only, rate limited per address, never cached or indexed, and it
// reads that one project's index entry and the records a viewer needs, nothing else. The only
// thing it writes is when the link was last opened. A link stops opening while its account is
// being deleted, and opens again if the account is kept.
//
// Each link also says whether people with it can comment on the plan (worker/src/comments.ts):
// off unless the owner ticks it when making the link, or later.

import type { Env } from './env'
import { HttpError, json, randomId, readBytes, sha256Hex } from './http'
import { checkId, getBlob, type RecordRef } from './projects'
import { clientIp, rateLimit } from './session'

/** The header that carries a share token. */
export const SHARE_HEADER = 'x-bhp-share'

/**
 * The records a shared project shows: the survey, the plan, its view and print choices, and the
 * site features. Not the undo history, the survey a Replace took the place of, the tools'
 * settings, or the site drawings and second DXF (which the project file leaves out unless asked).
 */
export const SHARED_KINDS = ['survey', 'plan', 'prefs', 'site'] as const

/** 32 random bytes, base64url: 43 characters. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const LINK_ID_RE = /^[0-9a-f]{64}$/
const HASH_RE = /^[0-9a-f]{64}$/
const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

/** How long a new link can last, in days: at least 30 (decided 9 November). */
export const LINK_DAYS = [30, 90, 365] as const
export const DEFAULT_DAYS = 30
/** What Extend adds to a link that still works, and the furthest from now it can reach. */
export const EXTEND_DAYS = 30
export const MAX_DAYS = 365

/**
 * Comments on a link (share_links.comments, by position): off, on with each person seeing only
 * their own, or on with everyone with the link seeing all of them.
 */
export const COMMENT_MODES = ['off', 'own', 'all'] as const
export type CommentMode = (typeof COMMENT_MODES)[number]
export const commentMode = (n: number | null | undefined): CommentMode => COMMENT_MODES[n ?? 0] ?? 'off'

/** Links one project can have turned on at once. */
export const LINKS_MAX = 50
/** A link turned off can be turned back on (the toast's Undo) for this long. */
export const UNDO_MS = 5 * MINUTE
/** Last opened is written at most this often per link. */
export const OPENED_EVERY = MINUTE
/** Requests from one address to shared projects, per window. */
export const SHARE_LIMIT = 240
/** Tokens from one address that open nothing, per window; past this the address waits. */
export const MISS_LIMIT = 20
export const SHARE_WINDOW = 10 * MINUTE

/** What every reply to a viewer carries: never stored, never indexed, never passed on. */
export const PUBLIC_HEADERS: Record<string, string> = {
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

const sharedList = SHARED_KINDS.map(() => '?').join(', ')

interface LinkRow {
  token_hash: string
  created: number
  last_opened: number | null
  /** When it stops working; null for a link made before links had an end. */
  expires: number | null
  /** Its comments setting (COMMENT_MODES). */
  comments: number
}

/** The link's columns linkOut needs, for a SELECT or RETURNING. */
export const LINK_COLUMNS = 'token_hash, created, last_opened, expires, comments'

export const linkOut = (r: LinkRow) => ({ id: r.token_hash, created: r.created, lastOpened: r.last_opened, expires: r.expires, comments: commentMode(r.comments) })

/** A link that still works at `now` (as SQL, with `now` bound for the ?). */
const WORKS = '(expires IS NULL OR expires > ?)'

/** Comments as a request asks for them: one of COMMENT_MODES, as its number; off when not said. */
export function modeAsked(v: unknown): number {
  if (v === undefined || v === null) return 0
  const i = (COMMENT_MODES as readonly unknown[]).indexOf(v)
  if (i < 0) throw new HttpError(400, 'bad-request', 'Comments can be off, each person’s own, or everyone’s.')
  return i
}

/** What the new link should be: the body's `days` (30 with no body) and `comments` (off unless asked). */
async function linkAsked(req: Request): Promise<{ days: number; comments: number }> {
  const bytes = await readBytes(req, 1024)
  type Body = { days?: unknown; comments?: unknown } | null
  let body: Body = null
  if (bytes.length) {
    try {
      body = JSON.parse(new TextDecoder().decode(bytes)) as Body
    } catch {
      throw new HttpError(400, 'bad-json', 'The request was not readable.')
    }
  }
  const days = body?.days
  const comments = modeAsked(body?.comments)
  if (days === undefined || days === null) return { days: DEFAULT_DAYS, comments }
  if (!(LINK_DAYS as readonly unknown[]).includes(days)) throw new HttpError(400, 'bad-length', 'A link can last 30 days, 90 days or a year.')
  return { days: days as number, comments }
}

export const linkId = (id: string) => {
  if (!LINK_ID_RE.test(id)) throw new HttpError(400, 'bad-request', 'That link was not readable.')
  return id
}

async function liveProject(env: Env, user: string, id: string): Promise<boolean> {
  return !!(await env.DB.prepare('SELECT 1 AS x FROM projects WHERE user_id = ? AND id = ? AND deleted = 0').bind(user, id).first())
}

// ---------------------------------------------------------------------------
// The owner's side.

/** Make a link for one of the owner's projects (it has to be in the cloud). The token is in this reply only. */
export async function createShare(env: Env, req: Request, user: string, rawId: string, now: number): Promise<Response> {
  const id = checkId(rawId)
  const asked = await linkAsked(req)
  const expires = now + asked.days * DAY
  await rateLimit(env, `share-make:${user}`, 60, 60 * MINUTE, now)
  if (!(await liveProject(env, user, id))) throw new HttpError(404, 'not-in-cloud', 'This project isn’t in the cloud yet. Upload it, then make a link.')
  const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM share_links WHERE user_id = ? AND project_id = ? AND revoked IS NULL AND ${WORKS}`).bind(user, id, now).first<{ n: number }>()
  if ((count?.n ?? 0) >= LINKS_MAX) throw new HttpError(409, 'too-many-links', `This project has ${LINKS_MAX} links already. Turn off some you no longer need.`)
  const token = randomId(32)
  const hash = await sha256Hex(token)
  // The project could go between the check and here: the link is made only while it is there.
  const res = await env.DB.prepare(
    'INSERT INTO share_links (token_hash, user_id, project_id, created, revoked, last_opened, expires, comments) SELECT ?, ?, ?, ?, NULL, NULL, ?, ? WHERE EXISTS (SELECT 1 FROM projects WHERE user_id = ? AND id = ? AND deleted = 0)',
  )
    .bind(hash, user, id, now, expires, asked.comments, user, id)
    .run()
  if (!res.meta.changes) throw new HttpError(404, 'not-in-cloud', 'This project isn’t in the cloud yet. Upload it, then make a link.')
  return json({ token, link: linkOut({ token_hash: hash, created: now, last_opened: null, expires, comments: asked.comments }) }, 201)
}

/** The project's links that work now (on, and not ended), newest first. */
export async function listShares(env: Env, user: string, rawId: string, now: number): Promise<Response> {
  const id = checkId(rawId)
  const rows = await env.DB.prepare(`SELECT ${LINK_COLUMNS} FROM share_links WHERE user_id = ? AND project_id = ? AND revoked IS NULL AND ${WORKS} ORDER BY created DESC`)
    .bind(user, id, now)
    .all<LinkRow>()
  return json({ links: rows.results.map(linkOut) })
}

/**
 * Keep a link that still works for 30 more days from when it ends, but never more than a year
 * from now. A link with no end has nothing to extend; an ended link stays ended (make a new one).
 */
export async function extendShare(env: Env, user: string, rawId: string, rawLink: string, now: number): Promise<Response> {
  const id = checkId(rawId)
  const link = linkId(rawLink)
  const res = await env.DB.prepare(
    'UPDATE share_links SET expires = MIN(expires + ?, ?) WHERE token_hash = ? AND user_id = ? AND project_id = ? AND revoked IS NULL AND expires IS NOT NULL AND expires > ?',
  )
    .bind(EXTEND_DAYS * DAY, now + MAX_DAYS * DAY, link, user, id, now)
    .run()
  const row = await env.DB.prepare(`SELECT ${LINK_COLUMNS}, revoked FROM share_links WHERE token_hash = ? AND user_id = ? AND project_id = ?`)
    .bind(link, user, id)
    .first<LinkRow & { revoked: number | null }>()
  if (!row) throw new HttpError(404, 'not-found', 'That link isn’t one of this project’s.')
  if (!res.meta.changes && (row.revoked !== null || (row.expires !== null && row.expires <= now)))
    throw new HttpError(409, 'link-ended', 'That link has ended or was turned off. Make a new one instead.')
  return json({ link: linkOut(row) })
}

/** Turn a link off. It stops working at once; doing it twice is harmless. */
export async function revokeShare(env: Env, user: string, rawId: string, rawLink: string, now: number): Promise<Response> {
  const id = checkId(rawId)
  const link = linkId(rawLink)
  const res = await env.DB.prepare('UPDATE share_links SET revoked = ? WHERE token_hash = ? AND user_id = ? AND project_id = ? AND revoked IS NULL').bind(now, link, user, id).run()
  if (!res.meta.changes) {
    const there = await env.DB.prepare('SELECT revoked FROM share_links WHERE token_hash = ? AND user_id = ? AND project_id = ?').bind(link, user, id).first<{ revoked: number | null }>()
    if (!there) throw new HttpError(404, 'not-found', 'That link isn’t one of this project’s.')
    return json({ ok: true, revoked: there.revoked })
  }
  return json({ ok: true, revoked: now })
}

/** Undo turning a link off, within a few minutes of it, while the project is still there. */
export async function restoreShare(env: Env, user: string, rawId: string, rawLink: string, now: number): Promise<Response> {
  const id = checkId(rawId)
  const link = linkId(rawLink)
  const res = await env.DB.prepare(
    'UPDATE share_links SET revoked = NULL WHERE token_hash = ? AND user_id = ? AND project_id = ? AND revoked IS NOT NULL AND revoked >= ? AND EXISTS (SELECT 1 FROM projects WHERE user_id = ? AND id = ? AND deleted = 0)',
  )
    .bind(link, user, id, now - UNDO_MS, user, id)
    .run()
  if (!res.meta.changes) {
    const row = await env.DB.prepare(`SELECT ${LINK_COLUMNS}, revoked FROM share_links WHERE token_hash = ? AND user_id = ? AND project_id = ?`)
      .bind(link, user, id)
      .first<LinkRow & { revoked: number | null }>()
    if (!row) throw new HttpError(404, 'not-found', 'That link isn’t one of this project’s.')
    if (row.revoked !== null) throw new HttpError(409, 'too-late', 'That link was turned off a while ago and stays off. Make a new one instead.')
    return json({ link: linkOut(row) })
  }
  const row = await env.DB.prepare(`SELECT ${LINK_COLUMNS} FROM share_links WHERE token_hash = ?`).bind(link).first<LinkRow>()
  return json({ link: linkOut(row!) })
}

// ---------------------------------------------------------------------------
// The viewer's side.

export interface OpenLink {
  token_hash: string
  user_id: string
  project_id: string
  last_opened: number | null
  expires: number | null
  name: string
  /** Its comments setting (COMMENT_MODES). */
  comments: number
}

const turnedOff = () => new HttpError(404, 'link-off', 'This link doesn’t open anything now. It may have been turned off, or copied wrong.')
/** An ended link says so, with the same code as one turned off, so the viewer shows it the same way. */
const ended = () => new HttpError(404, 'link-off', 'This link has ended. Links work for a set time, then stop.')

/** Whether `key` is already past `limit` in this window, without counting this request. */
async function over(env: Env, key: string, limit: number, windowMs: number, now: number): Promise<boolean> {
  const row = await env.DB.prepare('SELECT win, count FROM rate_limits WHERE key = ?').bind(key).first<{ win: number; count: number }>()
  return !!row && row.win === Math.floor(now / windowMs) * windowMs && row.count >= limit
}

/** The link this request's token opens, if it is on and its project is there (comments open it the same way). */
export async function openLink(env: Env, req: Request, now: number): Promise<OpenLink> {
  const ip = clientIp(req)
  await rateLimit(env, `share:${ip}`, SHARE_LIMIT, SHARE_WINDOW, now)
  const missKey = `share-miss:${ip}`
  if (await over(env, missKey, MISS_LIMIT, SHARE_WINDOW, now)) {
    const wait = Math.max(1, Math.ceil((Math.floor(now / SHARE_WINDOW) * SHARE_WINDOW + SHARE_WINDOW - now) / MINUTE))
    throw new HttpError(429, 'slow-down', `Too many links that don’t open anything. Wait ${wait} minute${wait === 1 ? '' : 's'} and try again.`)
  }
  const token = req.headers.get(SHARE_HEADER) ?? ''
  const row = TOKEN_RE.test(token)
    ? await env.DB.prepare(
        'SELECT s.token_hash AS token_hash, s.user_id AS user_id, s.project_id AS project_id, s.last_opened AS last_opened, s.expires AS expires, s.comments AS comments, u.name AS name FROM share_links s JOIN users u ON u.id = s.user_id JOIN projects p ON p.user_id = s.user_id AND p.id = s.project_id WHERE s.token_hash = ? AND s.revoked IS NULL AND p.deleted = 0 AND u.delete_after IS NULL',
      )
        .bind(await sha256Hex(token))
        .first<OpenLink>()
    : null
  if (!row) {
    await rateLimit(env, missKey, MISS_LIMIT, SHARE_WINDOW, now)
    throw turnedOff()
  }
  // A real token whose time is up: not a guess, so it doesn't count against the address.
  if (row.expires !== null && row.expires <= now) throw ended()
  return row
}

const publicJson = (text: string) => new Response(text, { headers: { 'content-type': 'application/json; charset=utf-8', ...PUBLIC_HEADERS } })

/**
 * The shared project, as the cloud has it now: who shared it, its index entry, and which blob
 * holds each record a viewer needs. Notes when the link was opened.
 */
export async function openShared(env: Env, req: Request, now: number): Promise<Response> {
  const link = await openLink(env, req, now)
  const p = await env.DB.prepare('SELECT revision, meta FROM projects WHERE user_id = ? AND id = ? AND deleted = 0').bind(link.user_id, link.project_id).first<{ revision: number; meta: string }>()
  if (!p) throw turnedOff()
  const recs = await env.DB.prepare(`SELECT kind, hash, size, parts FROM project_records WHERE user_id = ? AND project_id = ? AND kind IN (${sharedList})`)
    .bind(link.user_id, link.project_id, ...SHARED_KINDS)
    .all<{ kind: string; hash: string; size: number; parts: number }>()
  const records: Record<string, RecordRef> = {}
  for (const r of recs.results) records[r.kind] = { hash: r.hash, size: r.size, parts: r.parts }
  if (link.last_opened === null || link.last_opened < now - OPENED_EVERY)
    await env.DB.prepare('UPDATE share_links SET last_opened = ? WHERE token_hash = ? AND (last_opened IS NULL OR last_opened < ?)').bind(now, link.token_hash, now - OPENED_EVERY).run()
  // The index entry goes out as stored (the app's ProjectMeta); who shared it, by the name on the account only.
  return publicJson(`{"sharedBy":${JSON.stringify(link.name)},"project":{"revision":${p.revision},"records":${JSON.stringify(records)},"meta":${p.meta}}}`)
}

/** One part of one of the shared project's records, and only those it shows now. */
export async function sharedBlob(env: Env, req: Request, hash: string, part: string, now: number): Promise<Response> {
  if (!HASH_RE.test(hash)) throw new HttpError(400, 'bad-request', 'The request was not readable.')
  const link = await openLink(env, req, now)
  const ok = await env.DB.prepare(`SELECT 1 AS x FROM project_records WHERE user_id = ? AND project_id = ? AND hash = ? AND kind IN (${sharedList}) LIMIT 1`)
    .bind(link.user_id, link.project_id, hash, ...SHARED_KINDS)
    .first()
  if (!ok) throw new HttpError(404, 'not-found', 'That isn’t part of this shared project now. Open the link again.')
  return getBlob(env, link.user_id, hash, part, PUBLIC_HEADERS)
}

/** A token as the app makes links with (for tests). */
export const newShareToken = () => randomId(32)
