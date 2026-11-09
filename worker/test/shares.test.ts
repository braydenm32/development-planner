// Read-only share links on the Worker: making, listing, extending and turning them off (signed
// in), and opening a shared project with only the token: the latest revision, nothing but that
// project's shown records, never another project or account, nothing written but when it was
// opened, never after the link ends, and rate limited per address.

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { CSRF_HEADER } from '../src/api'
import { PART_MAX, partsFor } from '../src/projects'
import { LINKS_MAX, MISS_LIMIT, OPENED_EVERY, SHARE_HEADER, SHARE_LIMIT, SHARE_WINDOW, UNDO_MS } from '../src/shares'
import { softPasskey } from './authenticator'
import { ORIGIN, post, testServer, type TestServer } from './fakes'

const hashOf = (text: string) => createHash('sha256').update(text).digest('hex')

async function signUp(_s: TestServer, browser: typeof fetch, name: string) {
  const opts = await (await browser('/api/auth/signup/options', post({ name }))).json()
  const res = await browser('/api/auth/signup/verify', post({ challengeId: opts.challengeId, response: await softPasskey(ORIGIN).create(opts.options) }))
  expect(res.status).toBe(200)
  return (await res.json()).user as { id: string; name: string }
}

async function owner(vars = {}) {
  const s = testServer({ SIGNUP: 'open', ...vars })
  const user = await signUp(s, s.fetch, 'Alex')
  return { ...s, user }
}

async function upload(f: typeof fetch, text: string) {
  const bytes = new TextEncoder().encode(text)
  const hash = hashOf(text)
  const parts = partsFor(bytes.length)
  for (let p = 0; p < parts; p++) {
    const res = await f(`/api/blobs/${hash}/${p}?parts=${parts}&size=${bytes.length}`, { method: 'PUT', headers: { [CSRF_HEADER]: '1' }, body: bytes.slice(p * PART_MAX, (p + 1) * PART_MAX) })
    expect(res.status).toBe(200)
  }
  return { hash, size: bytes.length, parts }
}

const meta = (name: string, extra = {}) => ({ name, created: 1, updated: 2, archived: false, surveyFileName: 'block.dxf', thumbnail: null, numbers: { siteArea: 600, floorArea: 180, ffl: 10 }, ...extra })

/** A project in the cloud with every kind of record the app keeps, shown and not. */
async function project(f: typeof fetch, id: string, name: string, tag = name) {
  const records = {
    survey: await upload(f, JSON.stringify({ survey: tag })),
    plan: await upload(f, JSON.stringify({ plan: tag })),
    prefs: await upload(f, JSON.stringify({ prefs: tag })),
    site: await upload(f, JSON.stringify({ site: tag })),
    history: await upload(f, JSON.stringify({ history: tag })),
    'previous-survey': await upload(f, JSON.stringify({ old: tag })),
    'site-files': await upload(f, JSON.stringify({ drawings: tag })),
    costs: await upload(f, JSON.stringify({ quotes: tag })),
  }
  const res = await f(`/api/projects/${id}/commit`, post({ base: 0, meta: meta(name), records }))
  expect(res.status).toBe(200)
  return records
}

const DAY = 24 * 60 * 60 * 1000
type Link = { id: string; created: number; lastOpened: number | null; expires: number | null }
const make = async (f: typeof fetch, id: string, body: Record<string, unknown> = {}) => f(`/api/projects/${id}/shares`, post(body))
async function link(f: typeof fetch, id: string, body: Record<string, unknown> = {}) {
  const res = await make(f, id, body)
  expect(res.status).toBe(201)
  return (await res.json()) as { token: string; link: Link }
}
const list = async (f: typeof fetch, id: string) => (await (await f(`/api/projects/${id}/shares`)).json()).links as Link[]
const extend = (f: typeof fetch, id: string, linkId: string) => f(`/api/projects/${id}/shares/${linkId}/extend`, post({}))

/** Move the clock to `to`, with the owner using the app every few weeks so the session stays signed in. */
async function passTo(s: TestServer, to: number) {
  while (s.clock.now < to) {
    s.clock.now = Math.min(to, s.clock.now + 20 * DAY)
    expect((await s.fetch('/api/account')).status).toBe(200)
  }
}
const turnOff = (f: typeof fetch, id: string, linkId: string) => f(`/api/projects/${id}/shares/${linkId}`, { method: 'DELETE', headers: { [CSRF_HEADER]: '1' } })
const turnOn = (f: typeof fetch, id: string, linkId: string) => f(`/api/projects/${id}/shares/${linkId}/restore`, post({}))

