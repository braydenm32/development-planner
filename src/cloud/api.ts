// The cloud API (worker/src/api.ts), from the app: same origin, the session in an HttpOnly
// cookie the app never sees, and the X-BHP header on every change (the CSRF guard).
//
// On GitHub Pages there is no /api/: health() says so and nothing else is ever called.

import type { ProjectMeta } from '../projects/types'

export const CSRF_HEADER = 'x-bhp'
/** Records are uploaded in parts of this size (the Worker's PART_MAX). */
export const PART_SIZE = 20 * 1024 * 1024
export const partsFor = (size: number) => Math.max(1, Math.ceil(size / PART_SIZE))

export interface CloudUser {
  id: string
  name: string
  /** When the account goes, if its owner asked to delete it (ms); null or missing otherwise. */
  deleteAfter?: number | null
}

export type Signup = 'open' | 'invite' | 'closed'

export interface RecordRef {
  hash: string
  size: number
  parts: number
}

/** A project as the server has it (a tombstone when deleted). `revision` is the server's. */
export interface RemoteProject {
  id: string
  revision: number
  deleted: boolean
  meta: ProjectMeta
  records: Record<string, RecordRef>
}

export interface Account {
  user: CloudUser
  /** The address sign-in codes go to; null (or missing, from an older Worker) when there's none. */
  email?: string | null
  passkeys: { created: number; lastUsed: number | null; synced: boolean }[]
  recoveryCodeCreated: number | null
  /** What the account keeps in the cloud, and the most it may, in bytes. */
  storage: { used: number; limit: number }
  deleteAfter: number | null
}

/** The server said no, in words for people (`message`) and a code for the app. */
export class CloudError extends Error {
  status: number
  code: string
  body: Record<string, unknown>
  constructor(status: number, body: Record<string, unknown> | null) {
    super(typeof body?.message === 'string' ? body.message : `The cloud said no (${status}).`)
    this.name = 'CloudError'
    this.status = status
    this.code = typeof body?.error === 'string' ? body.error : 'error'
    this.body = body ?? {}
  }
}

/** The project moved on (or went) on the server since this device saw it. */
export class ConflictError extends CloudError {
  project: RemoteProject | null
  constructor(body: Record<string, unknown>) {
    super(409, body)
    this.name = 'ConflictError'
    this.project = (body.project as RemoteProject | null) ?? null
  }
}

/** The server couldn't be reached: no network, or it is down for a moment. */
export class OfflineError extends Error {
  constructor() {
    super('Offline. Changes are kept on this device and sent when you’re back online.')
    this.name = 'OfflineError'
  }
}

export const isOffline = (e: unknown) => e instanceof OfflineError
export const isSignedOut = (e: unknown) => e instanceof CloudError && e.status === 401

export interface Health {
  signup: Signup
  /** Whether this cloud can email sign-in codes (worker/src/emailAuth.ts). */
  email: boolean
}

export interface CloudApi {
  health(): Promise<Health | null>
  session(): Promise<CloudUser | null>
  signupOptions(name: string, invite?: string): Promise<{ challengeId: string; options: unknown }>
  signupVerify(challengeId: string, response: unknown, invite?: string): Promise<{ user: CloudUser; recoveryCode: string }>
  loginOptions(): Promise<{ challengeId: string; options: unknown }>
  loginVerify(challengeId: string, response: unknown): Promise<{ user: CloudUser }>
  recoverOptions(code: string): Promise<{ challengeId: string; options: unknown }>
  recoverVerify(challengeId: string, response: unknown): Promise<{ user: CloudUser; recoveryCode: string }>
  passkeyOptions(): Promise<{ challengeId: string; options: unknown }>
  passkeyVerify(challengeId: string, response: unknown): Promise<void>
  newRecoveryCode(): Promise<string>
  /** Signed out: email a sign-in code to the address, if an account has it (the reply can't say). */
  emailCode(email: string): Promise<void>
  /** Signed out: the address and its code start a session. */
  emailSignIn(email: string, code: string): Promise<{ user: CloudUser }>
  /** Signed in: email a code to an address being added, to check it's theirs. The address as kept. */
  emailAdd(email: string): Promise<string>
  /** Signed in: that code makes the address the account's. */
  emailConfirm(email: string, code: string): Promise<string>
  emailRemove(): Promise<void>
  account(): Promise<Account>
  /** Ask for the account to be deleted (30 days on); signs out everywhere. When it goes. */
  deleteAccount(): Promise<number>
  /** Keep an account that is waiting to be deleted. */
  keepAccount(): Promise<CloudUser>
  logout(): Promise<void>
  projects(): Promise<RemoteProject[]>
  project(id: string): Promise<RemoteProject | null>
  commit(id: string, body: { base: number; meta: ProjectMeta; records: Record<string, RecordRef | null> }): Promise<RemoteProject>
  remove(id: string, base: number): Promise<void>
  missing(hashes: string[]): Promise<string[]>
  putPart(hash: string, part: number, size: number, bytes: Uint8Array<ArrayBuffer>): Promise<{ next: number; complete: boolean }>
  getPart(hash: string, part: number): Promise<Uint8Array>
}

