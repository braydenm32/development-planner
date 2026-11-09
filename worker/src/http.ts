// Small HTTP helpers: JSON replies, plain errors, and request bodies read with a size limit.

/** An error with the status and a short code the app can act on; `message` is shown to people. */
export class HttpError extends Error {
  status: number
  code: string
  extra?: Record<string, unknown>
  constructor(status: number, code: string, message: string, extra?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

const NO_STORE = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...NO_STORE, ...headers } })
}

/** A JSON reply whose body is already JSON text (stored index entries), so it isn't parsed again. */
export function rawJson(text: string, status = 200): Response {
  return new Response(text, { status, headers: { 'content-type': 'application/json; charset=utf-8', ...NO_STORE } })
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.code, message: e.message, ...e.extra }, e.status)
  console.error(e)
  return json({ error: 'server', message: 'Something went wrong on the server. Your work is still saved on this device.' }, 500)
}

/** The body, read up to `max` bytes; longer bodies are refused before they are held whole. */
export async function readBytes(req: Request, max: number): Promise<Uint8Array> {
  const stated = Number(req.headers.get('content-length') ?? NaN)
  if (stated > max) throw tooLarge(max)
  if (!req.body) return new Uint8Array(0)
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel().catch(() => {})
      throw tooLarge(max)
    }
    chunks.push(value)
  }
  if (chunks.length === 1) return chunks[0]
  const out = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.byteLength
  }
  return out
}

const tooLarge = (max: number) => new HttpError(413, 'too-large', `That is more than ${Math.round(max / 1024)} KB.`)

/** A small JSON body (64 KB unless said otherwise). */
export async function readJson<T>(req: Request, max = 64 * 1024): Promise<T> {
  const bytes = await readBytes(req, max)
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } catch {
    throw new HttpError(400, 'bad-json', 'The request was not readable.')
  }
}

export function cookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return null
}

// ---------------------------------------------------------------------------
// Encoding and randomness.

export function b64url(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n))
}

export const randomId = (n = 16) => b64url(randomBytes(n))

export async function sha256Hex(text: string | Uint8Array<ArrayBuffer>): Promise<string> {
  const data = typeof text === 'string' ? new TextEncoder().encode(text) : text
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  return [...digest].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Compare two secrets in time that doesn't depend on where they differ. */
export function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}
