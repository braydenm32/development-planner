// Email sign-in, the backup to passkeys: a 6-digit code emailed to an address the account's owner
// added, and proved they read, from the account sheet. Sign-up stays invite code + passkey.
//
//   add      signed in → an address → a `verify` code to it → that code → users.email
//   remove   signed in → users.email goes, with any code waiting
//   sign in  signed out → an address → a `signin` code to it, only if an account has it (the
//            reply is the same either way, and as quick) → the address and code → a session,
//            exactly as a passkey gives one
//
// Codes: 6 digits without modulo bias; only a hash kept, bound to the account, the address and
// the purpose; single use; 10 minutes; 5 wrong tries and it's dead; asking again replaces it.
// Every way a code can fail says the same thing, so nothing tells whether an address has an
// account, or, when adding one another account has, whose it is. Neither codes nor addresses are
// logged or sent back.

import { canSave } from './account'
import { accountGone, limitAuth, signedIn } from './auth'
import { emailOn, sendCode, SendError, type CodePurpose } from './email'
import type { Env, WaitUntil } from './env'
import { HttpError, json, readJson, sameSecret, sha256Hex } from './http'
import { clientIp, LIVE_ACCOUNT, rateLimit, requireUser, sessionInsert, type User } from './session'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
/** How long a code works. */
export const CODE_MINUTES = 10
/** Wrong tries a code takes before it's dead. */
export const CODE_TRIES = 5
/** Emails sent in a day, at most, whoever asks: Resend's free plan sends 100 a day. */
export const EMAILS_A_DAY = 100

// ---------------------------------------------------------------------------
// Addresses and codes.

// The HTML form's own rule for an address (WHATWG), lower case, with a dot in the domain.
const ADDRESS = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

/** An address as it's kept: trimmed and lower-cased. Null if it can't be one (at most 254 characters, one @). */
export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 320) return null
  const e = raw.trim().toLowerCase()
  if (e.length > 254 || !ADDRESS.test(e) || e.indexOf('@') > 64) return null
  return e
}

function needEmail(raw: unknown): string {
  const e = cleanEmail(raw)
  if (!e) throw new HttpError(400, 'email', 'That doesn’t look like an email address. Check it and try again.')
  return e
}

/** Six digits, each of the million codes as likely as any other. */
export function newEmailCode(): string {
  // 4,294,000,000 is the last multiple of a million below 2³²: a draw at or past it is thrown
  // away, so `% 1,000,000` favours no code.
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0]
    if (n < 4_294_000_000) return String(n % 1_000_000).padStart(6, '0')
  }
}

/** The code as typed ("123 456", "123-456" and pasted ones too): six digits, or null. */
export function typedCode(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 40) return null
  const d = raw.replace(/[\s-]/g, '')
  return /^\d{6}$/.test(d) ? d : null
}

function needCode(raw: unknown): string {
  const c = typedCode(raw)
  if (!c) throw new HttpError(400, 'email-code', 'A code is 6 numbers. Check the email and try again.')
  return c
}

const codeHash = (purpose: CodePurpose, userId: string, email: string, code: string) => sha256Hex(`bhp-email:${purpose}:${userId}:${email}:${code}`)

const emailOff = () => new HttpError(404, 'email-off', 'Email sign-in isn’t on here. Sign in with your passkey, or use your recovery code.')

/** Every failure to use a code, whatever the reason. */
const codeFailed = () => new HttpError(400, 'email-code', 'That code didn’t work. Check it, or ask for a new one: each code works once, for 10 minutes.')

const TOO_MANY = 'Too many codes asked for. Try again in a few minutes.'
const TOO_MANY_TODAY = 'Too many codes asked for today. Try again tomorrow, or use your passkey or recovery code.'
const BUSY_TODAY = 'Too many email codes have gone out today. Try again tomorrow, or use your passkey or recovery code.'
const TOO_MANY_TRIES = 'Too many wrong codes for this email today. Try again tomorrow, or use your passkey or recovery code.'

/** An address in rate_limits' keys: a hash, so that table never holds an address. */
const addressKey = async (email: string) => (await sha256Hex(`bhp-email-limit:${email}`)).slice(0, 32)

/** Limits on asking for a code, the same for every address whether or not it has an account: per IP, and per address. */
async function limitAsks(env: Env, req: Request, email: string, now: number) {
  const who = await addressKey(email)
  await rateLimit(env, `email-ip:${clientIp(req)}`, 10, HOUR, now, TOO_MANY)
  await rateLimit(env, `email:${who}`, 3, 15 * MINUTE, now, TOO_MANY)
  await rateLimit(env, `email-day:${who}`, 10, DAY, now, TOO_MANY_TODAY)
}

/**
 * Limits on typing a code in: per IP, and per address across all its codes in a day, so asking
 * for new ones doesn't buy more guesses (each code takes 5; 20 a day in all is 1 in 50,000).
 */