export interface ApiOptions {
  /** Where the API is: the app's own base + api/ (so a build for a sub-path finds it too). */
  base?: string
  fetch?: typeof fetch
}

export function createCloudApi(opts: ApiOptions = {}): CloudApi {
  const base = opts.base ?? `${import.meta.env?.BASE_URL ?? '/'}api/`
  const doFetch = opts.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const method = init.method ?? 'GET'
    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) }
    if (method !== 'GET' && method !== 'HEAD') headers[CSRF_HEADER] = '1'
    if (typeof init.body === 'string') headers['content-type'] = 'application/json'
    let res: Response
    try {
      res = await doFetch(base + path, { ...init, method, headers, credentials: 'same-origin', cache: 'no-store' })
    } catch {
      throw new OfflineError()
    }
    // A gateway between here and the Worker is down: the same as offline, for now.
    if (res.status === 502 || res.status === 503 || res.status === 504) throw new OfflineError()
    return res
  }

  async function json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await call(path, init)
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (res.status === 409 && body) throw new ConflictError(body)
    if (!res.ok) throw new CloudError(res.status, body)
    return body as T
  }

  const post = <T,>(path: string, body: unknown = {}) => json<T>(path, { method: 'POST', body: JSON.stringify(body) })
  const enc = encodeURIComponent

  return {
    // null when this copy of the app has no API (GitHub Pages); throws OfflineError when it can't tell.
    async health() {
      const res = await call('health')
      if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null
      const body = (await res.json().catch(() => null)) as { app?: string; signup?: Signup; email?: boolean } | null
      return body?.app === 'block-and-house-planner' ? { signup: body.signup ?? 'closed', email: body.email === true } : null
    },
    session: async () => (await json<{ user: CloudUser | null }>('session')).user,
    signupOptions: (name, invite) => post('auth/signup/options', { name, invite }),
    signupVerify: (challengeId, response, invite) => post('auth/signup/verify', { challengeId, response, invite }),
    loginOptions: () => post('auth/login/options'),
    loginVerify: (challengeId, response) => post('auth/login/verify', { challengeId, response }),
    recoverOptions: code => post('auth/recover/options', { code }),
    recoverVerify: (challengeId, response) => post('auth/recover/verify', { challengeId, response }),
    passkeyOptions: () => post('auth/passkey/options'),
    passkeyVerify: async (challengeId, response) => void (await post('auth/passkey/verify', { challengeId, response })),
    newRecoveryCode: async () => (await post<{ recoveryCode: string }>('auth/recovery-code')).recoveryCode,
    emailCode: async email => void (await post('auth/email/start', { email })),
    emailSignIn: (email, code) => post('auth/email/verify', { email, code }),
    emailAdd: async email => (await post<{ email: string }>('account/email/start', { email })).email,
    emailConfirm: async (email, code) => (await post<{ email: string }>('account/email/confirm', { email, code })).email,
    emailRemove: async () => void (await post('account/email/remove')),
    account: () => json('account'),
    deleteAccount: async () => (await post<{ deleteAfter: number }>('account/delete')).deleteAfter,
    keepAccount: async () => (await post<{ user: CloudUser }>('account/keep')).user,
    logout: async () => void (await post('auth/logout')),
    projects: async () => (await json<{ projects: RemoteProject[] }>('projects')).projects,
    async project(id) {
      try {
        return (await json<{ project: RemoteProject }>(`projects/${enc(id)}`)).project
      } catch (e) {
        if (e instanceof CloudError && e.status === 404) return null
        throw e
      }
    },
    commit: async (id, body) => (await post<{ project: RemoteProject }>(`projects/${enc(id)}/commit`, body)).project,
    remove: async (id, base) => void (await json(`projects/${enc(id)}?base=${base}`, { method: 'DELETE' })),
    missing: async hashes => (await post<{ missing: string[] }>('blobs/missing', { hashes })).missing,
    async putPart(hash, part, size, bytes) {
      return json(`blobs/${hash}/${part}?parts=${partsFor(size)}&size=${size}`, { method: 'PUT', body: bytes, headers: { 'content-type': 'application/octet-stream' } })
    },
    async getPart(hash, part) {
      const res = await call(`blobs/${hash}/${part}`)
      if (!res.ok) throw new CloudError(res.status, (await res.json().catch(() => null)) as Record<string, unknown> | null)
      return new Uint8Array(await res.arrayBuffer())
    },
  }
}
