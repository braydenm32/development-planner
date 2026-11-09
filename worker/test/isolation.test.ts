// One person can't reach another's data, whatever they know or guess: their projects (by id),
// their records (by hash, in D1 or KV), their share links (by id), or their account. Each test
// has two people on one Worker, Ana and Ben, and Ben tries everything he can with what he knows of
// Ana's; at the end Ana's rows and KV keys are exactly as they were.

import { describe, expect, it } from 'vitest'
import { CSRF_HEADER } from '../src/api'
import { GRACE_MS, INLINE_MAX } from '../src/projects'
import { post } from './fakes'
import { linkBlob, meta, openLink, person, rowsOf, server } from './people'

/** Ana with a project holding a small record (kept in D1) and a large one (kept in KV), and a share link to it. */
async function twoPeople() {
  const s = server()
  const ana = await person(s, 'Ana')
  const ben = await person(s, 'Ben')
  const plan = await ana.upload(JSON.stringify({ plan: 'Ana’s plan' }))
  const survey = await ana.upload(JSON.stringify({ survey: 'Ana’s survey', pad: 'x'.repeat(INLINE_MAX) }))
  await ana.save('p_home', 'Ana’s house', { plan, survey })
  const link = await ana.share('p_home')
  return { s, ana, ben, plan, survey, link, before: rowsOf(s, ana.id) }
}

const del = (f: typeof fetch, path: string) => f(path, { method: 'DELETE', headers: { [CSRF_HEADER]: '1' } })

describe('keeping each person’s data to themselves', () => {
  it('doesn’t list, open or change another person’s project, even by its id', async () => {
    const { s, ana, ben, before } = await twoPeople()
    expect((await (await ben.fetch('/api/projects')).json()).projects).toEqual([])
    expect((await ben.fetch('/api/projects/p_home')).status).toBe(404)
    // Deleting Ana's id deletes nothing: Ben has no project by that id.
    expect((await del(ben.fetch, '/api/projects/p_home?base=1')).status).toBe(200)
    // Saving to Ana's id makes Ben's own project, with nothing of hers in it.
    expect((await ben.fetch('/api/projects/p_home/commit', post({ base: 0, meta: meta('Ben’s'), records: {} }))).status).toBe(200)
    const his = (await (await ben.fetch('/api/projects/p_home')).json()).project
    expect(his).toMatchObject({ revision: 1, meta: { name: 'Ben’s' }, records: {} })
    expect(rowsOf(s, ana.id)).toEqual(before)
    expect((await (await ana.fetch('/api/projects/p_home')).json()).project.meta.name).toBe('Ana’s house')
  })

  it('doesn’t read another person’s records by hash, or say whether they exist', async () => {
    const { s, ana, ben, plan, survey, before } = await twoPeople()
    for (const r of [plan, survey]) expect((await ben.fetch(`/api/blobs/${r.hash}/0`)).status).toBe(404)
    // Asking which blobs the server has tells Ben only about his own.
    const missing = await ben.fetch('/api/blobs/missing', post({ hashes: [plan.hash, survey.hash] }))
    expect((await missing.json()).missing).toEqual([plan.hash, survey.hash])
    // Naming her blobs in a commit doesn't borrow them.
    const borrow = await ben.fetch('/api/projects/p_ben/commit', post({ base: 0, meta: meta('Ben’s'), records: { plan, survey } }))
    expect(borrow.status).toBe(422)
    expect(rowsOf(s, ana.id)).toEqual(before)
  })

  it('keeps the same content uploaded by two people apart, in D1 and in KV', async () => {
    const { s, ana, ben, before } = await twoPeople()
    const same = JSON.stringify({ survey: 'Ana’s survey', pad: 'x'.repeat(INLINE_MAX) })
    const his = await ben.upload(same)
    expect([...s.env.BLOBS.map.keys()].filter(k => k.includes(his.hash)).sort()).toEqual([`b:${ana.id}:${his.hash}:0`, `b:${ben.id}:${his.hash}:0`])
    await ben.save('p_ben', 'Ben’s', { survey: his })
    // His copy going (unused, then tidied) leaves hers.
    expect((await ben.fetch('/api/projects/p_ben/commit', post({ base: 1, meta: meta('Ben’s'), records: { survey: null } }))).status).toBe(200)
    s.clock.now += GRACE_MS + 1
    expect((await ben.fetch('/api/projects/p_ben/commit', post({ base: 2, meta: meta('Ben’s'), records: {} }))).status).toBe(200)
    expect(s.env.BLOBS.map.has(`b:${ben.id}:${his.hash}:0`)).toBe(false)
    expect(rowsOf(s, ana.id)).toEqual(before)
    expect(await (await ana.fetch(`/api/blobs/${his.hash}/0`)).text()).toBe(same)
  })

  it('doesn’t tidy away another person’s upload that is waiting for its save', async () => {
    const { s, ana, ben } = await twoPeople()
    const waiting = await ana.upload('"not saved yet"')
    s.clock.now += GRACE_MS + 1
    // Ben's saves tidy only Ben's blobs.
    const mine = await ben.upload('"Ben’s"')
    await ben.save('p_ben', 'Ben’s', { plan: mine })
    expect(s.env.DB.sqlite.prepare('SELECT 1 FROM blobs WHERE user_id = ? AND hash = ?').get(ana.id, waiting.hash)).toBeTruthy()
  })

  it('doesn’t list, make, turn off, restore or extend another person’s share links', async () => {
    const { s, ana, ben, link, before } = await twoPeople()
    expect((await (await ben.fetch('/api/projects/p_home/shares')).json()).links).toEqual([])
    expect((await ben.fetch('/api/projects/p_home/shares', post({}))).status).toBe(404)
    expect((await del(ben.fetch, `/api/projects/p_home/shares/${link.id}`)).status).toBe(404)
    expect((await ben.fetch(`/api/projects/p_home/shares/${link.id}/restore`, post({}))).status).toBe(404)
    expect((await ben.fetch(`/api/projects/p_home/shares/${link.id}/extend`, post({}))).status).toBe(404)
    // Even with a project of his own by the same id.
    await ben.save('p_home', 'Ben’s', {})
    expect((await del(ben.fetch, `/api/projects/p_home/shares/${link.id}`)).status).toBe(404)
    expect((await ben.fetch(`/api/projects/p_home/shares/${link.id}/extend`, post({}))).status).toBe(404)
    expect(rowsOf(s, ana.id)).toEqual(before)
    expect((await openLink(s, link.token)).status).toBe(200)
  })

  it('opens with a link only that project’s records, never another person’s', async () => {
    const { s, ben, link } = await twoPeople()
    const his = await ben.upload('"Ben’s plan"')
    await ben.save('p_ben', 'Ben’s', { plan: his })
    expect((await linkBlob(s, link.token, his.hash)).status).toBe(404)
    const shared = await (await openLink(s, link.token)).json()
    expect(shared.sharedBy).toBe('Ana')
    expect(JSON.stringify(shared)).not.toContain('Ben')
  })

  it('shows each person only their own account', async () => {
    const { ana, ben } = await twoPeople()
    const his = await (await ben.fetch('/api/account')).json()
    expect(his.user).toMatchObject({ id: ben.id, name: 'Ben' })
    expect(his.passkeys).toHaveLength(1)
    expect(his.storage.used).toBe(0)
    expect(JSON.stringify(his)).not.toContain(ana.id)
    // Ana's cookie is hers alone; a browser with none is no one.
    expect((await (await ana.fetch('/api/session')).json()).user.id).toBe(ana.id)
  })
})
