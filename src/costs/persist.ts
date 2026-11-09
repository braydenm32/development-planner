// Costs are kept with each project as its `costs` record, so Projects, the project file and
// cloud saves carry them like the plan. Share links never do: their records are a fixed list
// (SHARED_KINDS in worker/src/shares.ts) without it, so prices stay private.

import { projectsNow, registerRecordKind } from '../projects/session'
import { COSTS_KIND, emptyCosts, normalizeCosts, type CostsData } from './model'
import { useCosts } from './store'

export { COSTS_KIND }

/** Written this long after the last change, so typing a rate doesn't thrash storage (ms). */
const SAVE_DELAY = 600

let started = false
let applying = false
let save: ((value: CostsData, id?: string) => Promise<void>) | null = null
let pending: { id: string; data: CostsData } | null = null
let timer: ReturnType<typeof setTimeout> | undefined

/** Write the waiting change now. */
export function flushCosts(): Promise<void> {
  clearTimeout(timer)
  const job = pending
  pending = null
  return job && save ? save(job.data, job.id) : Promise.resolve()
}

/** Keep costs with each project. Call once the app starts; later calls do nothing. */
export function startCostRecords() {
  if (started) return
  started = true
  save = registerRecordKind<CostsData>(COSTS_KIND, value => {
    // A change still waiting belongs to the project before.
    void flushCosts()
    applying = true
    try {
      useCosts.getState().load(normalizeCosts(value))
    } finally {
      applying = false
    }
  })
  useCosts.subscribe((s, prev) => {
    if (applying || s.data === prev.data) return
    const id = projectsNow().currentId
    if (!id) return
    if (pending && pending.id !== id) void flushCosts()
    pending = { id, data: s.data }
    clearTimeout(timer)
    timer = setTimeout(() => void flushCosts(), SAVE_DELAY)
  })
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('pagehide', () => void flushCosts())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flushCosts()
    })
  }
}

/** Whether costs say anything beyond the starting point: a choice, a rate, a quote or a share changed. */
export const hasCosts = (d: CostsData) => JSON.stringify(d) !== JSON.stringify(emptyCosts())

/** What goes in the project file now, from the project open: nothing while costs are untouched. */
export function costsForProject(): CostsData | undefined {
  const d = useCosts.getState().data
  return hasCosts(d) ? d : undefined
}

/** A project's costs from its records (any project, open or not), for its project file. */
export function costsFromRecords(records: Record<string, unknown> | null): CostsData | undefined {
  const raw = records?.[COSTS_KIND]
  if (raw === undefined || raw === null) return undefined
  const d = normalizeCosts(raw)
  return hasCosts(d) ? d : undefined
}
