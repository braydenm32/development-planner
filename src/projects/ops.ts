import { COSTS_KIND, costsSummary, normalizeCosts } from '../costs/model'
import { OPTIONS_KIND } from '../options/model'
import { parseProjectFile } from '../share/project'
import { siteRecords, SITE_FILES_KIND, SITE_KIND } from '../site/store'
import type { ProjectMeta, ProjectRecords, ProjectStore } from './types'

/**
 * What the Projects home does, written against the ProjectStore interface so it works the same
 * on any store (this browser now, the cloud later).
 */

/** `name`, or `name 2`, `name 3`… if another project already has it. */
export async function freeName(store: Pick<ProjectStore, 'list'>, name: string, except?: string): Promise<string> {
  const base = name.trim() || 'My house'
  const taken = new Set((await store.list()).filter(p => p.id !== except).map(p => p.name.trim().toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`
}

/** A full, separate copy with a new id. Changes to either never reach the other. */
export async function duplicateProject(store: ProjectStore, id: string): Promise<ProjectMeta> {
  const meta = await store.get(id)
  const records = await store.read(id)
  if (!meta || !records) throw new Error('That project is no longer here.')
  return store.create({
    name: await freeName(store, `Copy of ${meta.name}`),
    // structuredClone, so even a store that hands back live objects can't share them.
    records: structuredClone(records),
    meta: { surveyFileName: meta.surveyFileName, thumbnail: meta.thumbnail, numbers: meta.numbers },
  })
}

export function renameProject(store: ProjectStore, id: string, name: string): Promise<ProjectMeta> {
  const clean = name.trim()
  if (!clean) return Promise.reject(new Error('A project needs a name.'))
  return store.save(id, { meta: { name: clean } })
}

/** Tuck a project away. Nothing is deleted; Restore brings it back. */
export const archiveProject = (store: ProjectStore, id: string) => store.save(id, { meta: { archived: true }, touch: false })

export const restoreProject = (store: ProjectStore, id: string) => store.save(id, { meta: { archived: false }, touch: false })

/** Delete for good: the store refuses unless the project is archived. */
export const deleteProject = (store: ProjectStore, id: string) => store.remove(id)

/** The name a project file carries: its own, else the plan's. */
export function nameInProjectFile(text: string): string | null {
  try {
    const f = JSON.parse(text) as { name?: unknown; plan?: { name?: unknown } }
    const n = typeof f.name === 'string' && f.name.trim() ? f.name : typeof f.plan?.name === 'string' ? f.plan.name : ''
    return n.trim() || null
  } catch {
    return null
  }
}

/** A project file (.json) always becomes a new project, with its site features; it never overwrites one. */
export async function createFromProjectFile(store: ProjectStore, text: string): Promise<ProjectMeta> {
  const { survey, plan, site, costs, options } = parseProjectFile(text)
  const name = await freeName(store, nameInProjectFile(text) ?? 'Shared project')
  return store.create({ name, records: { survey, plan: { ...plan, name }, ...siteRecords(site), ...(costs ? { [COSTS_KIND]: costs } : {}), ...(options ? { [OPTIONS_KIND]: options } : {}) }, meta: { surveyFileName: survey.fileName } })
}

/** In plain words, what deleting this project removes, for the review step. */
export function describeContents(meta: ProjectMeta, records: ProjectRecords | null): string[] {
  const out: string[] = []
  const survey = records?.survey as { fileName?: string; roles?: Record<string, unknown> } | undefined
  if (survey) out.push(`The survey${survey.fileName ? ` (${survey.fileName})` : ''} and its layer settings`)
  const plan = records?.plan as { levels?: unknown[]; walls?: unknown[]; rooms?: unknown[]; roofs?: unknown[] } | undefined
  if (plan) {
    const n = (a: unknown[] | undefined, one: string, many = `${one}s`) => {
      const c = Array.isArray(a) ? a.length : 0
      return c ? `${c} ${c === 1 ? one : many}` : null
    }
    const parts = [n(plan.levels, 'floor'), n(plan.walls, 'wall'), n(plan.rooms, 'room'), n(plan.roofs, 'roof')].filter(Boolean)
    out.push(parts.length ? `The plan: ${parts.join(', ')}` : 'The plan')
  }
  if (records?.prefs) out.push('Its print and view settings')
  const site = (records?.[SITE_KIND] as { data?: { features?: unknown[]; overlays?: unknown[] } } | undefined)?.data
  if (site) {
    const n = (a: unknown[] | undefined, one: string) => (Array.isArray(a) && a.length ? `${a.length} ${one}${a.length === 1 ? '' : 's'}` : null)
    const parts = [n(site.features, 'traced or read feature'), n(site.overlays, 'drawing')].filter(Boolean)
    out.push(parts.length ? `Its site features: ${parts.join(', ')}` : 'Its site features')
  }
  if (records?.[COSTS_KIND]) out.push(`Its costs: ${costsSummary(normalizeCosts(records[COSTS_KIND]))}`)
  const earlier = records?.['previous-survey'] as { fileName?: string } | undefined
  if (earlier) out.push(`The survey it replaced${earlier.fileName ? ` (${earlier.fileName})` : ''}`)
  const others = (records?.[OPTIONS_KIND] as { items?: unknown[] } | undefined)?.items
  if (Array.isArray(others) && others.length > 1) out.push(`Its ${others.length} options (named versions of the design)`)
  if (records?.history) out.push('Its undo history')
  const other = Object.keys(records ?? {}).filter(k => !['survey', 'plan', 'prefs', 'history', 'previous-survey', OPTIONS_KIND, SITE_KIND, SITE_FILES_KIND, COSTS_KIND].includes(k))
  if (other.length) out.push(`Everything else saved with it (${other.join(', ')})`)
  if (!out.length) out.push(`The project “${meta.name}”`)
  return out
}
