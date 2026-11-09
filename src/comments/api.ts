// Comments on share links, from the app (worker/src/comments.ts). The viewer's calls carry the
// link's token and this browser's commenter token, in headers, and no cookie; the owner's go with
// their session like the rest of the cloud API, with the X-BHP header on every change.

import { CloudError, CSRF_HEADER, OfflineError } from '../cloud/api'
import { SHARE_HEADER, type ShareLink } from '../share-links/api'
import type { CommentCounts, CommentMode, OwnerComment, Spot, ViewerComment } from './model'

/** The header this browser's commenter token goes in. */
export const COMMENTER_HEADER = 'x-bhp-commenter'

export interface NewComment extends Spot {
  text: string
  name: string | null
}

export interface CommentsApi {
  /** The link's setting and the comments this browser may see on it. */
  seen(token: string, commenter: string | null): Promise<{ mode: CommentMode; comments: ViewerComment[] }>
  add(token: string, commenter: string, c: NewComment): Promise<ViewerComment>
  /** The owner's: the project's comments, newest first, and each link that has some, with its counts. */
  list(projectId: string): Promise<{ comments: OwnerComment[]; links: CommentCounts }>
  resolve(projectId: string, id: string, resolved: boolean): Promise<OwnerComment>
  remove(projectId: string, id: string): Promise<void>
  /** Change a link's setting; the link as it is now. */
  setMode(projectId: string, linkId: string, mode: CommentMode): Promise<ShareLink>
}

export function createCommentsApi(opts: { base?: string; fetch?: typeof fetch } = {}): CommentsApi {
  const base = opts.base ?? `${import.meta.env?.BASE_URL ?? '/'}api/`
  const doFetch = opts.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))

  /** `viewer` carries the link's token (and this browser's, if it has one) instead of the session. */
  async function call<T>(path: string, init: RequestInit = {}, viewer?: { token: string; commenter: string | null }): Promise<T> {
    const method = init.method ?? 'GET'
    const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) }
    if (method !== 'GET') headers[CSRF_HEADER] = '1'
    if (init.body !== undefined) headers['content-type'] = 'application/json'
    if (viewer) {
      headers[SHARE_HEADER] = viewer.token
      if (viewer.commenter) headers[COMMENTER_HEADER] = viewer.commenter
    }
    let res: Response
    try {
      res = await doFetch(base + path, { ...init, method, headers, credentials: viewer ? 'omit' : 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer' })
    } catch {
      throw new OfflineError()
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) throw new OfflineError()
    if (!res.ok) throw new CloudError(res.status, (await res.json().catch(() => null)) as Record<string, unknown> | null)
    return (await res.json()) as T
  }
  const enc = encodeURIComponent
  const body = (v: unknown) => JSON.stringify(v)
  // A reply missing a part (an older worker, a proxy's page) reads as none, rather than
  // breaking the panels that list them.
  const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  const record = <T,>(v: unknown): T => (v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : ({} as T))

  return {
    seen: async (token, commenter) => {
      const got = record<{ mode?: CommentMode; comments?: unknown }>(await call('shared/comments', {}, { token, commenter }))
      return { mode: got.mode === 'all' || got.mode === 'own' ? got.mode : 'off', comments: list<ViewerComment>(got.comments) }
    },
    add: async (token, commenter, c) => (await call<{ comment: ViewerComment }>('shared/comments', { method: 'POST', body: body(c) }, { token, commenter })).comment,
    list: async id => {
      const got = record<{ comments?: unknown; links?: unknown }>(await call(`projects/${enc(id)}/comments`))
      return { comments: list<OwnerComment>(got.comments), links: record<CommentCounts>(got.links) }
    },
    resolve: async (id, c, resolved) => (await call<{ comment: OwnerComment }>(`projects/${enc(id)}/comments/${enc(c)}/resolve`, { method: 'POST', body: body({ resolved }) })).comment,
    remove: async (id, c) => void (await call(`projects/${enc(id)}/comments/${enc(c)}`, { method: 'DELETE' })),
    setMode: async (id, link, mode) => (await call<{ link: ShareLink }>(`projects/${enc(id)}/shares/${enc(link)}/comments`, { method: 'POST', body: body({ comments: mode }) })).link,
  }
}
