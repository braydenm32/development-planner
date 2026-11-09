import 'fake-indexeddb/auto'
import { createStore } from 'idb-keyval'
import { describe, expect, it } from 'vitest'
import { softPasskey } from '../../../worker/test/authenticator'
import { ORIGIN, testServer } from '../../../worker/test/fakes'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { createLocalProjectStore } from '../../projects/localStore'
import { createMemoryProjectStore } from '../../projects/memoryStore'
import { createCloudApi } from '../api'
import { createCloudProjectStore } from '../cloudStore'
import { decodeRecord, encodeRecord } from '../codec'
import { projectStoreContract } from './storeContract'

/** The Worker in-process (real SQL, a KV map), an account signed in, and the cloud store on it. */
export async function signedInCloud(clock = { t: 1_000_000 }) {
  const server = testServer()
  const api = createCloudApi({ fetch: server.fetch })
  const key = softPasskey(ORIGIN)
  const o = await api.signupOptions('Test Person')
  await api.signupVerify(o.challengeId, await key.create(o.options as never))
  return { server, api, key, store: createCloudProjectStore(api, () => clock.t), clock }
}

let n = 0
projectStoreContract('the in-memory store', async () => {
  const clock = { t: 1_000_000 }
  return { store: createMemoryProjectStore(() => clock.t), tick: ms => (clock.t += ms) }
})

projectStoreContract('this browser’s store (IndexedDB)', async () => {
  const clock = { t: 1_000_000 }
  return { store: createLocalProjectStore({ db: createStore(`contract-${++n}`, 'projects'), now: () => clock.t }), tick: ms => (clock.t += ms) }
})

projectStoreContract('the cloud store', async () => {
  const c = await signedInCloud()
  return { store: c.store, tick: ms => (c.clock.t += ms) }
})

describe('putting a whole project in place (cloud sync’s download)', () => {
  it('writes it only while the project is at the revision expected', async () => {
    const local = createLocalProjectStore({ db: createStore(`whole-${++n}`, 'projects') })
    const p = await local.create({ name: 'Here', records: { plan: { v: 1 }, prefs: { a: 1 } } })
    const theirs = { ...p, name: 'From the cloud' }
    // Someone saved first: nothing changes.
    await local.save(p.id, { records: { plan: { v: 2 } } })
    expect(await local.putWhole(theirs, { plan: { v: 9 } }, p.revision)).toBeNull()
    expect((await local.read(p.id))?.plan).toEqual({ v: 2 })
    // At the right revision: exactly these records, and the revision moves on.
    const put = await local.putWhole(theirs, { plan: { v: 9 }, site: { s: 1 } }, 2)
    expect(put).toMatchObject({ name: 'From the cloud', revision: 3 })
    expect(await local.read(p.id)).toEqual({ plan: { v: 9 }, site: { s: 1 } })
    // A new one only while it isn't here.
    expect(await local.putWhole({ ...p, id: 'p_new' }, {}, null)).toMatchObject({ id: 'p_new', revision: 1 })
    expect(await local.putWhole({ ...p, id: 'p_new' }, {}, null)).toBeNull()
  })
})

