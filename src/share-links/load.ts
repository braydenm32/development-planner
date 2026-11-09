// A shared project, read from the cloud with its token: who shared it, its index entry, and the
// records a viewer needs, each checked against its hash. Nothing is kept: not in this browser's
// projects, not anywhere but this page.

import { CloudError, isOffline, type RecordRef } from '../cloud/api'
import { readRecords } from '../cloud/cloudStore'
import type { SavedProject } from '../lib/storage'
import type { Plan } from '../plan/model'
import type { ProjectPrefs } from '../projects/session'
import type { ProjectMeta } from '../projects/types'
import type { SiteRecord } from '../site/store'
import type { ShareApi } from './api'

export interface SharedProject {
  /** The name on the account it was shared from. */
  sharedBy: string
  revision: number
  meta: ProjectMeta
  survey: SavedProject | null
  plan: Plan | null
  prefs: ProjectPrefs
  site: SiteRecord | null
}

/** Why a shared project can't show: the link is off (or wrong), too many tries, offline, or something else. */
export type SharedTrouble = { kind: 'off' | 'slow' | 'offline' | 'broken'; message: string }

export function troubleOf(e: unknown): SharedTrouble {
  if (isOffline(e)) return { kind: 'offline', message: 'You’re offline. Connect to the internet and try again.' }
  if (e instanceof CloudError && e.status === 404 && e.code === 'link-off') return { kind: 'off', message: e.message }
  if (e instanceof CloudError && e.status === 429) return { kind: 'slow', message: e.message }
  return { kind: 'broken', message: (e as Error)?.message || 'This shared project couldn’t be opened. Try again.' }
}

/**
 * Read the shared project now. `cache` keeps records by hash between reads, so looking again
 * after a change fetches only what changed. If the project changes between reading its index
 * and its records, it reads the index again (once).
 */
export async function loadShared(api: ShareApi, token: string, cache: Map<string, unknown> = new Map()): Promise<SharedProject> {
  for (let attempt = 0; ; attempt++) {
    const index = await api.open(token)
    const refs = index.project.records
    const missing: Record<string, RecordRef> = {}
    for (const [kind, ref] of Object.entries(refs)) if (!cache.has(ref.hash)) missing[kind] = ref
    try {
      const got = await readRecords(missing, (hash, part) => api.part(token, hash, part))
      for (const [kind, value] of Object.entries(got)) cache.set(missing[kind].hash, value)
    } catch (e) {
      // A record changed under us (a save landed meanwhile): its old copy isn't shared now.
      if (attempt === 0 && e instanceof CloudError && e.status === 404 && e.code !== 'link-off') continue
      throw e
    }
    // Only what this revision uses stays in the cache.
    const used = new Set(Object.values(refs).map(r => r.hash))
    for (const h of [...cache.keys()]) if (!used.has(h)) cache.delete(h)
    const value = <T,>(kind: string) => (refs[kind] ? (cache.get(refs[kind].hash) as T) : null)
    return {
      sharedBy: index.sharedBy,
      revision: index.project.revision,
      meta: index.project.meta,
      survey: value<SavedProject>('survey'),
      plan: value<Plan>('plan'),
      prefs: value<ProjectPrefs>('prefs') ?? {},
      site: value<SiteRecord>('site'),
    }
  }
}
