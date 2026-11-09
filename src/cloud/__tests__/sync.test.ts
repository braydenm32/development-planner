// Cloud sync between devices, each with its own IndexedDB and cookies, against one Worker
// (in-process, real SQL): pushing after edits settle, pulling on open, conflicts kept both ways,
// the first-upload review, offline, deletes, and two tabs on one device.

import 'fake-indexeddb/auto'
import { createStore } from 'idb-keyval'
import { describe, expect, it, vi } from 'vitest'
import { softPasskey } from '../../../worker/test/authenticator'
import { ORIGIN, testServer, type TestServer } from '../../../worker/test/fakes'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { createLocalProjectStore, type LocalProjectStore } from '../../projects/localStore'
import type { StoreWrite } from '../../projects/session'
import type { NewProject, ProjectChange } from '../../projects/types'
import { createCloudApi } from '../api'
import { createCloudProjectStore } from '../cloudStore'
import { createSync, type SyncHost, type SyncNotice, type SyncState } from '../sync'

let n = 0
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

interface World {
  server: TestServer
  key: ReturnType<typeof softPasskey>
  userId: string
  /** The network: false and every request fails as if offline. */
  online: { on: boolean }
}

async function world(): Promise<World> {
  const server = testServer()
  const key = softPasskey(ORIGIN)
  const api = createCloudApi({ fetch: server.browser() })
  const o = await api.signupOptions('Test Person')
  const { user } = await api.signupVerify(o.challengeId, await key.create(o.options as never))
  return { server, key, userId: user.id, online: { on: true } }
}

/** A device: its own store and a stand-in for the session (writes go through it, like the app's). */
async function device(w: World, opts: { local?: LocalProjectStore; signIn?: boolean; retryMs?: number } = {}) {
  const local = opts.local ?? createLocalProjectStore({ db: createStore(`device-${++n}`, 'projects') })
  const browser = w.server.browser()
  const requests: string[] = []
  const api = createCloudApi({
    fetch: async (input, init) => {
      if (!w.online.on) throw new TypeError('Failed to fetch')
      requests.push(`${init?.method ?? 'GET'} ${String(input)}`)
      return browser(input, init)
    },
  })
  if (opts.signIn !== false) {
    const o = await api.loginOptions()
    await api.loginVerify(o.challengeId, await w.key.get(o.options as never))
  }
  const watchers = new Set<(x: StoreWrite) => void>()
  const tell = (x: StoreWrite) => watchers.forEach(f => f(x))
  let open: string | null = null
  let editWaiting = false
  let beforeOpen: ((id: string) => Promise<void>) | null = null
  const landed: string[][] = []
  const host: SyncHost = {
    watch: fn => {
      watchers.add(fn)
      return () => watchers.delete(fn)
    },
    beforeOpen: fn => void (beforeOpen = fn),
    openId: () => open,
    flush: async () => {},
    landed: async changed => {
      landed.push(changed)
      return !(editWaiting && open && changed.includes(open))
    },
  }
  const notices: SyncNotice[] = []
  const states: SyncState[] = []
  const sync = createSync({ local, cloud: createCloudProjectStore(api), userId: w.userId, host, settleMs: 5, maxWaitMs: 40, retryMs: opts.retryMs, onNotice: x => notices.push(x), onState: s => states.push(s) })
  const app = {
    create: async (init: NewProject) => {
      const m = await local.create(init)
      tell({ op: 'create', id: m.id })
      return m
    },
    save: async (id: string, change: ProjectChange) => {
      const m = await local.save(id, change)
      tell({ op: 'save', id, kinds: Object.keys(change.records ?? {}) })
      return m
    },
    remove: async (id: string) => {
      await local.remove(id)
      tell({ op: 'remove', id })
    },
    open: async (id: string) => {
      await beforeOpen?.(id)
      open = id
    },
  }
  /** Let the writes settle and the pushes land. */
  const settle = async () => {
    await wait(15)
    await sync.flush()
    await wait(5)
    await sync.flush()
  }
  return {
    local,
    api,
    sync,
    app,
    notices,
    states,
    landed,
    requests,
    settle,
    editWaiting: (on: boolean) => void (editWaiting = on),
    names: async () => (await local.list()).map(m => m.name).sort(),
  }
}