/** A viewer: a browser with no account, from its own address. */
function viewer(s: TestServer, ip = '203.0.113.7') {
  const b = s.browser()
  return {
    open: (token: string, extra: Record<string, string> = {}) => b('/api/shared', { headers: { [SHARE_HEADER]: token, 'cf-connecting-ip': ip, ...extra } }),
    blob: (token: string, hash: string, part = 0) => b(`/api/shared/blobs/${hash}/${part}`, { headers: { [SHARE_HEADER]: token, 'cf-connecting-ip': ip } }),
    raw: b,
  }
}

/** Every row of every table, but the rate counters (which count requests, not data). */
function snapshot(s: TestServer) {
  const db = s.env.DB.sqlite
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'rate_limits' ORDER BY name").all() as { name: string }[]).map(t => t.name)
  return Object.fromEntries(tables.map(t => [t, db.prepare(`SELECT * FROM ${t}`).all()]))
}

describe('making share links (signed in)', () => {
  it('makes a link with a long random token and keeps only its hash', async () => {
    const s = await owner()
    await project(s.fetch, 'p_house', 'House')
    const { token, link: l } = await link(s.fetch, 'p_house')
    // 32 random bytes, base64url: well past 128 bits.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(l).toEqual({ id: hashOf(token), created: s.clock.now, lastOpened: null, expires: s.clock.now + 30 * DAY })
    const rows = s.env.DB.sqlite.prepare('SELECT * FROM share_links').all() as Record<string, unknown>[]
    expect(rows).toEqual([{ token_hash: hashOf(token), user_id: s.user.id, project_id: 'p_house', created: s.clock.now, revoked: null, last_opened: null, expires: s.clock.now + 30 * DAY }])
    expect(JSON.stringify(rows)).not.toContain(token)
    // Each link is its own.
    const second = await link(s.fetch, 'p_house')
    expect(second.token).not.toBe(token)
  })

  it('lists the project’s links that are on, newest first, with when each was made and last opened', async () => {
    const s = await owner()
    await project(s.fetch, 'p_a', 'A')
    const first = await link(s.fetch, 'p_a')
    s.clock.now += 60_000
    const second = await link(s.fetch, 'p_a')
    expect((await list(s.fetch, 'p_a')).map(l => l.id)).toEqual([second.link.id, first.link.id])
    await viewer(s).open(first.token)
    const [, opened] = await list(s.fetch, 'p_a')
    expect(opened).toEqual({ id: first.link.id, created: first.link.created, lastOpened: s.clock.now, expires: first.link.expires })
  })

  it('needs the project in the cloud, the session and the app’s header', async () => {
    const s = await owner()
    expect((await (await make(s.fetch, 'p_missing')).json()).error).toBe('not-in-cloud')
    await project(s.fetch, 'p_a', 'A')
    const stranger = s.browser()
    expect((await make(stranger, 'p_a')).status).toBe(401)
    expect((await stranger('/api/projects/p_a/shares')).status).toBe(401)
    // From another site: no CSRF header.
    const noHeader = await s.fetch('/api/projects/p_a/shares', { method: 'POST' })
    expect(noHeader.status).toBe(403)
    expect(await list(s.fetch, 'p_a')).toEqual([])
  })

  it('refuses a link for a deleted project, and deleting one turns its links off for good', async () => {
    const s = await owner()
    const records = await project(s.fetch, 'p_d', 'Doomed')
    const { token } = await link(s.fetch, 'p_d')
    await s.fetch('/api/projects/p_d/commit', post({ base: 1, meta: meta('Doomed', { archived: true }), records: {} }))
    // Archived still opens (it is only tucked away).
    expect((await viewer(s).open(token)).status).toBe(200)
    expect((await s.fetch('/api/projects/p_d?base=2', { method: 'DELETE', headers: { [CSRF_HEADER]: '1' } })).status).toBe(200)
    expect((await viewer(s).open(token)).status).toBe(404)
    expect((await make(s.fetch, 'p_d')).status).toBe(404)
    // Saved again from revision 3, it comes back, but the old link stays off.
    await s.fetch('/api/projects/p_d/commit', post({ base: 3, meta: meta('Back'), records: { plan: records.plan } }))
    expect((await viewer(s).open(token)).status).toBe(404)
    expect(await list(s.fetch, 'p_d')).toEqual([])
  })
})

