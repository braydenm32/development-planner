// Projects in the cloud, as a ProjectStore (src/projects/types.ts): the same contract as this
// browser's store, so anything written against ProjectStore works on it. Cloud sync (./sync.ts)
// uses its lower-level `put`, which commits a whole index entry only if the server is still at
// the revision this device last saw, and otherwise throws ConflictError with what the server has.

import { EMPTY_NUMBERS, newProjectId, NotArchivedError, ProjectNotFoundError, type ProjectMeta, type ProjectRecords, type ProjectStore, type RecordKind } from '../projects/types'
import { ConflictError, CloudError, PART_SIZE, partsFor, type CloudApi, type RecordRef, type RemoteProject } from './api'
import { decodeRecord, encodeForCloud, sha256Hex, type Encoded } from './codec'

export interface CloudProjectStore extends ProjectStore {
  api: CloudApi
  /** Everything the server has for this account, deleted projects (tombstones) included. */
  remotes(): Promise<RemoteProject[]>
  remote(id: string): Promise<RemoteProject | null>
  /**
   * Upload the records the server doesn't have yet, then commit `meta` and the record changes
   * (null removes one; records not named stay as they are) if the server is still at `base`
   * (0: the project is new there). Throws ConflictError otherwise, and nothing changes.
   */
  put(id: string, base: number, meta: ProjectMeta, records: Record<string, Encoded | null>): Promise<RemoteProject>
  /** Download records, each checked against its hash. */
  fetch(refs: Record<string, RecordRef>): Promise<ProjectRecords>
  /** Delete for good, if the server is still at `base`. */
  deleteAt(id: string, base: number): Promise<void>
}

const ref = (e: Encoded): RecordRef => ({ hash: e.hash, size: e.bytes.byteLength, parts: partsFor(e.bytes.byteLength) })

/** The newest first, as every store lists them. */
const byUpdated = (a: ProjectMeta, b: ProjectMeta) => b.updated - a.updated || b.created - a.created || a.name.localeCompare(b.name)

/** The index entry as the app knows it: the server's revision, its id. */
export const metaOf = (r: RemoteProject): ProjectMeta => ({ ...r.meta, id: r.id, revision: r.revision })

/**
 * Download records part by part, each checked against its hash and size, and decode them. A
 * shared project (src/share-links) reads its records this way too, through its own `getPart`.
 */
export async function readRecords(refs: Record<string, RecordRef>, getPart: (hash: string, part: number) => Promise<Uint8Array>): Promise<ProjectRecords> {
  const out: ProjectRecords = {}
  for (const [kind, r] of Object.entries(refs)) {
    const chunks: Uint8Array[] = []
    for (let p = 0; p < r.parts; p++) chunks.push(await getPart(r.hash, p))
    const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0))
    let at = 0
    for (const c of chunks) {
      bytes.set(c, at)
      at += c.byteLength
    }
    if (bytes.byteLength !== r.size || (await sha256Hex(bytes)) !== r.hash) throw new Error(`The cloud copy of this project’s ${kind} didn’t arrive whole. Try again.`)
    out[kind] = decodeRecord(new TextDecoder().decode(bytes))
  }
  return out
}

