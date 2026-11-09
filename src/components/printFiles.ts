// Saving the print parts, the plan set, the DA pack and the project file: what the download
// buttons in Share, and ⌘K, call.

import { saveFile } from '../lib/download'
import type { SavedProject } from '../lib/storage'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { finishedContours } from '../plan/finishedContours'
import type { Plan } from '../plan/model'
import { driveGround } from '../plan/driveway'
import type { Earth } from '../plan/useEarthworks'
import type { PrintModel, PrintSettings } from '../print/build'
import { fileSafe, to3mf, toStlZip } from '../print/export'
import { planSetPdf, type Paper, type PlanSetInput } from '../share/plans'
import { useOptions } from '../options/store'
import { projectFileText, projectTitle } from '../share/project'
import { costsForProject } from '../costs/persist'
import { mapForProject, useMap } from '../map/store'
import { mapChecks } from '../map/checks'
import { activeCouncil } from '../checks/councils'
import { measure } from '../checks/measure'
import { notChecked, runChecks } from '../checks/rules'
import { checkTreesOf } from '../checks/siteTrees'
import { daOf } from '../da/model'
import { packDetails, useDaDetails } from '../da/details'
import { projectsNow } from '../projects/session'
import { daPackPdf } from '../da/pack'
import { stormwaterSheet } from '../drainage/stormwater'
import { localFeatures, siteForProject } from '../site/store'
import { siteWarningsNow } from '../site/sync'
import { keptShadowDiagram, keptSunFacts, winterDay } from '../sun/facts'

export type PrintState = { model: PrintModel | null; busy: boolean; error: string | null }

export interface DownloadProps {
  plan: Plan
  settings: PrintSettings
  print: PrintState
}

export const printReady = (print: PrintState) => !!print.model && !print.busy && print.model.parts.length > 0
const printBase = (plan: Plan, settings: PrintSettings) => `${fileSafe(projectTitle(plan))}-1-${settings.scale}`

/** Save the print parts as one 3MF; false if they aren't ready. */
export function save3mf({ plan, settings, print }: DownloadProps): boolean {
  if (!printReady(print) || !print.model) return false
  saveFile(`${printBase(plan, settings)}.3mf`, to3mf(print.model.parts, projectTitle(plan)), 'model/3mf')
  return true
}

/** Save the print parts as a ZIP of STLs; false if they aren't ready. */
export function saveStls({ plan, settings, print }: DownloadProps): boolean {
  if (!printReady(print) || !print.model) return false
  saveFile(`${printBase(plan, settings)}-stl.zip`, toStlZip(print.model.parts), 'application/zip')
  return true
}

export interface PdfInput {
  plan: Plan
  survey: Survey
  terrain: Terrain
  earth: Earth | null
  up: 'house' | number
  paper: Paper
  pdfFurniture: boolean
}

/** A file to hand over: saved, or shared on a phone. */
export interface OutFile {
  name: string
  data: Uint8Array | string
  type: string
}

/** Draw the plan set and save it as a PDF. Throws if the plans can't be drawn. */
export function savePlansPdf(p: PdfInput) {
  const f = plansPdfFile(p)
  saveFile(f.name, f.data, f.type)
}

/** What the plan set and the DA pack both draw from. */
function planSetInput(p: PdfInput): PlanSetInput {
  const title = projectTitle(p.plan)
  const e = p.earth?.result
  return {
    plan: p.plan,
    survey: p.survey,
    siteArea: p.terrain.stats.area,
    earthworks: e && e.cut + e.fill > 0.01 ? { cut: e.cut, fill: e.fill } : null,
    ground: e?.grid ?? p.terrain.grid,
    drive: driveGround(p.earth ?? null, p.terrain.grid),
    contours: e && e.cut + e.fill > 0.01 ? finishedContours(p.survey, p.terrain.grid, e.grid, p.earth?.strips) : null,
    up: p.up,
    paper: p.paper,
    furniture: p.pdfFurniture,
    title,
    date: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
    site: { features: localFeatures(), warnings: siteWarningsNow() },
    terrain: p.terrain,
    shadows: keptShadowDiagram({ plan: p.plan, boundary: p.survey.boundary, origin: p.survey.origin, ground: e?.grid ?? p.terrain.grid, date: winterDay() }),
    // The street side the plan knows: Lot facts first, then the one picked for Street view on this project.
    stormwater: stormwaterSheet(p.plan, p.survey, p.terrain),
  }
}

/** The plan set as a PDF file. Throws if the plans can't be drawn. */
export function plansPdfFile(p: PdfInput): OutFile {
  const input = planSetInput(p)
  return { name: `${fileSafe(input.title)}-plans.pdf`, data: planSetPdf(input), type: 'application/pdf' }
}

/**
 * The DA pack as a PDF file: the plan set's drawings, the cut and fill plan and stormwater concept,
 * a cover checklist and the checks for a DA. It carries the address from the map placement, so it's
 * only ever saved to this device, never sent. Throws if the plans can't be drawn.
 */
export function daPackFile(p: PdfInput): OutFile {
  const base = planSetInput(p)
  const e = p.earth?.result
  const place = useMap.getState().place
  const planning = place?.planning ?? null
  // The checks as Design › Checks works them out, but always for a DA: the land's flags, then the council's rules.
  const trees = checkTreesOf(localFeatures(undefined, true), p.survey.boundary)
  const sun = keptSunFacts({ plan: p.plan, boundary: p.survey.boundary, origin: p.survey.origin, ground: e?.grid ?? p.terrain.grid, date: winterDay() })
  const measures = measure({ plan: p.plan, survey: p.survey, terrain: p.terrain, earth: p.earth, trees, sun, dem: !!projectsNow().opened?.survey?.dem })
  const council = activeCouncil(measures.settings)
  const checks = [...(planning ? mapChecks(planning, 'da') : []), ...(council ? runChecks(measures, 'da', council.id) : [])]
  const pdf = daPackPdf({
    ...base,
    earthworks: base.earthworks && e ? { ...base.earthworks, maxCut: e.maxCut, maxFill: e.maxFill } : base.earthworks,
    revision: daOf(p.plan).revision,
    // What's typed above the Download button first, then the map placement's.
    ...packDetails(useDaDetails.getState().details, place ? { address: place.lot.address ?? null, lot: place.lot.label } : null),
    planning,
    council,
    checks,
    notChecked: notChecked('da', council),
  })
  return { name: `${fileSafe(base.title)}-DA-pack.pdf`, data: pdf, type: 'application/pdf' }
}

/** Draw the DA pack and save it to this device. Throws if the plans can't be drawn. */
export function saveDaPack(p: PdfInput) {
  const f = daPackFile(p)
  saveFile(f.name, f.data, f.type)
}

/** Save the project file: the survey, the plan, the site features (with the drawings ticked to go in) and the costs. */
export async function saveProjectFile(project: SavedProject, plan: Plan) {
  const f = await projectFile(project, plan)
  saveFile(f.name, f.data, f.type)
}

/** The project file: the survey, the plan, the site features (with the drawings ticked to go in) and the costs. */
export async function projectFile(project: SavedProject, plan: Plan): Promise<OutFile> {
  return { name: `${fileSafe(projectTitle(plan))}.project.json`, data: projectFileText(project, plan, await siteForProject(), costsForProject(), useOptions.getState().rec, mapForProject()), type: 'application/json' }
}