describe('how long a link lasts', () => {
  it('lasts 30 days unless 90 days or a year is asked for, and nothing shorter or in between', async () => {
    const s = await owner()
    await project(s.fetch, 'p_a', 'A')
    const now = s.clock.now
    expect((await link(s.fetch, 'p_a')).link.expires).toBe(now + 30 * DAY)
    // An app from before links had an end sends no body at all.
    const bare = await s.fetch('/api/projects/p_a/shares', { method: 'POST', headers: { [CSRF_HEADER]: '1' } })
    expect(bare.status).toBe(201)
    expect((await bare.json()).link.expires).toBe(now + 30 * DAY)
    expect((await link(s.fetch, 'p_a', { days: 90 })).link.expires).toBe(now + 90 * DAY)
    expect((await link(s.fetch, 'p_a', { days: 365 })).link.expires).toBe(now + 365 * DAY)
    for (const days of [7, 29, 31, 1000, '30', -30]) {
      const res = await make(s.fetch, 'p_a', { days })
      expect(res.status, String(days)).toBe(400)
      expect((await res.json()).error).toBe('bad-length')
    }
  })

  it('works until its last moment, then says it has ended, and leaves the list', async () => {
    const s = await owner()
    await project(s.fetch, 'p_a', 'A')
    const { token, link: l } = await link(s.fetch, 'p_a')
    s.clock.now = l.expires! - 1
    expect((await viewer(s).open(token)).status).toBe(200)
    expect((await list(s.fetch, 'p_a')).map(x => x.id)).toEqual([l.id])
    s.clock.now = l.expires!
    const res = await viewer(s).open(token)
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'link-off', message: 'This link has ended. Links work for a set time, then stop.' })
    const blob = await viewer(s).blob(token, hashOf(JSON.stringify({ plan: 'A' })))
    expect(blob.status).toBe(404)
    expect(await list(s.fetch, 'p_a')).toEqual([])
  })

  it('doesn’t count an ended link as a guess, or against the project’s links', async () => {
    const s = await owner()
    await project(s.fetch, 'p_a', 'A')
    const { token, link: l } = await link(s.fetch, 'p_a')
    await passTo(s, l.expires! + 1)
    const v = viewer(s)
    for (let i = 0; i < MISS_LIMIT + 5; i++) expect((await v.open(token)).status).toBe(404)
    // The address isn't slowed down: a link that works still opens from it.
    const fresh = await link(s.fetch, 'p_a')
    expect((await v.open(fresh.token)).status).toBe(200)
    // Ended links leave room for new ones.
    s.env.DB.sqlite.prepare('UPDATE share_links SET expires = ? WHERE token_hash = ?').run(s.clock.now - 1, fresh.link.id)
    for (let i = 0; i < LINKS_MAX; i++) await link(s.fetch, 'p_a')
    expect((await make(s.fetch, 'p_a')).status).toBe(409)
  })

  it('extends a link that works by 30 days from its end, never past a year from now', async () => {
    const s = await owner()
    await project(s.fetch, 'p_a', 'A')
    const { token, link: l } = await link(s.fetch, 'p_a')
    s.clock.now += 20 * DAY
    const res = await extend(s.fetch, 'p_a', l.id)
    expect(res.status).toBe(200)
    expect((await res.json()).link).toEqual({ ...l, expires: l.expires! + 30 * DAY })
    // Still the same link: the token opens it past its first end.
    s.clock.now = l.expires! + DAY
    expect((await viewer(s).open(token)).status).toBe(200)
    // A year's link can't go further than a year from now.
    const long = await link(s.fetch, 'p_a', { days: 365 })
    const capped = await (await extend(s.fetch, 'p_a', long.link.id)).json()
    expect(capped.link.expires).toBe(s.clock.now + 365 * DAY)
  })

  it('won’t extend a link that has ended, was turned off, or is another project’s', async () => {
    const s = await owner()
    await project(s.fetch, 'p_a', 'A')
    await project(s.fetch, 'p_b', 'B')
    const ended = await link(s.fetch, 'p_a')
    const off = await link(s.fetch, 'p_a')
    expect((await turnOff(s.fetch, 'p_a', off.link.id)).status).toBe(200)
    expect((await extend(s.fetch, 'p_a', off.link.id)).status).toBe(409)
    expect((await extend(s.fetch, 'p_b', ended.link.id)).status).toBe(404)
    s.clock.now = ended.link.expires!
    const res = await extend(s.fetch, 'p_a', ended.link.id)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('link-ended')
    expect((await viewer(s).open(ended.token)).status).toBe(404)
    // Someone else's session can't touch it.
    const other = s.browser()
    expect((await extend(other, 'p_a', ended.link.id)).status).toBe(401)
  })

  it('keeps a link made before links had an end working until it is turned off', async () => {
    const s = await owner()
    await project(s.fetch, 'p_a', 'A')
    const { token, link: l } = await link(s.fetch, 'p_a')
    s.env.DB.sqlite.prepare('UPDATE share_links SET expires = NULL WHERE token_hash = ?').run(l.id)
    await passTo(s, s.clock.now + 3 * 365 * DAY)
    expect((await viewer(s).open(token)).status).toBe(200)
    expect(await list(s.fetch, 'p_a')).toEqual([{ ...l, expires: null, lastOpened: s.clock.now }])
    // Nothing to extend: it has no end, and still has none.
    const same = await extend(s.fetch, 'p_a', l.id)
    expect(same.status).toBe(200)
    expect((await same.json()).link.expires).toBeNull()
    expect((await turnOff(s.fetch, 'p_a', l.id)).status).toBe(200)
    expect((await viewer(s).open(token)).status).toBe(404)
  })
})

