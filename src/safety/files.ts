// One Open for every file the planner reads: a survey (DXF), a project file, or a plan on its
// own. It works out which it is from what's inside, not only from the name.

import { DxfError, parseDxf } from '../lib/dxf'
import type { SavedProject } from '../lib/storage'
import { confirmColumns } from '../formats/columns'
import { isLandXml, readLandXml } from '../lib/landxml'
import { NeedColumns, looksLikePoints, readPointsCsv } from '../lib/pointsCsv'
import { withMadeContours } from '../lib/madeContours'
import { analyzeLayers, buildSurvey, guessRoles, NoGroundError, type LayerInfo, type LayerRole } from '../lib/survey'
import { buildTerrain } from '../lib/terrain'
import type { Plan } from '../plan/model'
import { parsePlanFile } from '../plan/store'
import { isProjectFile } from '../share/project'
import type { Site } from './align'

export type OpenedFile =
  | { kind: 'survey'; name: string; survey: SavedProject }
  | { kind: 'project'; name: string; text: string }
  | { kind: 'plan'; name: string; plan: Plan }

const NOT_OURS =
  'That file isn’t one the planner can open. Choose a survey (.dxf, LandXML .xml, or spot levels as .csv or .txt), a project file, or a plan (.json). A PDF or picture of the survey can be laid over the plan afterwards, under Site features.'

const DWG = new DxfError('That’s a DWG, the CAD program’s own kind of file, which the planner can’t read. Ask your surveyor for the survey as an ASCII DXF, or save it as one from a CAD program.')

/**
 * What to ask the surveyor for when a survey file can't be read, ready to copy into an email: a
 * DXF the planner reads, with the heights on the contour lines themselves.
 */
export const SURVEYOR_REQUEST =
  'Could you please send the contour survey as an ASCII DXF (AutoCAD 2013 or earlier), with contours as polylines that have elevations?'

/**
 * A survey DXF that reads, with no contours or spot levels on the layers they'd usually be on: the
 * layers to pick from, by hand, in the layer review (src/safety/LayersSheet.tsx).
 */
export class PickLayersError extends Error {
  fileName: string
  dxfText: string
  roles: Record<string, LayerRole>
  layers: LayerInfo[]
  constructor(fileName: string, dxfText: string, roles: Record<string, LayerRole>, layers: LayerInfo[]) {
    super(`No contours or spot levels found in ${fileName} on the layers they’re usually on. Pick which layers hold them.`)
    this.name = 'PickLayersError'
    this.fileName = fileName
    this.dxfText = dxfText
    this.roles = roles
    this.layers = layers
  }
}

/** Whether the fix for this error is a better file from the surveyor (so the request is offered). */
export const askSurveyor = (e: unknown): boolean => e instanceof DxfError || e instanceof PickLayersError

/** A survey record from DXF text, with its layers guessed. Throws the reader's message if it can't make a site. */
export function readSurvey(fileName: string, dxfText: string): SavedProject {
  const doc = parseDxf(dxfText)
  // Nothing to pick from: say so, rather than open the layer review on no layers.
  if (doc.entities.length === 0) throw new DxfError(`${fileName} is empty: it has no lines, points or text in it. Ask your surveyor to send the survey again.`)
  const layers = analyzeLayers(doc)
  const roles = guessRoles(layers)
  try {
    buildSurvey(doc, roles) // fail early with a clear message
  } catch (e) {
    // Nothing on the layers guessed: the layers can still be picked by hand.
    if (e instanceof NoGroundError) throw new PickLayersError(fileName, dxfText, roles, layers)
    throw e
  }
  return { fileName, dxfText, roles }
}

/** The survey and ground a survey record makes, as the app builds them. Throws if it can't. */
export function readSite(saved: SavedProject): Site {
  const survey = buildSurvey(parseDxf(saved.dxfText), saved.roles)
  const terrain = buildTerrain(survey)
  // As the app builds it (src/lib/builtSite.ts): contours from the ground when the file has none.
  return { survey: withMadeContours(survey, terrain.grid), terrain }
}

/** What a file is, from its name and text. Throws a plain message for anything else. */
export function detectFile(name: string, text: string): OpenedFile {
  const trimmed = text.trimStart()
  if (!trimmed) throw new DxfError(`${name} is empty: there’s nothing in the file. Choose it again, or ask for it to be sent again.`)
  if (trimmed.startsWith('{')) {
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(`${name} looks like a JSON file but can’t be read. ${NOT_OURS}`)
    }
    if (isProjectFile(text)) return { kind: 'project', name, text }
    const p = json as Partial<Plan>
    if (p && p.version === 1 && Array.isArray(p.walls)) return { kind: 'plan', name, plan: parsePlanFile(text) }
    throw new Error(NOT_OURS)
  }
  // A DXF starts with group code 0 and SECTION (some exports lead with a comment, code 999).
  if (/\.dxf$/i.test(name) || /^(0|999)\s*\r?\n/.test(trimmed)) return { kind: 'survey', name, survey: readSurvey(name, text) }
  // Other survey formats: LandXML, and spot levels as text (src/lib/landxml.ts, pointsCsv.ts).
  if (/\.xml$/i.test(name) || isLandXml(text)) return { kind: 'survey', name, survey: checked(readLandXml(name, text)) }
  if (/\.csv$/i.test(name) || (/\.txt$/i.test(name) && looksLikePoints(text))) return { kind: 'survey', name, survey: checked(readPointsCsv(name, text)) }
  throw new Error(NOT_OURS)
}

/** Fail early, with the reader's message, if a survey can't make a site. */
function checked(saved: SavedProject): SavedProject {
  buildSurvey(parseDxf(saved.dxfText), saved.roles)
  return saved
}

/** Read a chosen or dropped file and work out what it is. */
export async function readFile(file: File): Promise<OpenedFile> {
  if (/\.dwg$/i.test(file.name)) throw DWG
  if (/\.(pdf|png|jpe?g|gif|webp|heic)$/i.test(file.name)) throw new Error(NOT_OURS)
  const text = await file.text()
  try {
    return detectFile(file.name, text)
  } catch (e) {
    // Spot levels whose columns aren't certain: ask which is which, then read them.
    if (!(e instanceof NeedColumns)) throw e
    return { kind: 'survey', name: file.name, survey: checked(readPointsCsv(file.name, text, await confirmColumns(e))) }
  }
}
