// Comments on share links: someone with a link pins a short note on the plan ("move this wall")
// for the person who shared it. Off for every link unless its owner ticks "Let people comment";
// then each person with the link sees only their own comments, or, if the owner chose, everyone's.
//
// The viewer's side needs only the link's token (in X-BHP-Share, as opening the link does) and
// opens the link the same way, so a link that is off, ended, for a deleted project or for an
// account being deleted takes no comments and shows none. A viewer is known only by a random
// token their browser keeps (X-BHP-Commenter); only its SHA-256 is kept, so they can see their
// own comments again and nobody else can. A comment is plain text, kept as sent: the app shows
// it as text, never as markup.
//
// The owner's side, signed in: the project's comments (from links that are on), Resolve and
// Delete, and each link's setting. Nothing of another account is ever read or changed: every
// statement names the account it works on.
//
// Limits, for a public app on the free plan: a comment is up to 500 characters and a name up to
// 40, with no control characters; an address can send a few a minute, a link takes so many a
// day and holds 200 at most (the owner's Delete makes room). Each request is a handful of D1
// queries, well inside the 50 one request may make.

import type { Env } from './env'
import { HttpError, json, randomId, readJson, sha256Hex } from './http'
import { checkId } from './projects'
import { clientIp, rateLimit } from './session'
import { commentMode, LINK_COLUMNS, linkId, linkOut, modeAsked, openLink, SHARE_WINDOW, UNDO_MS } from './shares'

/** The header that carries a commenter's own token (32 random bytes, base64url), made by their browser. */
export const COMMENTER_HEADER = 'x-bhp-commenter'

export const TEXT_MAX = 500
export const NAME_MAX = 40
/** Comments one link can hold. */
export const COMMENTS_MAX = 200
/** Comments one link takes in a day. */
export const DAY_MAX = 50
/** Comments one address can send in SHARE_WINDOW (10 minutes). */
export const IP_MAX = 10
/** The newest comments the owner's list returns for one project. */
export const LIST_MAX = 300
/** How far from the survey's origin a pin can be, in metres either way (a sanity check, not a rule). */
const COORD_MAX = 1e8

const DAY = 24 * 60 * 60 * 1000
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const COMMENT_ID_RE = /^[A-Za-z0-9_-]{16}$/
const FLOOR_RE = /^[A-Za-z0-9_-]{1,64}$/
/**
 * Whether some text has a control character (a line break is fine where `breaks` says so), or
 * one of the invisible marks that turn text around or split lines: they have no place in a short
 * note, and can make one read as something it isn't.
 */
export function hasControl(text: string, breaks = false): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0)!
    if ((c < 0x20 && !(breaks && c === 0x0a)) || (c >= 0x7f && c <= 0x9f)) return true
    if (c === 0x200e || c === 0x200f || c === 0x2028 || c === 0x2029 || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) return true
  }
  return false
}

const bad = (message = 'The request was not readable.') => new HttpError(400, 'bad-request', message)
/** Length as people count it: emoji and accented letters are one character each. */
const chars = (s: string) => [...s].length

interface CommentRow {
  id: string
  link_id: string
  floor: string
  x: number
  y: number
  text: string
  name: string | null
  created: number
  resolved: number | null
}
const COLUMNS = 'id, link_id, floor, x, y, text, name, created, resolved'

/** A comment as a viewer gets it: whether it is theirs and whether it was resolved, nothing about who else wrote it. */
const viewerOut = (r: CommentRow, mine: boolean) => ({ id: r.id, floor: r.floor, x: r.x, y: r.y, text: r.text, name: r.name, created: r.created, resolved: r.resolved !== null, mine })
/** A comment as its link's owner gets it. */
const ownerOut = (r: CommentRow) => ({ id: r.id, link: r.link_id, floor: r.floor, x: r.x, y: r.y, text: r.text, name: r.name, created: r.created, resolved: r.resolved })

/** The SHA-256 of the commenter's token, if the request carries one. */
async function commenter(req: Request): Promise<string | null> {
  const token = req.headers.get(COMMENTER_HEADER) ?? ''
  return TOKEN_RE.test(token) ? sha256Hex(token) : null
}

export interface NewComment {
  floor: string
  x: number
  y: number
  text: string
  name: string | null
}

