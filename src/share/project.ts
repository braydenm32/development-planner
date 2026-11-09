import type { SavedProject } from '../lib/storage'
import { normalizePlan, type Plan } from '../plan/model'
import { normalizeProjectSite, type ProjectSite } from '../site/store'
import { normalizeCosts, type CostsData } from '../costs/model'
import { normalizeOptions, optionsForFile, type OptionsRecord } from '../options/model'

/** Everything needed to open the same project somewhere else: the survey file, the plan, the site features and the costs. */
export interface ProjectFile {
  app: 'block-and-house-planner'
  version: 1
  /** The project's name. Older files have none; the plan's name then stands in. */
  name?: string
  savedAt: string
  survey: SavedProject
  plan: Plan
  /** Trees, easements and the rest; files from before site features have none. */
  site?: ProjectSite
  /** Choices, rates and quotes from Costs; files from before Costs, or with costs untouched, have none. */
  costs?: CostsData
  /** The project's other options (named versions of the design); `plan` is the one open. Older files have none: one option. */
  options?: OptionsRecord
}

/** The project's name, for file names and title blocks. */
export function projectTitle(plan: Plan): string {
  return plan.name?.trim() || 'House plan'
}

export function projectFileText(survey: SavedProject, plan: Plan, site?: ProjectSite, costs?: CostsData, options?: unknown): string {
  const opts = optionsForFile(options)
  const name = plan.name?.trim()
  const file: ProjectFile = { app: 'block-and-house-planner', version: 1, ...(name ? { name } : {}), savedAt: new Date().toISOString(), survey, plan, ...(site ? { site } : {}), ...(costs ? { costs } : {}), ...(opts ? { options: opts } : {}) }
  return JSON.stringify(file)
}

export function isProjectFile(text: string): boolean {
  try {
    return (JSON.parse(text) as Partial<ProjectFile>)?.app === 'block-and-house-planner'
  } catch {
    return false
  }
}

export function parseProjectFile(text: string): { survey: SavedProject; plan: Plan; site: ProjectSite | null; costs: CostsData | null; options: OptionsRecord | null } {
  let f: Partial<ProjectFile>
  try {
    f = JSON.parse(text) as Partial<ProjectFile>
  } catch {
    throw new Error('This file is not a Contour & Gable project.')
  }
  const s = f.survey
  if (f.app !== 'block-and-house-planner' || f.version !== 1 || !s?.dxfText || !s.roles || !f.plan || f.plan.version !== 1) {
    throw new Error('This file is not a Contour & Gable project.')
  }
  return {
    survey: { fileName: s.fileName || 'survey.dxf', dxfText: s.dxfText, roles: s.roles, ...(s.sketch ? { sketch: s.sketch } : {}) },
    plan: normalizePlan(f.plan),
    site: normalizeProjectSite(f.site),
    costs: f.costs && typeof f.costs === 'object' ? normalizeCosts(f.costs) : null,
    options: normalizeOptions(f.options),
  }
}
