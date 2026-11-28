// Signing the desktop app in: a link the app asks for, approved by a signed-in browser, then
// collected once with the app's secret as a Bearer token. The app's requests come from its own
// origin with CORS, and never use a cookie.

import { describe, expect, it } from 'vitest'
import { CSRF_HEADER } from '../src/api'
import { cleanLinkCode, LINK_MINUTES, newLinkCode } from '../src/appLink'
import { ORIGIN, post } from './fakes'
import { DAY, person, server } from './people'

const APP = 'tauri://localhost'
const MINUTE = 60_000

type Fetch = typeof fetch

/** The desktop app: its own origin, no cookies, its token once it has one. */
function desktop(s: ReturnType<typeof server>, origin = APP) {
  const f = s.browser()
  let token: string | null = null
  const call: Fetch = (input, init = {}) => {
    const headers = new Headers(init.headers)
    headers.set('origin', origin)
    headers.set('sec-fetch-site', 'cross-site')
    if (token) headers.set('authorization', `Bearer ${token}`)
    return f(input, { ...init, headers })
  }
  return {
    fetch: call,
    setToken: (t: string | null) => void (token = t),
    async start() {
      const res = await call('/api/app/link', post({}))
      expect(res.status).toBe(200)
      return (await res.json()) as { code: string; secret: string; url: string; expires: number }
    },
    claim: (code: string, secret: string) => call('/api/app/link/claim', post({ code, secret })),
  }
}

describe('link codes', () => {
  it('are eight letters and digits that cannot be misread, and read back however they are typed', () => {
    for (let i = 0; i < 50; i++) {
      const c = newLinkCode()
      expect(c).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/)
      expect(cleanLinkCode(c.toLowerCase().replace('-', ' '))).toBe(c)
    }
    expect(cleanLinkCode('ABCD-EFG0')).toBeNull()
    expect(cleanLinkCode('ABC')).toBeNull()
    expect(cleanLinkCode(42)).toBeNull()
  })
})

