// Passkey sign-in against the Worker, with a software passkey that signs for real: sign-up and
// its gate, sign-in, the recovery code, sessions and their cookie, the CSRF guard, rate limits.

import { describe, expect, it } from 'vitest'
import { inviteCodes, normalizeCode } from '../src/auth'
import { softPasskey } from './authenticator'
import { ORIGIN, post, testServer, type TestServer } from './fakes'

type Fetch = typeof fetch

async function signUp(f: Fetch, key: ReturnType<typeof softPasskey>, name = 'Test Person', invite?: string) {
  const opts = await (await f('/api/auth/signup/options', post({ name, invite }))).json()
  if (!opts.options) return { status: 'refused', body: opts } as const
  const response = await key.create(opts.options)
  const res = await f('/api/auth/signup/verify', post({ challengeId: opts.challengeId, response, invite }))
  return { status: res.status, body: await res.json(), res } as const
}

async function signIn(f: Fetch, key: ReturnType<typeof softPasskey>) {
  const opts = await (await f('/api/auth/login/options', post({}))).json()
  const response = await key.get(opts.options)
  const res = await f('/api/auth/login/verify', post({ challengeId: opts.challengeId, response }))
  return { status: res.status, body: await res.json(), res }
}

const me = async (f: Fetch) => (await (await f('/api/session')).json()).user