describe('the record codec', () => {
  it('reads back what it writes, with JSON’s rules', () => {
    const value = { a: 1, b: [1, 'two', null, true], c: { d: 'é “x”' }, e: undefined, f: NaN, g: [undefined], h: new Date(0), '1': 'num key', '\u0001odd': 'escaped' }
    expect(decodeRecord(encodeRecord(value))).toEqual({ a: 1, b: [1, 'two', null, true], c: { d: 'é “x”' }, f: null, g: [null], h: '1970-01-01T00:00:00.000Z', '1': 'num key', '\u0001odd': 'escaped' })
    expect(decodeRecord(encodeRecord(null))).toBeNull()
    expect(decodeRecord(encodeRecord('text'))).toBe('text')
    expect(decodeRecord(encodeRecord({ '\u0001': 5 }))).toEqual({ '\u0001': 5 })
  })

  it('writes shared parts once, and shares them again on reading', () => {
    // An undo history: each step a new plan object that shares everything it didn't change.
    const base = garageFloor()
    const steps = Array.from({ length: 100 }, (_, i) => ({ ...base, name: `step ${i}` }))
    const history = { version: 1, past: steps, present: steps[99], future: [] }
    const text = encodeRecord(history)
    expect(text.length).toBeLessThan(JSON.stringify(history).length / 5)
    const back = decodeRecord(text) as typeof history
    expect(back).toEqual(JSON.parse(JSON.stringify(history)))
    expect(back.past[0].walls).toBe(back.past[50].walls)
    expect(back.past[0]).not.toBe(back.past[50])
    expect(back.present).toBe(back.past[99])
  })

  it('copes with a loop, and with a key named __proto__', () => {
    const a: Record<string, unknown> = { name: 'a' }
    a.self = a
    const back = decodeRecord(encodeRecord(a)) as Record<string, unknown>
    expect(back.self).toBe(back)
    const tricky = decodeRecord(encodeRecord(JSON.parse('{"__proto__": {"polluted": true}}'))) as Record<string, unknown>
    expect(Object.keys(tricky)).toEqual(['__proto__'])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('refuses text that isn’t one of its records', () => {
    expect(() => decodeRecord('{"walls":[]}')).toThrow(/can read/)
    expect(() => decodeRecord('{"bhp":1,"v":{"\\u0001":3}}')).toThrow(/refers/)
  })
})

describe('the cloud store on the Worker', () => {
  it('keeps small records out of KV, and puts a large one there', async () => {
    const { server, store } = await signedInCloud()
    const p = await store.create({ name: 'Sizes', records: { plan: garageFloor(), 'site-files': { version: 1, drawings: { d1: { image: 'data:image/png;base64,' + 'A'.repeat(700_000) } } } } })
    expect(server.env.BLOBS.writes).toBe(1)
    const back = (await store.read(p.id, ['site-files'])) ?? {}
    expect((back['site-files'] as { drawings: { d1: { image: string } } }).drawings.d1.image).toHaveLength(700_000 + 22)
  })

  it('doesn’t upload a record the server already has', async () => {
    const { server, store } = await signedInCloud()
    const big = { dxfText: 'x'.repeat(600_000) }
    const a = await store.create({ name: 'A', records: { survey: big } })
    await store.create({ name: 'B', records: { survey: big } })
    await store.save(a.id, { meta: { name: 'A2' } })
    expect(server.env.BLOBS.writes).toBe(1)
  })

  it('notices a record that arrives changed', async () => {
    const { server, store } = await signedInCloud()
    const p = await store.create({ name: 'Bad', records: { survey: { dxfText: 'y'.repeat(600_000) } } })
    const [key] = server.env.BLOBS.map.keys()
    server.env.BLOBS.map.set(key, new TextEncoder().encode(new TextDecoder().decode(server.env.BLOBS.map.get(key)).replace('yyy', 'yyz')))
    await expect(store.read(p.id)).rejects.toThrow(/didn’t arrive whole/)
  })

  it('says nothing to the server but “are you there?” before signing in', async () => {
    const server = testServer()
    const seen: string[] = []
    const api = createCloudApi({
      fetch: (input, init) => {
        seen.push(`${init?.method ?? 'GET'} ${String(input)}`)
        return server.fetch(input, init)
      },
    })
    expect(await api.health()).toEqual({ signup: 'open' })
    expect(await api.session()).toBeNull()
    expect(seen).toEqual(['GET /api/health', 'GET /api/session'])
  })

  it('tells an app with no API (GitHub Pages) that there is none', async () => {
    const pages = createCloudApi({ fetch: async () => new Response('<!doctype html><title>404</title>', { status: 404, headers: { 'content-type': 'text/html' } }) })
    expect(await pages.health()).toBeNull()
    const spa = createCloudApi({ fetch: async () => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }) })
    expect(await spa.health()).toBeNull()
    // Offline, it can't tell: the app carries on as it was last time.
    const offline = createCloudApi({ fetch: async () => Promise.reject(new TypeError('Failed to fetch')) })
    await expect(offline.health()).rejects.toThrow(/Offline/)
  })
})