describe('opening a share link (no sign-in)', () => {
  it('opens the project’s latest revision with only the records a viewer needs, and who shared it', async () => {
    const s = await owner()
    const records = await project(s.fetch, 'p_house', 'House')
    const { token } = await link(s.fetch, 'p_house')
    const v = viewer(s)
    const res = await v.open(token)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('set-cookie')).toBeNull()
    const body = await res.json()
    expect(body.sharedBy).toBe('Alex')
    expect(body.project.revision).toBe(1)
    expect(body.project.meta).toMatchObject({ name: 'House', surveyFileName: 'block.dxf' })
    expect(body.project.records).toEqual({ survey: records.survey, plan: records.plan, prefs: records.prefs, site: records.site })
    // Nothing about the account but the name it shares under.
    expect(JSON.stringify(body)).not.toContain(s.user.id)
    expect(Object.keys(body).sort()).toEqual(['project', 'sharedBy'])

    const plan = await v.blob(token, records.plan.hash)
    expect(plan.status).toBe(200)
    expect(await plan.text()).toBe(JSON.stringify({ plan: 'House' }))
    expect(plan.headers.get('x-robots-tag')).toContain('noindex')
    expect(plan.headers.get('referrer-policy')).toBe('no-referrer')
    expect(plan.headers.get('cache-control')).toBe('no-store')
    // Not the undo history, a replaced survey, the site drawings, or the costs (rates and quotes are private).
    for (const kind of ['history', 'previous-survey', 'site-files', 'costs'] as const) expect((await v.blob(token, records[kind].hash)).status, kind).toBe(404)
  })

  it('follows the project as it changes: the newest revision, never a frozen copy', async () => {
    const s = await owner()
    const records = await project(s.fetch, 'p_house', 'House')
    const { token } = await link(s.fetch, 'p_house')
    const plan2 = await upload(s.fetch, JSON.stringify({ plan: 'House, bigger' }))
    await s.fetch('/api/projects/p_house/commit', post({ base: 1, meta: meta('House'), records: { plan: plan2 } }))
    const v = viewer(s)
    const body = await (await v.open(token)).json()
    expect(body.project.revision).toBe(2)
    expect(body.project.records.plan).toEqual(plan2)
    expect(await (await v.blob(token, plan2.hash)).text()).toBe(JSON.stringify({ plan: 'House, bigger' }))
    // The plan it had before is no longer part of what the link shows.
    expect((await v.blob(token, records.plan.hash)).status).toBe(404)
  })

  it('writes nothing but when the link was last opened, at most once a minute', async () => {
    const s = await owner()
    const records = await project(s.fetch, 'p_house', 'House')
    const { token } = await link(s.fetch, 'p_house')
    const before = snapshot(s)
    const kvWrites = s.env.BLOBS.writes
    const v = viewer(s)
    await v.open(token)
    await v.blob(token, records.survey.hash)
    const after = snapshot(s)
    expect(after.share_links).toEqual([{ ...(before.share_links[0] as object), last_opened: s.clock.now }])
    expect({ ...after, share_links: null }).toEqual({ ...before, share_links: null })
    expect(s.env.BLOBS.writes).toBe(kvWrites)
    // Again within the minute: not written again.
    const opened = s.clock.now
    s.clock.now += OPENED_EVERY - 1000
    await v.open(token)
    expect((await list(s.fetch, 'p_house'))[0].lastOpened).toBe(opened)
    s.clock.now += 2000
    await v.open(token)
    expect((await list(s.fetch, 'p_house'))[0].lastOpened).toBe(s.clock.now)
  })

  it('is GET only: nothing else is allowed, with or without the app’s header', async () => {
    const s = await owner()
    await project(s.fetch, 'p_house', 'House')
    const { token } = await link(s.fetch, 'p_house')
    const before = snapshot(s)
    const v = viewer(s)
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const withHeader = await v.raw('/api/shared', { method, headers: { [SHARE_HEADER]: token, [CSRF_HEADER]: '1' }, body: method === 'DELETE' ? undefined : '{}' })
      expect(withHeader.status, method).toBe(405)
      expect(withHeader.headers.get('x-robots-tag'), method).toContain('noindex')
      const without = await v.raw('/api/shared', { method, headers: { [SHARE_HEADER]: token }, body: method === 'DELETE' ? undefined : '{}' })
      expect(without.status, method).toBe(403)
    }
    expect(snapshot(s)).toEqual(before)
  })

  it('says plainly when a token is wrong, and tells nothing else', async () => {
    const s = await owner()
    await project(s.fetch, 'p_house', 'House')
    const { token } = await link(s.fetch, 'p_house')
    const v = viewer(s)
    const wrong = [token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'), 'short', '', `${token}x`, 'a'.repeat(43)]
    for (const t of wrong) {
      const res = await v.open(t)
      expect(res.status, t).toBe(404)
      const body = await res.json()
      expect(body.error).toBe('link-off')
      expect(body.message).toMatch(/turned off/)
      expect(JSON.stringify(body)).not.toMatch(/Alex|House|p_house/)
      expect(res.headers.get('x-robots-tag')).toContain('noindex')
    }
    // No token at all.
    expect((await v.raw('/api/shared', { headers: { 'cf-connecting-ip': '203.0.113.7' } })).status).toBe(404)
    // The owner's session doesn't open a link either: only the token does.
    expect((await s.fetch('/api/shared')).status).toBe(404)
  })
})

