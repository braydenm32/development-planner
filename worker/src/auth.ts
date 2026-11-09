// Passkey sign-in (WebAuthn, through @simplewebauthn/server) and the one-time recovery code.
//
//   sign up      name (+ invite code when the gate asks) → a passkey → account, session, recovery code
//   sign in      a passkey this site knows (discoverable, so no name to type) → session
//   recover      the recovery code → a new passkey on this device → session and a new code
//   add passkey  signed in → another passkey (a second device)
//
// Challenges are single use and last five minutes. Every endpoint here is rate limited.

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import type { Env } from './env'
import { b64url, fromB64url, HttpError, json, randomBytes, randomId, readJson, sameSecret, sha256Hex } from './http'
import { clearedCookie, clientIp, endSession, rateLimit, requireUser, sessionCookie, sessionInsert, type User } from './session'

const RP_NAME = 'Contour & Gable'
const CHALLENGE_MS = 5 * 60 * 1000
const MINUTE = 60 * 1000
/** EdDSA, ES256 and RS256: what platform passkeys use. Fixed, so options and checks agree. */
const ALGORITHMS = [-8, -7, -257]

export type Signup = 'open' | 'invite' | 'closed'

/** Who may create an account now (see Env.SIGNUP). */
export async function signupState(env: Env): Promise<Signup> {
  const mode = (env.SIGNUP ?? 'first').trim().toLowerCase()
  if (mode === 'closed') return 'closed'
  if (env.INVITE_CODE) return 'invite'
  if (mode === 'open') return 'open'
  const any = await env.DB.prepare('SELECT 1 AS x FROM users LIMIT 1').first()
  return any ? 'closed' : 'open'
}

function relyingParty(env: Env, req: Request) {
  const url = new URL(req.url)
  return { rpID: env.RP_ID || url.hostname, origin: url.origin }
}

async function limitAuth(env: Env, req: Request, now: number) {
  await rateLimit(env, `auth:${clientIp(req)}`, 40, 10 * MINUTE, now)
}

// ---------------------------------------------------------------------------
// Recovery codes: 20 characters of Crockford base32 (100 random bits), in groups of four.

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function newRecoveryCode(): string {
  const bytes = randomBytes(20)
  let s = ''
  for (let i = 0; i < 20; i++) s += ALPHABET[bytes[i] & 31]
  return s.match(/.{4}/g)!.join('-')
}

/** The code as typed, made comparable: case, spaces, dashes and look-alike letters don't matter. */
export function normalizeCode(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

const codeHash = (code: string) => sha256Hex(`bhp-recovery:${normalizeCode(code)}`)

// ---------------------------------------------------------------------------
// Challenges.

async function saveChallenge(env: Env, kind: string, challenge: string, now: number, userId: string | null, data: unknown = null): Promise<string> {
  const id = randomId(16)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM challenges WHERE expires < ?').bind(now),
    env.DB.prepare('INSERT INTO challenges (id, kind, challenge, user_id, data, expires) VALUES (?, ?, ?, ?, ?, ?)').bind(
      id,
      kind,
      challenge,
      userId,
      data === null ? null : JSON.stringify(data),
      now + CHALLENGE_MS,
    ),
  ])
  return id
}

interface Challenge {
  challenge: string
  user_id: string | null
  data: string | null
  expires: number
}

/** Take a challenge (it can be answered once). */
async function takeChallenge(env: Env, id: unknown, kind: string, now: number): Promise<Challenge> {
  if (typeof id !== 'string' || id.length > 64) throw new HttpError(400, 'bad-request', 'The request was not readable.')
  const row = await env.DB.prepare('DELETE FROM challenges WHERE id = ? AND kind = ? RETURNING challenge, user_id, data, expires').bind(id, kind).first<Challenge>()
  if (!row || row.expires < now) throw new HttpError(400, 'expired', 'That took too long. Try again.')
  return row
}

function cleanName(name: unknown): string {
  const n = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim() : ''
  if (!n) throw new HttpError(400, 'name', 'Give the account a name, so your passkey is easy to find.')
  if (n.length > 60 || /\p{Cc}/u.test(n)) throw new HttpError(400, 'name', 'Use a shorter name (60 letters at most).')
  return n
}

