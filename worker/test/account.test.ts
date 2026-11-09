// Deleting an account: asking signs out every browser and stops its links and saving at once;
// for 30 days signing in again can keep it; after that it can't be signed in to, and the hourly
// clean-up removes every row and KV part of it, a little at a time, and nothing of anyone else's.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { DELETE_DAYS, PURGE_KV_DELETES, purgeAccounts } from '../src/account'
import { CSRF_HEADER } from '../src/api'
import { INLINE_MAX, QUOTA_MB_DEFAULT } from '../src/projects'
import worker from '../src/index'
import { post } from './fakes'
import { DAY, meta, openLink, person, rowsOf, server, type Person } from './people'

const askToDelete = (p: Person) => p.fetch('/api/account/delete', post({}))
const keep = (p: Person) => p.fetch('/api/account/keep', post({}))
const me = async (f: typeof fetch) => (await (await f('/api/session')).json()).user

/** Ana, with a project (one record in D1, one in KV) and a share link; Ben, who keeps his account. */
async function setUp() {
  const s = server()
  const ana = await person(s, 'Ana')
  const ben = await person(s, 'Ben')
  const plan = await ana.upload(JSON.stringify({ plan: 'Ana’s plan' }))
  const survey = await ana.upload(JSON.stringify({ survey: 'Ana’s', pad: 'x'.repeat(INLINE_MAX) }))
  await ana.save('p_home', 'Ana’s house', { plan, survey })
  const link = await ana.share('p_home')
  await ben.save('p_ben', 'Ben’s house', { plan: await ben.upload('"Ben’s plan"') })
  return { s, ana, ben, plan, survey, link }
}

afterEach(() => void vi.useRealTimers())

describe('asking to delete an account', () => {
  it('signs out every browser, stops its links and saving, and says when it goes', async () => {
    const { s, ana, link } = await setUp()
    const phone = s.browser()
    const o = await (await phone('/api/auth/login/options', post({}))).json()
    expect((await phone('/api/auth/login/verify', post({ challengeId: o.challengeId, response: await ana.key.get(o.options) }))).status).toBe(200)

    const res = await askToDelete(ana)
    expect(res.status).toBe(200)
    expect((await res.json()).deleteAfter).toBe(s.clock.now + DELETE_DAYS * DAY)
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/)
    expect(await me(ana.fetch)).toBeNull()
    expect(await me(phone)).toBeNull()
    expect((await openLink(s, link.token)).status).toBe(404)
  })

  it('needs the session and the app’s header', async () => {
    const { s, ana } = await setUp()
    expect((await s.browser()('/api/account/delete', post({}))).status).toBe(401)
    expect((await ana.fetch('/api/account/delete', { method: 'POST' })).status).toBe(403)
    expect(await me(ana.fetch)).not.toBeNull()
  })

  it('lets its owner sign in for 30 days to read and keep it, but not to save', async () => {
    const { s, ana, plan, survey, link } = await setUp()
    const { deleteAfter } = await (await askToDelete(ana)).json()
    s.clock.now += 10 * DAY
    const back = await ana.signIn()
    expect(back.status).toBe(200)
    expect((await back.json()).user.deleteAfter).toBe(deleteAfter)
    expect((await me(ana.fetch)).deleteAfter).toBe(deleteAfter)
    expect((await (await ana.fetch('/api/account')).json()).deleteAfter).toBe(deleteAfter)

    // Reading still works, so a new device can fetch what is there.
    expect((await (await ana.fetch('/api/projects')).json()).projects).toHaveLength(1)
    expect((await ana.fetch(`/api/blobs/${survey.hash}/0`)).status).toBe(200)
    // Saving doesn't.
    const refused = [
      await ana.fetch('/api/projects/p_home/commit', post({ base: 1, meta: meta('Changed'), records: { plan } })),
      await ana.fetch(`/api/blobs/${'a'.repeat(64)}/0?parts=1&size=3`, { method: 'PUT', headers: { [CSRF_HEADER]: '1' }, body: '"a"' }),
      await ana.fetch('/api/blobs/missing', post({ hashes: [plan.hash] })),
      await ana.fetch('/api/projects/p_home/shares', post({})),
      await ana.fetch(`/api/projects/p_home/shares/${link.id}/extend`, post({})),
    ]
    for (const r of refused) {
      expect(r.status).toBe(403)
      expect((await r.json()).error).toBe('account-deleting')
    }
    // Asking again keeps the first date.
    expect((await (await askToDelete(ana)).json()).deleteAfter).toBe(deleteAfter)
  })

  it('keeps the account when its owner says so, with its links and saving back', async () => {
    const { s, ana, plan, link } = await setUp()
    await askToDelete(ana)
    s.clock.now += 29 * DAY
    await ana.signIn()
    const kept = await keep(ana)
    expect(kept.status).toBe(200)
    expect((await kept.json()).user.deleteAfter).toBeNull()
    expect((await me(ana.fetch)).deleteAfter).toBeNull()
    expect((await ana.fetch('/api/projects/p_home/commit', post({ base: 1, meta: meta('Still here'), records: { plan } }))).status).toBe(200)
    expect((await openLink(s, link.token)).status).toBe(200)
    // Nothing is due, so the clean-up leaves it.
    s.clock.now += 2 * DAY
    expect(await purgeAccounts(s.env, s.clock.now)).toEqual([])
  })

  it('can’t be signed in to or kept once the 30 days are up', async () => {
    const { s, ana } = await setUp()
    const code = await (await ana.fetch('/api/auth/recovery-code', post({}))).json()
    await askToDelete(ana)
    s.clock.now += DELETE_DAYS * DAY
    const tooLate = await ana.signIn()
    expect(tooLate.status).toBe(403)
    expect((await tooLate.json()).error).toBe('account-deleted')
    const recover = await s.browser()('/api/auth/recover/options', post({ code: code.recoveryCode }))
    expect(recover.status).toBe(403)
    expect((await keep(ana)).status).toBe(401)
  })
})

