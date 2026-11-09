// Comments on share links, on the Worker: off unless the owner lets people comment; a viewer pins
// a short plain-text note on the plan and sees their own again (or everyone's, if the owner
// chose); the owner lists, resolves and deletes them; a link that is off, ended, for a deleted
// project or for an account being deleted takes none and shows none; and the limits that keep a
// public link from being flooded.

import { describe, expect, it } from 'vitest'
import { CSRF_HEADER } from '../src/api'
import { COMMENTS_MAX, DAY_MAX, IP_MAX, LIST_MAX, NAME_MAX, TEXT_MAX, tidyComments } from '../src/comments'
import worker from '../src/index'
import { SHARE_WINDOW, UNDO_MS } from '../src/shares'
import { post } from './fakes'
import { commenter, DAY, hashOf, meta, person, pin, server, type Person } from './people'

/** Ana with a project in the cloud and a link to it, with comments as asked. */
async function shared(comments?: 'off' | 'own' | 'all') {
  const s = server()
  const ana = await person(s, 'Ana')
  await ana.save('p_home', 'Ana’s house', { plan: await ana.upload(JSON.stringify({ plan: 'Ana’s plan' })) })
  const link = await ana.share('p_home', comments ? { comments } : {})
  return { s, ana, link }
}

type Owned = { id: string; link: string; floor: string; x: number; y: number; text: string; name: string | null; created: number; resolved: number | null }
type Tally = { created: number; expires: number | null; total: number; new: number }
const ownerList = async (p: Person, project = 'p_home') => (await (await p.fetch(`/api/projects/${project}/comments`)).json()) as { comments: Owned[]; links: Record<string, Tally> }
const counts = async (p: Person, link: string) => {
  const t = (await ownerList(p)).links[link]
  return t && { total: t.total, new: t.new }
}
const resolve = (p: Person, id: string, body: unknown = {}, project = 'p_home') => p.fetch(`/api/projects/${project}/comments/${id}/resolve`, post(body))
const remove = (p: Person, id: string, project = 'p_home') => p.fetch(`/api/projects/${project}/comments/${id}`, { method: 'DELETE', headers: { [CSRF_HEADER]: '1' } })
const setMode = (p: Person, link: string, comments: unknown, project = 'p_home') => p.fetch(`/api/projects/${project}/shares/${link}/comments`, post({ comments }))
const seen = async (res: Response) => (await res.json()) as { mode: string; comments: { id: string; text: string; name: string | null; mine: boolean; resolved: boolean }[] }