const signedIn = (user: User, token: string, extra: Record<string, unknown> = {}) => json({ user, ...extra }, 200, { 'set-cookie': sessionCookie(token) })

const notVerified = (e?: unknown) => {
  if (e) console.warn('passkey check failed:', (e as Error)?.message)
  return new HttpError(400, 'passkey', 'That passkey didn’t check out. Try again.')
}

async function userCredentials(env: Env, userId: string) {
  const rows = await env.DB.prepare('SELECT id, transports FROM credentials WHERE user_id = ?').bind(userId).all<{ id: string; transports: string | null }>()
  return rows.results.map(r => ({ id: r.id, transports: r.transports ? (JSON.parse(r.transports) as string[]) : undefined }))
}

function registrationOptions(env: Env, req: Request, user: User, exclude: { id: string; transports?: string[] }[] = []) {
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: relyingParty(env, req).rpID,
    userName: user.name,
    userDisplayName: user.name,
    userID: fromB64url(user.id),
    attestationType: 'none',
    excludeCredentials: exclude,
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    supportedAlgorithmIDs: ALGORITHMS,
  })
}

async function checkRegistration(env: Env, req: Request, response: unknown, challenge: string) {
  const { rpID, origin } = relyingParty(env, req)
  let result
  try {
    result = await verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      supportedAlgorithmIDs: ALGORITHMS,
    })
  } catch (e) {
    throw notVerified(e)
  }
  if (!result.verified) throw notVerified()
  const { credential, credentialBackedUp } = result.registrationInfo
  return { credential, backedUp: credentialBackedUp }
}

function credentialInsert(env: Env, userId: string, c: { credential: { id: string; publicKey: Uint8Array; counter: number; transports?: string[] }; backedUp: boolean }, now: number) {
  return env.DB.prepare(
    'INSERT INTO credentials (id, user_id, public_key, counter, transports, backed_up, created) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)',
  ).bind(c.credential.id, userId, b64url(c.credential.publicKey), c.credential.counter, c.credential.transports ? JSON.stringify(c.credential.transports) : null, c.backedUp ? 1 : 0, now, userId)
}

// ---------------------------------------------------------------------------
// Sign up.

export async function signupOptions(env: Env, req: Request, now: number): Promise<Response> {
  await limitAuth(env, req, now)
  const body = await readJson<{ name?: unknown; invite?: unknown }>(req)
  const name = cleanName(body.name)
  await checkGate(env, body.invite)
  const user = { id: randomId(16), name }
  const options = await registrationOptions(env, req, user)
  const challengeId = await saveChallenge(env, 'signup', options.challenge, now, user.id, { name })
  return json({ challengeId, options })
}

async function checkGate(env: Env, invite: unknown) {
  const state = await signupState(env)
  if (state === 'closed') throw new HttpError(403, 'signup-closed', 'New accounts aren’t open here. Sign in with your passkey, or use your recovery code.')
  if (state === 'invite' && !(typeof invite === 'string' && env.INVITE_CODE && sameSecret(invite.trim(), env.INVITE_CODE.trim())))
    throw new HttpError(403, 'invite', 'That invite code isn’t right.')
  return state
}

export async function signupVerify(env: Env, req: Request, now: number): Promise<Response> {
  await limitAuth(env, req, now)
  const body = await readJson<{ challengeId?: unknown; response?: unknown; invite?: unknown }>(req)
  const ch = await takeChallenge(env, body.challengeId, 'signup', now)
  const state = await checkGate(env, body.invite)
  const reg = await checkRegistration(env, req, body.response, ch.challenge)
  const user: User = { id: ch.user_id!, name: (JSON.parse(ch.data ?? '{}') as { name: string }).name }
  const code = newRecoveryCode()
  const session = await sessionInsert(env, user.id, now)
  // With the default gate, only the very first account gets in, even if two race.
  const userInsert =
    state === 'open' && (env.SIGNUP ?? 'first').trim().toLowerCase() !== 'open'
      ? env.DB.prepare('INSERT INTO users (id, name, created) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)').bind(user.id, user.name, now)
      : env.DB.prepare('INSERT INTO users (id, name, created) VALUES (?, ?, ?)').bind(user.id, user.name, now)
  const results = await env.DB.batch([
    userInsert,
    credentialInsert(env, user.id, reg, now),
    env.DB.prepare('INSERT INTO recovery_codes (user_id, hash, created) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)').bind(user.id, await codeHash(code), now, user.id),
    session.stmt,
  ])
  if (!results[0].meta.changes) throw new HttpError(403, 'signup-closed', 'Someone else made the account here first. Sign in with your passkey instead.')
  return signedIn(user, session.token, { recoveryCode: code })
}

