// Cloud saves: each person's projects as index entries (D1) with their records as blobs.
//
// A blob is one record's value, encoded by the app, named by the SHA-256 of that text. Blobs up
// to INLINE_MAX live in D1 beside their project; larger ones (a survey, the site drawings) go to
// KV, in parts of PART_MAX. Small records stay out of KV because the free plan allows only
// 1,000 KV writes a day, and the plan and its undo history change with every edit.
//
// A save is two steps: upload any blobs the server doesn't have, then commit the index entry and
// which blob each record is now, if the project is still at the revision the app last saw.
// Otherwise the commit is refused (409) with what the server has, and nothing changes. The
// Worker never parses a record, so a save costs it next to no CPU time.

import type { Env } from './env'
import { HttpError, json, randomId, rawJson, readBytes, readJson } from './http'

export const PART_MAX = 20 * 1024 * 1024
export const INLINE_MAX = 512 * 1024
export const RECORD_MAX = 200 * 1024 * 1024
const META_MAX = 256 * 1024
const KINDS_MAX = 40
const HASHES_MAX = 64
/** A blob nothing uses is tidied away only after this long, so one uploaded for a save in flight stays. */
export const GRACE_MS = 60 * 60 * 1000

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const KIND_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
const HASH_RE = /^[0-9a-f]{64}$/