const planOf = async (local: LocalProjectStore, id: string) => (await local.read(id, ['plan']))?.plan as { name?: string; walls: unknown[] }

describe('cloud sync', () => {
  it('pushes a project after its edits settle, sending only the records that changed', async () => {
    const w = await world()
    const a = await device(w)
    const p = await a.app.create({ name: 'My house', records: { survey: { dxfText: 'survey text' }, plan: garageFloor() } })
    await a.settle()
    const store = createCloudProjectStore(a.api)
    expect((await store.get(p.id))?.name).toBe('My house')
    expect(await store.read(p.id)).toEqual(await a.local.read(p.id))
    // A burst of edits: one push, with the plan only.
    a.requests.length = 0
    for (let i = 0; i < 5; i++) await a.app.save(p.id, { records: { plan: { ...garageFloor(), name: `v${i}` } } })
    await a.settle()
    expect(a.requests.filter(r => r.startsWith('POST') && r.includes('/commit'))).toHaveLength(1)
    expect(a.requests.filter(r => r.startsWith('PUT'))).toHaveLength(1)
    expect((await store.read(p.id, ['plan']))?.plan).toMatchObject({ name: 'v4' })
    expect(a.states.at(-1)).toMatchObject({ busy: 0, offline: false, error: null })
  })

  it('brings another device’s projects down on sync, and newer copies when a project opens', async () => {
    const w = await world()
    const a = await device(w)
    const p = await a.app.create({ name: 'Hilltop', records: { plan: garageFloor(), prefs: { view: { mode: '3d' } } } })
    await a.settle()
    const b = await device(w)
    await b.sync.syncNow()
    expect(await b.names()).toEqual(['Hilltop'])
    expect(await b.local.read(p.id)).toEqual(await a.local.read(p.id))
    // A changes it; B opens it and gets the change first.
    await a.app.save(p.id, { records: { plan: { ...garageFloor(), name: 'from A' } }, meta: { name: 'Hilltop v2' } })
    await a.settle()
    await b.app.open(p.id)
    expect((await planOf(b.local, p.id)).name).toBe('from A')
    expect((await b.local.get(p.id))?.name).toBe('Hilltop v2')
    expect(b.notices).toEqual([])
  })

  it('keeps both when a project changed on two devices, and tells him', async () => {
    const w = await world()
    const a = await device(w)
    const p = await a.app.create({ name: 'My house', records: { plan: garageFloor() } })
    await a.settle()
    const b = await device(w)
    await b.sync.syncNow()
    // Both change it before hearing of the other.
    await a.app.save(p.id, { records: { plan: { ...garageFloor(), name: 'desk' } } })
    await a.settle()
    await b.app.save(p.id, { records: { plan: { ...garageFloor(), name: 'phone' } } })
    await b.settle()
    // B kept its own under the id, and A's as a project of its own.
    expect(await b.names()).toEqual(['My house', 'My house (from another device)'])
    expect((await planOf(b.local, p.id)).name).toBe('phone')
    const copy = (await b.local.list()).find(m => m.name.endsWith('(from another device)'))!
    expect((await planOf(b.local, copy.id)).name).toBe('desk')
    expect(b.notices).toMatchObject([{ kind: 'conflict', name: 'My house', copyId: copy.id, copyName: 'My house (from another device)' }])
    // Both went up, so A sees both too, and nothing was lost.
    await b.settle()
    await a.sync.syncNow()
    expect(await a.names()).toEqual(['My house', 'My house (from another device)'])
    expect((await planOf(a.local, p.id)).name).toBe('phone')
    expect((await planOf(a.local, copy.id)).name).toBe('desk')
  })

  it('treats an edit waiting in the editor during a download as made on the old copy, and keeps both', async () => {
    const w = await world()
    const a = await device(w)
    const p = await a.app.create({ name: 'Open one', records: { plan: garageFloor() } })
    await a.settle()
    const b = await device(w)
    await b.sync.syncNow()
    await b.app.open(p.id)
    await a.app.save(p.id, { records: { plan: { ...garageFloor(), name: 'desk' } } })
    await a.settle()
    // B is mid-edit when it hears of A's change: the editor keeps B's work.
    b.editWaiting(true)
    await b.sync.syncNow()
    await b.app.save(p.id, { records: { plan: { ...garageFloor(), name: 'phone, made on the old copy' } } })
    b.editWaiting(false)
    await b.settle()
    expect(await b.names()).toEqual(['Open one', 'Open one (from another device)'])
    const copy = (await b.local.list()).find(m => m.name.endsWith('(from another device)'))!
    expect((await planOf(b.local, copy.id)).name).toBe('desk')
    expect((await planOf(b.local, p.id)).name).toBe('phone, made on the old copy')
  })

  it('keeps both even when the waiting edit lands after the next push', async () => {
    const w = await world()
    const a = await device(w)
    const p = await a.app.create({ name: 'Slow one', records: { plan: garageFloor() } })
    await a.settle()
    const b = await device(w)
    await b.sync.syncNow()
    await b.app.open(p.id)
    await a.app.save(p.id, { records: { plan: { ...garageFloor(), name: 'desk' } } })
    await a.settle()
    b.editWaiting(true)
    await b.sync.syncNow()
    // The push goes before the editor writes: the other device's change must not be lost.
    await b.settle()
    await b.app.save(p.id, { records: { plan: { ...garageFloor(), name: 'phone, made on the old copy' } } })
    b.editWaiting(false)
    await b.settle()
    expect(await b.names()).toEqual(['Slow one', 'Slow one (from another device)'])
    const copy = (await b.local.list()).find(m => m.name.endsWith('(from another device)'))!
    expect((await planOf(b.local, copy.id)).name).toBe('desk')
    await a.sync.syncNow()
    expect((await planOf(a.local, p.id)).name).toBe('phone, made on the old copy')
    expect((await planOf(a.local, copy.id)).name).toBe('desk')
  })

  it('doesn’t make a copy when the server already has exactly this (two tabs, or a lost answer)', async () => {
    const w = await world()
    const local = createLocalProjectStore({ db: createStore(`tabs-${++n}`, 'projects') })
    const tab1 = await device(w, { local })
    const tab2 = await device(w, { local })
    const p = await tab1.app.create({ name: 'Shared', records: { plan: garageFloor() } })
    await tab1.settle()
    await tab2.app.save(p.id, { records: { plan: { ...garageFloor(), name: 'x' } } })
    await tab2.settle()
    // Tab 1 pushes the same state (it heard of the write some other way).
    await tab1.app.save(p.id, { meta: { name: 'Shared' } })
    await tab1.settle()
    expect((await local.list()).map(m => m.name)).toEqual(['Shared'])
    expect([...tab1.notices, ...tab2.notices]).toEqual([])
  })
})

