// Cloud saves on the Worker: blobs (inline in D1, or in KV in parts), commits that refuse a stale
// revision, deletes that leave a tombstone, tidying unused blobs, and the size limits.

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { CSRF_HEADER } from '../src/api'
import { GRACE_MS, INLINE_MAX, PART_MAX, partsFor } from '../src/projects'
import { softPasskey } from './authenticator'
import { ORIGIN, post, testServer } from './fakes'

const hashOf = (text: string) => createHash('sha256').update(text).digest('hex')

async function signedIn(vars = {}) {
  const s = testServer(vars)
  const key = softPasskey(ORIGIN)
  const opts = await (await s.fetch('/api/auth/signup/options', post({ name: 'Owner' }))).json()
  await s.fetch('/api/auth/signup/verify', post({ challengeId: opts.challengeId, response: await key.create(opts.options) }))
  return s
}

type S = Awaited<ReturnType<typeof signedIn>>

/** Upload a record's text the way the app does, part by part. */
async function upload(s: S, text: string) {
  const bytes = new TextEncoder().encode(text)
  const hash = hashOf(text)
  const parts = partsFor(bytes.length)
  for (let p = 0; p < parts; p++) {
    const res = await s.fetch(`/api/blobs/${hash}/${p}?parts=${parts}&size=${bytes.length}`, {
      method: 'PUT',
      headers: { [CSRF_HEADER]: '1' },
      body: bytes.slice(p * PART_MAX, (p + 1) * PART_MAX),
    })
    expect(res.status).toBe(200)
  }
  return { hash, size: bytes.length, parts }
}

const meta = (name: string, extra = {}) => ({ name, created: 1, updated: 2, archived: false, surveyFileName: null, thumbnail: null, numbers: { siteArea: null, floorArea: null, ffl: null }, ...extra })
const commit = (s: S, id: string, body: unknown) => s.fetch(`/api/projects/${id}/commit`, post(body))
const read = async (s: S, hash: string, part = 0) => (await s.fetch(`/api/blobs/${hash}/${part}`)).text()