describe('whether a link takes comments', () => {
  it('takes none unless the owner lets people comment, and says so', async () => {
    const { s, link } = await shared()
    const v = commenter(s, link.token)
    const res = await v.add(pin())
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('comments-off')
    expect(await seen(await v.list())).toEqual({ mode: 'off', comments: [] })
    expect(s.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM share_comments').get()).toEqual({ n: 0 })
  })

  it('can be asked for when making the link, and changed later on a link that works', async () => {
    const { s, ana, link } = await shared('own')
    const lists = async () => (await (await ana.fetch('/api/projects/p_home/shares')).json()).links
    expect((await lists())[0]).toMatchObject({ id: link.id, comments: 'own' })
    for (const mode of ['all', 'off', 'own'] as const) {
      const res = await setMode(ana, link.id, mode)
      expect(res.status).toBe(200)
      expect((await res.json()).link).toMatchObject({ id: link.id, comments: mode })
      expect((await seen(await commenter(s, link.token).list())).mode).toBe(mode)
    }
    for (const bad of ['on', true, 1, '', null]) expect((await setMode(ana, link.id, bad)).status, String(bad)).toBe(400)
    expect((await ana.fetch('/api/projects/p_home/shares', post({ comments: 'yes' }))).status).toBe(400)
    // A link that ended or was turned off keeps what it had.
    await ana.fetch(`/api/projects/p_home/shares/${link.id}`, { method: 'DELETE', headers: { [CSRF_HEADER]: '1' } })
    expect((await setMode(ana, link.id, 'all')).status).toBe(404)
  })

  it('needs the session and the app’s header to change the setting, and not while the account is being deleted', async () => {
    const { s, ana, link } = await shared()
    expect((await s.browser()(`/api/projects/p_home/shares/${link.id}/comments`, post({ comments: 'own' }))).status).toBe(401)
    expect((await ana.fetch(`/api/projects/p_home/shares/${link.id}/comments`, { method: 'POST', body: '{"comments":"own"}' })).status).toBe(403)
    await ana.fetch('/api/account/delete', post({}))
    await ana.signIn()
    const res = await setMode(ana, link.id, 'own')
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('account-deleting')
  })
})

describe('commenting with a link (no sign-in)', () => {
  it('pins a comment on a spot of the plan, keeps only a hash of the browser’s token, and shows it to its writer only', async () => {
    const { s, ana, link } = await shared('own')
    const mine = commenter(s, link.token)
    const res = await mine.add(pin('Move this wall back a metre?', { name: '  Sam  ' }))
    expect(res.status).toBe(201)
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
    const { comment } = await res.json()
    expect(comment).toEqual({ id: expect.stringMatching(/^[A-Za-z0-9_-]{16}$/), floor: 'level_ground', x: 1012.5, y: 1008.25, text: 'Move this wall back a metre?', name: 'Sam', created: s.clock.now, resolved: false, mine: true })
    const rows = s.env.DB.sqlite.prepare('SELECT * FROM share_comments').all() as Record<string, unknown>[]
    expect(rows).toEqual([
      { id: comment.id, link_id: link.id, user_id: ana.id, project_id: 'p_home', floor: 'level_ground', x: 1012.5, y: 1008.25, text: 'Move this wall back a metre?', name: 'Sam', created: s.clock.now, resolved: null, viewer_hash: hashOf(mine.token!) },
    ])
    expect(JSON.stringify(rows)).not.toContain(mine.token)

    // The same browser sees it again; another browser, or none, doesn't.
    expect((await seen(await mine.list())).comments.map(c => c.id)).toEqual([comment.id])
    const other = commenter(s, link.token, { ip: '203.0.113.21' })
    expect(await seen(await other.list())).toEqual({ mode: 'own', comments: [] })
    expect((await seen(await commenter(s, link.token, { token: null }).list())).comments).toEqual([])
    expect((await other.add(pin('Bigger deck'))).status).toBe(201)
    expect((await seen(await other.list())).comments.map(c => c.text)).toEqual(['Bigger deck'])
    expect((await seen(await mine.list())).comments.map(c => c.text)).toEqual(['Move this wall back a metre?'])
  })

  it('shows everyone with the link every comment when the owner chose that, marking each person’s own, and nothing about who', async () => {
    const { s, link } = await shared('all')
    const a = commenter(s, link.token)
    const b = commenter(s, link.token, { ip: '203.0.113.21' })
    await a.add(pin('First', { name: 'Sam' }))
    s.clock.now += 1000
    await b.add(pin('Second'))
    const got = await seen(await a.list())
    expect(got.mode).toBe('all')
    expect(got.comments.map(c => [c.text, c.name, c.mine])).toEqual([
      ['First', 'Sam', true],
      ['Second', null, false],
    ])
    expect(Object.keys(got.comments[0]).sort()).toEqual(['created', 'floor', 'id', 'mine', 'name', 'resolved', 'text', 'x', 'y'])
    // Someone with the link but no comments of their own sees them all too.
    expect((await seen(await commenter(s, link.token, { token: null }).list())).comments.map(c => c.mine)).toEqual([false, false])
  })

  it('still shows a person their own comments once comments are turned off, but takes no more', async () => {
    const { s, ana, link } = await shared('all')
    const a = commenter(s, link.token)
    await a.add(pin('Kept'))
    await setMode(ana, link.id, 'off')
    expect((await a.add(pin('Too late'))).status).toBe(403)
    const got = await seen(await a.list())
    expect(got.mode).toBe('off')
    expect(got.comments.map(c => c.text)).toEqual(['Kept'])
    expect((await seen(await commenter(s, link.token, { ip: '203.0.113.21' }).list())).comments).toEqual([])
  })

  it('keeps a comment as plain text, trimmed, and refuses one that is empty, too long or has control characters', async () => {
    const { s, link } = await shared('own')
    const v = commenter(s, link.token)
    const send = async (body: unknown) => {
      s.clock.now += SHARE_WINDOW // past the address's limit each time
      return v.add(body)
    }
    // Markup stays as the words typed: the app shows it as text.
    const markup = await send(pin('  <b>wider</b> <script>x()</script>\r\nplease  '))
    expect(markup.status).toBe(201)
    expect((await markup.json()).comment.text).toBe('<b>wider</b> <script>x()</script>\nplease')
    // Up to 500 characters as people count them (an emoji is one), and a name up to 40.
    expect((await send(pin('a'.repeat(TEXT_MAX), { name: 'n'.repeat(NAME_MAX) }))).status).toBe(201)
    expect((await send(pin('🏠'.repeat(TEXT_MAX)))).status).toBe(201)
    const cp = String.fromCodePoint
    const refused: [unknown, string][] = [
      [pin('a'.repeat(TEXT_MAX + 1)), 'too-long'],
      [pin('ok', { name: 'n'.repeat(NAME_MAX + 1) }), 'too-long'],
      [pin('   '), 'bad-request'],
      [pin(''), 'bad-request'],
      [pin(`bell${cp(7)}`), 'bad-text'],
      [pin(`nul${cp(0)}`), 'bad-text'],
      [pin(`tab${cp(9)}here`), 'bad-text'],
      [pin(`turned ${cp(0x202e)}around`), 'bad-text'],
      [pin(`split${cp(0x2028)}line`), 'bad-text'],
      [pin('ok', { name: `two\nlines` }), 'bad-text'],
      [pin('ok', { name: 42 }), 'bad-request'],
      [pin(42 as unknown as string), 'bad-request'],
      [pin('ok', { floor: '../x' }), 'bad-request'],
      [pin('ok', { floor: '' }), 'bad-request'],
      [pin('ok', { x: 'east' }), 'bad-request'],
      [pin('ok', { y: Number.MAX_VALUE }), 'bad-request'],
      [pin('ok', { y: null }), 'bad-request'],
      [[], 'bad-request'],
    ]
    for (const [body, code] of refused) {
      const res = await send(body)
      expect(res.status, JSON.stringify(body).slice(0, 60)).toBe(400)
      expect((await res.json()).error, JSON.stringify(body).slice(0, 60)).toBe(code)
    }
    // Not JSON, or far too big.
    s.clock.now += SHARE_WINDOW
    expect((await v.raw('/api/shared/comments', { method: 'POST', headers: { ...v.headers(), [CSRF_HEADER]: '1' }, body: 'not json' })).status).toBe(400)
    expect((await send(pin('x'.repeat(10_000)))).status).toBe(413)
    // A browser with no token of its own (or a made-up one) can't send: it couldn't see it again.
    for (const token of [null, 'short']) expect((await commenter(s, link.token, { token, ip: '203.0.113.30' }).add(pin())).status).toBe(400)
    expect((await seen(await v.list())).comments).toHaveLength(3)
  })

  it('rounds the spot to the millimetre and keeps the floor it was pinned on', async () => {
    const { s, link } = await shared('own')
    const res = await commenter(s, link.token).add(pin('Here', { floor: 'level_first', x: 334512.123456, y: 6251234.98765 }))
    expect((await res.json()).comment).toMatchObject({ floor: 'level_first', x: 334512.123, y: 6251234.988 })
  })

  it('needs the app’s header, from the app’s own site', async () => {
    const { s, link } = await shared('own')
    const v = commenter(s, link.token)
    const body = JSON.stringify(pin())
    expect((await v.raw('/api/shared/comments', { method: 'POST', headers: v.headers(), body })).status).toBe(403)
    expect((await v.raw('/api/shared/comments', { method: 'POST', headers: { ...v.headers(), [CSRF_HEADER]: '1', origin: 'https://elsewhere.example' }, body })).status).toBe(403)
    expect((await v.raw('/api/shared/comments', { method: 'POST', headers: { ...v.headers(), [CSRF_HEADER]: '1', 'sec-fetch-site': 'cross-site' }, body })).status).toBe(403)
    expect((await v.raw('/api/shared/comments', { method: 'PUT', headers: { ...v.headers(), [CSRF_HEADER]: '1' }, body })).status).toBe(405)
    expect((await seen(await v.list())).comments).toEqual([])
  })
})

describe('a link that doesn’t open takes no comments and shows none', () => {
  /** A link with a comment on it, and someone who wrote it. */
  async function withComment() {
    const t = await shared('all')
    const v = commenter(t.s, t.link.token)
    expect((await v.add(pin('Before'))).status).toBe(201)
    return { ...t, v }
  }
  const gone = async (v: ReturnType<typeof commenter>, message?: RegExp) => {
    for (const res of [await v.list(), await v.add(pin('After'))]) {
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBe('link-off')
      if (message) expect(body.message).toMatch(message)
      expect(JSON.stringify(body)).not.toMatch(/Before|Ana/)
      expect(res.headers.get('x-robots-tag')).toContain('noindex')
    }
  }

  it('turned off', async () => {
    const { ana, link, v } = await withComment()
    await ana.fetch(`/api/projects/p_home/shares/${link.id}`, { method: 'DELETE', headers: { [CSRF_HEADER]: '1' } })
    await gone(v, /turned off/)
  })

  it('ended', async () => {
    const { s, link, v } = await withComment()
    s.env.DB.sqlite.prepare('UPDATE share_links SET expires = ? WHERE token_hash = ?').run(s.clock.now, link.id)
    await gone(v, /ended/)
  })

  it('for a project that was deleted', async () => {
    const { ana, v } = await withComment()
    await ana.fetch('/api/projects/p_home/commit', post({ base: 1, meta: meta('Ana’s house', { archived: true }), records: {} }))
    expect((await ana.fetch('/api/projects/p_home?base=2', { method: 'DELETE', headers: { [CSRF_HEADER]: '1' } })).status).toBe(200)
    await gone(v)
  })

  it('for an account being deleted', async () => {
    const { ana, v } = await withComment()
    await ana.fetch('/api/account/delete', post({}))
    await gone(v)
  })

  it('or a token that is wrong', async () => {
    const { s, link } = await withComment()
    await gone(commenter(s, link.token.slice(0, -1) + (link.token.endsWith('A') ? 'B' : 'A')))
  })
})

describe('limits on comments', () => {
  it('takes a few from one address in ten minutes, then asks it to wait; another address still can', async () => {
    const { s, link } = await shared('own')
    const v = commenter(s, link.token)
    for (let i = 0; i < IP_MAX; i++) expect((await v.add(pin(`n${i}`))).status).toBe(201)
    const res = await v.add(pin('one more'))
    expect(res.status).toBe(429)
    expect((await res.json()).message).toMatch(/Wait a little/)
    expect((await commenter(s, link.token, { ip: '203.0.113.99' }).add(pin('from elsewhere'))).status).toBe(201)
    s.clock.now += SHARE_WINDOW
    expect((await v.add(pin('later'))).status).toBe(201)
  })

  it('takes so many a day on one link, from any address, then waits for tomorrow', async () => {
    const { s, link } = await shared('own')
    s.clock.now = Math.floor(s.clock.now / DAY) * DAY + 1000
    for (let i = 0; i < DAY_MAX; i++) expect((await commenter(s, link.token, { ip: `198.51.100.${i}` }).add(pin(`n${i}`))).status).toBe(201)
    const res = await commenter(s, link.token, { ip: '198.51.100.250' }).add(pin('one more'))
    expect(res.status).toBe(429)
    expect((await res.json()).message).toMatch(/tomorrow/)
    s.clock.now += DAY
    expect((await commenter(s, link.token, { ip: '198.51.100.251' }).add(pin('next day'))).status).toBe(201)
  })

  it('holds 200 on a link at most, and the owner deleting one makes room', async () => {
    const { s, ana, link } = await shared('own')
    const db = s.env.DB.sqlite
    const add = db.prepare("INSERT INTO share_comments (id, link_id, user_id, project_id, floor, x, y, text, name, created, resolved, viewer_hash) VALUES (?, ?, ?, 'p_home', 'level_ground', 0, 0, 'old', NULL, ?, NULL, 'h')")
    for (let i = 0; i < COMMENTS_MAX - 1; i++) add.run(`c${String(i).padStart(15, '0')}`, link.id, ana.id, i)
    const v = commenter(s, link.token)
    expect((await v.add(pin('the last one'))).status).toBe(201)
    const full = await v.add(pin('too many'))
    expect(full.status).toBe(409)
    expect((await full.json()).error).toBe('too-many-comments')
    expect((await remove(ana, `c${'0'.repeat(15)}`)).status).toBe(200)
    expect((await v.add(pin('room again'))).status).toBe(201)
    expect(db.prepare('SELECT COUNT(*) AS n FROM share_comments').get()).toEqual({ n: COMMENTS_MAX })
  })

  it('keeps each request to a handful of D1 queries (the free plan allows 50)', async () => {
    const { s, ana, link } = await shared('all')
    const db = s.env.DB
    const prepare = db.prepare.bind(db)
    let n = 0
    db.prepare = sql => {
      n++
      return prepare(sql)
    }
    const queries = async (go: () => Promise<Response>) => {
      n = 0
      const res = await go()
      expect(res.status).toBeLessThan(300)
      return n
    }
    const v = commenter(s, link.token)
    const made = await v.add(pin())
    const id = (await made.json()).comment.id
    expect(await queries(() => v.add(pin('again')))).toBeLessThanOrEqual(8)
    expect(await queries(() => v.list())).toBeLessThanOrEqual(5)
    expect(await queries(() => ana.fetch('/api/projects/p_home/comments'))).toBeLessThanOrEqual(5)
    expect(await queries(() => resolve(ana, id))).toBeLessThanOrEqual(4)
    expect(await queries(() => setMode(ana, link.id, 'own'))).toBeLessThanOrEqual(4)
    expect(await queries(() => remove(ana, id))).toBeLessThanOrEqual(4)
  })
})

describe('the owner’s comments (signed in)', () => {
  it('lists the project’s comments newest first, with which link, and how many each link has and how many are new', async () => {
    const { s, ana, link } = await shared('own')
    const made = s.clock.now
    s.clock.now += 1000
    const second = await ana.share('p_home', { comments: 'all', days: 90 })
    await commenter(s, link.token).add(pin('One', { name: 'Sam' }))
    s.clock.now += 1000
    await commenter(s, second.token, { ip: '203.0.113.21' }).add(pin('Two'))
    s.clock.now += 1000
    await commenter(s, second.token, { ip: '203.0.113.22' }).add(pin('Three'))
    const got = await ownerList(ana)
    expect(got.comments.map(c => [c.text, c.link, c.name])).toEqual([
      ['Three', second.id, null],
      ['Two', second.id, null],
      ['One', link.id, 'Sam'],
    ])
    expect(got.comments[2]).toEqual({ id: expect.any(String), link: link.id, floor: 'level_ground', x: 1012.5, y: 1008.25, text: 'One', name: 'Sam', created: s.clock.now - 2000, resolved: null })
    // Nothing that says who in the browser, ever.
    expect(JSON.stringify(got)).not.toContain('viewer')
    // Each link by when it was made and ends, so the app can name it.
    expect(got.links).toEqual({ [link.id]: { created: made, expires: made + 30 * DAY, total: 1, new: 1 }, [second.id]: { created: made + 1000, expires: made + 1000 + 90 * DAY, total: 2, new: 2 } })
    expect(LIST_MAX).toBeGreaterThanOrEqual(COMMENTS_MAX)
  })

  it('resolves a comment (the viewer sees it was), can make it new again, and deletes one for good', async () => {
    const { s, ana, link } = await shared('own')
    const v = commenter(s, link.token)
    const id = (await (await v.add(pin('Move the laundry'))).json()).comment.id
    const done = await resolve(ana, id)
    expect(done.status).toBe(200)
    expect((await done.json()).comment).toMatchObject({ id, resolved: s.clock.now })
    const at = s.clock.now
    s.clock.now += 5000
    // Resolving again keeps when it was first resolved.
    expect((await (await resolve(ana, id)).json()).comment.resolved).toBe(at)
    expect(await counts(ana, link.id)).toEqual({ total: 1, new: 0 })
    expect((await seen(await v.list())).comments[0].resolved).toBe(true)
    // New again (Undo).
    expect((await (await resolve(ana, id, { resolved: false })).json()).comment.resolved).toBeNull()
    expect(await counts(ana, link.id)).toEqual({ total: 1, new: 1 })

    expect((await remove(ana, id)).status).toBe(200)
    expect((await ownerList(ana)).comments).toEqual([])
    expect((await seen(await v.list())).comments).toEqual([])
    expect((await remove(ana, id)).status).toBe(404)
    expect((await resolve(ana, id)).status).toBe(404)
    for (const bad of ['short', 'x'.repeat(40)]) expect((await remove(ana, bad)).status).toBe(400)
  })

  it('needs the session and the app’s header', async () => {
    const { s, ana, link } = await shared('own')
    const id = (await (await commenter(s, link.token).add(pin())).json()).comment.id
    const stranger = s.browser()
    expect((await stranger('/api/projects/p_home/comments')).status).toBe(401)
    expect((await stranger(`/api/projects/p_home/comments/${id}/resolve`, post({}))).status).toBe(401)
    expect((await stranger(`/api/projects/p_home/comments/${id}`, { method: 'DELETE', headers: { [CSRF_HEADER]: '1' } })).status).toBe(401)
    expect((await ana.fetch(`/api/projects/p_home/comments/${id}/resolve`, { method: 'POST' })).status).toBe(403)
    expect((await ana.fetch(`/api/projects/p_home/comments/${id}`, { method: 'DELETE' })).status).toBe(403)
    // A link's token opens nothing of the owner's side.
    expect((await stranger('/api/projects/p_home/comments', { headers: { 'x-bhp-share': link.token } })).status).toBe(401)
    expect((await ownerList(ana)).comments[0].resolved).toBeNull()
  })

  it('hides a link’s comments as soon as it is turned off, brings them back with Undo, and deletes them once Undo has passed', async () => {
    const { s, ana, link } = await shared('own')
    await commenter(s, link.token).add(pin('Keep me?'))
    const off = () => ana.fetch(`/api/projects/p_home/shares/${link.id}`, { method: 'DELETE', headers: { [CSRF_HEADER]: '1' } })
    await off()
    expect(await ownerList(ana)).toEqual({ comments: [], links: {} })
    expect(await tidyComments(s.env, s.clock.now)).toBe(0)
    expect((await ana.fetch(`/api/projects/p_home/shares/${link.id}/restore`, post({}))).status).toBe(200)
    expect((await ownerList(ana)).comments.map(c => c.text)).toEqual(['Keep me?'])
    await off()
    s.clock.now += UNDO_MS + 1
    expect(await tidyComments(s.env, s.clock.now)).toBe(1)
    expect(s.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM share_comments').get()).toEqual({ n: 0 })
  })

  it('deletes a deleted project’s comments, from the Worker’s hourly trigger, and keeps those of links that ended', async () => {
    const { s, ana, link } = await shared('own')
    await commenter(s, link.token).add(pin('On a deleted project'))
    await ana.save('p_other', 'Other', {})
    const ended = await ana.share('p_other', { comments: 'own' })
    await commenter(s, ended.token).add(pin('On a link that ended'))
    s.env.DB.sqlite.prepare('UPDATE share_links SET expires = ? WHERE token_hash = ?').run(s.clock.now + 1, ended.id)
    await ana.fetch('/api/projects/p_home/commit', post({ base: 1, meta: meta('Ana’s house', { archived: true }), records: {} }))
    await ana.fetch('/api/projects/p_home?base=2', { method: 'DELETE', headers: { [CSRF_HEADER]: '1' } })
    s.clock.now += UNDO_MS + 1
    const waits: Promise<unknown>[] = []
    const real = Date.now
    Date.now = () => s.clock.now
    try {
      await worker.scheduled({}, s.env, { waitUntil: p => void waits.push(p) })
      await Promise.all(waits)
    } finally {
      Date.now = real
    }
    expect((s.env.DB.sqlite.prepare('SELECT text FROM share_comments').all() as { text: string }[]).map(r => r.text)).toEqual(['On a link that ended'])
    // What was said on a link that ended still shows to its owner.
    expect((await ownerList(ana, 'p_other')).comments.map(c => c.text)).toEqual(['On a link that ended'])
  })
})