async function limitTries(env: Env, req: Request, email: string, now: number) {
  await rateLimit(env, `email-try:${clientIp(req)}`, 30, HOUR, now)
  await rateLimit(env, `email-try-day:${await addressKey(email)}`, 20, DAY, now, TOO_MANY_TRIES)
}

/** Count an email about to go against the day's cap, so a flood can't use up the free plan. */
const countSend = (env: Env, now: number) => rateLimit(env, 'email-sent', EMAILS_A_DAY, DAY, now, BUSY_TODAY)

/**
 * Make a code and keep its hash, in place of any the account had for this purpose. With no
 * account (an address nobody has), the same work is done and nothing kept, so it takes as long.
 */
async function saveCode(env: Env, userId: string | null, purpose: CodePurpose, email: string, now: number): Promise<string> {
  const code = newEmailCode()
  const hash = await codeHash(purpose, userId ?? '', email, code)
  const tidy = env.DB.prepare('DELETE FROM email_codes WHERE expires < ?').bind(now)
  if (!userId) {
    await tidy.run()
    return code
  }
  await env.DB.batch([
    tidy,
    env.DB.prepare(
      'INSERT INTO email_codes (user_id, purpose, email, hash, expires, attempts, created) VALUES (?, ?, ?, ?, ?, 0, ?) ON CONFLICT(user_id, purpose) DO UPDATE SET email = excluded.email, hash = excluded.hash, expires = excluded.expires, attempts = 0, created = excluded.created',
    ).bind(userId, purpose, email, hash, now + CODE_MINUTES * MINUTE, now),
  ])
  return code
}

interface CodeRow {
  user_id: string
  email: string
  hash: string
  attempts: number
  expires: number
}

const NO_ROW: CodeRow = { user_id: '', email: '', hash: '', attempts: 0, expires: 0 }

/**
 * Use a code: the try is counted first (so tries at the same moment can't get past five), then
 * checked, and a matching code is deleted as it's used, so only one request gets it. A code
 * that's run out, or had its five tries, goes too. The account whose code it was, or null.
 *
 * A failed try takes the same steps whether or not there was a code (one update, a hash, one
 * delete), so how long it takes doesn't say either.
 */
async function spendCode(env: Env, purpose: CodePurpose, email: string, code: string, now: number, userId?: string): Promise<string | null> {
  const [where, key] = userId ? ['user_id = ? AND purpose = ?', userId] : ['email = ? AND purpose = ?', email]
  const rows = (await env.DB.prepare(`UPDATE email_codes SET attempts = attempts + 1 WHERE ${where} RETURNING user_id, email, hash, attempts, expires`).bind(key, purpose).all<CodeRow>()).results
  let match: CodeRow | null = null
  for (const r of rows.length ? rows : [NO_ROW]) {
    const right = sameSecret(await codeHash(purpose, r.user_id, email, code), r.hash)
    if (r !== NO_ROW && right && r.email === email && r.attempts <= CODE_TRIES && r.expires > now) match = r
  }
  if (!match) {
    await env.DB.prepare(`DELETE FROM email_codes WHERE ${where} AND (attempts >= ? OR expires <= ?)`).bind(key, purpose, CODE_TRIES, now).run()
    return null
  }
  const taken = await env.DB.prepare('DELETE FROM email_codes WHERE user_id = ? AND purpose = ? AND hash = ? RETURNING user_id').bind(match.user_id, purpose, match.hash).first<{ user_id: string }>()
  return taken?.user_id ?? null
}

/** Run `p` after the reply has gone (in production), or before it (in tests, which have no ctx). */
async function afterReply(ctx: WaitUntil | undefined, p: Promise<unknown>) {
  if (ctx) ctx.waitUntil(p)
  else await p
}

/** Clear away codes that ran out (the hourly clean-up, beside the purge of deleted accounts). */
export const tidyEmailCodes = (env: Env, now: number) => env.DB.prepare('DELETE FROM email_codes WHERE expires < ?').bind(now).run()

// ---------------------------------------------------------------------------
// Signed out: sign in with a code.

/** Ask for a sign-in code. The reply is the same whether or not an account has the address. */
export async function emailSigninStart(env: Env, req: Request, now: number, ctx?: WaitUntil): Promise<Response> {
  await limitAuth(env, req, now)
  if (!emailOn(env)) throw emailOff()
  const email = needEmail((await readJson<{ email?: unknown }>(req)).email)
  await limitAsks(env, req, email, now)
  // An account past its 30 days after asking to delete it has no address any more, as far as this goes.
  const account = await env.DB.prepare(`SELECT u.id AS id FROM users u WHERE u.email = ? AND ${LIVE_ACCOUNT}`).bind(email, now).first<{ id: string }>()
  const code = await saveCode(env, account?.id ?? null, 'signin', email, now)
  // Sent after the reply, so how long Resend takes doesn't say whether it was sent; and a failure
  // can't be told either, so it's only noted (without the address or the code).
  if (account)
    await afterReply(
      ctx,
      (async () => {
        try {
          await countSend(env, now)
          await sendCode(env, email, code, 'signin')
        } catch (e) {
          console.warn('A sign-in code wasn’t sent:', e instanceof HttpError ? 'the day’s emails are used up' : (e as Error)?.message)
        }
      })(),
    )
  return json({ ok: true })
}

