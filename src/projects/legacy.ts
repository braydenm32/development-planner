import { delMany, getMany, type UseStore } from 'idb-keyval'
import type { LocalProjectStore } from './localStore'
import { freeName } from './ops'
import { newProjectId, type ProjectRecords, type ProjectStore } from './types'

/**
 * Before projects, the browser held one project: IndexedDB `project-v1` (the survey and its
 * layer roles) and `plan-v1` (the plan), with view and print choices in localStorage
 * (`view-v1`, `print-v1`). The first load with projects turns those into the first project.
 */
export interface LegacyData {
  survey?: unknown
  plan?: unknown
  view?: unknown
  print?: unknown
}

export interface LegacySource {
  read(): Promise<LegacyData>
  /** Remove the old survey and plan, once their copy has been read back. */
  clear(): Promise<void>
}

export const LEGACY_KEYS = { survey: 'project-v1', plan: 'plan-v1', view: 'view-v1', print: 'print-v1' } as const

/** The old keys in idb-keyval's default database, and localStorage for the old preferences. */
export function legacySource(opts: { db?: UseStore; prefs?: Pick<Storage, 'getItem'> | null } = {}): LegacySource {
  const prefs = () => {
    try {
      return opts.prefs === undefined ? globalThis.localStorage : opts.prefs
    } catch {
      return null
    }
  }
  const json = (key: string) => {
    try {
      const raw = prefs()?.getItem(key)
      return raw ? (JSON.parse(raw) as unknown) : undefined
    } catch {
      return undefined
    }
  }
  return {
    read: async () => {
      const [survey, plan] = await getMany([LEGACY_KEYS.survey, LEGACY_KEYS.plan], opts.db)
      return { survey: survey ?? undefined, plan: plan ?? undefined, view: json(LEGACY_KEYS.view), print: json(LEGACY_KEYS.print) }
    },
    // The view and print choices stay in localStorage: they are this device's defaults for new projects.
    clear: () => delMany([LEGACY_KEYS.survey, LEGACY_KEYS.plan], opts.db),
  }
}

/** Where the migration got to; kept beside the projects, never synced. */
interface Marker {
  projectId: string
  /** Fingerprint of the old survey and plan that this project was made from. */
  fingerprint: string
  verified: boolean
}

const MARKER = 'legacy-v1'

/** FNV-1a over the text, with its length: cheap, and enough to tell whether old data changed. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${text.length}:${(h >>> 0).toString(16)}`
}

/** A failed clear is retried on the next load; it must never stop the app opening. */
async function clearQuietly(legacy: LegacySource) {
  try {
    await legacy.clear()
  } catch {
    // tried again next time
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function legacyName(plan: unknown): string {
  const name = (plan as { name?: unknown } | undefined)?.name
  return typeof name === 'string' && name.trim() ? name.trim() : 'My house'
}

export interface MigrationResult {
  projectId: string
  /** False when the copy couldn't be read back; the old keys are then kept. */
  verified: boolean
}

/**
 * Copy the old single project into the store as a project of its own, read it back, and only
 * then remove the old survey and plan. Safe to run on every load:
 *
 * - nothing old left: does nothing;
 * - interrupted before the read-back: finishes the same project (the marker holds its id);
 * - already done, but the old keys are still there with the same data: just removes them;
 * - already done, and the old keys hold different data (an old tab kept saving): that becomes
 *   another project, so nothing is lost.
 */
export async function migrateLegacy(store: ProjectStore, local: Pick<LocalProjectStore, 'getSetting' | 'setSetting'>, legacy: LegacySource): Promise<MigrationResult | null> {
  const old = await legacy.read()
  if (old.survey === undefined && old.plan === undefined) return null

  const print = fingerprint(JSON.stringify([old.survey ?? null, old.plan ?? null]))
  let marker = await local.getSetting<Marker>(MARKER)
  if (marker?.verified && marker.fingerprint === print) {
    await clearQuietly(legacy)
    return null
  }
  if (!marker || marker.verified) {
    marker = { projectId: newProjectId(), fingerprint: print, verified: false }
    // Written before the project, so an interrupted run comes back to the same id.
    await local.setSetting(MARKER, marker)
  } else if (marker.fingerprint !== print) {
    marker = { ...marker, fingerprint: print }
    await local.setSetting(MARKER, marker)
  }

  const records: ProjectRecords = {}
  if (old.survey !== undefined) records.survey = old.survey
  if (old.plan !== undefined) records.plan = old.plan
  const prefs = { ...(old.view ? { view: old.view } : {}), ...(old.print ? { print: old.print } : {}) }
  if (Object.keys(prefs).length) records.prefs = prefs
  const surveyFileName = (old.survey as { fileName?: unknown } | undefined)?.fileName

  const existing = await store.get(marker.projectId)
  if (existing) await store.save(marker.projectId, { records, touch: false })
  else
    await store.create({
      id: marker.projectId,
      name: await freeName(store, legacyName(old.plan), marker.projectId),
      records,
      meta: { surveyFileName: typeof surveyFileName === 'string' ? surveyFileName : null },
    })

  const back = await store.read(marker.projectId, ['survey', 'plan'])
  const verified = !!back && same(back.survey, old.survey) && same(back.plan, old.plan)
  if (verified) {
    await local.setSetting(MARKER, { ...marker, verified: true })
    await clearQuietly(legacy)
  }
  return { projectId: marker.projectId, verified }
}