/** A comment as sent, checked: the spot, the text (trimmed, 1 to 500 characters) and the name (trimmed, up to 40, or none). */
export function checkComment(body: unknown): NewComment {
  const b = body as Record<string, unknown> | null
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw bad()
  const { floor, x, y } = b
  if (typeof floor !== 'string' || !FLOOR_RE.test(floor)) throw bad('That spot on the plan was not readable.')
  for (const v of [x, y]) if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > COORD_MAX) throw bad('That spot on the plan was not readable.')
  if (typeof b.text !== 'string') throw bad('Write a comment first.')
  const text = b.text.replace(/\r\n?/g, '\n').trim()
  if (!text) throw bad('Write a comment first.')
  if (chars(text) > TEXT_MAX) throw new HttpError(400, 'too-long', `A comment can be up to ${TEXT_MAX} characters.`)
  if (hasControl(text, true)) throw new HttpError(400, 'bad-text', 'That comment has characters it can’t keep. Type it again as plain text.')
  if (b.name !== undefined && b.name !== null && typeof b.name !== 'string') throw bad()
  const typed = typeof b.name === 'string' ? b.name.trim() : ''
  if (hasControl(typed)) throw new HttpError(400, 'bad-text', 'That name has characters it can’t keep. Type it again as plain text.')
  const name = typed.replace(/\s+/g, ' ')
  if (chars(name) > NAME_MAX) throw new HttpError(400, 'too-long', `A name can be up to ${NAME_MAX} characters.`)
  // To the millimetre: plenty for a pin, and no more digits than a survey has.
  const mm = (v: number) => Math.round(v * 1000) / 1000
  return { floor, x: mm(x as number), y: mm(y as number), text, name: name || null }
}

/** A rate limit that says, if it is reached, why in words for this. */
async function limit(env: Env, key: string, max: number, windowMs: number, now: number, message: string) {
  try {
    await rateLimit(env, key, max, windowMs, now)
  } catch (e) {
    if (e instanceof HttpError && e.status === 429) throw new HttpError(429, 'slow-down', message)
    throw e
  }
}

// ---------------------------------------------------------------------------
// The viewer's side: the link's token only.

/**
 * The link's comments setting, and the comments this viewer may see: their own, or every one on
 * the link if its owner lets everyone see them all. Their own still show once comments are off.
 */
export async function sharedComments(env: Env, req: Request, now: number): Promise<Response> {
  const link = await openLink(env, req, now)
  const mode = commentMode(link.comments)
  const me = await commenter(req)
  let rows: (CommentRow & { mine: number })[] = []
  if (mode === 'all')
    rows = (
      await env.DB.prepare(`SELECT ${COLUMNS}, viewer_hash = ? AS mine FROM share_comments WHERE link_id = ? ORDER BY created`)
        .bind(me ?? '', link.token_hash)
        .all<CommentRow & { mine: number }>()
    ).results
  else if (me)
    rows = (
      await env.DB.prepare(`SELECT ${COLUMNS}, 1 AS mine FROM share_comments WHERE link_id = ? AND viewer_hash = ? ORDER BY created`)
        .bind(link.token_hash, me)
        .all<CommentRow & { mine: number }>()
    ).results
  return json({ mode, comments: rows.map(r => viewerOut(r, !!r.mine)) })
}

/** Pin a comment on the shared plan, on a link that takes them. */
export async function addComment(env: Env, req: Request, now: number): Promise<Response> {
  const link = await openLink(env, req, now)
  if (commentMode(link.comments) === 'off') throw new HttpError(403, 'comments-off', 'Comments are turned off for this link.')
  const me = await commenter(req)
  if (!me) throw bad()
  const c = checkComment(await readJson(req, 8 * 1024))
  await limit(env, `comment:${clientIp(req)}`, IP_MAX, SHARE_WINDOW, now, 'That’s a lot of comments in a few minutes. Wait a little and send it again.')
  await limit(env, `comment-day:${link.token_hash}`, DAY_MAX, DAY, now, 'This link has had all the comments it takes in a day. Try again tomorrow.')
  const id = randomId(12)
  // The cap is checked as the comment goes in, so two sent at once can't pass it.
  const res = await env.DB.prepare(
    'INSERT INTO share_comments (id, link_id, user_id, project_id, floor, x, y, text, name, created, resolved, viewer_hash) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ? WHERE (SELECT COUNT(*) FROM share_comments WHERE link_id = ?) < ?',
  )
    .bind(id, link.token_hash, link.user_id, link.project_id, c.floor, c.x, c.y, c.text, c.name, now, me, link.token_hash, COMMENTS_MAX)
    .run()
  if (!res.meta.changes) throw new HttpError(409, 'too-many-comments', 'This link has all the comments it can hold. The person who shared it can clear some.')
  return json({ comment: viewerOut({ id, link_id: link.token_hash, ...c, created: now, resolved: null }, true) }, 201)
}

// ---------------------------------------------------------------------------
// The owner's side, signed in.

