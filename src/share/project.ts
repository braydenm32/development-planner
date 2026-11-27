import { normalizeDemSource, type SavedProject } from '../lib/storage'
import { normalizePlan, type Plan } from '../plan/model'
import { normalizeProjectSite, type ProjectSite } from '../site/store'
import { normalizeCosts, type CostsData } from '../costs/model'
import { normalizeOptions, optionsForFile, type OptionsRecord } from '../options/model'
import { normalizeMapPlace, type MapPlace } from '../map/model'
import { daDetailsForFile, type DaDetails } from '../da/detailsModel'
import { DamagedPlan, readablePlan, type Dropped } from './readable'

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
  /** The lot the survey sits on and where, only when the owner chose to include it (Site › Map). */
  map?: MapPlace
  /** The DA pack's site address, Lot/DP and Prepared by, when any was typed (Approvals › DA pack). Older files have none. */
  da?: DaDetails
}

/** The project's name, for file names and title blocks. */
export function projectTitle(plan: Plan): string {
  return plan.name?.trim() || 'House plan'
}

export function projectFileText(survey: SavedProject, plan: Plan, site?: ProjectSite, costs?: CostsData, options?: unknown, map?: MapPlace, da?: DaDetails): string {
  const opts = optionsForFile(options)
  const name = plan.name?.trim()
  const details = daDetailsForFile(da)
  const file: ProjectFile = {
    app: 'block-and-house-planner',
    version: 1,
    ...(name ? { name } : {}),
    savedAt: new Date().toISOString(),
    survey,
    plan,
    ...(site ? { site } : {}),
    ...(costs ? { costs } : {}),
    ...(opts ? { options: opts } : {}),
    ...(map ? { map } : {}),
    ...(details ? { da: details } : {}),
  }
  return JSON.stringify(file)
}

export function isProjectFile(text: string): boolean {
  try {
    return (JSON.parse(text) as Partial<ProjectFile>)?.app === 'block-and-house-planner'
  } catch {
    return false
  }
}

/** What a project file gives: its parts made safe, and what in its plan couldn't be read and was left out. */
export interface ParsedProject {
  survey: SavedProject
  plan: Plan
  site: ProjectSite | null
  costs: CostsData | null
  options: OptionsRecord | null
  map: MapPlace | null
  /** The DA pack's site details, when the file has them. */
  da: DaDetails | null
  /** Entries of the plan that couldn't be drawn (a wall with no ends, a door on a missing wall): left out, and counted. */
  dropped: Dropped[]
}

const NOT_OURS = 'This file is not a Contour & Gable project.'
const NEWER = 'This project was saved by a newer version of Contour & Gable than the one open here. Reload the page to get the latest version, then open the file again.'
const damaged = (how: string) => `This Contour & Gable project file is damaged: ${how}. If you have an earlier copy, open that one.`

/**
 * Read a project file, or say exactly why it can't be opened: not this app's file, saved by a newer
 * version, or damaged (and which part is missing). Entries in the plan that can't be drawn are left
 * out and listed in `dropped`, so the review can say so before it opens.
 */
export function parseProjectFile(text: string): ParsedProject {
  let f: Partial<ProjectFile> | null
  try {
    f = JSON.parse(text) as Partial<ProjectFile> | null
  } catch {
    throw new Error(NOT_OURS)
  }
  if (!f || typeof f !== 'object' || f.app !== 'block-and-house-planner') throw new Error(NOT_OURS)
  // The app's own file from here on: say what is wrong with it, not that it isn't ours.
  const version = f.version as unknown
  if (typeof version === 'number' && version > 1) throw new Error(NEWER)
  if (version !== 1) throw new Error(damaged('it doesn’t say which version of the app saved it'))
  const s = f.survey
  if (!s || typeof s !== 'object' || !s.dxfText || !s.roles) throw new Error(damaged('its survey is missing'))
  if (!f.plan || typeof f.plan !== 'object') throw new Error(damaged('its plan is missing'))
  const planVersion = (f.plan as { version?: unknown }).version
  if (typeof planVersion === 'number' && planVersion > 1) throw new Error(NEWER)
  if (planVersion !== 1) throw new Error(damaged('its plan can’t be read'))
  let read: ReturnType<typeof readablePlan>
  try {
    read = readablePlan(f.plan)
  } catch (err) {
    if (err instanceof DamagedPlan) throw new Error(damaged(err.message), { cause: err })
    throw err
  }
  const dem = normalizeDemSource(s.dem)
  return {
    survey: { fileName: s.fileName || 'survey.dxf', dxfText: s.dxfText, roles: s.roles, ...(s.sketch ? { sketch: s.sketch } : {}), ...(dem ? { dem } : {}) },
    plan: normalizePlan(read.plan),
    site: normalizeProjectSite(f.site),
    costs: f.costs && typeof f.costs === 'object' ? normalizeCosts(f.costs) : null,
    options: normalizeOptions(f.options),
    map: normalizeMapPlace(f.map),
    da: daDetailsForFile(f.da) ?? null,
    dropped: read.dropped,
  }
}
