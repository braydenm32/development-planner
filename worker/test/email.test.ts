// Email sign-in codes, the backup to passkeys, with Resend stubbed (./mail.ts: nothing reaches the
// network): adding an address, signing in with a code, every way a code can fail, the limits, and
// never saying whether an address has an account, or whose it is.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { purgeAccounts } from '../src/account'
import { EMAIL_FROM_DEFAULT, RESEND_URL } from '../src/email'
import { CODE_TRIES, EMAILS_A_DAY, cleanEmail, newEmailCode, typedCode } from '../src/emailAuth'
import worker from '../src/index'
import { ORIGIN, post } from './fakes'
import { RESEND_KEY, stubResend } from './mail'
import { DAY, person, rowsOf, server, type Person } from './people'

type Fetch = typeof fetch
type Mail = ReturnType<typeof stubResend>
const MINUTE = 60_000

/** A request from a given IP, so the per-IP limits can be told apart from the per-address ones. */
const from = (ip: string, init: RequestInit): RequestInit => ({ ...init, headers: { ...(init.headers as Record<string, string>), 'cf-connecting-ip': ip } })
const ask = (f: Fetch, email: string, ip = '198.51.100.7') => f('/api/auth/email/start', from(ip, post({ email })))
const use = (f: Fetch, email: string, code: string, ip = '198.51.100.7') => f('/api/auth/email/verify', from(ip, post({ email, code })))
const me = async (f: Fetch) => (await (await f('/api/session')).json()).user
const accountEmail = async (p: Person) => (await (await p.fetch('/api/account')).json()).email
/** A code that isn't this one. */
const notThe = (code: string) => (code === '000000' ? '111111' : '000000')

async function setUp() {
  const mail = stubResend()
  const s = server({ RESEND_API_KEY: RESEND_KEY })
  const ana = await person(s, 'Ana')
  return { s, mail, ana }
}

/** Add an address to someone's account, as the account sheet does. */
async function addEmail(p: Person, mail: Mail, email: string) {
  expect((await p.fetch('/api/account/email/start', post({ email }))).status).toBe(200)
  const res = await p.fetch('/api/account/email/confirm', post({ email, code: mail.codeFor(cleanEmail(email)!) }))
  expect(res.status).toBe(200)
}

const codeRows = (s: Awaited<ReturnType<typeof setUp>>['s']) => s.env.DB.sqlite.prepare('SELECT * FROM email_codes').all() as Record<string, unknown>[]

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('without RESEND_API_KEY', () => {
  it('is off: health says so and every email endpoint refuses, but an address can still be removed', async () => {
    const mail = stubResend()
    const s = server()
    const ana = await person(s, 'Ana')
    expect((await (await s.fetch('/api/health')).json()).email).toBe(false)
    const tries: [Fetch, string][] = [
      [s.browser(), '/api/auth/email/start'],
      [s.browser(), '/api/auth/email/verify'],
      [ana.fetch, '/api/account/email/start'],
      [ana.fetch, '/api/account/email/confirm'],
    ]
    for (const [f, path] of tries) {
      const res = await f(path, post({ email: 'ana@example.com', code: '123456' }))
      expect(res.status, path).toBe(404)
      expect((await res.json()).error, path).toBe('email-off')
    }
    expect((await ana.fetch('/api/account/email/remove', post({}))).status).toBe(200)
    expect(mail.fetch).not.toHaveBeenCalled()
    s.env.RESEND_API_KEY = RESEND_KEY
    expect((await (await s.fetch('/api/health')).json()).email).toBe(true)
  })
})

