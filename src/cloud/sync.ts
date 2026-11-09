// Cloud sync: this browser's store stays the working copy (so the app works offline), and the
// cloud follows it.
//
// - Push: after a project's writes settle, its state goes up through a write queue
//   (src/projects/queue.ts), one lane per project, so pushes never overlap and a failed one is
//   tried again. Only records whose hash changed are sent.
// - Pull: at start, when a project opens and when the page comes back, newer cloud copies come
//   down, but only into a project with no changes waiting here.
// - Conflicts: a push from a revision the server has moved past is refused (409). Both are then
//   kept: the server's copy becomes "<name> (from another device)" here, and this device's copy
//   goes up in its place. Nothing is overwritten silently.
//
// What this device knows of each project's cloud copy (its manifest) is kept with the local
// store's own settings, so a reload, or a week offline, loses nothing.

import { freeName } from '../projects/ops'
import { withWriteQueue } from '../projects/queue'
import type { LocalProjectStore } from '../projects/localStore'
import type { StoreWrite } from '../projects/session'
import { newProjectId, type ProjectMeta, type ProjectRecords, type ProjectStore } from '../projects/types'
import { ConflictError, isOffline, isSignedOut, type RemoteProject } from './api'
import { metaOf, type CloudProjectStore } from './cloudStore'
import { encodeForCloud, type Encoded } from './codec'

export interface Manifest {
  /** The server revision this device's copy is based on (0: not in the cloud yet). */
  cloudRevision: number
  /** The local revision when it last matched the cloud (-1: changed since, or never sent). */
  localRevision: number
  /** Each record's hash, as the server has it. */
  hashes: Record<string, string>
  /** Kept on this device only (chosen in the upload review). */
  localOnly?: boolean
}

/** The session, as sync sees it (src/projects/session.ts → projectSync). */
export interface SyncHost {
  watch(fn: (w: StoreWrite) => void): () => void
  beforeOpen(fn: ((id: string) => Promise<void>) | null): void
  openId(): string | null
  flush(): Promise<void>
  landed(changed: string[], removed?: string[]): Promise<boolean>
}

export interface SyncNotice {
  kind: 'conflict' | 'deleted-elsewhere' | 'kept-edited' | 'kept-changed'
  /** The project it is about. */
  name: string
  id?: string
  /** The other device's copy, kept as a project of its own. */
  copyId?: string
  copyName?: string
  at: number
}

export interface SyncState {
  /** Projects waiting to go up, or going up now. */
  busy: number
  offline: boolean
  signedOut: boolean
  error: string | null
  lastSynced: number | null
}

export interface SyncDeps {
  local: LocalProjectStore
  cloud: CloudProjectStore
  userId: string
  host: SyncHost
  now?: () => number
  /** A project goes up this long after its last write (ms)… */
  settleMs?: number
  /** …or this long after its first unsent one, while edits keep coming. */
  maxWaitMs?: number
  /** After a failure, try again this long after (ms), doubling each time up to five minutes. */
  retryMs?: number
  onState?: (s: SyncState) => void
  onNotice?: (n: SyncNotice) => void
}

export type Sync = ReturnType<typeof createSync>

const NEW: Manifest = { cloudRevision: 0, localRevision: -1, hashes: {} }