// ---------------------------------------------------------------------------
// Sign in.

export async function loginOptions(env: Env, req: Request, now: number): Promise<Response> {
  await limitAuth(env, req, now)
  const options = await generateAuthenticationOptions({ rpID: relyingParty(env, req).rpID, userVerification: 'required', allowCredentials: [] })
  const challengeId = await saveChallenge(env, 'login', options.challenge, now, null)
  return json({ challengeId, options })
}

export async function loginVerify(env: Env, req: Request, now: number): Promise<Response> {
  await limitAuth(env, req, now)
  const body = await readJson<{ challengeId?: unknown; response?: AuthenticationResponseJSON }>(req)
  const ch = await takeChallenge(env, body.challengeId, 'login', now)
  const response = body.response
  if (!response || typeof response.id !== 'string' || response.id.length > 1024) throw notVerified()
  const cred = await env.DB.prepare(
    'SELECT c.id AS id, c.user_id AS user_id, c.public_key AS public_key, c.counter AS counter, c.transports AS transports, u.name AS name FROM credentials c JOIN users u ON u.id = c.user_id WHERE c.id = ?',
  )
    .bind(response.id)
    .first<{ id: string; user_id: string; public_key: string; counter: number; transports: string | null; name: string }>()
  if (!cred) throw new HttpError(400, 'unknown-passkey', 'This site doesn’t know that passkey. If you made it for another account, use your recovery code.')
  // The passkey says whose it is; it has to be the account it was made for.
  if (response.response?.userHandle && response.response.userHandle !== cred.user_id) throw notVerified()
  const { rpID, origin } = relyingParty(env, req)
  let result
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: { id: cred.id, publicKey: fromB64url(cred.public_key), counter: cred.counter, transports: cred.transports ? JSON.parse(cred.transports) : undefined },
      requireUserVerification: true,
    })
  } catch (e) {
    throw notVerified(e)
  }
  if (!result.verified) throw notVerified()
  const session = await sessionInsert(env, cred.user_id, now)
  await env.DB.batch([
    env.DB.prepare('UPDATE credentials SET counter = ?, last_used = ? WHERE id = ?').bind(result.authenticationInfo.newCounter, now, cred.id),
    session.stmt,
  ])
  return signedIn({ id: cred.user_id, name: cred.name }, session.token)
}

// ---------------------------------------------------------------------------
// Recover with the code: a new passkey on this device, and a new code (the old one is used up).

export async function recoverOptions(env: Env, req: Request, now: number): Promise<Response> {
  await limitAuth(env, req, now)
  await rateLimit(env, `recover:${clientIp(req)}`, 8, 60 * MINUTE, now)
  await rateLimit(env, 'recover:all', 60, 60 * MINUTE, now)
  const body = await readJson<{ code?: unknown }>(req)
  if (typeof body.code !== 'string' || normalizeCode(body.code).length !== 20) throw new HttpError(400, 'recovery-code', 'A recovery code has 20 letters and numbers, like ABCD-EFGH-JKMN-PQRS-TVWX.')
  const hash = await codeHash(body.code)
  const row = await env.DB.prepare('SELECT u.id AS id, u.name AS name FROM recovery_codes r JOIN users u ON u.id = r.user_id WHERE r.hash = ?').bind(hash).first<User>()
  if (!row) throw new HttpError(400, 'recovery-code', 'That recovery code isn’t right. Check it and try again.')
  const options = await registrationOptions(env, req, row, await userCredentials(env, row.id))
  const challengeId = await saveChallenge(env, 'recover', options.challenge, now, row.id, { hash })
  return json({ challengeId, options })
}

