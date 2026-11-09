import { createStore, type UseStore } from 'idb-keyval'
import {
  EMPTY_NUMBERS,
  newProjectId,
  NotArchivedError,
  ProjectNotFoundError,
  type NewProject,
  type ProjectChange,
  type ProjectMeta,
  type ProjectRecords,
  type ProjectStore,
  type RecordKind,
} from './types'

/**
 * Projects in this browser's IndexedDB: one object store holding
 *   meta:<id>         each project's index entry
 *   rec:<id>:<kind>   each of its records (survey, plan, prefs, …), stored as given
 *   sys:<key>         device settings that never sync (the migration marker)
 * A save writes the records and the index entry in one transaction.
 */
export interface LocalProjectStore extends ProjectStore {
  getSetting<T>(key: string): Promise<T | undefined>
  setSetting(key: string, value: unknown): Promise<void>
  /**
   * Put a project in place whole, as cloud sync downloads it: this index entry and exactly these
   * records (any others go). Only while the project is still at `ifRevision` (null: only while it
   * isn't here at all), so a save that lands first is never overwritten; returns null then.
   * The revision moves on from the one here, so the app sees a change.
   */
  putWhole(meta: ProjectMeta, records: ProjectRecords, ifRevision: number | null): Promise<ProjectMeta | null>
}

export const PROJECTS_DB = 'block-and-house-planner'

const META = 'meta:'
const SYS = 'sys:'
const END = '￿'
const recKey = (id: string, kind: RecordKind) => `rec:${id}:${kind}`
const recRange = (id: string) => IDBKeyRange.bound(`rec:${id}:`, `rec:${id}:${END}`)

type Body<T> = (s: IDBObjectStore, ok: (v: T) => void, fail: (e: unknown) => void) => void

/** One transaction. Resolves once it has committed, so a resolved save is on disk. */
function run<T>(db: UseStore, mode: IDBTransactionMode, body: Body<T>): Promise<T> {
  return db(
    mode,
    s =>
      new Promise<T>((resolve, reject) => {
        let result: T
        let failed: unknown = null
        const tx = s.transaction
        const fail = (e: unknown) => {
          failed ??= e
          try {
            tx.abort()
          } catch {
            // already finished
          }
        }
        tx.oncomplete = () => (failed ? reject(failed) : resolve(result))
        tx.onabort = tx.onerror = () => reject(failed ?? tx.error ?? new Error('The save did not finish.'))
        try {
          body(s, v => (result = v), fail)
        } catch (e) {
          fail(e)
        }
      }),
  )
}

/** Run `fn` with the request's result once it succeeds; an error inside aborts the transaction. */
function after<R>(req: IDBRequest<R>, fail: (e: unknown) => void, fn: (r: R) => void) {
  req.onsuccess = () => {
    try {
      fn(req.result)
    } catch (e) {
      fail(e)
    }
  }
}

const byUpdated = (a: ProjectMeta, b: ProjectMeta) => b.updated - a.updated || b.created - a.created || a.name.localeCompare(b.name)

export function createLocalProjectStore(opts: { db?: UseStore; now?: () => number } = {}): LocalProjectStore {
  let db = opts.db
  const use: UseStore = (mode, cb) => {
    db ??= createStore(PROJECTS_DB, 'projects')
    return db(mode, cb)
  }
  const now = opts.now ?? Date.now

  return {
    list: () =>
      run<ProjectMeta[]>(use, 'readonly', (s, ok, fail) => {
        after(s.getAll(IDBKeyRange.bound(META, META + END)), fail, all => ok((all as ProjectMeta[]).sort(byUpdated)))
      }),

    get: id =>
      run<ProjectMeta | null>(use, 'readonly', (s, ok, fail) => {
        after(s.get(META + id), fail, m => ok((m as ProjectMeta | undefined) ?? null))
      }),

    read: (id, kinds) =>
      run<ProjectRecords | null>(use, 'readonly', (s, ok, fail) => {
        after(s.get(META + id), fail, m => {
          if (!m) return ok(null)
          const out: ProjectRecords = {}
          ok(out)
          if (kinds) {
            for (const k of kinds) after(s.get(recKey(id, k)), fail, v => v !== undefined && (out[k] = v))
            return
          }
          const prefix = `rec:${id}:`
          after(s.getAllKeys(recRange(id)), fail, keys => {
            after(s.getAll(recRange(id)), fail, values => {
              keys.forEach((k, i) => (out[String(k).slice(prefix.length)] = values[i]))
            })
          })
        })
      }),

    create: (init: NewProject) =>
      run<ProjectMeta>(use, 'readwrite', (s, ok, fail) => {
        const id = init.id ?? newProjectId()
        after(s.get(META + id), fail, existing => {
          if (existing) return fail(new Error(`Project ${id} already exists.`))
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
          for (const [k, v] of Object.entries(init.records ?? {})) if (v !== undefined && v !== null) s.put(v, recKey(id, k))
          s.put(meta, META + id)
          ok(meta)
        })
      }),

    save: (id: string, change: ProjectChange) =>
      run<ProjectMeta>(use, 'readwrite', (s, ok, fail) => {
        after(s.get(META + id), fail, prev => {
          const old = prev as ProjectMeta | undefined
          if (!old) return fail(new ProjectNotFoundError(id))
          for (const [k, v] of Object.entries(change.records ?? {})) {
            if (v === null) s.delete(recKey(id, k))
            else if (v !== undefined) s.put(v, recKey(id, k))
          }
          const meta: ProjectMeta = {
            ...old,
            ...change.meta,
            id,
            created: old.created,
            revision: old.revision + 1,
            updated: change.touch === false ? old.updated : Math.max(now(), old.updated),
          }
          s.put(meta, META + id)
          ok(meta)
        })
      }),

    remove: id =>
      run<void>(use, 'readwrite', (s, ok, fail) => {
        after(s.get(META + id), fail, prev => {
          const old = prev as ProjectMeta | undefined
          if (!old) return ok(undefined)
          if (!old.archived) return fail(new NotArchivedError())
          s.delete(recRange(id))
          s.delete(META + id)
          ok(undefined)
        })
      }),

    putWhole: (meta, records, ifRevision) =>
      run<ProjectMeta | null>(use, 'readwrite', (s, ok, fail) => {
        const id = meta.id
        after(s.get(META + id), fail, prev => {
          const old = prev as ProjectMeta | undefined
          if ((old?.revision ?? null) !== ifRevision) return ok(null)
          s.delete(recRange(id))
          for (const [k, v] of Object.entries(records)) if (v !== undefined && v !== null) s.put(v, recKey(id, k))
          const next: ProjectMeta = { ...meta, id, revision: (old?.revision ?? 0) + 1 }
          s.put(next, META + id)
          ok(next)
        })
      }),

    getSetting: <T,>(key: string) =>
      run<T | undefined>(use, 'readonly', (s, ok, fail) => {
        after(s.get(SYS + key), fail, v => ok(v as T | undefined))
      }),

    setSetting: (key, value) =>
      run<void>(use, 'readwrite', s => {
        s.put(value, SYS + key)
      }),
  }
}
