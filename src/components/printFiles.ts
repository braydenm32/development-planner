// Saving the print parts, the plan set and the project file: what the download buttons in
// Share, and ⌘K, call.

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
import { planSetPdf, type Paper } from '../share/plans'
import { projectFileText, projectTitle } from '../share/project'
import { costsForProject } from '../costs/persist'
import { stormwaterSheet } from '../drainage/stormwater'
import { loadStreetSide, type StreetSide } from '../phone/camera'
import { projectsNow } from '../projects/session'
import { localFeatures, siteForProject } from '../site/store'
import { siteWarningsNow } from '../site/sync'

/** The street side picked for Street view on the open project, or 'auto' (the low side) with none picked. */
const streetSideNow = (): StreetSide => {
  const id = projectsNow().opened?.id
  return id ? loadStreetSide(id) : 'auto'
}

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

/** The plan set as a PDF file. Throws if the plans can't be drawn. */
export function plansPdfFile(p: PdfInput): OutFile {
  const title = projectTitle(p.plan)
  const e = p.earth?.result
  const pdf = planSetPdf({
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
    // The street side the plan knows: Lot facts first, then the one picked for Street view on this project.
    stormwater: stormwaterSheet(p.plan, p.survey, p.terrain, streetSideNow()),
  })
  return { name: `${fileSafe(title)}-plans.pdf`, data: pdf, type: 'application/pdf' }
}

/** Save the project file: the survey, the plan, the site features (with the drawings ticked to go in) and the costs. */
export async function saveProjectFile(project: SavedProject, plan: Plan) {
  const f = await projectFile(project, plan)
  saveFile(f.name, f.data, f.type)
}

/** The project file: the survey, the plan, the site features (with the drawings ticked to go in) and the costs. */
export async function projectFile(project: SavedProject, plan: Plan): Promise<OutFile> {
  return { name: `${fileSafe(projectTitle(plan))}.project.json`, data: projectFileText(project, plan, await siteForProject(), costsForProject()), type: 'application/json' }
}