describe('signing the desktop app in', () => {
  it('works end to end: start, approve in the browser, claim once, then the app is signed in with its token', async () => {
    const s = server()
    const ana = await person(s, 'Ana')
    await ana.save('p1', 'Shed', {})
    const app = desktop(s)
    const link = await app.start()
    expect(link.url).toBe(`${ORIGIN}/?app-link=${encodeURIComponent(link.code)}`)
    // Not yet approved: the app waits.
    expect((await app.claim(link.code, link.secret)).status).toBe(202)
    // The browser checks it, then approves it.
    expect(await (await ana.fetch(`/api/app/link/${link.code}`)).json()).toMatchObject({ code: link.code, approved: false })
    expect((await ana.fetch(`/api/app/link/${link.code}/approve`, post({}))).status).toBe(200)
    const got = await app.claim(link.code, link.secret)
    expect(got.status).toBe(200)
    const { token, user } = await got.json()
    expect(user).toMatchObject({ id: ana.id, name: 'Ana' })
    expect(got.headers.get('access-control-allow-origin')).toBe(APP)
    // Used once.
    expect((await app.claim(link.code, link.secret)).status).toBe(404)
    app.setToken(token)
    expect((await (await app.fetch('/api/session')).json()).user.id).toBe(ana.id)
    const list = await (await app.fetch('/api/projects')).json()
    expect(list.projects.map((p: { id: string }) => p.id)).toEqual(['p1'])
    // It can save too.
    expect((await app.fetch('/api/projects/p2/commit', post({ base: 0, meta: { name: 'House', created: 1, updated: 2, archived: false, surveyFileName: null, thumbnail: null, numbers: null }, records: {} }))).status).toBe(200)
    // Signing out ends that token only; the browser stays signed in.
    expect((await app.fetch('/api/auth/logout', post({}))).status).toBe(200)
    expect((await (await app.fetch('/api/session')).json()).user).toBeNull()
    expect((await (await ana.fetch('/api/session')).json()).user.id).toBe(ana.id)
  })

  it('gives nothing for a wrong secret, a link nobody approved, or one that ran out', async () => {
    const s = server()
    const ana = await person(s, 'Ana')
    const app = desktop(s)
    const link = await app.start()
    await ana.fetch(`/api/app/link/${link.code}/approve`, post({}))
    expect((await app.claim(link.code, 'not-the-secret')).status).toBe(404)
    expect((await app.claim('ZZZZ-ZZZZ', link.secret)).status).toBe(404)
    const late = await app.start()
    await ana.fetch(`/api/app/link/${late.code}/approve`, post({}))
    s.clock.now += (LINK_MINUTES + 1) * MINUTE
    expect((await app.claim(late.code, late.secret)).status).toBe(404)
    expect((await ana.fetch(`/api/app/link/${late.code}`)).status).toBe(404)
  })

  it('is approved only by a signed-in browser, never by a token or someone else after the first', async () => {
    const s = server()
    const ana = await person(s, 'Ana')
    const ben = await person(s, 'Ben')
    const app = desktop(s)
    const link = await app.start()
    // Signed out: no.
    const stranger = s.browser()
    expect((await stranger(`/api/app/link/${link.code}/approve`, post({}))).status).toBe(401)
    // With a Bearer token: no.
    const res = await stranger(`/api/app/link/${link.code}/approve`, { ...post({}), headers: { ...post({}).headers, authorization: 'Bearer abc' } })
    expect(res.status).toBe(403)
    // Ana approves; Ben can't take it over.
    expect((await ana.fetch(`/api/app/link/${link.code}/approve`, post({}))).status).toBe(200)
    expect((await ben.fetch(`/api/app/link/${link.code}/approve`, post({}))).status).toBe(404)
    const { user } = await (await app.claim(link.code, link.secret)).json()
    expect(user.id).toBe(ana.id)
  })

  it('never uses a cookie on a request from the app, and lets no other origin in', async () => {
    const s = server()
    const ana = await person(s, 'Ana')
    // Ana's own browser, saying it is the app: her cookie is ignored.
    const asApp = (path: string, init: RequestInit = {}) => ana.fetch(path, { ...init, headers: { ...(init.headers as Record<string, string>), origin: APP } })
    expect((await (await asApp('/api/session')).json()).user).toBeNull()
    expect((await asApp('/api/projects')).status).toBe(401)
    // Another site: refused, and no CORS.
    const other = await ana.fetch('/api/projects/p1/commit', { ...post({ base: 0, meta: {}, records: {} }), headers: { ...post({}).headers, origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } })
    expect(other.status).toBe(403)
    expect(other.headers.get('access-control-allow-origin')).toBeNull()
    // The app still needs the X-BHP header on a change.
    const bare = await desktop(s).fetch('/api/app/link', { method: 'POST', body: '{}' })
    expect(bare.status).toBe(403)
  })

  it('answers the CORS check for the app only', async () => {
    const s = server()
    const pre = (origin: string) => s.browser()('/api/projects', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': `authorization, ${CSRF_HEADER}` } })
    for (const origin of [APP, 'http://tauri.localhost']) {
      const res = await pre(origin)
      expect(res.status).toBe(204)
      expect(res.headers.get('access-control-allow-origin')).toBe(origin)
      expect(res.headers.get('access-control-allow-headers')).toContain('authorization')
    }
    expect((await pre('https://evil.example')).headers.get('access-control-allow-origin')).toBeNull()
  })

  it('ends the app’s session too when the account is deleted, and app tokens last 30 days from last use', async () => {
    const s = server()
    const ana = await person(s, 'Ana')
    const app = desktop(s)
    const link = await app.start()
    await ana.fetch(`/api/app/link/${link.code}/approve`, post({}))
    app.setToken((await (await app.claim(link.code, link.secret)).json()).token)
    s.clock.now += 29 * DAY
    expect((await (await app.fetch('/api/session')).json()).user.id).toBe(ana.id)
    s.clock.now += 29 * DAY
    expect((await (await app.fetch('/api/session')).json()).user.id).toBe(ana.id)
    // Her browser wasn't used in that time, so it signs in again.
    expect((await ana.signIn()).status).toBe(200)
    expect((await ana.fetch('/api/account/delete', post({}))).status).toBe(200)
    expect((await (await app.fetch('/api/session')).json()).user).toBeNull()
  })

  it('limits how many links one address can ask for', async () => {
    const s = server()
    const app = desktop(s)
    for (let i = 0; i < 20; i++) expect((await app.fetch('/api/app/link', post({}))).status).toBe(200)
    expect((await app.fetch('/api/app/link', post({}))).status).toBe(429)
  })
})