describe('the first upload', () => {
  it('offers the projects made before signing in, uploads the ones he picks, and never sends the others', async () => {
    const w = await world()
    const local = createLocalProjectStore({ db: createStore(`first-${++n}`, 'projects') })
    // Made before signing in: nothing is sent.
    const keep = await local.create({ name: 'Keep here', records: { plan: garageFloor() } })
    const up = await local.create({ name: 'Upload me', records: { plan: garageFloor() } })
    const a = await device(w, { local })
    await a.sync.syncNow()
    expect(a.requests.filter(r => !r.startsWith('GET'))).toEqual(['POST /api/auth/login/options', 'POST /api/auth/login/verify'])
    const offered = await a.sync.localOnly()
    expect(offered.waiting.map(m => m.name).sort()).toEqual(['Keep here', 'Upload me'])
    await a.sync.upload([up.id])
    await a.sync.keepHere([keep.id])
    await a.settle()
    const there = await createCloudProjectStore(a.api).list()
    expect(there.map(m => m.name)).toEqual(['Upload me'])
    // Kept-here projects aren't offered again, and their edits stay here.
    expect((await a.sync.localOnly()).waiting).toEqual([])
    expect((await a.sync.localOnly()).kept.map(m => m.id)).toEqual([keep.id])
    await a.app.save(keep.id, { meta: { name: 'Still here only' } })
    await a.settle()
    expect((await createCloudProjectStore(a.api).list()).map(m => m.name)).toEqual(['Upload me'])
    // A project made while signed in goes up by itself.
    await a.app.create({ name: 'New while signed in' })
    await a.settle()
    expect((await createCloudProjectStore(a.api).list()).map(m => m.name).sort()).toEqual(['New while signed in', 'Upload me'])
    expect([...(await a.sync.inCloud())].length).toBe(2)
  })
})