export const partsFor = (size: number) => Math.max(1, Math.ceil(size / PART_MAX))
const partLength = (size: number, part: number) => (part < partsFor(size) - 1 ? PART_MAX : size - PART_MAX * (partsFor(size) - 1))
export const kvKey = (user: string, hash: string, part: number) => `b:${user}:${hash}:${part}`
/** The most one person may keep, in MB, unless QUOTA_MB says otherwise: 20 people fill the free plan's 1 GB of KV. */
export const QUOTA_MB_DEFAULT = 50
export const quota = (env: Env) => (Number(env.QUOTA_MB) > 0 ? Number(env.QUOTA_MB) : QUOTA_MB_DEFAULT) * 1024 * 1024
/** How much one person keeps now, in bytes: every blob, in D1 or KV, used or waiting to be tidied. */
export async function storageUsed(env: Env, user: string): Promise<number> {
  return (await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS total FROM blobs WHERE user_id = ?').bind(user).first<{ total: number }>())?.total ?? 0
}

export interface RecordRef {
  hash: string
  size: number
  parts: number
}

const bad = (message = 'The request was not readable.') => new HttpError(400, 'bad-request', message)

export function checkId(id: string): string {
  if (!ID_RE.test(id)) throw bad('That project id is not one this app makes.')
  return id
}

const isInt = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max

function checkRef(v: unknown): RecordRef {
  const r = v as RecordRef
  if (!r || typeof r !== 'object' || typeof r.hash !== 'string' || !HASH_RE.test(r.hash) || !isInt(r.size, 0, RECORD_MAX) || r.parts !== partsFor(r.size)) throw bad('A record’s details were not readable.')
  return { hash: r.hash, size: r.size, parts: r.parts }
}

const inList = (n: number) => Array.from({ length: n }, () => '?').join(', ')

// ---------------------------------------------------------------------------
// Reading.

/** The person's projects (or one), tombstones included, as JSON text: each index entry goes out as stored. */
async function projectsJson(env: Env, user: string, id?: string): Promise<string[]> {
  const where = id ? ' AND id = ?' : ''
  const rows = await env.DB.prepare(`SELECT id, revision, meta, deleted FROM projects WHERE user_id = ?${where}`)
    .bind(...(id ? [user, id] : [user]))
    .all<{ id: string; revision: number; meta: string; deleted: number }>()
  if (!rows.results.length) return []
  const recs = await env.DB.prepare(`SELECT project_id, kind, hash, size, parts FROM project_records WHERE user_id = ?${id ? ' AND project_id = ?' : ''}`)
    .bind(...(id ? [user, id] : [user]))
    .all<{ project_id: string; kind: string; hash: string; size: number; parts: number }>()
  const byProject = new Map<string, Record<string, RecordRef>>()
  for (const r of recs.results) {
    const m = byProject.get(r.project_id) ?? {}
    m[r.kind] = { hash: r.hash, size: r.size, parts: r.parts }
    byProject.set(r.project_id, m)
  }
  return rows.results.map(
    p => `{"id":${JSON.stringify(p.id)},"revision":${p.revision},"deleted":${p.deleted ? 'true' : 'false'},"records":${JSON.stringify(byProject.get(p.id) ?? {})},"meta":${p.meta}}`,
  )
}

export async function listProjects(env: Env, user: string): Promise<Response> {
  return rawJson(`{"projects":[${(await projectsJson(env, user)).join(',')}]}`)
}

export async function getProject(env: Env, user: string, id: string): Promise<Response> {
  const [one] = await projectsJson(env, user, checkId(id))
  if (!one) throw new HttpError(404, 'not-found', 'That project isn’t in the cloud.')
  return rawJson(`{"project":${one}}`)
}

async function conflict(env: Env, user: string, id: string, code = 'conflict', message = 'This project changed on another device.'): Promise<Response> {
  const [one] = await projectsJson(env, user, id)
  return rawJson(`{"error":${JSON.stringify(code)},"message":${JSON.stringify(message)},"project":${one ?? 'null'}}`, 409)
}

// ---------------------------------------------------------------------------
// Saving: commit, delete.

interface CommitBody {
  base?: unknown
  meta?: unknown
  records?: unknown
}

export async function commitProject(env: Env, req: Request, user: string, rawId: string, now: number): Promise<Response> {
  const id = checkId(rawId)
  const body = await readJson<CommitBody>(req, META_MAX + 64 * 1024)
  if (!isInt(body.base, 0, Number.MAX_SAFE_INTEGER)) throw bad()
  const base = body.base
  const meta = body.meta as Record<string, unknown> | null
  if (!meta || typeof meta !== 'object' || Array.isArray(meta) || typeof meta.name !== 'string' || !meta.name.trim() || meta.name.length > 200) throw bad('A project needs a name.')
  const metaText = JSON.stringify({ ...meta, id, revision: base + 1 })
  if (metaText.length > META_MAX) throw new HttpError(413, 'too-large', 'The project’s summary is too large.')
  const records = (body.records ?? {}) as Record<string, unknown>
  if (typeof records !== 'object' || Array.isArray(records)) throw bad()
  const kinds = Object.keys(records)
  if (kinds.length > KINDS_MAX || kinds.some(k => !KIND_RE.test(k))) throw bad('A record’s name was not readable.')
  const refs = new Map<string, RecordRef | null>(kinds.map(k => [k, records[k] === null ? null : checkRef(records[k])]))

  // Every blob it names has to be here, whole.
  const hashes = [...new Set([...refs.values()].filter((r): r is RecordRef => !!r).map(r => r.hash))]
  if (hashes.length) {
    const have = await env.DB.prepare(`SELECT hash, size, parts, got FROM blobs WHERE user_id = ? AND hash IN (${inList(hashes.length)})`)
      .bind(user, ...hashes)
      .all<{ hash: string; size: number; parts: number; got: number }>()
    const whole = new Set(have.results.filter(b => b.got >= b.parts).map(b => b.hash))
    const missing = hashes.filter(h => !whole.has(h))
    if (missing.length) return json({ error: 'missing-blobs', message: 'Some records hadn’t finished uploading.', missing }, 422)
  }

  // The project row moves from `base` to base + 1 (or is made, at base 0); each record change
  // lands only if this commit is the one that moved it.
  const cid = randomId(12)
  const mine = 'EXISTS (SELECT 1 FROM projects WHERE user_id = ? AND id = ? AND commit_id = ?)'
  const statements = [
    env.DB.prepare(
      'INSERT INTO projects (user_id, id, revision, meta, deleted, commit_id, changed) VALUES (?, ?, ?, ?, 0, ?, ?) ON CONFLICT(user_id, id) DO UPDATE SET revision = excluded.revision, meta = excluded.meta, deleted = 0, commit_id = excluded.commit_id, changed = excluded.changed WHERE projects.revision = ?',
    ).bind(user, id, base + 1, metaText, cid, now, base),
  ]
  for (const [kind, ref] of refs) {
    statements.push(
      ref
        ? env.DB.prepare(
            `INSERT INTO project_records (user_id, project_id, kind, hash, size, parts) SELECT ?, ?, ?, ?, ?, ? WHERE ${mine} ON CONFLICT(user_id, project_id, kind) DO UPDATE SET hash = excluded.hash, size = excluded.size, parts = excluded.parts`,
          ).bind(user, id, kind, ref.hash, ref.size, ref.parts, user, id, cid)
        : env.DB.prepare(`DELETE FROM project_records WHERE user_id = ? AND project_id = ? AND kind = ? AND ${mine}`).bind(user, id, kind, user, id, cid),
    )
  }
  const results = await env.DB.batch(statements)
  if (!results[0].meta.changes) return conflict(env, user, id)
  await tidy(env, user, now)
  const [one] = await projectsJson(env, user, id)
  return rawJson(`{"project":${one}}`)
}

export async function deleteProject(env: Env, req: Request, user: string, rawId: string, now: number): Promise<Response> {
  const id = checkId(rawId)
  const base = Number(new URL(req.url).searchParams.get('base'))
  if (!isInt(base, 0, Number.MAX_SAFE_INTEGER)) throw bad()
  const row = await env.DB.prepare('SELECT revision, meta, deleted FROM projects WHERE user_id = ? AND id = ?').bind(user, id).first<{ revision: number; meta: string; deleted: number }>()
  if (!row || row.deleted) return json({ ok: true })
  if (row.revision !== base) return conflict(env, user, id)
  const meta = JSON.parse(row.meta) as { name?: string; archived?: boolean }
  if (!meta.archived) return conflict(env, user, id, 'not-archived', 'Archive a project before deleting it.')
  // A tombstone stays, with the name, so another device can say what went.
  const cid = randomId(12)
  const results = await env.DB.batch([
    env.DB.prepare('UPDATE projects SET deleted = 1, revision = revision + 1, meta = ?, commit_id = ?, changed = ? WHERE user_id = ? AND id = ? AND revision = ?').bind(
      JSON.stringify({ id, name: meta.name ?? '' }),
      cid,
      now,
      user,
      id,
      base,
    ),
    env.DB.prepare('DELETE FROM project_records WHERE user_id = ? AND project_id = ? AND EXISTS (SELECT 1 FROM projects WHERE user_id = ? AND id = ? AND commit_id = ?)').bind(user, id, user, id, cid),
    // Its share links go off with it, so they don't open it again if it ever comes back.
    env.DB.prepare('UPDATE share_links SET revoked = ? WHERE user_id = ? AND project_id = ? AND revoked IS NULL AND EXISTS (SELECT 1 FROM projects WHERE user_id = ? AND id = ? AND commit_id = ?)').bind(
      now,
      user,
      id,
      user,
      id,
      cid,
    ),
  ])
  if (!results[0].meta.changes) return conflict(env, user, id)
  await tidy(env, user, now)
  return json({ ok: true, revision: base + 1 })
}

// ---------------------------------------------------------------------------
// Blobs.

/** Which of these blobs the server doesn't have whole. Those it has are kept from tidying for a while. */
export async function missingBlobs(env: Env, req: Request, user: string, now: number): Promise<Response> {
  const body = await readJson<{ hashes?: unknown }>(req)
  const hashes = body.hashes
  if (!Array.isArray(hashes) || hashes.length > HASHES_MAX || hashes.some(h => typeof h !== 'string' || !HASH_RE.test(h))) throw bad()
  const unique = [...new Set(hashes as string[])]
  if (!unique.length) return json({ missing: [] })
  // Touch first, so a tidy that runs meanwhile can't take one this says is here.
  await env.DB.prepare(`UPDATE blobs SET used = ? WHERE user_id = ? AND hash IN (${inList(unique.length)})`).bind(now, user, ...unique).run()
  const have = await env.DB.prepare(`SELECT hash FROM blobs WHERE user_id = ? AND got >= parts AND hash IN (${inList(unique.length)})`)
    .bind(user, ...unique)
    .all<{ hash: string }>()
  const present = new Set(have.results.map(r => r.hash))
  return json({ missing: unique.filter(h => !present.has(h)) })
}

export async function putBlob(env: Env, req: Request, user: string, hash: string, partText: string, now: number): Promise<Response> {
  const q = new URL(req.url).searchParams
  const size = Number(q.get('size'))
  const parts = Number(q.get('parts'))
  const part = Number(partText)
  if (!HASH_RE.test(hash) || !isInt(size, 0, RECORD_MAX) || parts !== partsFor(size) || !isInt(part, 0, parts - 1)) throw bad()
  const row = await env.DB.prepare('SELECT size, parts, got FROM blobs WHERE user_id = ? AND hash = ?').bind(user, hash).first<{ size: number; parts: number; got: number }>()
  if (row && (row.size !== size || row.parts !== parts)) throw new HttpError(409, 'blob-mismatch', 'That record doesn’t match the copy already uploaded.')
  const got = row?.got ?? 0
  // Already here (whole, or this part): nothing to write.
  if (got >= parts || part < got) {
    await env.DB.prepare('UPDATE blobs SET used = ? WHERE user_id = ? AND hash = ?').bind(now, user, hash).run()
    return json({ next: got, complete: got >= parts })
  }
  if (part > got) throw new HttpError(409, 'part-order', `Upload part ${got} first.`, { next: got })
  if (!row) {
    if ((await storageUsed(env, user)) + size > quota(env))
      throw new HttpError(413, 'quota', `The cloud is full for this account (${Math.round(quota(env) / 1024 / 1024)} MB). Delete projects you no longer need from Archived, then try again.`)
  }
  const want = partLength(size, part)
  const bytes = await readBytes(req, want)
  if (bytes.byteLength !== want) throw bad('The upload was cut short.')

  if (size <= INLINE_MAX) {
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw bad('A record has to be text.')
    }
    await env.DB.prepare('INSERT INTO blobs (user_id, hash, size, parts, got, inline, used) VALUES (?, ?, ?, 1, 1, ?, ?) ON CONFLICT(user_id, hash) DO UPDATE SET got = 1, inline = excluded.inline, used = excluded.used')
      .bind(user, hash, size, text, now)
      .run()
    return json({ next: 1, complete: true })
  }

  await env.BLOBS.put(kvKey(user, hash, part), bytes)
  if (part === 0)
    await env.DB.prepare('INSERT INTO blobs (user_id, hash, size, parts, got, inline, used) VALUES (?, ?, ?, ?, 1, NULL, ?) ON CONFLICT(user_id, hash) DO UPDATE SET got = MAX(blobs.got, 1), used = excluded.used')
      .bind(user, hash, size, parts, now)
      .run()
  else await env.DB.prepare('UPDATE blobs SET got = ?, used = ? WHERE user_id = ? AND hash = ? AND got = ?').bind(part + 1, now, user, hash, part).run()
  return json({ next: part + 1, complete: part + 1 >= parts })
}