describe('signing up with a passkey', () => {
  it('makes the account, signs in, and gives a one-time recovery code', async () => {
    const s = testServer()
    const key = softPasskey(ORIGIN)
    expect((await (await s.fetch('/api/health')).json()).signup).toBe('open')
    const r = await signUp(s.fetch, key)
    expect(r.status).toBe(200)
    expect(r.body.user.name).toBe('Test Person')
    expect(r.body.recoveryCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/)
    expect((await me(s.fetch))?.name).toBe('Test Person')
    // Only hashes are kept: neither the code nor the cookie's token is in the database.
    const dump = JSON.stringify([...s.env.DB.sqlite.prepare('SELECT * FROM recovery_codes').all(), ...s.env.DB.sqlite.prepare('SELECT * FROM sessions').all()])
    expect(dump).not.toContain(normalizeCode(r.body.recoveryCode))
    const cookie = r.res!.headers.getSetCookie()[0]
    expect(cookie).toMatch(/^__Host-bhp_session=[\w-]{40,};/)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(dump).not.toContain(cookie.split(';')[0].split('=')[1])
  })

  it('lets only the first person in by default, then closes', async () => {
    const s = testServer()
    await signUp(s.fetch, softPasskey(ORIGIN), 'Owner')
    expect((await (await s.fetch('/api/health')).json()).signup).toBe('closed')
    const stranger = await signUp(s.browser(), softPasskey(ORIGIN), 'Stranger')
    expect(stranger.status).toBe('refused')
    expect(stranger.body.error).toBe('signup-closed')
    expect(s.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 1 })
  })

  it('lets only one of two people racing for the first account in', async () => {
    const s = testServer()
    const [a, b] = [s.browser(), s.browser()]
    const [ka, kb] = [softPasskey(ORIGIN), softPasskey(ORIGIN)]
    const oa = await (await a('/api/auth/signup/options', post({ name: 'A' }))).json()
    const ob = await (await b('/api/auth/signup/options', post({ name: 'B' }))).json()
    const ra = await a('/api/auth/signup/verify', post({ challengeId: oa.challengeId, response: await ka.create(oa.options) }))
    const rb = await b('/api/auth/signup/verify', post({ challengeId: ob.challengeId, response: await kb.create(ob.options) }))
    expect([ra.status, rb.status]).toEqual([200, 403])
    expect(await me(b)).toBeNull()
    expect(s.env.DB.sqlite.prepare('SELECT COUNT(*) AS c FROM credentials').get()).toEqual({ c: 1 })
  })

  it('asks for the invite code when one is set, and refuses a wrong one', async () => {
    const s = testServer({ INVITE_CODE: 'garden-shed-42' })
    expect((await (await s.fetch('/api/health')).json()).signup).toBe('invite')
    expect((await signUp(s.fetch, softPasskey(ORIGIN), 'Me', 'wrong')).body.error).toBe('invite')
    expect((await signUp(s.fetch, softPasskey(ORIGIN), 'Me')).body.error).toBe('invite')
    expect((await signUp(s.fetch, softPasskey(ORIGIN), 'Me', ' garden-shed-42 ')).status).toBe(200)
    // The invite lets a second person in too.
    expect((await signUp(s.browser(), softPasskey(ORIGIN), 'Builder', 'garden-shed-42')).status).toBe(200)
  })

  it('notes a single code against each account, without keeping the code', async () => {
    const s = testServer({ INVITE_CODE: 'garden-shed-42' })
    await signUp(s.fetch, softPasskey(ORIGIN), 'Me', 'garden-shed-42')
    const row = s.env.DB.sqlite.prepare('SELECT invite FROM users').get() as { invite: string }
    expect(row.invite).toMatch(/^#[0-9a-f]{8}$/)
    expect(JSON.stringify(row)).not.toContain('garden-shed-42')
  })

  it('takes several codes, each with its own label, and notes which one let each person in', async () => {
    const s = testServer({ INVITE_CODE: 'friends:blue-gum-7, builders:oak-door-17\nspotted-quoll-3' })
    expect((await signUp(s.fetch, softPasskey(ORIGIN), 'Friend', 'blue-gum-7')).status).toBe(200)
    expect((await signUp(s.browser(), softPasskey(ORIGIN), 'Builder', 'oak-door-17')).status).toBe(200)
    expect((await signUp(s.browser(), softPasskey(ORIGIN), 'Neighbour', 'spotted-quoll-3')).status).toBe(200)
    // A label isn't a code, and nor is the whole list split another way.
    expect((await signUp(s.browser(), softPasskey(ORIGIN), 'Stranger', 'friends')).body.error).toBe('invite')
    expect((await signUp(s.browser(), softPasskey(ORIGIN), 'Stranger', 'blue-gum-7, builders')).body.error).toBe('invite')
    const rows = s.env.DB.sqlite.prepare('SELECT name, invite FROM users ORDER BY created, name').all() as { name: string; invite: string }[]
    const by = Object.fromEntries(rows.map(r => [r.name, r.invite]))
    expect(by.Friend).toBe('friends')
    expect(by.Builder).toBe('builders')
    expect(by.Neighbour).toMatch(/^#[0-9a-f]{8}$/)
  })

  it('lets one code be taken out without the others or anyone’s account changing', async () => {
    const s = testServer({ INVITE_CODE: 'friends:blue-gum-7,builders:oak-door-17' })
    const builder = softPasskey(ORIGIN)
    expect((await signUp(s.fetch, builder, 'Builder', 'oak-door-17')).status).toBe(200)
    // The builders' code got passed around: it's taken out of the list.
    s.env.INVITE_CODE = 'friends:blue-gum-7'
    expect((await signUp(s.browser(), softPasskey(ORIGIN), 'Someone', 'oak-door-17')).body.error).toBe('invite')
    expect((await signUp(s.browser(), softPasskey(ORIGIN), 'Friend', 'blue-gum-7')).status).toBe(200)
    // Whoever came in with it keeps their account.
    expect((await signIn(s.browser(), builder)).status).toBe(200)
  })

  it('reads the list forgivingly, and keeps a code with a colon or comma in it working as it did', async () => {
    expect(inviteCodes(' a:one ,\r\n, two ,:three')).toEqual([
      { label: 'a', code: 'one', entry: 'a:one' },
      { label: null, code: 'two', entry: 'two' },
      { label: null, code: ':three', entry: ':three' },
    ])
    expect(inviteCodes(undefined)).toEqual([])
    const colon = testServer({ INVITE_CODE: 'shed:42' })
    expect((await signUp(colon.fetch, softPasskey(ORIGIN), 'Me', 'shed:42')).status).toBe(200)
    const comma = testServer({ INVITE_CODE: 'red,blue' })
    expect((await signUp(comma.fetch, softPasskey(ORIGIN), 'Me', 'red,blue')).status).toBe(200)
    expect((await signUp(comma.browser(), softPasskey(ORIGIN), 'Me too', '')).body.error).toBe('invite')
  })

  it('stays shut when sign-up is closed', async () => {
    const s = testServer({ SIGNUP: 'closed' })
    expect((await (await s.fetch('/api/health')).json()).signup).toBe('closed')
    expect((await signUp(s.fetch, softPasskey(ORIGIN))).body.error).toBe('signup-closed')
  })

  it('wants a name, and not a long one', async () => {
    const s = testServer()
    expect((await (await s.fetch('/api/auth/signup/options', post({ name: '  ' }))).json()).error).toBe('name')
    expect((await (await s.fetch('/api/auth/signup/options', post({ name: 'x'.repeat(61) }))).json()).error).toBe('name')
  })

  it('refuses a passkey made for another site, or answering a challenge twice', async () => {
    const s = testServer()
    const key = softPasskey(ORIGIN)
    const opts = await (await s.fetch('/api/auth/signup/options', post({ name: 'Me' }))).json()
    const elsewhere = await key.create(opts.options, { origin: 'https://evil.example' })
    const bad = await s.fetch('/api/auth/signup/verify', post({ challengeId: opts.challengeId, response: elsewhere }))
    expect(bad.status).toBe(400)
    // The challenge was used up by that try.
    const again = await s.fetch('/api/auth/signup/verify', post({ challengeId: opts.challengeId, response: await key.create(opts.options) }))
    expect((await again.json()).error).toBe('expired')
  })

  it('lets a challenge run out after five minutes', async () => {
    const s = testServer()
    const opts = await (await s.fetch('/api/auth/signup/options', post({ name: 'Me' }))).json()
    s.clock.now += 6 * 60 * 1000
    const res = await s.fetch('/api/auth/signup/verify', post({ challengeId: opts.challengeId, response: await softPasskey(ORIGIN).create(opts.options) }))
    expect((await res.json()).error).toBe('expired')
  })
})

describe('signing in', () => {
  async function owner() {
    const s = testServer()
    const key = softPasskey(ORIGIN)
    const up = await signUp(s.fetch, key)
    return { s, key, code: up.body.recoveryCode as string }
  }

  it('signs in on another browser with the passkey, without typing a name', async () => {
    const { s, key } = await owner()
    const other = s.browser()
    expect(await me(other)).toBeNull()
    const r = await signIn(other, key)
    expect(r.status).toBe(200)
    expect((await me(other))?.name).toBe('Test Person')
    // The passkey's counter moved on.
    expect((s.env.DB.sqlite.prepare('SELECT counter FROM credentials').get() as { counter: number }).counter).toBe(1)
  })

  it('refuses a passkey the site doesn’t know', async () => {
    const { s } = await owner()
    const stranger = softPasskey(ORIGIN)
    await stranger.create({ challenge: 'AAAA', rp: {}, user: { id: 'AAAA' } })
    const r = await signIn(s.browser(), stranger)
    expect(r.body.error).toBe('unknown-passkey')
  })

  it('signs out, and the old cookie stops working', async () => {
    const { s } = await owner()
    const before = s.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get()
    const res = await s.fetch('/api/auth/logout', post({}))
    expect(res.headers.getSetCookie()[0]).toContain('Max-Age=0')
    expect(await me(s.fetch)).toBeNull()
    expect(before).toEqual({ n: 1 })
    expect(s.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 })
  })

  it('ends a session 30 days after the last visit', async () => {
    const { s } = await owner()
    s.clock.now += 20 * 86400_000
    expect(await me(s.fetch)).not.toBeNull() // and that visit moves the end on
    s.clock.now += 25 * 86400_000
    expect(await me(s.fetch)).not.toBeNull()
    s.clock.now += 31 * 86400_000
    expect(await me(s.fetch)).toBeNull()
  })

  it('adds a passkey for a second device while signed in', async () => {
    const { s } = await owner()
    const phone = softPasskey(ORIGIN)
    const opts = await (await s.fetch('/api/auth/passkey/options', post({}))).json()
    expect(opts.options.excludeCredentials).toHaveLength(1)
    const res = await s.fetch('/api/auth/passkey/verify', post({ challengeId: opts.challengeId, response: await phone.create(opts.options) }))
    expect(res.status).toBe(200)
    expect((await signIn(s.browser(), phone)).status).toBe(200)
    const acct = await (await s.fetch('/api/account')).json()
    expect(acct.passkeys).toHaveLength(2)
  })
})