describe('adding an email to the account', () => {
  it('sends a code to the address, kept only as a hash, and the account shows it once the code is in', async () => {
    const { s, mail, ana } = await setUp()
    expect(await accountEmail(ana)).toBeNull()
    const start = await ana.fetch('/api/account/email/start', post({ email: '  Ana.Builder@Example.COM ' }))
    expect(start.status).toBe(200)
    expect(await start.json()).toEqual({ ok: true, email: 'ana.builder@example.com' })

    // What went to Resend: one POST, with the key, from the default sender, to the address as kept.
    expect(mail.fetch).toHaveBeenCalledTimes(1)
    expect(String(mail.fetch.mock.calls[0][0])).toBe(RESEND_URL)
    expect(RESEND_URL).toBe('https://api.resend.com/emails')
    const sent = mail.sent[0]
    expect(sent).toMatchObject({ method: 'POST', to: 'ana.builder@example.com', from: EMAIL_FROM_DEFAULT, authorization: `Bearer ${RESEND_KEY}`, contentType: 'application/json' })
    expect(EMAIL_FROM_DEFAULT).toBe('Contour & Gable <sign-in@contourandgable.com>')
    const code = mail.codeFor('ana.builder@example.com')
    expect(sent.subject).toBe(`${code} is your Contour & Gable code`)
    for (const body of [sent.text, sent.html]) {
      expect(body).toContain(code)
      expect(body.replace(/&amp;/g, '&')).toContain('It works for 10 minutes. If you didn’t ask for it, you can ignore this email.')
    }
    expect(sent.text).toContain('add this email to your account')
    // No links of any kind.
    expect(`${sent.text} ${sent.html}`).not.toMatch(/https?:|www\.|href|\.com/i)
    expect(JSON.stringify(codeRows(s))).not.toContain(code)
    // Not the account's until the code is in.
    expect(await accountEmail(ana)).toBeNull()

    const done = await ana.fetch('/api/account/email/confirm', post({ email: 'ana.builder@example.com', code }))
    expect(await done.json()).toEqual({ email: 'ana.builder@example.com' })
    expect(await accountEmail(ana)).toBe('ana.builder@example.com')
    expect(codeRows(s)).toEqual([])
  })

  it('needs the code for the address it went to', async () => {
    const { mail, ana } = await setUp()
    await ana.fetch('/api/account/email/start', post({ email: 'ana@example.com' }))
    const code = mail.codeFor('ana@example.com')
    expect((await ana.fetch('/api/account/email/confirm', post({ email: 'other@example.com', code }))).status).toBe(400)
    expect(await accountEmail(ana)).toBeNull()
    expect((await ana.fetch('/api/account/email/confirm', post({ email: 'ana@example.com', code }))).status).toBe(200)
  })

  it('won’t give one address to two accounts, and fails then as a wrong code does, without saying whose it is', async () => {
    const { s, mail, ana } = await setUp()
    const ben = await person(s, 'Ben')
    await addEmail(ana, mail, 'shared@example.com')
    // Asking looks the same as for any address: the code goes to whoever reads that inbox.
    const start = await ben.fetch('/api/account/email/start', post({ email: 'Shared@example.com' }))
    expect(start.status).toBe(200)
    expect(await start.json()).toEqual({ ok: true, email: 'shared@example.com' })
    const code = mail.codeFor('shared@example.com')
    const wrong = await ben.fetch('/api/account/email/confirm', post({ email: 'shared@example.com', code: notThe(code) }))
    const taken = await ben.fetch('/api/account/email/confirm', post({ email: 'shared@example.com', code }))
    expect(taken.status).toBe(wrong.status)
    const text = await taken.text()
    expect(text).toBe(await wrong.text())
    expect(text).not.toMatch(/Ana|another account|taken/i)
    expect(text).not.toContain(ana.id)
    expect(await accountEmail(ana)).toBe('shared@example.com')
    expect(await accountEmail(ben)).toBeNull()
  })

  it('changes it only once the new address’s code is in, and the old one then stops signing in', async () => {
    const { s, mail, ana } = await setUp()
    await addEmail(ana, mail, 'old@example.com')
    await ask(s.browser(), 'old@example.com')
    const waiting = mail.codeFor('old@example.com')
    await ana.fetch('/api/account/email/start', post({ email: 'new@example.com' }))
    expect(await accountEmail(ana)).toBe('old@example.com')
    expect((await ana.fetch('/api/account/email/confirm', post({ email: 'new@example.com', code: mail.codeFor('new@example.com') }))).status).toBe(200)
    expect(await accountEmail(ana)).toBe('new@example.com')
    // The sign-in code sent to the old address before the change doesn't work, and no more go there.
    expect((await use(s.browser(), 'old@example.com', waiting)).status).toBe(400)
    const n = mail.sent.length
    expect((await ask(s.browser(), 'old@example.com', '198.51.100.8')).status).toBe(200)
    expect(mail.sent).toHaveLength(n)
    await ask(s.browser(), 'new@example.com')
    expect((await use(s.browser(), 'new@example.com', mail.codeFor('new@example.com'))).status).toBe(200)
  })

  it('removes it, with any code waiting', async () => {
    const { s, mail, ana } = await setUp()
    await addEmail(ana, mail, 'ana@example.com')
    await ask(s.browser(), 'ana@example.com')
    const waiting = mail.codeFor('ana@example.com')
    expect(await (await ana.fetch('/api/account/email/remove', post({}))).json()).toEqual({ email: null })
    expect(await accountEmail(ana)).toBeNull()
    expect(codeRows(s)).toEqual([])
    expect((await use(s.browser(), 'ana@example.com', waiting)).status).toBe(400)
    const n = mail.sent.length
    await ask(s.browser(), 'ana@example.com', '198.51.100.9')
    expect(mail.sent).toHaveLength(n)
  })

  it('needs to be signed in, with the app’s header', async () => {
    const { s, ana } = await setUp()
    for (const path of ['/api/account/email/start', '/api/account/email/confirm', '/api/account/email/remove']) expect((await s.browser()(path, post({ email: 'ana@example.com', code: '123456' }))).status, path).toBe(401)
    const res = await ana.fetch('/api/account/email/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ana@example.com' }) })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('csrf')
  })
})