export async function recoverVerify(env: Env, req: Request, now: number): Promise<Response> {
  await limitAuth(env, req, now)
  const body = await readJson<{ challengeId?: unknown; response?: unknown }>(req)
  const ch = await takeChallenge(env, body.challengeId, 'recover', now)
  const reg = await checkRegistration(env, req, body.response, ch.challenge)
  const userId = ch.user_id!
  const oldHash = (JSON.parse(ch.data ?? '{}') as { hash: string }).hash
  const code = newRecoveryCode()
  const newHash = await codeHash(code)
  // Each code works once: the passkey and the session land only if this request is the one that
  // swapped the code it used for the new one.
  const guard = { sql: 'EXISTS (SELECT 1 FROM recovery_codes WHERE user_id = ? AND hash = ?)', args: [userId, newHash] }
  const session = await sessionInsert(env, userId, now, guard)
  const results = await env.DB.batch([
    env.DB.prepare('UPDATE recovery_codes SET hash = ?, created = ? WHERE user_id = ? AND hash = ?').bind(newHash, now, userId, oldHash),
    env.DB.prepare(
      `INSERT INTO credentials (id, user_id, public_key, counter, transports, backed_up, created) SELECT ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`,
    ).bind(reg.credential.id, userId, b64url(reg.credential.publicKey), reg.credential.counter, reg.credential.transports ? JSON.stringify(reg.credential.transports) : null, reg.backedUp ? 1 : 0, now, ...guard.args),
    session.stmt,
  ])
  if (!results[0].meta.changes) throw new HttpError(400, 'recovery-code', 'That recovery code has already been used.')
  const user = await env.DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(userId).first<User>()
  return signedIn(user!, session.token, { recoveryCode: code })
}

// ---------------------------------------------------------------------------
// Signed in: add a passkey, make a new recovery code, see the account, sign out.

export async function passkeyOptions(env: Env, req: Request, now: number): Promise<Response> {
  await limitAuth(env, req, now)
  const user = await requireUser(env, req, now)
  const options = await registrationOptions(env, req, user, await userCredentials(env, user.id))
  const challengeId = await saveChallenge(env, 'add', options.challenge, now, user.id)
  return json({ challengeId, options })
}

export async function passkeyVerify(env: Env, req: Request, now: number): Promise<Response> {
  await limitAuth(env, req, now)
  const user = await requireUser(env, req, now)
  const body = await readJson<{ challengeId?: unknown; response?: unknown }>(req)
  const ch = await takeChallenge(env, body.challengeId, 'add', now)
  if (ch.user_id !== user.id) throw notVerified()
  const reg = await checkRegistration(env, req, body.response, ch.challenge)
  await credentialInsert(env, user.id, reg, now).run()
  return json({ ok: true })
}

export async function newCode(env: Env, req: Request, now: number): Promise<Response> {
  await limitAuth(env, req, now)
  const user = await requireUser(env, req, now)
  const code = newRecoveryCode()
  await env.DB.prepare('INSERT INTO recovery_codes (user_id, hash, created) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET hash = excluded.hash, created = excluded.created')
    .bind(user.id, await codeHash(code), now)
    .run()
  return json({ recoveryCode: code })
}

export async function account(env: Env, req: Request, now: number): Promise<Response> {
  const user = await requireUser(env, req, now)
  const keys = await env.DB.prepare('SELECT created, last_used, backed_up FROM credentials WHERE user_id = ? ORDER BY created').bind(user.id).all<{ created: number; last_used: number | null; backed_up: number }>()
  const code = await env.DB.prepare('SELECT created FROM recovery_codes WHERE user_id = ?').bind(user.id).first<{ created: number }>()
  return json({
    user,
    passkeys: keys.results.map(k => ({ created: k.created, lastUsed: k.last_used, synced: !!k.backed_up })),
    recoveryCodeCreated: code?.created ?? null,
  })
}

export async function logout(env: Env, req: Request): Promise<Response> {
  await endSession(env, req)
  return json({ ok: true }, 200, { 'set-cookie': clearedCookie() })
}
