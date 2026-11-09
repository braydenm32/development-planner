// How a project's records travel to the cloud: as JSON text that keeps shared parts shared.
//
// The undo history is a hundred plans that share everything a step didn't touch. IndexedDB keeps
// that sharing; plain JSON would write every plan out in full (megabytes). Here each object or
// array that appears again is written once and referred to after that, so the text is about the
// size of the changes, and reading it back shares them again. Otherwise it is JSON's own rules:
// toJSON is used, undefined and functions are left out (null in arrays), NaN and ±∞ are null.
//
// The text is named by its SHA-256, so the same record is never uploaded twice.

const REF = '\u0001'
const VERSION = 1

/** Set a key, even "__proto__", as an own property. */
function put(o: Record<string, unknown>, k: string, v: unknown) {
  if (k === '__proto__') Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true })
  else o[k] = v
}

/** A record's value as text. Objects get numbers in the order they are first met (depth first). */
export function encodeRecord(value: unknown): string {
  const seen = new Map<object, number>()
  let next = 0
  const walk = (input: unknown, inArray: boolean): unknown => {
    let v = input
    if (v && typeof v === 'object' && typeof (v as { toJSON?: unknown }).toJSON === 'function') v = (v as { toJSON: () => unknown }).toJSON()
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    if (typeof v === 'string' || typeof v === 'boolean' || v === null) return v
    if (typeof v === 'bigint') throw new TypeError('A record can’t hold a BigInt.')
    if (typeof v !== 'object') return inArray ? null : undefined
    const id = seen.get(v)
    if (id !== undefined) return { [REF]: id }
    seen.set(v, next++)
    if (Array.isArray(v)) return v.map(x => walk(x, true))
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v)) {
      const x = walk((v as Record<string, unknown>)[k], false)
      if (x !== undefined) put(out, k.startsWith(REF) ? REF + k : k, x)
    }
    return out
  }
  return JSON.stringify({ bhp: VERSION, v: walk(value, false) ?? null })
}

/** The value back from its text, with shared parts shared again. */
export function decodeRecord(text: string): unknown {
  const parsed = JSON.parse(text) as { bhp?: unknown; v?: unknown }
  if (!parsed || parsed.bhp !== VERSION) throw new Error('That isn’t a saved record this app can read.')
  const table: unknown[] = []
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v
    if (Array.isArray(v)) {
      const out: unknown[] = []
      table.push(out)
      for (const x of v) out.push(walk(x))
      return out
    }
    const o = v as Record<string, unknown>
    const keys = Object.keys(o)
    if (keys.length === 1 && keys[0] === REF) {
      const n = o[REF]
      if (typeof n !== 'number' || !(n in table)) throw new Error('A saved record refers to a part it doesn’t have.')
      return table[n]
    }
    const out: Record<string, unknown> = {}
    table.push(out)
    for (const k of keys) put(out, k.startsWith(REF) ? k.slice(1) : k, walk(o[k]))
    return out
  }
  return walk(parsed.v)
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  let s = ''
  for (const b of digest) s += b.toString(16).padStart(2, '0')
  return s
}

export interface Encoded {
  text: string
  bytes: Uint8Array<ArrayBuffer>
  hash: string
}

export async function encodeForCloud(value: unknown): Promise<Encoded> {
  const text = encodeRecord(value)
  const bytes = new TextEncoder().encode(text)
  return { text, bytes, hash: await sha256Hex(bytes) }
}