describe('turning a link off', () => {
  it('stops it at once, for the project and its records, with a few minutes to undo', async () => {
    const s = await owner()
    const records = await project(s.fetch, 'p_house', 'House')
    const { token, link: l } = await link(s.fetch, 'p_house')
    const v = viewer(s)
    expect((await v.open(token)).status).toBe(200)
    const off = await turnOff(s.fetch, 'p_house', l.id)
    expect(off.status).toBe(200)
    expect((await off.json()).revoked).toBe(s.clock.now)
    expect((await v.open(token)).status).toBe(404)
    expect((await v.blob(token, records.plan.hash)).status).toBe(404)
    expect(await list(s.fetch, 'p_house')).toEqual([])
    // Turning it off twice is harmless.
    expect((await turnOff(s.fetch, 'p_house', l.id)).status).toBe(200)
    // Undo, a moment later: it works again, as it was.
    s.clock.now += 5000
    const back = await turnOn(s.fetch, 'p_house', l.id)
    expect(back.status).toBe(200)
    expect((await back.json()).link).toMatchObject({ id: l.id, created: l.created })
    expect((await v.open(token)).status).toBe(200)
    // Off again, and too late to undo: it stays off.
    await turnOff(s.fetch, 'p_house', l.id)
    s.clock.now += UNDO_MS + 1000
    const late = await turnOn(s.fetch, 'p_house', l.id)
    expect(late.status).toBe(409)
    expect((await late.json()).error).toBe('too-late')
    expect((await v.open(token)).status).toBe(404)
  })

  it('turns off only the one link', async () => {
    const s = await owner()
    await project(s.fetch, 'p_house', 'House')
    const a = await link(s.fetch, 'p_house')
    const b = await link(s.fetch, 'p_house')
    await turnOff(s.fetch, 'p_house', a.link.id)
    expect((await viewer(s).open(a.token)).status).toBe(404)
    expect((await viewer(s).open(b.token)).status).toBe(200)
    expect((await list(s.fetch, 'p_house')).map(x => x.id)).toEqual([b.link.id])
  })
})

