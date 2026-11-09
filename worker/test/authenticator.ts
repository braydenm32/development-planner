// A software passkey for tests: it answers WebAuthn options the way a phone or laptop would
// (ES256, "none" attestation, user verified), with real signatures, so the server's checks run
// for real. Only what the tests need.

import { b64url, fromB64url } from '../src/http'

// ---- A small CBOR encoder (major types 0, 1, 2, 3, 5).

function head(major: number, n: number): number[] {
  if (n < 24) return [(major << 5) | n]
  if (n < 256) return [(major << 5) | 24, n]
  if (n < 65536) return [(major << 5) | 25, n >> 8, n & 255]
  return [(major << 5) | 26, (n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255]
}

type Cbor = number | string | Uint8Array | Map<number | string, Cbor>

function cbor(v: Cbor): number[] {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v)
  if (typeof v === 'string') {
    const b = new TextEncoder().encode(v)
    return [...head(3, b.length), ...b]
  }
  if (v instanceof Uint8Array) return [...head(2, v.length), ...v]
  const out = head(5, v.size)
  for (const [k, x] of v) out.push(...cbor(k), ...cbor(x))
  return out
}

const concat = (...parts: (Uint8Array | number[])[]) => new Uint8Array(parts.flatMap(p => [...p]))
const sha256 = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>))
const u32 = (n: number) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255]

/** An ECDSA signature as WebCrypto gives it (r‖s) in the DER form WebAuthn sends. */
function der(sig: Uint8Array): Uint8Array {
  const int = (b: Uint8Array) => {
    let i = 0
    while (i < b.length - 1 && b[i] === 0) i++
    const t = b.slice(i)
    const v = t[0] & 0x80 ? concat([0], t) : t
    return concat([0x02, v.length], v)
  }
  const body = concat(int(sig.slice(0, 32)), int(sig.slice(32)))
  return concat([0x30, body.length], body)
}

interface Credential {
  id: Uint8Array
  keys: CryptoKeyPair
  counter: number
  userHandle: string
  rpId: string
}

interface CreationOptions {
  challenge: string
  rp: { id?: string }
  user: { id: string }
  excludeCredentials?: { id: string }[]
}

interface RequestOptions {
  challenge: string
  rpId?: string
}

export function softPasskey(origin: string) {
  const creds: Credential[] = []
  const rpIdOf = (id?: string) => id ?? new URL(origin).hostname
  const clientData = (type: string, challenge: string) => new TextEncoder().encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }))

  return {
    credentials: creds,

    /** navigator.credentials.create(), as JSON. */
    async create(options: CreationOptions, opts: { origin?: string } = {}) {
      const rpId = rpIdOf(options.rp.id)
      if (options.excludeCredentials?.some(c => creds.some(k => b64url(k.id) === c.id))) throw new Error('InvalidStateError: already registered')
      const keys = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
      const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey)
      const id = crypto.getRandomValues(new Uint8Array(16))
      const cose = cbor(
        new Map<number, Cbor>([
          [1, 2],
          [3, -7],
          [-1, 1],
          [-2, fromB64url(jwk.x!)],
          [-3, fromB64url(jwk.y!)],
        ]),
      )
      const flags = 0x01 | 0x04 | 0x40 // user present, user verified, attested credential data
      const authData = concat(await sha256(new TextEncoder().encode(rpId)), [flags], u32(0), new Uint8Array(16), [id.length >> 8, id.length & 255], id, cose)
      const attestation = new Uint8Array(cbor(new Map<string, Cbor>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]])))
      creds.push({ id, keys, counter: 0, userHandle: options.user.id, rpId })
      const data = opts.origin ? new TextEncoder().encode(JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin: opts.origin })) : clientData('webauthn.create', options.challenge)
      return {
        id: b64url(id),
        rawId: b64url(id),
        type: 'public-key',
        authenticatorAttachment: 'platform',
        clientExtensionResults: {},
        response: { clientDataJSON: b64url(data), attestationObject: b64url(attestation), transports: ['internal'] },
      }
    },

    /** navigator.credentials.get(), as JSON: answers with the first passkey (or `which`) for the site. */
    async get(options: RequestOptions, which = 0) {
      const rpId = rpIdOf(options.rpId)
      const cred = creds.filter(c => c.rpId === rpId)[which]
      if (!cred) throw new Error('NotAllowedError: no passkey')
      cred.counter++
      const authData = concat(await sha256(new TextEncoder().encode(rpId)), [0x01 | 0x04], u32(cred.counter))
      const data = clientData('webauthn.get', options.challenge)
      const signed = concat(authData, await sha256(data))
      const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cred.keys.privateKey, signed as Uint8Array<ArrayBuffer>))
      return {
        id: b64url(cred.id),
        rawId: b64url(cred.id),
        type: 'public-key',
        authenticatorAttachment: 'platform',
        clientExtensionResults: {},
        response: { clientDataJSON: b64url(data), authenticatorData: b64url(authData), signature: b64url(der(sig)), userHandle: cred.userHandle },
      }
    },
  }
}
