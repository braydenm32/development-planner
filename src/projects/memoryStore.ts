import { EMPTY_NUMBERS, newProjectId, NotArchivedError, ProjectNotFoundError, type ProjectMeta, type ProjectRecords, type ProjectStore } from './types'

/**
 * Projects held in memory only: what the app falls back to when the browser won't let it save
 * (some private windows), so it still works for the session and can say plainly that nothing
 * will survive a reload. Also a reference for what a ProjectStore must do.
 */
export function createMemoryProjectStore(now: () => number = Date.now): ProjectStore {
  const metas = new Map<string, ProjectMeta>()
  const recs = new Map<string, ProjectRecords>()
  const copy = <T,>(v: T): T => structuredClone(v)
  return {
    list: async () => [...metas.values()].map(copy).sort((a, b) => b.updated - a.updated || b.created - a.created),
    get: async id => copy(metas.get(id) ?? null),
    read: async (id, kinds) => {
      if (!metas.has(id)) return null
      const all = recs.get(id) ?? {}
      return copy(kinds ? Object.fromEntries(kinds.filter(k => k in all).map(k => [k, all[k]])) : all)
    },
    create: async init => {
      const id = init.id ?? newProjectId()
      if (metas.has(id)) throw new Error(`Project ${id} already exists.`)
      const t = now()
      const meta: ProjectMeta = { surveyFileName: null, thumbnail: null, numbers: EMPTY_NUMBERS, ...init.meta, archived: init.meta?.archived ?? false, id, name: init.meta?.name ?? init.name, created: t, updated: t, revision: 1 }
      metas.set(id, meta)
      recs.set(id, copy(Object.fromEntries(Object.entries(init.records ?? {}).filter(([, v]) => v != null))))
      return copy(meta)
    },
    save: async (id, change) => {
      const old = metas.get(id)
      if (!old) throw new ProjectNotFoundError(id)
      const r = { ...recs.get(id) }
      for (const [k, v] of Object.entries(change.records ?? {})) {
        if (v === null) delete r[k]
        else if (v !== undefined) r[k] = copy(v)
      }
      const meta = { ...old, ...change.meta, id, created: old.created, revision: old.revision + 1, updated: change.touch === false ? old.updated : Math.max(now(), old.updated) }
      recs.set(id, r)
      metas.set(id, meta)
      return copy(meta)
    },
    remove: async id => {
      const old = metas.get(id)
      if (!old) return
      if (!old.archived) throw new NotArchivedError()
      metas.delete(id)
      recs.delete(id)
    },
  }
}
