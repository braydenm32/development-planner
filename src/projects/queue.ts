import { ProjectNotFoundError, type ProjectChange, type ProjectMeta, type ProjectStore } from './types'

/**
 * One write queue per project, in front of any ProjectStore.
 *
 * - Saves to one project never overlap: one write is in flight, and everything asked for
 *   meanwhile is merged into a single next write (the newest value of each record wins).
 * - A save resolves once a write that includes it has landed.
 * - A write that fails is kept and folded under the next save (newer values still win), so it
 *   is retried rather than dropped; the store's last good copy stays as it was.
 * - Reads, duplicates and deletes of a project wait for its queue first, so they see every save.
 */
export interface QueuedProjectStore extends ProjectStore {
  /** Wait until every save asked for so far (for one project, or all) has landed or failed. */
  flush(id?: string): Promise<void>
  /** Projects with changes that haven't reached storage, because a write failed. */
  unsaved(): string[]
  /** An edit to this project (not only preferences) is still to be written, or is being written now. */
  unsavedEdits(id: string): boolean
  /**
   * Forget every change to this project that hasn't been written (the copy stored is newer: another
   * tab saved it). Saves still waiting fail with `why`. Resolves once nothing is in flight.
   */
  drop(id: string, why: unknown): Promise<void>
}

interface Waiter {
  resolve: (m: ProjectMeta) => void
  reject: (e: unknown) => void
}

interface Lane {
  running: Promise<void> | null
  /** The write in flight is an edit (not only preferences). */
  runningEdit: boolean
  pending: { change: ProjectChange; waiters: Waiter[] } | null
  /** A change whose write failed, folded into the next one. */
  failed: ProjectChange | null
}

/** `b` on top of `a`: later records and index fields win; an edit in either makes it an edit. */
export function mergeChanges(a: ProjectChange, b: ProjectChange): ProjectChange {
  return {
    meta: a.meta || b.meta ? { ...a.meta, ...b.meta } : undefined,
    records: a.records || b.records ? { ...a.records, ...b.records } : undefined,
    touch: a.touch !== false || b.touch !== false,
  }
}

export function withWriteQueue(store: ProjectStore): QueuedProjectStore {
  const lanes = new Map<string, Lane>()
  const lane = (id: string) => {
    let l = lanes.get(id)
    if (!l) lanes.set(id, (l = { running: null, runningEdit: false, pending: null, failed: null }))
    return l
  }

  const kick = (id: string) => {
    const l = lane(id)
    if (l.running || !l.pending) return
    const job = l.pending
    l.pending = null
    const change = l.failed ? mergeChanges(l.failed, job.change) : job.change
    l.failed = null
    l.runningEdit = change.touch !== false
    l.running = store.save(id, change).then(
      meta => job.waiters.forEach(w => w.resolve(meta)),
      err => {
        // A project that no longer exists has nothing to retry.
        if (!(err instanceof ProjectNotFoundError)) l.failed = l.failed ? mergeChanges(change, l.failed) : change
        job.waiters.forEach(w => w.reject(err))
      },
    )
    void l.running.finally(() => {
      l.running = null
      kick(id)
    })
  }

  const settle = async (id: string) => {
    const l = lanes.get(id)
    while (l && (l.running || l.pending)) {
      await (l.running ?? Promise.resolve())
      await Promise.resolve()
    }
  }

  return {
    list: () => store.list(),
    get: async id => {
      await settle(id)
      return store.get(id)
    },
    read: async (id, kinds) => {
      await settle(id)
      return store.read(id, kinds)
    },
    create: init => store.create(init),

    save: (id, change) =>
      new Promise<ProjectMeta>((resolve, reject) => {
        const l = lane(id)
        if (l.pending) l.pending.change = mergeChanges(l.pending.change, change)
        else l.pending = { change, waiters: [] }
        l.pending.waiters.push({ resolve, reject })
        kick(id)
      }),

    remove: async id => {
      await settle(id)
      await store.remove(id)
      lanes.delete(id)
    },

    flush: async id => {
      const ids = id ? [id] : [...lanes.keys()]
      await Promise.all(
        ids.map(async i => {
          const l = lanes.get(i)
          // Retry a failed write if nothing newer is queued to carry it.
          if (l?.failed && !l.pending && !l.running) l.pending = { change: { touch: false }, waiters: [] }
          if (l) kick(i)
          await settle(i)
        }),
      )
    },

    unsaved: () => [...lanes].filter(([, l]) => l.failed).map(([id]) => id),

    unsavedEdits: id => {
      const l = lanes.get(id)
      const edit = (c: ProjectChange | null | undefined) => !!c && c.touch !== false
      return !!l && (edit(l.failed) || edit(l.pending?.change) || (!!l.running && l.runningEdit))
    },

    drop: async (id, why) => {
      const l = lanes.get(id)
      if (!l) return
      const waiting = l.pending
      l.pending = null
      l.failed = null
      waiting?.waiters.forEach(w => w.reject(why))
      await settle(id)
      l.failed = null
    },
  }
}