/** The address and its code: a session, as a passkey sign-in starts one. */
export async function emailSigninVerify(env: Env, req: Request, now: number): Promise<Response> {
  await limitAuth(env, req, now)
  if (!emailOn(env)) throw emailOff()
  const body = await readJson<{ email?: unknown; code?: unknown }>(req)
  const email = needEmail(body.email)
  const code = needCode(body.code)
  await limitTries(env, req, email, now)
  const userId = await spendCode(env, 'signin', email, code, now)
  if (!userId) throw codeFailed()
  // Still this account's address (it can't have changed in the 10 minutes without the code going, but check).
  const user = await env.DB.prepare('SELECT id, name, delete_after AS deleteAfter FROM users WHERE id = ? AND email = ?').bind(userId, email).first<User>()
  if (!user) throw codeFailed()
  // Within its 30 days a deleted account can still be signed in to, to keep it, as with a passkey.
  if (user.deleteAfter !== null && user.deleteAfter <= now) throw accountGone()
  const session = await sessionInsert(env, user.id, now)
  await session.stmt.run()
  return signedIn(user, session.token)
}

// ---------------------------------------------------------------------------
// Signed in: add or change the address, or remove it.

/** Send a code to an address being added (or changed to), to prove it's theirs. */
export async function emailAddStart(env: Env, req: Request, now: number): Promise<Response> {
  await limitAuth(env, req, now)
  const user = canSave(await requireUser(env, req, now))
  if (!emailOn(env)) throw emailOff()
  const email = needEmail((await readJson<{ email?: unknown }>(req)).email)
  await rateLimit(env, `email-add:${user.id}`, 10, HOUR, now, TOO_MANY)
  await limitAsks(env, req, email, now)
  // Sent even to an address another account has, so asking says nothing about it; the
  // confirming fails, as a wrong code does.
  await countSend(env, now)
  const code = await saveCode(env, user.id, 'verify', email, now)
  try {
    await sendCode(env, email, code, 'verify')
  } catch (e) {
    await env.DB.prepare('DELETE FROM email_codes WHERE user_id = ? AND purpose = ?').bind(user.id, 'verify').run()
    if (e instanceof SendError && e.badAddress) throw new HttpError(400, 'email', 'That address can’t be sent to. Check it and try again.')
    console.warn('A code to add an email wasn’t sent:', (e as Error)?.message)
    throw new HttpError(500, 'email-send', 'The email didn’t go. Try again in a few minutes.')
  }
  return json({ ok: true, email })
}

/** The code from that email: the address becomes the account's, for signing in. */
export async function emailAddConfirm(env: Env, req: Request, now: number): Promise<Response> {
  await limitAuth(env, req, now)
  const user = canSave(await requireUser(env, req, now))
  if (!emailOn(env)) throw emailOff()
  const body = await readJson<{ email?: unknown; code?: unknown }>(req)
  const email = needEmail(body.email)
  const code = needCode(body.code)
  await limitTries(env, req, email, now)
  if (!(await spendCode(env, 'verify', email, code, now, user.id))) throw codeFailed()
  let changes = 0
  try {
    const [set] = await env.DB.batch([
      env.DB.prepare('UPDATE users SET email = ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM users WHERE email = ? AND id <> ?)').bind(email, user.id, email, user.id),
      // A sign-in code sent to the old address stops working.
      env.DB.prepare("DELETE FROM email_codes WHERE user_id = ? AND purpose = 'signin'").bind(user.id),
    ])
    changes = set.meta.changes
  } catch (e) {
    // Another account took it at the same moment (users.email is UNIQUE).
    if (!/unique/i.test((e as Error)?.message ?? '')) throw e
  }
  if (!changes) throw codeFailed()
  return json({ email })
}

/** Remove the address (works even with email sign-in off, and while the account is being deleted). */
export async function emailRemove(env: Env, req: Request, now: number): Promise<Response> {
  await limitAuth(env, req, now)
  const user = await requireUser(env, req, now)
  await env.DB.batch([env.DB.prepare('UPDATE users SET email = NULL WHERE id = ?').bind(user.id), env.DB.prepare('DELETE FROM email_codes WHERE user_id = ?').bind(user.id)])
  return json({ email: null })
}