export function createCloudProjectStore(api: CloudApi, now: () => number = Date.now): CloudProjectStore {
  async function upload(records: Record<string, Encoded | null>) {
    const list = Object.values(records).filter((e): e is Encoded => !!e)
    const byHash = new Map(list.map(e => [e.hash, e]))
    const hashes = [...byHash.keys()]
    const missing: string[] = []
    for (let i = 0; i < hashes.length; i += 64) missing.push(...(await api.missing(hashes.slice(i, i + 64))))
    for (const h of missing) {
      const e = byHash.get(h)!
      const size = e.bytes.byteLength
      for (let part = 0; part < partsFor(size); ) {
        try {
          const r = await api.putPart(h, part, size, e.bytes.slice(part * PART_SIZE, (part + 1) * PART_SIZE))
          part = r.complete ? partsFor(size) : r.next
        } catch (err) {
          // Parts go in order; the server says where to carry on (after a dropped connection, say).
          if (err instanceof ConflictError && typeof err.body.next === 'number') part = err.body.next
          else throw err
        }
      }
    }
  }

  async function put(id: string, base: number, meta: ProjectMeta, records: Record<string, Encoded | null>): Promise<RemoteProject> {
    const refs = Object.fromEntries(Object.entries(records).map(([k, e]) => [k, e ? ref(e) : null]))
    await upload(records)
    try {
      return await api.commit(id, { base, meta, records: refs })
    } catch (e) {
      // A blob was tidied away between the check and the commit: send it again, once.
      if (!(e instanceof CloudError && e.code === 'missing-blobs')) throw e
      await upload(records)
      return api.commit(id, { base, meta, records: refs })
    }
  }

  const fetchRecords = (refs: Record<string, RecordRef>) => readRecords(refs, (hash, part) => api.getPart(hash, part))

  const live = async (id: string) => {
    const r = await api.project(id)
    return r && !r.deleted ? r : null
  }

  const encodeAll = async (records: Partial<Record<RecordKind, unknown>>) => {
    const out: Record<string, Encoded | null> = {}
    for (const [k, v] of Object.entries(records)) if (v !== undefined) out[k] = v === null ? null : await encodeForCloud(v)
    return out
  }

  const store: CloudProjectStore = {
    api,
    remotes: () => api.projects(),
    remote: id => api.project(id),
    put,
    fetch: fetchRecords,
    async deleteAt(id, base) {
      await api.remove(id, base)
    },

    list: async () =>
      (await api.projects())
        .filter(r => !r.deleted)
        .map(metaOf)
        .sort(byUpdated),

    get: async id => {
      const r = await live(id)
      return r ? metaOf(r) : null
    },

    read: async (id, kinds) => {
      const r = await live(id)
      if (!r) return null
      const refs = kinds ? Object.fromEntries(Object.entries(r.records).filter(([k]) => kinds.includes(k))) : r.records
      return fetchRecords(refs)
    },

    create: async init => {
      const id = init.id ?? newProjectId()
      const t = now()
      const meta: ProjectMeta = {
        surveyFileName: null,
        thumbnail: null,
        numbers: EMPTY_NUMBERS,
        ...init.meta,
        archived: init.meta?.archived ?? false,
        id,
        name: init.meta?.name ?? init.name,
        created: t,
        updated: t,
        revision: 1,
      }
      const records = Object.fromEntries(Object.entries(init.records ?? {}).filter(([, v]) => v !== undefined && v !== null))
      try {
        return metaOf(await put(id, 0, meta, await encodeAll(records)))
      } catch (e) {
        if (e instanceof ConflictError) throw new Error(`Project ${id} already exists.`)
        throw e
      }
    },

    // A change is applied to what the server has now; if another save lands first, it is applied again on top.
    save: async (id, change) => {
      const records = await encodeAll(change.records ?? {})
      for (let attempt = 0; ; attempt++) {
        const cur = await live(id)
        if (!cur) throw new ProjectNotFoundError(id)
        const old = metaOf(cur)
        const meta: ProjectMeta = {
          ...old,
          ...change.meta,
          id,
          created: old.created,
          revision: old.revision + 1,
          updated: change.touch === false ? old.updated : Math.max(now(), old.updated),
        }
        try {
          return metaOf(await put(id, cur.revision, meta, records))
        } catch (e) {
          if (!(e instanceof ConflictError) || attempt >= 3) throw e
        }
      }
    },

    remove: async id => {
      for (let attempt = 0; ; attempt++) {
        const cur = await live(id)
        if (!cur) return
        if (!cur.meta.archived) throw new NotArchivedError()
        try {
          return await api.remove(id, cur.revision)
        } catch (e) {
          if (!(e instanceof ConflictError) || attempt >= 3) throw e
        }
      }
    },
  }
  return store
}