/** One part of a blob. `extra` headers go on the reply too (a shared project's, say). */
export async function getBlob(env: Env, user: string, hash: string, partText: string, extra: Record<string, string> = {}): Promise<Response> {
  const part = Number(partText)
  if (!HASH_RE.test(hash) || !isInt(part, 0, 1000)) throw bad()
  const row = await env.DB.prepare('SELECT parts, got, inline FROM blobs WHERE user_id = ? AND hash = ?').bind(user, hash).first<{ parts: number; got: number; inline: string | null }>()
  if (!row || row.got < row.parts || part >= row.parts) throw new HttpError(404, 'not-found', 'That record isn’t in the cloud.')
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra }
  if (row.inline !== null) return new Response(row.inline, { headers })
  const stream = await env.BLOBS.get(kvKey(user, hash, part), 'stream')
  if (!stream) throw new HttpError(404, 'not-found', 'That record isn’t in the cloud.')
  return new Response(stream, { headers })
}

/** Let go of a few blobs no project uses any more (each save or delete tidies a little). */
export async function tidy(env: Env, user: string, now: number): Promise<number> {
  const old = now - GRACE_MS
  const unused = 'used < ? AND NOT EXISTS (SELECT 1 FROM project_records r WHERE r.user_id = blobs.user_id AND r.hash = blobs.hash)'
  const pick = await env.DB.prepare(`SELECT hash FROM blobs WHERE user_id = ? AND ${unused} LIMIT 10`).bind(user, old).all<{ hash: string }>()
  if (!pick.results.length) return 0
  const hashes = pick.results.map(r => r.hash)
  // The row goes first (checked again), then its KV parts: a save can never name a blob whose parts are gone.
  const gone = await env.DB.prepare(`DELETE FROM blobs WHERE user_id = ? AND hash IN (${inList(hashes.length)}) AND ${unused} RETURNING hash, got, inline IS NULL AS kv`)
    .bind(user, ...hashes, old)
    .all<{ hash: string; got: number; kv: number }>()
  for (const b of gone.results) if (b.kv) for (let p = 0; p < b.got; p++) await env.BLOBS.delete(kvKey(user, b.hash, p))
  return gone.results.length
}
