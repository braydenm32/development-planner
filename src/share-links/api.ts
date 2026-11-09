// Share links, from the app: the owner's calls (make, list, extend, turn off, turn back on), which go
// with his session like the rest of the cloud API, and the viewer's, which carry only the token,
// in a header so it stays out of addresses and logs (worker/src/shares.ts).

import { CloudError, CSRF_HEADER, OfflineError, type RecordRef } from '../cloud/api'
import type { ProjectMeta } from '../projects/types'

/** The header the token goes in. */
export const SHARE_HEADER = 'x-bhp-share'

export interface ShareLink {
  /** The SHA-256 of its token: what the owner's list knows it by. */
  id: string
  created: number
  lastOpened: number | null
  /** When it stops working; null for a link made before links had an end, which works until turned off. */
  expires: number | null
  /** Whether people with it can comment on the plan, and see each other's (src/comments); off when missing. */
  comments?: 'off' | 'own' | 'all'
}

/** How long a new link can last, in days: 30 unless the owner picks longer. */
export const LINK_DAYS = [30, 90, 365] as const
export type LinkDays = (typeof LINK_DAYS)[number]
/** What Extend adds, and the furthest off a link's end can be. */
export const EXTEND_DAYS = 30
export const MAX_DAYS = 365

/** A shared project as the cloud has it now. */
export interface SharedIndex {
  sharedBy: string
  project: { revision: number; meta: ProjectMeta; records: Record<string, RecordRef> }
}

export interface ShareApi {
  list(projectId: string): Promise<ShareLink[]>
  /** A new link that lasts `days`, taking comments or not. Its token is only in this answer. */
  make(projectId: string, days: LinkDays, comments?: ShareLink['comments']): Promise<{ token: string; link: ShareLink }>
  /** Push a link's end 30 days on, to at most a year from now. */
  extend(projectId: string, linkId: string): Promise<ShareLink>
  turnOff(projectId: string, linkId: string): Promise<void>
  /** Undo turning it off, within a few minutes. */
  turnOn(projectId: string, linkId: string): Promise<ShareLink>
  open(token: string): Promise<SharedIndex>
  part(token: string, hash: string, part: number): Promise<Uint8Array>
}

export function createShareApi(opts: { base?: string; fetch?: typeof fetch } = {}): ShareApi {
  const base = opts.base ?? `${import.meta.env?.BASE_URL ?? '/'}api/`
  const doFetch = opts.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))

  async function call(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
    const method = init.method ?? 'GET'
    const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) }
    if (method !== 'GET') headers[CSRF_HEADER] = '1'
    if (token !== undefined) headers[SHARE_HEADER] = token
    let res: Response
    try {
      // A viewer's request carries no cookie: only the token opens a shared project.
      res = await doFetch(base + path, { ...init, method, headers, credentials: token === undefined ? 'same-origin' : 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' })
    } catch {
      throw new OfflineError()
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) throw new OfflineError()
    if (!res.ok) throw new CloudError(res.status, (await res.json().catch(() => null)) as Record<string, unknown> | null)
    return res
  }
  const json = async <T,>(path: string, init?: RequestInit, token?: string) => (await (await call(path, init, token)).json()) as T
  const enc = encodeURIComponent

  return {
    list: async id => (await json<{ links: ShareLink[] }>(`projects/${enc(id)}/shares`)).links,
    make: (id, days, comments = 'off') => json(`projects/${enc(id)}/shares`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ days, comments }) }),
    extend: async (id, link) => (await json<{ link: ShareLink }>(`projects/${enc(id)}/shares/${enc(link)}/extend`, { method: 'POST' })).link,
    turnOff: async (id, link) => void (await call(`projects/${enc(id)}/shares/${enc(link)}`, { method: 'DELETE' })),
    turnOn: async (id, link) => (await json<{ link: ShareLink }>(`projects/${enc(id)}/shares/${enc(link)}/restore`, { method: 'POST' })).link,
    open: token => json('shared', {}, token),
    part: async (token, hash, part) => new Uint8Array(await (await call(`shared/blobs/${hash}/${part}`, {}, token)).arrayBuffer()),
  }
}