describe('saving projects to the cloud', () => {
  it('commits a new project at revision 1 and lists it with its records', async () => {
    const s = await signedIn()
    const plan = await upload(s, JSON.stringify({ walls: [1, 2, 3] }))
    const res = await commit(s, 'p_one', { base: 0, meta: meta('House'), records: { plan } })
    expect(res.status).toBe(200)
    const { project } = await res.json()
    expect(project).toMatchObject({ id: 'p_one', revision: 1, deleted: false, meta: { name: 'House', id: 'p_one', revision: 1 }, records: { plan } })
    const list = (await (await s.fetch('/api/projects')).json()).projects
    expect(list).toHaveLength(1)
    expect(await read(s, plan.hash)).toBe(JSON.stringify({ walls: [1, 2, 3] }))
    // Small records stay in D1: no KV write for them.
    expect(s.env.BLOBS.writes).toBe(0)
  })

  it('refuses a commit from a revision the server has moved past, and changes nothing', async () => {
    const s = await signedIn()
    const a = await upload(s, '"a"')
    await commit(s, 'p_x', { base: 0, meta: meta('X'), records: { plan: a } })
    const b = await upload(s, '"b"')
    expect((await commit(s, 'p_x', { base: 1, meta: meta('X'), records: { plan: b } })).status).toBe(200)
    // Another device, still at revision 1.
    const c = await upload(s, '"c"')
    const stale = await commit(s, 'p_x', { base: 1, meta: meta('X from the phone'), records: { plan: c } })
    expect(stale.status).toBe(409)
    const body = await stale.json()
    expect(body.error).toBe('conflict')
    expect(body.project).toMatchObject({ revision: 2, meta: { name: 'X' }, records: { plan: b } })
    // A brand-new project at base 0 can't take an id that is already there either.
    expect((await commit(s, 'p_x', { base: 0, meta: meta('Again'), records: {} })).status).toBe(409)
  })

  it('keeps records a commit doesn’t mention, and removes those it sets to null', async () => {
    const s = await signedIn()
    const survey = await upload(s, '"survey"')
    const plan = await upload(s, '"plan"')
    await commit(s, 'p_k', { base: 0, meta: meta('K'), records: { survey, plan } })
    const plan2 = await upload(s, '"plan 2"')
    const { project } = await (await commit(s, 'p_k', { base: 1, meta: meta('K'), records: { plan: plan2 } })).json()
    expect(project.records).toEqual({ survey, plan: plan2 })
    const { project: p3 } = await (await commit(s, 'p_k', { base: 2, meta: meta('K'), records: { survey: null } })).json()
    expect(p3.records).toEqual({ plan: plan2 })
  })

  it('won’t commit a record whose blob hasn’t been uploaded', async () => {
    const s = await signedIn()
    const res = await commit(s, 'p_m', { base: 0, meta: meta('M'), records: { plan: { hash: 'a'.repeat(64), size: 3, parts: 1 } } })
    expect(res.status).toBe(422)
    expect((await res.json()).missing).toEqual(['a'.repeat(64)])
    expect((await (await s.fetch('/api/projects')).json()).projects).toEqual([])
  })

  it('says which blobs it already has, so they aren’t sent again', async () => {
    const s = await signedIn()
    const a = await upload(s, '"a"')
    const res = await s.fetch('/api/blobs/missing', post({ hashes: [a.hash, 'b'.repeat(64)] }))
    expect((await res.json()).missing).toEqual(['b'.repeat(64)])
    // Uploading one it has costs nothing.
    const again = await s.fetch(`/api/blobs/${a.hash}/0?parts=1&size=${a.size}`, { method: 'PUT', headers: { [CSRF_HEADER]: '1' }, body: '"a"' })
    expect((await again.json()).complete).toBe(true)
  })

  it('puts large records in KV, in parts, and reads them back whole', async () => {
    const s = await signedIn()
    const big = JSON.stringify('x'.repeat(INLINE_MAX + 10))
    const ref = await upload(s, big)
    expect(ref.parts).toBe(1)
    expect(s.env.BLOBS.writes).toBe(1)
    expect(await read(s, ref.hash)).toBe(big)
    // Past the part size: two parts, in order.
    const huge = JSON.stringify('y'.repeat(PART_MAX + 5))
    const h = hashOf(huge)
    const bytes = new TextEncoder().encode(huge)
    const second = await s.fetch(`/api/blobs/${h}/1?parts=2&size=${bytes.length}`, { method: 'PUT', headers: { [CSRF_HEADER]: '1' }, body: bytes.slice(PART_MAX) })
    expect(second.status).toBe(409)
    expect((await second.json()).next).toBe(0)
    const href = await upload(s, huge)
    expect(href.parts).toBe(2)
    expect((await read(s, h, 0)).length + (await read(s, h, 1)).length).toBe(bytes.length)
    await commit(s, 'p_big', { base: 0, meta: meta('Big'), records: { 'site-files': href } })
    expect((await (await s.fetch('/api/projects/p_big')).json()).project.records['site-files']).toEqual(href)
  }, 30_000)

  it('refuses a part that is longer or shorter than it said', async () => {
    const s = await signedIn()
    const h = hashOf('"abc"')
    const long = await s.fetch(`/api/blobs/${h}/0?parts=1&size=3`, { method: 'PUT', headers: { [CSRF_HEADER]: '1' }, body: '"abc"' })
    expect(long.status).toBe(413)
    const short = await s.fetch(`/api/blobs/${h}/0?parts=1&size=9`, { method: 'PUT', headers: { [CSRF_HEADER]: '1' }, body: '"abc"' })
    expect(short.status).toBe(400)
    const wrongParts = await s.fetch(`/api/blobs/${h}/0?parts=2&size=5`, { method: 'PUT', headers: { [CSRF_HEADER]: '1' }, body: '"abc"' })
    expect(wrongParts.status).toBe(400)
  })

  it('stops at the account’s quota', async () => {
    const s = await signedIn({ QUOTA_MB: '1' })
    await upload(s, JSON.stringify('z'.repeat(700 * 1024)))
    const text = JSON.stringify('w'.repeat(400 * 1024))
    const res = await s.fetch(`/api/blobs/${hashOf(text)}/0?parts=1&size=${text.length}`, { method: 'PUT', headers: { [CSRF_HEADER]: '1' }, body: text })
    expect(res.status).toBe(413)
    expect((await res.json()).error).toBe('quota')
  })

  it('checks the index entry and the record names', async () => {
    const s = await signedIn()
    expect((await commit(s, 'p_v', { base: 0, meta: { name: '' }, records: {} })).status).toBe(400)
    expect((await commit(s, 'p_v', { base: -1, meta: meta('V'), records: {} })).status).toBe(400)
    expect((await commit(s, 'p_v', { base: 0, meta: meta('V'), records: { 'bad kind!': null } })).status).toBe(400)
    expect((await commit(s, 'bad id!', { base: 0, meta: meta('V'), records: {} })).status).toBe(400)
    expect((await commit(s, 'p_v', { base: 0, meta: meta('V', { thumbnail: 'x'.repeat(300 * 1024) }), records: {} })).status).toBe(413)
  })

  it('keeps each person’s projects and blobs to themselves', async () => {
    const s = await signedIn({ SIGNUP: 'open' })
    const plan = await upload(s, '"mine"')
    await commit(s, 'p_mine', { base: 0, meta: meta('Mine'), records: { plan } })
    const other = s.browser()
    const opts = await (await other('/api/auth/signup/options', post({ name: 'Other' }))).json()
    await other('/api/auth/signup/verify', post({ challengeId: opts.challengeId, response: await softPasskey(ORIGIN).create(opts.options) }))
    expect((await (await other('/api/projects')).json()).projects).toEqual([])
    expect((await other(`/api/blobs/${plan.hash}/0`)).status).toBe(404)
    expect((await other('/api/projects/p_mine')).status).toBe(404)
    // The same id is a different project for them.
    expect((await other('/api/projects/p_mine/commit', post({ base: 0, meta: meta('Theirs'), records: {} }))).status).toBe(200)
    expect((await (await s.fetch('/api/projects/p_mine')).json()).project.meta.name).toBe('Mine')
  })
})