/** Meta as it is compared and sent: everything but this store's own id and revision. */
function content(m: ProjectMeta) {
  const { id: _id, revision: _rev, ...rest } = m
  void _id
  void _rev
  return rest
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .filter(k => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(v) ?? 'null'
}

export const hashesOf = (r: RemoteProject) => Object.fromEntries(Object.entries(r.records).map(([k, ref]) => [k, ref.hash]))

const sameHashes = (a: Record<string, string>, b: Record<string, string>) => {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every(k => a[k] === b[k])
}

export function createSync(d: SyncDeps) {
  const { local, cloud, userId, host } = d
  const now = d.now ?? Date.now
  const settleMs = d.settleMs ?? 2000
  const maxWaitMs = d.maxWaitMs ?? 15000
  const retryMs = d.retryMs ?? 5000
  const mKey = (id: string) => `cloud:${userId}:p:${id}`
  const delKey = `cloud:${userId}:deletes`
  const getM = (id: string) => local.getSetting<Manifest>(mKey(id))
  const setM = (id: string, m: Manifest | undefined) => local.setSetting(mKey(id), m)
  const deletes = async () => (await local.getSetting<{ id: string }[]>(delKey)) ?? []

  let stopped = false
  const state: SyncState = { busy: 0, offline: false, signedOut: false, error: null, lastSynced: null }
  const report = () => {
    state.busy = timers.size + inflight
    d.onState?.({ ...state })
  }
  const notice = (n: Omit<SyncNotice, 'at'>) => d.onNotice?.({ ...n, at: now() })

  // ---- One at a time per project: in this tab, and across tabs where the browser can.

  const chains = new Map<string, Promise<unknown>>()
  function locked<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
    const run = () => (locks ? locks.request(`bhp-cloud:${userId}:${id}`, fn) : fn())
    const next = (chains.get(id) ?? Promise.resolve()).then(run, run)
    chains.set(
      id,
      next.catch(() => {}),
    )
    return next
  }

  // ---- What changed since the last push, while the count of writes says it can be trusted.

  const observed = new Map<string, { saves: number; kinds: Set<string> }>()

  // ---- Pushing.

  async function encodeAll(records: ProjectRecords) {
    const out: Record<string, Encoded> = {}
    for (const [k, v] of Object.entries(records)) if (v !== undefined && v !== null) out[k] = await encodeForCloud(v)
    return out
  }

  /** Keep the server's copy as a project of its own here, and send it up as one. */
  async function keepServerCopy(r: RemoteProject, about: string, fetched?: ProjectRecords) {
    const records = fetched ?? (await cloud.fetch(r.records))
    const copyName = await freeName(local, `${r.meta.name} (from another device)`)
    const copyId = newProjectId()
    await local.putWhole({ ...metaOf(r), id: copyId, name: copyName }, records, null)
    await setM(copyId, NEW)
    await host.landed([copyId])
    notice({ kind: 'conflict', name: about, id: r.id, copyId, copyName })
    schedule(copyId, 0)
  }

  async function push(id: string): Promise<void> {
    if ((await deletes()).some(x => x.id === id)) return pushDelete(id)
    const m = await getM(id)
    if (!m || m.localOnly) return
    const meta = await local.get(id)
    if (!meta || meta.revision === m.localRevision) return
    const seen = observed.get(id)
    observed.delete(id)
    try {
      // Only the records written since the last push, when every write since was seen here.
      const trusted = !!seen && m.localRevision >= 0 && meta.revision === m.localRevision + seen.saves
      let kinds = trusted ? [...seen.kinds] : undefined
      let records = (await local.read(id, kinds)) ?? {}
      let enc = await encodeAll(records)
      let hashes: Record<string, string> = trusted ? { ...m.hashes } : {}
      for (const k of kinds ?? []) delete hashes[k]
      for (const [k, e] of Object.entries(enc)) hashes[k] = e.hash
      let known = m.hashes
      let base = m.cloudRevision
      for (let attempt = 0; attempt < 4; attempt++) {
        const changes: Record<string, Encoded | null> = {}
        for (const [k, h] of Object.entries(hashes)) if (known[k] !== h) changes[k] = enc[k]
        for (const k of Object.keys(known)) if (!(k in hashes)) changes[k] = null
        try {
          const r = await cloud.put(id, base, meta, changes)
          await setM(id, { cloudRevision: r.revision, localRevision: meta.revision, hashes })
          return
        } catch (e) {
          if (!(e instanceof ConflictError)) throw e
          // Compare against all of it from here on.
          if (kinds) {
            kinds = undefined
            records = (await local.read(id)) ?? {}
            enc = await encodeAll(records)
            hashes = Object.fromEntries(Object.entries(enc).map(([k, x]) => [k, x.hash]))
          }
          const r = e.project
          if (!r) {
            base = 0
            known = {}
          } else if (r.deleted) {
            // Deleted on another device, but changed here since: it goes back up, and he is told.
            notice({ kind: 'kept-edited', name: meta.name, id })
            base = r.revision
            known = {}
          } else if (sameHashes(hashesOf(r), hashes) && canonical(content(metaOf(r))) === canonical(content(meta))) {
            // The server already has exactly this (another tab sent it, or the answer got lost).
            await setM(id, { cloudRevision: r.revision, localRevision: meta.revision, hashes })
            return
          } else {
            await keepServerCopy(r, meta.name)
            base = r.revision
            known = hashesOf(r)
          }
        }
      }
      throw new Error('This project kept changing in the cloud while it was being saved. It will be tried again.')
    } catch (e) {
      if (seen) {
        const o = observed.get(id) ?? { saves: 0, kinds: new Set<string>() }
        o.saves += seen.saves
        for (const k of seen.kinds) o.kinds.add(k)
        observed.set(id, o)
      }
      throw e
    }
  }

  async function pushDelete(id: string): Promise<void> {
    const entry = (await deletes()).find(x => x.id === id)
    if (!entry) return
    const m = await getM(id)
    const base = m && !m.localOnly ? m.cloudRevision : 0
    try {
      if (base > 0) await cloud.deleteAt(id, base)
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e
      const r = e.project
      if (r && !r.deleted) {
        if (e.code === 'not-archived' && r.revision === base) {
          // Archived here, but that never reached the cloud: archive it there, then delete.
          const archived = await cloud.put(id, base, { ...metaOf(r), archived: true }, {})
          await cloud.deleteAt(id, archived.revision)
        } else {
          // Changed on another device since this one last saw it: bring it back rather than lose that.
          const w = await local.putWhole(metaOf(r), await cloud.fetch(r.records), null)
          if (w) {
            await setM(id, { cloudRevision: r.revision, localRevision: w.revision, hashes: hashesOf(r) })
            await host.landed([id])
            notice({ kind: 'kept-changed', name: r.meta.name, id })
          }
          await local.setSetting(delKey, (await deletes()).filter(x => x.id !== id))
          return
        }
      }
    }
    await setM(id, undefined)
    await local.setSetting(delKey, (await deletes()).filter(x => x.id !== id))
  }

  // The lane: the app's write queue in front of "push this project's state now".
  const lane = withWriteQueue({
    save: async (id: string) => {
      await locked(id, () => push(id))
      return { id } as ProjectMeta
    },
  } as unknown as ProjectStore)

  // ---- Scheduling, and how it's going.

  const timers = new Map<string, { t: ReturnType<typeof setTimeout>; first: number }>()
  let inflight = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let retryWait = 0

  function schedule(id: string, delay = settleMs) {
    if (stopped) return
    const prev = timers.get(id)
    const first = prev?.first ?? now()
    if (prev) clearTimeout(prev.t)
    const wait = Math.max(0, Math.min(delay, first + maxWaitMs - now()))
    timers.set(id, {
      first,
      t: setTimeout(() => {
        timers.delete(id)
        void send(id)
      }, wait),
    })
    report()
  }

  function failed(e: unknown) {
    if (isOffline(e)) state.offline = true
    else if (isSignedOut(e)) state.signedOut = true
    else state.error = (e as Error)?.message || 'The cloud didn’t take the last change.'
    // Try again later, waiting longer each time (5 s up to 5 min).
    report()
    if (stopped || state.signedOut) return
    retryWait = Math.min(Math.max(retryWait * 2, retryMs), 300_000)
    clearTimeout(retryTimer)
    retryTimer = setTimeout(() => void retry(), retryWait)
  }

  function worked() {
    if (lane.unsaved().length) return
    state.offline = false
    state.error = null
    state.lastSynced = now()
    retryWait = 0
  }

  async function send(id: string) {
    inflight++
    report()
    try {
      await lane.save(id, {})
      worked()
    } catch (e) {
      failed(e)
    } finally {
      inflight--
      report()
    }
  }

  async function retry() {
    if (stopped) return
    inflight++
    report()
    try {
      // Not from under the editor: this runs while he may be working.
      await pullAll({ leaveOpen: true })
      await lane.flush()
      if (lane.unsaved().length) throw new Error(state.error ?? 'Not saved yet.')
      await pushDirty()
      worked()
    } catch (e) {
      failed(e)
    } finally {
      inflight--
      report()
    }
  }

  /** Send every project with changes the cloud doesn't have. */
  async function pushDirty() {
    for (const m of await local.list()) {
      const man = await getM(m.id)
      if (man && !man.localOnly && man.localRevision !== m.revision) schedule(m.id, 0)
    }
    for (const x of await deletes()) schedule(x.id, 0)
  }

  // ---- Pulling.

  async function fastForward(r: RemoteProject, m: Manifest) {
    if (host.openId() === r.id) await host.flush()
    const before = await local.get(r.id)
    // Changed here meanwhile: the push will find both changed, and keep both.
    if (!before || before.revision !== m.localRevision) return
    const same = Object.keys(r.records).filter(k => m.hashes[k] === r.records[k].hash)
    const kept = same.length ? ((await local.read(r.id, same)) ?? {}) : {}
    const fetchKinds = Object.keys(r.records).filter(k => !(k in kept))
    const fetched = await cloud.fetch(Object.fromEntries(fetchKinds.map(k => [k, r.records[k]])))
    const records = { ...kept, ...fetched }
    const w = await local.putWhole(metaOf(r), records, before.revision)
    if (!w) return
    if (await host.landed([r.id])) {
      await setM(r.id, { cloudRevision: r.revision, localRevision: w.revision, hashes: hashesOf(r) })
      return
    }
    // An edit was waiting in the editor, made on the copy before. Keep the cloud's version as a
    // copy now, and send this one over it once the edit lands, whenever that is.
    await keepServerCopy(r, before.name, records)
    await setM(r.id, { cloudRevision: r.revision, localRevision: -1, hashes: hashesOf(r) })
    schedule(r.id)
  }

  async function pullOne(r: RemoteProject, here: ProjectMeta | null, opts: { leaveOpen?: boolean }, changed: string[], removed: string[]) {
    const m = await getM(r.id)
    if (r.deleted) {
      if (!here) {
        if (m) await setM(r.id, undefined)
        return
      }
      // Deleted on another device. If nothing changed here since, it goes here too (not from
      // under the editor, though); if it did, the push sends it back up and says so.
      if (!m || m.localOnly || here.revision !== m.localRevision || host.openId() === r.id) return
      if (!here.archived) await local.save(r.id, { meta: { archived: true }, touch: false })
      await local.remove(r.id)
      await setM(r.id, undefined)
      removed.push(r.id)
      notice({ kind: 'deleted-elsewhere', name: here.name, id: r.id })
      return
    }
    if (!here) {
      const w = await local.putWhole(metaOf(r), await cloud.fetch(r.records), null)
      if (w) {
        await setM(r.id, { cloudRevision: r.revision, localRevision: w.revision, hashes: hashesOf(r) })
        changed.push(r.id)
      }
      return
    }
    if (!m) {
      // Here and there under one id, but never synced (a download cut short): the same, or keep both.
      const hashes = Object.fromEntries(Object.entries(await encodeAll((await local.read(r.id)) ?? {})).map(([k, e]) => [k, e.hash]))
      if (sameHashes(hashes, hashesOf(r))) await setM(r.id, { cloudRevision: r.revision, localRevision: here.revision, hashes })
      else {
        await keepServerCopy(r, here.name)
        await setM(r.id, { cloudRevision: r.revision, localRevision: -1, hashes: hashesOf(r) })
      }
      return
    }
    if (m.localOnly || r.revision === m.cloudRevision) return
    if (r.revision < m.cloudRevision) {
      // The cloud went back (restored, say): send this copy again; the check sorts out the rest.
      await setM(r.id, { ...m, cloudRevision: r.revision, localRevision: -1 })
      return
    }
    if (here.revision !== m.localRevision) return
    if (opts.leaveOpen && host.openId() === r.id) return
    await fastForward(r, m)
  }

  async function pullAll(opts: { leaveOpen?: boolean } = {}) {
    const remotes = await cloud.remotes()
    const here = new Map((await local.list()).map(m => [m.id, m]))
    const waiting = new Set((await deletes()).map(x => x.id))
    const changed: string[] = []
    const removed: string[] = []
    for (const r of remotes) {
      if (waiting.has(r.id) || stopped) continue
      await locked(r.id, () => pullOne(r, here.get(r.id) ?? null, opts, changed, removed))
    }
    // Ours that the cloud has never heard of (it lost them): they go up again.
    const there = new Set(remotes.map(r => r.id))
    for (const id of here.keys()) {
      if (there.has(id)) continue
      const m = await getM(id)
      if (m && !m.localOnly && m.cloudRevision > 0) await setM(id, NEW)
    }
    if (changed.length || removed.length) await host.landed(changed, removed)
    state.lastSynced = now()
  }

  // ---- Hearing about the session's writes.

  async function heard(w: StoreWrite) {
    if (w.op === 'create') {
      if (!(await getM(w.id))) await setM(w.id, NEW)
      schedule(w.id)
      return
    }
    if (w.op === 'save') {
      const o = observed.get(w.id) ?? { saves: 0, kinds: new Set<string>() }
      o.saves++
      for (const k of w.kinds ?? []) o.kinds.add(k)
      observed.set(w.id, o)
      const m = await getM(w.id)
      if (m && !m.localOnly) schedule(w.id)
      return
    }
    // Deleted for good here: the cloud copy goes too, after any push of it still on its way.
    const m = await getM(w.id)
    if (!m) return
    const list = await deletes()
    if (!list.some(x => x.id === w.id)) await local.setSetting(delKey, [...list, { id: w.id }])
    schedule(w.id, 0)
  }

  const unwatch = host.watch(w => void heard(w).catch(failed))

  // Bring a project up to date as it opens, but don't hold it up for long.
  host.beforeOpen(async id => {
    const r = await Promise.race([cloud.remote(id), new Promise<null>(res => setTimeout(() => res(null), 2500))])
    if (!r || stopped) return
    const changed: string[] = []
    await locked(id, async () => pullOne(r, await local.get(id), {}, changed, []))
    if (changed.length) await host.landed(changed)
  })

  return {
    state: () => ({ ...state }),
    /** Bring everything up to date both ways: at start, after signing in, when the page comes back, Sync now. */
    async syncNow(opts: { leaveOpen?: boolean } = {}) {
      inflight++
      report()
      try {
        state.signedOut = false
        await pullAll(opts)
        await pushDirty()
        await lane.flush()
        worked()
      } catch (e) {
        failed(e)
      } finally {
        inflight--
        report()
      }
    },
    /** Send what is waiting now, and wait for it. */
    async flush() {
      for (const [id, t] of timers) {
        clearTimeout(t.t)
        timers.delete(id)
        void send(id)
      }
      await lane.flush()
    },
    /** Projects on this device that aren't in the cloud: never asked about, or kept here. */
    async localOnly(): Promise<{ waiting: ProjectMeta[]; kept: ProjectMeta[] }> {
      const waiting: ProjectMeta[] = []
      const kept: ProjectMeta[] = []
      for (const m of await local.list()) {
        const man = await getM(m.id)
        if (!man) waiting.push(m)
        else if (man.localOnly) kept.push(m)
      }
      return { waiting, kept }
    },
    /** Which projects are in the cloud (or on their way there). */
    async inCloud(): Promise<Set<string>> {
      const out = new Set<string>()
      for (const m of await local.list()) {
        const man = await getM(m.id)
        if (man && !man.localOnly) out.add(m.id)
      }
      return out
    },
    /** Start keeping these in the cloud (the upload review). */
    async upload(ids: string[]) {
      for (const id of ids) {
        await setM(id, NEW)
        schedule(id, 0)
      }
    },
    /** Keep these on this device only, and don't ask again. */
    async keepHere(ids: string[]) {
      for (const id of ids) await setM(id, { ...NEW, localOnly: true })
    },
    stop() {
      stopped = true
      unwatch()
      host.beforeOpen(null)
      for (const t of timers.values()) clearTimeout(t.t)
      timers.clear()
      clearTimeout(retryTimer)
    },
  }
}