describe('the clean-up of deleted accounts', () => {
  it('removes every row and KV part of an account whose 30 days are up, and nothing of anyone else’s', async () => {
    const { s, ana, ben, link } = await setUp()
    const bens = rowsOf(s, ben.id)
    await askToDelete(ana)
    s.clock.now += DELETE_DAYS * DAY - 1
    expect(await purgeAccounts(s.env, s.clock.now)).toEqual([])
    s.clock.now += 1
    expect(await purgeAccounts(s.env, s.clock.now)).toEqual([ana.id])

    const left = rowsOf(s, ana.id)
    for (const [table, rows] of Object.entries(left)) expect(rows, table).toEqual([])
    const db = s.env.DB.sqlite
    expect(db.prepare('SELECT COUNT(*) AS n FROM challenges WHERE user_id = ?').get(ana.id)).toEqual({ n: 0 })
    expect(JSON.stringify(db.prepare('SELECT * FROM rate_limits').all())).not.toContain(ana.id)
    expect(rowsOf(s, ben.id)).toEqual(bens)
    expect((await openLink(s, link.token)).status).toBe(404)
    // Gone: the passkey is unknown now.
    expect((await (await ana.signIn()).json()).error).toBe('unknown-passkey')
  })

  it('stops at its limit for one run and carries on in the next', async () => {
    const { s, ana } = await setUp()
    // More KV records than one run deletes.
    const big = (i: number) => JSON.stringify({ n: i, pad: 'y'.repeat(INLINE_MAX) })
    for (let i = 0; i < PURGE_KV_DELETES + 4; i++) await ana.upload(big(i))
    const before = s.env.BLOBS.deletes
    await askToDelete(ana)
    s.clock.now += DELETE_DAYS * DAY
    expect(await purgeAccounts(s.env, s.clock.now)).toEqual([])
    expect(s.env.BLOBS.deletes - before).toBeLessThanOrEqual(PURGE_KV_DELETES)
    expect(rowsOf(s, ana.id).users).toHaveLength(1)
    expect(await purgeAccounts(s.env, s.clock.now)).toEqual([ana.id])
    expect(rowsOf(s, ana.id).kv).toEqual([])
  })

  it('runs from the Worker’s hourly trigger', async () => {
    const { s, ana } = await setUp()
    await askToDelete(ana)
    vi.useFakeTimers({ now: s.clock.now + DELETE_DAYS * DAY, toFake: ['Date'] })
    const waits: Promise<unknown>[] = []
    await worker.scheduled({}, s.env, { waitUntil: p => void waits.push(p) })
    await Promise.all(waits)
    expect(rowsOf(s, ana.id).users).toEqual([])
  })
})

describe('the storage limit', () => {
  it('is 50 MB a person unless set otherwise, and the account says how much is used', async () => {
    const { s, ana, plan, survey } = await setUp()
    expect(QUOTA_MB_DEFAULT).toBe(50)
    const { storage } = await (await ana.fetch('/api/account')).json()
    expect(storage).toEqual({ used: plan.size + survey.size, limit: 50 * 1024 * 1024 })
    s.env.QUOTA_MB = '2'
    expect((await (await ana.fetch('/api/account')).json()).storage.limit).toBe(2 * 1024 * 1024)
  })
})
