// This browser's commenter token: 32 random bytes, made the first time someone sends a comment
// from a share link and kept in this browser only, so they can see their own comments again. The
// Worker keeps only its hash. Opening a link without commenting keeps nothing here.

const KEY = 'bhp-commenter'
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

/** For a browser that keeps nothing (private browsing, blocked storage): this page's token only. */
let inMemory: string | null = null

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The token, if this browser has sent a comment before. */
export function commenterToken(): string | null {
  let t: string | null = null
  try {
    t = localStorage.getItem(KEY)
  } catch {
    // Storage blocked: this page's token, if it made one.
  }
  return t && TOKEN_RE.test(t) ? t : inMemory
}

/** The token, made now if this browser has none. */
export function ensureCommenterToken(): string {
  const have = commenterToken()
  if (have) return have
  const t = newToken()
  try {
    localStorage.setItem(KEY, t)
  } catch {
    // Kept for this page only.
    inMemory = t
  }
  return t
}