describe('the recovery code', () => {
  it('adds a new passkey on a new device, signs in, and is then used up', async () => {
    const s = testServer()
    const up = await signUp(s.fetch, softPasskey(ORIGIN))
    const code = up.body.recoveryCode as string
    const lost = s.browser()
    const newKey = softPasskey(ORIGIN)
    // Typed loosely: lower case, spaces, an O for a zero.
    const typed = code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o')
    const opts = await (await lost('/api/auth/recover/options', post({ code: typed }))).json()
    expect(opts.options.user.name).toBe('Test Person')
    const res = await lost('/api/auth/recover/verify', post({ challengeId: opts.challengeId, response: await newKey.create(opts.options) }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.recoveryCode).not.toBe(code)
    expect((await me(lost))?.name).toBe('Test Person')
    expect((await signIn(s.browser(), newKey)).status).toBe(200)
    // The old code is spent; the new one works.
    expect((await (await s.browser()('/api/auth/recover/options', post({ code }))).json()).error).toBe('recovery-code')
    expect((await (await s.browser()('/api/auth/recover/options', post({ code: body.recoveryCode }))).json()).options).toBeTruthy()
  })

  it('works once even if used twice at the same time', async () => {
    const s = testServer()
    const code = (await signUp(s.fetch, softPasskey(ORIGIN))).body.recoveryCode
    const [a, b] = [s.browser(), s.browser()]
    const oa = await (await a('/api/auth/recover/options', post({ code }))).json()
    const ob = await (await b('/api/auth/recover/options', post({ code }))).json()
    const ra = await a('/api/auth/recover/verify', post({ challengeId: oa.challengeId, response: await softPasskey(ORIGIN).create(oa.options) }))
    const rb = await b('/api/auth/recover/verify', post({ challengeId: ob.challengeId, response: await softPasskey(ORIGIN).create(ob.options) }))
    expect([ra.status, rb.status]).toEqual([200, 400])
    expect(await me(b)).toBeNull()
    expect(s.env.DB.sqlite.prepare('SELECT COUNT(*) AS c FROM credentials').get()).toEqual({ c: 2 })
  })

  it('can be replaced while signed in', async () => {
    const s = testServer()
    const old = (await signUp(s.fetch, softPasskey(ORIGIN))).body.recoveryCode
    const fresh = (await (await s.fetch('/api/auth/recovery-code', post({}))).json()).recoveryCode
    expect(fresh).not.toBe(old)
    expect((await (await s.browser()('/api/auth/recover/options', post({ code: old }))).json()).error).toBe('recovery-code')
  })

  it('slows down someone guessing codes', async () => {
    const s = testServer()
    await signUp(s.fetch, softPasskey(ORIGIN))
    const guesser = s.browser()
    const statuses: number[] = []
    for (let i = 0; i < 10; i++) statuses.push((await guesser('/api/auth/recover/options', post({ code: 'AAAA-AAAA-AAAA-AAAA-AAAA' }))).status)
    expect(statuses.slice(0, 8).every(x => x === 400)).toBe(true)
    expect(statuses.slice(8)).toEqual([429, 429])
    // An hour later it can try again.
    s.clock.now += 61 * 60 * 1000
    expect((await guesser('/api/auth/recover/options', post({ code: 'AAAA-AAAA-AAAA-AAAA-AAAA' }))).status).toBe(400)
  })
})

describe('the CSRF guard and request limits', () => {
  const signedIn = async (): Promise<TestServer> => {
    const s = testServer()
    await signUp(s.fetch, softPasskey(ORIGIN))
    return s
  }

  it('refuses a change without the app’s header', async () => {
    const s = await signedIn()
    const res = await s.fetch('/api/auth/logout', { method: 'POST' })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('csrf')
    expect(await me(s.fetch)).not.toBeNull()
  })

  it('refuses a change from another site, even with the header', async () => {
    const s = await signedIn()
    const init = post({})
    for (const h of [{ origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' }] as Record<string, string>[]) {
      const res = await s.fetch('/api/auth/logout', { ...init, headers: { ...(init.headers as Record<string, string>), ...h } })
      expect(res.status).toBe(403)
    }
    expect(await me(s.fetch)).not.toBeNull()
  })

  it('lets reads through without the header, but only for the signed-in', async () => {
    const s = await signedIn()
    expect((await s.fetch('/api/projects')).status).toBe(200)
    expect((await s.browser()('/api/projects')).status).toBe(401)
  })

  it('refuses a body that is too large', async () => {
    const s = testServer()
    const res = await s.fetch('/api/auth/signup/options', post({ name: 'x', pad: 'y'.repeat(70 * 1024) }))
    expect(res.status).toBe(413)
  })

  it('rate-limits the sign-in endpoints', async () => {
    const s = testServer()
    let last = 0
    for (let i = 0; i < 41; i++) last = (await s.fetch('/api/auth/login/options', post({}))).status
    expect(last).toBe(429)
  })

  it('says what is wrong in plain words', async () => {
    const s = testServer()
    expect((await s.fetch('/api/nothing')).status).toBe(404)
    expect((await s.fetch('/api/health', post({}))).status).toBe(405)
  })
})