/**
 * The project's comments from its links that are on (ended ones too: what was said still
 * counts), newest first, and for each link with comments: when it was made and ends (to name it
 * by), how many it has and how many are new (not resolved yet).
 */
export async function listComments(env: Env, user: string, rawId: string): Promise<Response> {
  const id = checkId(rawId)
  const on = 'JOIN share_links s ON s.token_hash = c.link_id AND s.user_id = c.user_id WHERE c.user_id = ? AND c.project_id = ? AND s.revoked IS NULL'
  const rows = await env.DB.prepare(`SELECT c.id AS id, c.link_id AS link_id, c.floor AS floor, c.x AS x, c.y AS y, c.text AS text, c.name AS name, c.created AS created, c.resolved AS resolved FROM share_comments c ${on} ORDER BY c.created DESC LIMIT ?`)
    .bind(user, id, LIST_MAX)
    .all<CommentRow>()
  const links = await env.DB.prepare(
    `SELECT c.link_id AS link, MIN(s.created) AS created, MIN(s.expires) AS expires, COUNT(*) AS total, SUM(c.resolved IS NULL) AS fresh FROM share_comments c ${on} GROUP BY c.link_id`,
  )
    .bind(user, id)
    .all<{ link: string; created: number; expires: number | null; total: number; fresh: number }>()
  return json({
    comments: rows.results.map(ownerOut),
    links: Object.fromEntries(links.results.map(r => [r.link, { created: r.created, expires: r.expires, total: r.total, new: r.fresh ?? 0 }])),
  })
}

const commentId = (id: string) => {
  if (!COMMENT_ID_RE.test(id)) throw bad('That comment was not readable.')
  return id
}
const notFound = () => new HttpError(404, 'not-found', 'That comment isn’t one of this project’s. It may have been deleted.')

/** Mark a comment dealt with (or new again, to undo that). */
export async function resolveComment(env: Env, req: Request, user: string, rawId: string, rawComment: string, now: number): Promise<Response> {
  const id = checkId(rawId)
  const cid = commentId(rawComment)
  const body = await readJson<{ resolved?: unknown } | null>(req, 1024).catch(() => null)
  const resolved = body?.resolved === false ? null : now
  const row = await env.DB.prepare(`UPDATE share_comments SET resolved = CASE WHEN ? IS NULL THEN NULL ELSE COALESCE(resolved, ?) END WHERE id = ? AND user_id = ? AND project_id = ? RETURNING ${COLUMNS}`)
    .bind(resolved, resolved, cid, user, id)
    .first<CommentRow>()
  if (!row) throw notFound()
  return json({ comment: ownerOut(row) })
}

/** Delete a comment for good. */
export async function deleteComment(env: Env, user: string, rawId: string, rawComment: string): Promise<Response> {
  const id = checkId(rawId)
  const cid = commentId(rawComment)
  const res = await env.DB.prepare('DELETE FROM share_comments WHERE id = ? AND user_id = ? AND project_id = ?').bind(cid, user, id).run()
  if (!res.meta.changes) throw notFound()
  return json({ ok: true })
}

/** Change a link's comments setting: off, each person's own, or everyone's. Only a link that works now. */
export async function setLinkComments(env: Env, req: Request, user: string, rawId: string, rawLink: string, now: number): Promise<Response> {
  const id = checkId(rawId)
  const link = linkId(rawLink)
  const body = await readJson<{ comments?: unknown } | null>(req, 1024)
  if (!body || typeof body !== 'object' || typeof body.comments !== 'string') throw bad('Comments can be off, each person’s own, or everyone’s.')
  const mode = modeAsked(body.comments)
  const row = await env.DB.prepare(
    `UPDATE share_links SET comments = ? WHERE token_hash = ? AND user_id = ? AND project_id = ? AND revoked IS NULL AND (expires IS NULL OR expires > ?) RETURNING ${LINK_COLUMNS}`,
  )
    .bind(mode, link, user, id, now)
    .first<Parameters<typeof linkOut>[0]>()
  if (!row) throw new HttpError(404, 'not-found', 'That link isn’t one of this project’s that works now.')
  return json({ link: linkOut(row) })
}

// ---------------------------------------------------------------------------
// Tidying.

/**
 * Delete the comments of links turned off for longer than Undo allows (deleting a project turns
 * its links off, so its comments go too). The Worker's hourly trigger runs it. Returns how many went.
 */
export async function tidyComments(env: Env, now: number): Promise<number> {
  const res = await env.DB.prepare('DELETE FROM share_comments WHERE link_id IN (SELECT token_hash FROM share_links WHERE revoked IS NOT NULL AND revoked < ?)').bind(now - UNDO_MS).run()
  return res.meta.changes
}
