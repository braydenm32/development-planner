// A share link's address: the app's own address with the token after #/view/.
//
//   https://…/#/view/<token>            the plan
//   https://…/#/view/<token>?view=3d    the 3D view (Back and reload keep it)
//
// In the hash, not the path: browsers never send the part after # to a server or put it in a
// Referer, so the token stays out of logs and other sites' analytics, and the one-page app
// needs no new route on the Worker. The app then sends the token in a header.

export type SharedCanvas = 'plan' | '3d'

export interface ShareAddress {
  token: string
  view: SharedCanvas
}

const SHARE_RE = /^#\/view\/([A-Za-z0-9_-]{16,128})(?:\?(.*))?$/

/** The share link's parts, when the hash is one; null otherwise. */
export function readShareHash(hash: string): ShareAddress | null {
  const m = SHARE_RE.exec(hash)
  if (!m) return null
  const view = new URLSearchParams(m[2] ?? '').get('view') === '3d' ? '3d' : 'plan'
  return { token: m[1], view }
}

/** The hash for a shared view. The plan is the plain link. */
export const shareHash = (a: ShareAddress) => `#/view/${a.token}${a.view === '3d' ? '?view=3d' : ''}`

/** The whole link to send: this copy of the app's address, with the token. */
export function shareUrl(token: string, where: { origin: string } = location, base: string = import.meta.env?.BASE_URL ?? '/'): string {
  return `${where.origin}${base}${shareHash({ token, view: 'plan' })}`
}

/** A short, readable form of a link for the list: the address, and the token's first few letters. */
export function shortLink(url: string): string {
  const i = url.indexOf('#/view/')
  if (i < 0) return url
  const host = url.slice(0, i).replace(/^https?:\/\//, '').replace(/\/$/, '')
  return `${host}/#/view/${url.slice(i + 7, i + 13)}…`
}