describe('signing in with an emailed code', () => {
  it('signs in on a new browser with the address and its code, as a passkey sign-in does', async () => {
    const { s, mail, ana } = await setUp()
    await addEmail(ana, mail, 'ana@example.com')
    const phone = s.browser()
    const asked = await ask(phone, ' ANA@example.com')
    expect(asked.status).toBe(200)
    expect(await asked.json()).toEqual({ ok: true })
    const code = mail.codeFor('ana@example.com')
    expect(mail.to('ana@example.com').at(-1)!.text).toContain('to sign in')
    // Typed with a space, as some apps show it.
    const res = await use(phone, 'ana@example.com', `${code.slice(0, 3)} ${code.slice(3)}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ user: { id: ana.id, name: 'Ana', deleteAfter: null } })
    expect(res.headers.getSetCookie()[0]).toMatch(/^__Host-bhp_session=[\w-]{40,}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/)
    expect((await me(phone))?.id).toBe(ana.id)
    expect((await phone('/api/projects')).status).toBe(200)
    expect(codeRows(s)).toEqual([])
    // Only hashes: no code in the database.
    expect(JSON.stringify(s.env.DB.sqlite.prepare('SELECT * FROM rate_limits').all())).not.toContain('ana@example.com')
  })

  it('refuses a wrong code, and the right one still works after', async () => {
    const { s, mail, ana } = await setUp()
    await addEmail(ana, mail, 'ana@example.com')
    const f = s.browser()
    await ask(f, 'ana@example.com')
    const code = mail.codeFor('ana@example.com')
    const wrong = await use(f, 'ana@example.com', notThe(code))
    expect(wrong.status).toBe(400)
    expect(await wrong.json()).toEqual({ error: 'email-code', message: 'That code didn’t work. Check it, or ask for a new one: each code works once, for 10 minutes.' })
    expect(await me(f)).toBeNull()
    expect((await use(f, 'ana@example.com', code)).status).toBe(200)
  })

  it('says what a code looks like when it isn’t six numbers', async () => {
    const { s } = await setUp()
    const res = await use(s.browser(), 'ana@example.com', '12345')
    expect(res.status).toBe(400)
    expect((await res.json()).message).toMatch(/6 numbers/)
    expect((await (await ask(s.browser(), 'not an address')).json()).error).toBe('email')
  })

  it('works once, even if used twice at the same moment', async () => {
    const { s, mail, ana } = await setUp()
    await addEmail(ana, mail, 'ana@example.com')
    await ask(s.browser(), 'ana@example.com')
    const code = mail.codeFor('ana@example.com')
    const [a, b] = await Promise.all([use(s.browser(), 'ana@example.com', code), use(s.browser(), 'ana@example.com', code)])
    expect([a.status, b.status].sort()).toEqual([200, 400])
    expect((await use(s.browser(), 'ana@example.com', code)).status).toBe(400)
  })

  it('runs out after 10 minutes', async () => {
    const { s, mail, ana } = await setUp()
    await addEmail(ana, mail, 'ana@example.com')
    await ask(s.browser(), 'ana@example.com')
    s.clock.now += 10 * MINUTE
    expect((await use(s.browser(), 'ana@example.com', mail.codeFor('ana@example.com'))).status).toBe(400)
    expect(codeRows(s)).toEqual([])
  })

  it('is dead after five wrong tries, even for the right code then', async () => {
    const { s, mail, ana } = await setUp()
    await addEmail(ana, mail, 'ana@example.com')
    await ask(s.browser(), 'ana@example.com')
    const code = mail.codeFor('ana@example.com')
    expect(CODE_TRIES).toBe(5)
    for (let i = 0; i < CODE_TRIES; i++) expect((await use(s.browser(), 'ana@example.com', notThe(code))).status).toBe(400)
    expect(codeRows(s)).toEqual([])
    expect((await use(s.browser(), 'ana@example.com', code)).status).toBe(400)
  })

  it('lets four wrong tries go, then the right code in', async () => {
    const { s, mail, ana } = await setUp()
    await addEmail(ana, mail, 'ana@example.com')
    await ask(s.browser(), 'ana@example.com')
    const code = mail.codeFor('ana@example.com')
    for (let i = 0; i < CODE_TRIES - 1; i++) await use(s.browser(), 'ana@example.com', notThe(code))
    expect((await use(s.browser(), 'ana@example.com', code)).status).toBe(200)
  })

  it('replaces the old code when asked again', async () => {
    const { s, mail, ana } = await setUp()
    await addEmail(ana, mail, 'ana@example.com')
    await ask(s.browser(), 'ana@example.com')
    const first = mail.codeFor('ana@example.com')
    await ask(s.browser(), 'ana@example.com')
    const second = mail.codeFor('ana@example.com')
    expect(codeRows(s)).toHaveLength(1)
    if (first !== second) expect((await use(s.browser(), 'ana@example.com', first)).status).toBe(400)
    expect((await use(s.browser(), 'ana@example.com', second)).status).toBe(200)
  })

  it('answers the same whether or not an address has an account, and sends only when one does', async () => {
    const { s, mail, ana } = await setUp()
    const ben = await person(s, 'Ben')
    await addEmail(ana, mail, 'ana@example.com')
    // An address only being added (its code not yet in) has no account either.
    await ben.fetch('/api/account/email/start', post({ email: 'pending@example.com' }))
    const before = mail.sent.length
    const replies = [await ask(s.browser(), 'ana@example.com', '198.51.100.1'), await ask(s.browser(), 'nobody@example.com', '198.51.100.2'), await ask(s.browser(), 'pending@example.com', '198.51.100.3')]
    const shape = async (r: Response) => ({ status: r.status, headers: [...r.headers].filter(([k]) => k !== 'date'), body: await r.text() })
    const [known, ...unknown] = await Promise.all(replies.map(shape))
    for (const u of unknown) expect(u).toEqual(known)
    expect(known.headers.some(([k]) => k === 'set-cookie')).toBe(false)
    expect(mail.sent.slice(before).map(m => m.to)).toEqual(['ana@example.com'])

    // A guess at a code fails the same way for both.
    const code = mail.codeFor('ana@example.com')
    const guesses = [await use(s.browser(), 'ana@example.com', notThe(code), '198.51.100.4'), await use(s.browser(), 'nobody@example.com', notThe(code), '198.51.100.5')]
    const [g1, g2] = await Promise.all(guesses.map(shape))
    expect(g2).toEqual(g1)

    // And the limit on asking counts both alike (from a fresh 15 minutes).
    s.clock.now += 15 * MINUTE
    const more = async (email: string) => {
      const out = []
      for (let i = 0; i < 4; i++) out.push(await shape(await ask(s.browser(), email, `192.0.2.${email.length * 10 + i}`)))
      return out
    }
    const a = await more('ana@example.com')
    const n = await more('nobody@example.com')
    expect(a.map(r => r.status)).toEqual([200, 200, 200, 429])
    expect(n).toEqual(a)
  })

  it('sends after replying, so how long Resend takes says nothing', async () => {
    const { s, mail, ana } = await setUp()
    await addEmail(ana, mail, 'ana@example.com')
    let letGo!: () => void
    mail.hold = new Promise<void>(r => (letGo = r))
    const later: Promise<unknown>[] = []
    const req = new Request(`${ORIGIN}/api/auth/email/start`, from('198.51.100.20', post({ email: 'ana@example.com' })))
    const res = await worker.fetch(req, s.env, { waitUntil: p => void later.push(p) })
    expect(res.status).toBe(200)
    expect(later).toHaveLength(1)
    expect(mail.to('ana@example.com')).toHaveLength(1)
    letGo()
    await Promise.all(later)
    expect(mail.to('ana@example.com')).toHaveLength(2)
  })

  it('signs in to an account within its 30 days after asking to delete it, as a passkey does, and not after', async () => {
    const { s, mail, ana } = await setUp()
    await addEmail(ana, mail, 'ana@example.com')
    const { deleteAfter } = await (await ana.fetch('/api/account/delete', post({}))).json()
    s.clock.now += 10 * DAY
    const f = s.browser()
    await ask(f, 'ana@example.com')
    const back = await use(f, 'ana@example.com', mail.codeFor('ana@example.com'))
    expect(back.status).toBe(200)
    expect((await back.json()).user.deleteAfter).toBe(deleteAfter)
    // Signed in, but nothing more is saved meanwhile, a new address included; it can still be removed.
    expect((await (await f('/api/account/email/start', post({ email: 'new@example.com' }))).json()).error).toBe('account-deleting')

    // A code asked for just before the 30 days are up, then none after.
    s.clock.now = deleteAfter - 5 * MINUTE
    await ask(s.browser(), 'ana@example.com', '198.51.100.30')
    const late = mail.codeFor('ana@example.com')
    s.clock.now = deleteAfter
    const n = mail.sent.length
    expect((await ask(s.browser(), 'ana@example.com', '198.51.100.31')).status).toBe(200)
    expect(mail.sent).toHaveLength(n)
    // The code that's still in time meets a deleted account, as a passkey would.
    const gone = await use(s.browser(), 'ana@example.com', late, '198.51.100.32')
    expect((await gone.json()).error).toBe('account-deleted')
  })
})

describe('the limits on asking for codes', () => {
  it('allows 3 an address in 15 minutes and 10 a day, said plainly', async () => {
    const { s } = await setUp()
    let ip = 0
    const once = async () => {
      const r = await ask(s.browser(), 'someone@example.com', `203.0.113.${ip++}`)
      return { status: r.status, message: (await r.json()).message as string | undefined }
    }
    const first = [await once(), await once(), await once(), await once()]
    expect(first.map(r => r.status)).toEqual([200, 200, 200, 429])
    expect(first[3].message).toBe('Too many codes asked for. Try again in a few minutes.')
    const rest = []
    for (let w = 0; w < 3; w++) {
      s.clock.now += 15 * MINUTE
      for (let i = 0; i < 3; i++) rest.push(await once())
    }
    // 3 + 3 + 3 + 1 = 10 in the day.
    expect(rest.map(r => r.status)).toEqual([200, 200, 200, 200, 200, 200, 200, 429, 429])
    expect(rest[7].message).toBe('Too many codes asked for today. Try again tomorrow, or use your passkey or recovery code.')
    // Not one of them names the address.
    expect(JSON.stringify(s.env.DB.sqlite.prepare('SELECT key FROM rate_limits').all())).not.toContain('someone')
  })

  it('allows 20 tries at codes for an address a day, however many codes are asked for', async () => {
    const { s, mail, ana } = await setUp()
    await addEmail(ana, mail, 'ana@example.com')
    // A new day: typing the code that added the address counted too.
    s.clock.now += DAY
    let ip = 0
    const tries: number[] = []
    for (let c = 0; c < 4; c++) {
      if (c === 2) s.clock.now += 15 * MINUTE
      await ask(s.browser(), 'ana@example.com', `203.0.113.${100 + c}`)
      const code = mail.codeFor('ana@example.com')
      for (let i = 0; i < 5; i++) tries.push((await use(s.browser(), 'ana@example.com', notThe(code), `198.18.0.${ip++}`)).status)
    }
    expect(tries).toEqual(Array(20).fill(400))
    await ask(s.browser(), 'ana@example.com', '203.0.113.120')
    const right = await use(s.browser(), 'ana@example.com', mail.codeFor('ana@example.com'), '198.18.1.1')
    expect(right.status).toBe(429)
    expect((await right.json()).message).toBe('Too many wrong codes for this email today. Try again tomorrow, or use your passkey or recovery code.')
    // The same for an address with no account.
    const none: number[] = []
    for (let i = 0; i < 21; i++) none.push((await use(s.browser(), 'nobody@example.com', '123456', `198.18.2.${i}`)).status)
    expect(none).toEqual([...Array(20).fill(400), 429])
  })

  it('allows 10 an hour from one IP, whatever the addresses', async () => {
    const { s } = await setUp()
    const statuses = []
    for (let i = 0; i < 11; i++) statuses.push((await ask(s.browser(), `p${i}@example.com`, '192.0.2.50')).status)
    expect(statuses).toEqual([...Array(10).fill(200), 429])
  })

  it('stops sending for the day at the cap, which only emails sent count towards', async () => {
    const { s, mail, ana } = await setUp()
    await addEmail(ana, mail, 'ana@example.com')
    // Asking for addresses with no account sends nothing, so it can't use up the day's emails.
    for (let i = 0; i < 5; i++) await ask(s.browser(), `junk${i}@example.com`, `192.0.2.${60 + i}`)
    const count = () => (s.env.DB.sqlite.prepare("SELECT count FROM rate_limits WHERE key = 'email-sent'").get() as { count: number }).count
    expect(count()).toBe(1)
    s.env.DB.sqlite.prepare("UPDATE rate_limits SET count = ? WHERE key = 'email-sent'").run(EMAILS_A_DAY)
    const n = mail.sent.length
    // Signed out, the reply is as ever (it can't say an address has an account), but nothing goes.
    expect((await ask(s.browser(), 'ana@example.com', '192.0.2.70')).status).toBe(200)
    expect(mail.sent).toHaveLength(n)
    // Signed in, adding an address says so.
    const adding = await ana.fetch('/api/account/email/start', post({ email: 'new@example.com' }))
    expect(adding.status).toBe(429)
    expect((await adding.json()).message).toBe('Too many email codes have gone out today. Try again tomorrow, or use your passkey or recovery code.')
    expect(mail.sent).toHaveLength(n)
  })
})

describe('when things go wrong', () => {
  it('says plainly when an email can’t go, keeps no code for it, and logs neither address nor code', async () => {
    const { s, mail, ana } = await setUp()
    const logs: string[] = []
    for (const m of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(' ')))
    mail.status = 422
    const bad = await ana.fetch('/api/account/email/start', post({ email: 'ana@nowhere.example' }))
    expect(bad.status).toBe(400)
    expect((await bad.json()).error).toBe('email')
    mail.status = 500
    const down = await ana.fetch('/api/account/email/start', post({ email: 'ana@example.com' }))
    expect(down.status).toBe(500)
    expect(await down.json()).toEqual({ error: 'email-send', message: 'The email didn’t go. Try again in a few minutes.' })
    expect(codeRows(s)).toEqual([])
    // A sign-in code that doesn't go is only noted.
    mail.status = 200
    await addEmail(ana, mail, 'ana@example.com')
    mail.status = 500
    expect((await ask(s.browser(), 'ana@example.com')).status).toBe(200)
    expect(logs.length).toBeGreaterThan(0)
    const codes = mail.sent.map(m => /\d{6}/.exec(m.subject)![0])
    for (const line of logs) {
      expect(line).not.toMatch(/example/)
      for (const c of codes) expect(line).not.toContain(c)
    }
  })

  it('refuses a body that is too large', async () => {
    const { s } = await setUp()
    expect((await s.browser()('/api/auth/email/start', post({ email: 'ana@example.com', pad: 'x'.repeat(70 * 1024) }))).status).toBe(413)
  })
})

describe('deleting', () => {
  it('takes the address and any code waiting when the account goes for good, and leaves others’', async () => {
    const { s, mail, ana } = await setUp()
    const ben = await person(s, 'Ben')
    await addEmail(ana, mail, 'ana@example.com')
    await addEmail(ben, mail, 'ben@example.com')
    await ben.fetch('/api/account/email/start', post({ email: 'ben.new@example.com' }))
    const bens = rowsOf(s, ben.id)
    const { deleteAfter } = await (await ana.fetch('/api/account/delete', post({}))).json()
    s.clock.now = deleteAfter - 5 * MINUTE
    await ask(s.browser(), 'ana@example.com')
    expect(codeRows(s).filter(r => r.user_id === ana.id)).toHaveLength(1)
    s.clock.now = deleteAfter
    expect(await purgeAccounts(s.env, s.clock.now)).toEqual([ana.id])
    for (const [table, rows] of Object.entries(rowsOf(s, ana.id))) expect(rows, table).toEqual([])
    const db = s.env.DB.sqlite
    expect(JSON.stringify(db.prepare('SELECT * FROM users').all())).not.toContain('ana@example.com')
    expect(JSON.stringify(db.prepare('SELECT * FROM rate_limits').all())).not.toContain(ana.id)
    // Ben's code ran out meanwhile; the rest of his is as it was.
    expect({ ...rowsOf(s, ben.id), email_codes: [] }).toEqual({ ...bens, email_codes: [] })
  })

  it('clears away codes that ran out, hourly', async () => {
    const { s, ana } = await setUp()
    await ana.fetch('/api/account/email/start', post({ email: 'typo@exmaple.com' }))
    expect(codeRows(s)).toHaveLength(1)
    vi.useFakeTimers({ now: s.clock.now + 11 * MINUTE, toFake: ['Date'] })
    const waits: Promise<unknown>[] = []
    await worker.scheduled({}, s.env, { waitUntil: p => void waits.push(p) })
    await Promise.all(waits)
    expect(codeRows(s)).toEqual([])
  })
})

describe('addresses and codes', () => {
  it('keeps an address trimmed and lower case, and refuses what can’t be one', () => {
    expect(cleanEmail('  Ana@Example.COM ')).toBe('ana@example.com')
    expect(cleanEmail('a.b+plans@sub.example.com.au')).toBe('a.b+plans@sub.example.com.au')
    const local = 'a'.repeat(64)
    const domain = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}.com`
    expect(`${local}@${domain}`).toHaveLength(254)
    expect(cleanEmail(`${local}@${domain}`)).not.toBeNull()
    const bad: unknown[] = [
      '',
      'ana',
      'ana@',
      '@example.com',
      'ana@@example.com',
      'a@b@example.com',
      'ana@example',
      'ana @example.com',
      'ana@exa mple.com',
      'ana@-example.com',
      'ana@example..com',
      '<ana@example.com>',
      'ana@example.com\nbcc: x@example.org',
      `a${local}@example.com`,
      `${local}@b${domain}`,
      42,
      null,
    ]
    for (const b of bad) expect(cleanEmail(b), String(b)).toBeNull()
  })

  it('reads a code as typed or pasted', () => {
    for (const ok of ['123456', ' 123 456 ', '123-456']) expect(typedCode(ok)).toBe('123456')
    for (const no of ['12345', '1234567', 'abcdef', '12345a', 123456, null]) expect(typedCode(no)).toBeNull()
  })

  it('makes six digits, throwing away a draw that would favour low codes', () => {
    for (let i = 0; i < 200; i++) expect(newEmailCode()).toMatch(/^\d{6}$/)
    const draws = [4_294_967_295, 4_294_000_000, 1_000_123]
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(a: T): T => {
      ;(a as unknown as Uint32Array)[0] = draws.shift()!
      return a
    })
    expect(newEmailCode()).toBe('000123')
    expect(spy).toHaveBeenCalledTimes(3)
  })
})