describe('deleting from the cloud', () => {
  it('deletes only an archived project at the revision the app saw, leaving a tombstone', async () => {
    const s = await signedIn()
    const plan = await upload(s, '"p"')
    await commit(s, 'p_d', { base: 0, meta: meta('Doomed'), records: { plan } })
    const del = (base: number) => s.fetch(`/api/projects/p_d?base=${base}`, { method: 'DELETE', headers: { [CSRF_HEADER]: '1' } })
    expect((await (await del(1)).json()).error).toBe('not-archived')
    await commit(s, 'p_d', { base: 1, meta: meta('Doomed', { archived: true }), records: {} })
    expect((await del(1)).status).toBe(409)
    expect((await del(2)).status).toBe(200)
    const [tomb] = (await (await s.fetch('/api/projects')).json()).projects
    expect(tomb).toEqual({ id: 'p_d', revision: 3, deleted: true, records: {}, meta: { id: 'p_d', name: 'Doomed' } })
    // Deleting again is harmless; saving to it again from revision 3 brings it back.
    expect((await del(3)).status).toBe(200)
    expect((await commit(s, 'p_d', { base: 3, meta: meta('Back'), records: { plan } })).status).toBe(200)
  })

  it('tidies away blobs nothing uses once they have been unused for a while', async () => {
    const s = await signedIn()
    const big = await upload(s, JSON.stringify('k'.repeat(INLINE_MAX + 1)))
    const small = await upload(s, '"small"')
    await commit(s, 'p_t', { base: 0, meta: meta('T'), records: { survey: big, plan: small } })
    const small2 = await upload(s, '"small 2"')
    await commit(s, 'p_t', { base: 1, meta: meta('T'), records: { survey: null, plan: small2 } })
    const count = () => (s.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM blobs').get() as { n: number }).n
    expect(count()).toBe(3) // the old ones wait out the grace period
    s.clock.now += GRACE_MS + 1000
    const touch = await upload(s, '"touch"')
    await commit(s, 'p_t', { base: 2, meta: meta('T'), records: { prefs: touch } })
    expect(count()).toBe(2)
    expect(s.env.BLOBS.map.size).toBe(0)
    expect(s.env.BLOBS.deletes).toBe(1)
    expect(await read(s, small2.hash)).toBe('"small 2"')
  })
})