describe('keeping a link to its one project', () => {
  it('never reaches another of the owner’s projects', async () => {
    const s = await owner()
    await project(s.fetch, 'p_a', 'A', 'shared one')
    const other = await project(s.fetch, 'p_b', 'B', 'private one')
    const { token } = await link(s.fetch, 'p_a')
    const v = viewer(s)
    const body = await (await v.open(token)).json()
    expect(JSON.stringify(body)).not.toMatch(/p_b|private one/)
    for (const kind of Object.keys(other) as (keyof typeof other)[]) expect((await v.blob(token, other[kind].hash)).status, kind).toBe(404)
    // A link id is the project's own: turning one off through another project does nothing.
    const { link: l } = await link(s.fetch, 'p_a')
    expect((await turnOff(s.fetch, 'p_b', l.id)).status).toBe(404)
    expect((await list(s.fetch, 'p_a')).map(x => x.id)).toContain(l.id)
  })

  it('never reaches another person’s projects, and they can’t see or change the owner’s links', async () => {
    const s = await owner()
    const mine = await project(s.fetch, 'p_house', 'House', 'owner’s')
    const { token, link: l } = await link(s.fetch, 'p_house')
    const them = s.browser()
    await signUp(s, them, 'Someone else')
    const theirs = await project(them, 'p_house', 'Theirs', 'their own')
    const theirLink = await link(them, 'p_house')
    // Same project id, different people: each token opens its own person's.
    const v = viewer(s)
    expect((await (await v.open(token)).json()).sharedBy).toBe('Alex')
    expect((await (await v.open(theirLink.token)).json()).sharedBy).toBe('Someone else')
    expect((await v.blob(theirLink.token, mine.plan.hash)).status).toBe(404)
    expect((await v.blob(token, theirs.plan.hash)).status).toBe(404)
    // Their session lists only their own, and can't turn the owner's off or back on.
    expect((await list(them, 'p_house')).map(x => x.id)).toEqual([theirLink.link.id])
    expect((await turnOff(them, 'p_house', l.id)).status).toBe(404)
    await turnOff(s.fetch, 'p_house', l.id)
    expect((await turnOn(them, 'p_house', l.id)).status).toBe(404)
    expect((await v.open(token)).status).toBe(404)
  })
})

describe('rate limits on shared projects', () => {
  it('slows down an address that tries tokens that open nothing, even with a right one after', async () => {
    const s = await owner()
    await project(s.fetch, 'p_house', 'House')
    const { token } = await link(s.fetch, 'p_house')
    const guesser = viewer(s, '198.51.100.9')
    for (let i = 0; i < MISS_LIMIT; i++) expect((await guesser.open('b'.repeat(43))).status).toBe(404)
    const blocked = await guesser.open(token)
    expect(blocked.status).toBe(429)
    expect((await blocked.json()).error).toBe('slow-down')
    expect(blocked.headers.get('x-robots-tag')).toContain('noindex')
    // Another address is not held up.
    expect((await viewer(s, '192.0.2.44').open(token)).status).toBe(200)
    // The next window, it opens.
    s.clock.now += SHARE_WINDOW
    expect((await guesser.open(token)).status).toBe(200)
  })

  it('limits how often one address can open shared projects at all', async () => {
    const s = await owner()
    await project(s.fetch, 'p_house', 'House')
    const { token } = await link(s.fetch, 'p_house')
    s.env.DB.sqlite.prepare('INSERT INTO rate_limits (key, win, count) VALUES (?, ?, ?)').run('share:203.0.113.7', Math.floor(s.clock.now / SHARE_WINDOW) * SHARE_WINDOW, SHARE_LIMIT)
    expect((await viewer(s).open(token)).status).toBe(429)
    expect((await viewer(s, '192.0.2.44').open(token)).status).toBe(200)
  })
})