describe('offline', () => {
  it('keeps working on this device, says so, and sends everything when back', async () => {
    const w = await world()
    const a = await device(w)
    const p = await a.app.create({ name: 'Offline', records: { plan: garageFloor() } })
    await a.settle()
    w.online.on = false
    await a.app.save(p.id, { records: { plan: { ...garageFloor(), name: 'written offline' } } })
    await a.settle()
    expect(a.states.at(-1)).toMatchObject({ offline: true })
    expect((await planOf(a.local, p.id)).name).toBe('written offline')
    // A reload while offline loses nothing: a new sync on the same store still knows it is unsent.
    a.sync.stop()
    w.online.on = true
    const again = await device(w, { local: a.local })
    await again.sync.syncNow()
    await again.settle()
    expect((await createCloudProjectStore(again.api).read(p.id, ['plan']))?.plan).toMatchObject({ name: 'written offline' })
    expect(again.states.at(-1)).toMatchObject({ offline: false, busy: 0 })
  })

  it('tries again by itself once the network is back', async () => {
    const w = await world()
    const a = await device(w, { retryMs: 20 })
    const p = await a.app.create({ name: 'Retry' })
    await a.settle()
    w.online.on = false
    await a.app.save(p.id, { meta: { name: 'Retry 2' } })
    await vi.waitFor(() => expect(a.states.at(-1)?.offline).toBe(true))
    w.online.on = true
    await vi.waitFor(async () => expect((await createCloudProjectStore(a.api).get(p.id))?.name).toBe('Retry 2'))
    await vi.waitFor(() => expect(a.states.at(-1)).toMatchObject({ offline: false, busy: 0 }))
  })
})

describe('deleting', () => {
  it('deletes the cloud copy too, and the other device’s once nothing changed there', async () => {
    const w = await world()
    const a = await device(w)
    const p = await a.app.create({ name: 'Doomed', records: { plan: garageFloor() } })
    const keep = await a.app.create({ name: 'Keeper' })
    await a.settle()
    const b = await device(w)
    await b.sync.syncNow()
    await a.app.save(p.id, { meta: { archived: true }, touch: false })
    await a.app.remove(p.id)
    await a.settle()
    expect((await createCloudProjectStore(a.api).list()).map(m => m.id)).toEqual([keep.id])
    await b.sync.syncNow()
    expect(await b.names()).toEqual(['Keeper'])
    expect(b.notices).toMatchObject([{ kind: 'deleted-elsewhere', name: 'Doomed' }])
  })

  it('keeps a project deleted elsewhere but changed here, and sends it back', async () => {
    const w = await world()
    const a = await device(w)
    const p = await a.app.create({ name: 'Disputed', records: { plan: garageFloor() } })
    await a.settle()
    const b = await device(w)
    await b.sync.syncNow()
    await a.app.save(p.id, { meta: { archived: true }, touch: false })
    await a.app.remove(p.id)
    await a.settle()
    await b.app.save(p.id, { records: { plan: { ...garageFloor(), name: 'worked on' } } })
    await b.settle()
    expect(b.notices).toMatchObject([{ kind: 'kept-edited', name: 'Disputed' }])
    expect((await createCloudProjectStore(b.api).read(p.id, ['plan']))?.plan).toMatchObject({ name: 'worked on' })
  })

  it('archives the cloud copy first when that never got there', async () => {
    const w = await world()
    const a = await device(w)
    const p = await a.app.create({ name: 'Quick' })
    await a.settle()
    // Archived and deleted while offline, then back online.
    w.online.on = false
    await a.app.save(p.id, { meta: { archived: true }, touch: false })
    await a.app.remove(p.id)
    await a.settle()
    w.online.on = true
    await a.sync.syncNow()
    await a.settle()
    expect(await createCloudProjectStore(a.api).list()).toEqual([])
  })
})
