import { useMemo } from 'react'
import { create } from 'zustand'
import { parseDxf } from '../lib/dxf'
import { centroidOf, pointInPolygon, type Vec2 } from '../lib/geom'
import type { Heightfield } from '../lib/terrain'
import { isFeatureRole, type LayerRole } from '../lib/survey'
import { applyAffine, compose, type Affine } from './align'
import { featuresFromDxf } from './fromDxf'
import { FEATURE_TYPES, geomPoints, mapGeom, normalizeFeature, toLocal, type EdgeKind, type FeatureType, type GeometryKind, type PavingKind, type ServiceKind, type SiteFeature } from './model'
import type { VectorPage } from './pdfVector'

/** A drawing (a PDF page or a picture) laid over the plan. Its picture is kept in IndexedDB, not here. */
export interface Overlay {
  id: string
  name: string
  kind: 'pdf' | 'image'
  page: number
  /** Page size in drawing units: PDF points, or pixels for a picture. */
  width: number
  height: number
  /** Pixels of the stored picture per drawing unit. */
  pxPerUnit: number
  /** The scale the drawing states (1:n), if it does. */
  scale: number | null
  /** Drawing units (y up from the page's bottom-left) to survey grid (easting, northing). */
  transform: Affine
  /** Lined up by two points, rather than only roughly placed. */
  aligned: boolean
  opacity: number
  visible: boolean
  locked: boolean
  /** Put the picture in the project file too. */
  include: boolean
  /** The drawing had words and line work to read. */
  vector: boolean
  /** Found groups already added as features. */
  added: string[]
}

/** Edits to a feature read from a DXF, kept apart because the DXF features are read again each time. */
export type FeatureEdit = Partial<SiteFeature> & { hidden?: boolean }

/** Everything about the site features that is saved: in this browser, and in the project file. */
export interface SiteData {
  version: 1
  /** Traced, and read from drawings; survey grid coordinates. */
  features: SiteFeature[]
  /** Changes to DXF features by id. */
  edits: Record<string, FeatureEdit>
  overlays: Overlay[]
  /** Feature types hidden on the plan, in 3D and on the PDF plans. */
  hidden: FeatureType[]
  /** A second DXF with more features, beside the survey's own. */
  extraDxf: { fileName: string; roles: Record<string, LayerRole> } | null
}

export const emptySiteData = (): SiteData => ({ version: 1, features: [], edits: {}, overlays: [], hidden: [], extraDxf: null })

/** A drawing's picture (a data URL) and, for a PDF with line work, its words and lines. */
export interface DrawingFile {
  image: string
  vector?: VectorPage
}

/**
 * The large files behind the site features: the drawings' pictures and line work, and the
 * second DXF's text. Kept apart from SiteData so an edit to a tree doesn't write them again.
 */
export interface SiteFiles {
  version: 1
  extraDxfText: string | null
  drawings: Record<string, DrawingFile>
}

export const emptySiteFiles = (): SiteFiles => ({ version: 1, extraDxfText: null, drawings: {} })

/** What a click on the plan does while Site features has a tool picked. */
export type SiteTool =
  | { kind: 'trace'; type: FeatureType; geom: GeometryKind; service?: ServiceKind; paving?: PavingKind; edge?: EdgeKind }
  | {
      kind: 'align'
      overlay: string
      /** Drawing points picked, and the survey points they go to. */
      pairs: { from: Vec2; to?: Vec2 }[]
      /** Where the drawing sat when lining up started, to put it back on cancel. */
      start: Affine
      /** Keep the drawing's stated scale and only turn and move it. */
      keepScale: boolean
    }

interface SiteStore {
  data: SiteData
  loaded: boolean
  past: SiteData[]
  future: SiteData[]
  /** The survey's DXF and roles, for the features on its layers. */
  main: { dxfText: string; roles: Record<string, LayerRole> } | null
  extraDxfText: string | null
  /** The survey's local origin and boundary (local frame). */
  origin: Vec2 | null
  boundary: Vec2[] | null
  /** The natural ground and, once there is cut or fill, the finished ground: for works in tree zones. */
  ground: { natural: Heightfield; finished: Heightfield } | null
  tool: SiteTool | null
  selected: string | null
  /** The project's drawing files and second DXF, as saved. */
  files: SiteFiles
  /** URLs of the overlay pictures to show, by overlay id. */
  images: Record<string, string>
  /** Words and line work of vector drawings, by overlay id. */
  vectors: Record<string, VectorPage>
  /** A found group to point out on the plan: where its labels are and what it would add, in drawing units. */
  highlight: { overlay: string; marks: Vec2[]; features: SiteFeature[] } | null
  notice: string | null
  /** Site features has the plan: its panel shows in place of the floor plan panels, and Undo works on features. */
  focus: boolean

  commit: (fn: (d: SiteData) => SiteData) => void
  /** Change without an undo step (live previews); `settle` makes the change since `from` one step. */
  preview: (fn: (d: SiteData) => SiteData) => void
  settle: (from: SiteData) => void
  undo: () => void
  redo: () => void
  setTool: (t: SiteTool | null) => void
  select: (id: string | null) => void
  notify: (msg: string | null) => void
}

const HISTORY = 100

export const useSiteStore = create<SiteStore>((setState, getState) => ({
  data: emptySiteData(),
  loaded: false,
  past: [],
  future: [],
  main: null,
  extraDxfText: null,
  origin: null,
  boundary: null,
  ground: null,
  tool: null,
  selected: null,
  files: emptySiteFiles(),
  images: {},
  vectors: {},
  highlight: null,
  notice: null,
  focus: false,

  commit: fn => {
    const { data, past } = getState()
    const next = fn(data)
    if (next === data) return
    setState({ data: next, past: [...past, data].slice(-HISTORY), future: [] })
  },
  preview: fn => setState({ data: fn(getState().data) }),
  settle: from => {
    const { data, past } = getState()
    if (from !== data) setState({ past: [...past, from].slice(-HISTORY), future: [] })
  },
  undo: () => {
    const { data, past, future } = getState()
    if (!past.length) return
    setState({ data: past[past.length - 1], past: past.slice(0, -1), future: [data, ...future], selected: null })
  },
  redo: () => {
    const { data, past, future } = getState()
    if (!future.length) return
    setState({ data: future[0], past: [...past, data], future: future.slice(1), selected: null })
  },
  setTool: tool => setState({ tool, notice: null }),
  select: selected => setState({ selected }),
  notify: notice => setState({ notice }),
}))

// ---------------------------------------------------------------------------
// Saved with each project (src/site/persist.ts keeps them in its records).

/** Check saved or shared site data, keeping what is sound. */
export function normalizeSiteData(raw: unknown): SiteData {
  const d = raw as Partial<SiteData> | null
  if (!d || typeof d !== 'object') return emptySiteData()
  const features = Array.isArray(d.features) ? d.features.map(normalizeFeature).filter((f): f is SiteFeature => !!f) : []
  const overlays = Array.isArray(d.overlays)
    ? d.overlays.filter(o => o && typeof o.id === 'string' && Array.isArray(o.transform) && o.transform.length === 6 && o.transform.every(Number.isFinite))
    : []
  return {
    version: 1,
    features,
    edits: d.edits && typeof d.edits === 'object' ? d.edits : {},
    overlays: overlays.map(o => ({ ...o, added: Array.isArray(o.added) ? o.added : [], opacity: Number.isFinite(o.opacity) ? o.opacity : 0.6 })),
    hidden: Array.isArray(d.hidden) ? d.hidden.filter(t => FEATURE_TYPES.some(x => x.type === t)) : [],
    extraDxf: d.extraDxf && typeof d.extraDxf.fileName === 'string' ? { fileName: d.extraDxf.fileName, roles: d.extraDxf.roles ?? {} } : null,
  }
}

const isVector = (v: unknown): v is VectorPage => {
  const x = v as Partial<VectorPage> | null
  return !!x && Array.isArray(x.texts) && Array.isArray(x.paths) && Number.isFinite(x.width) && Number.isFinite(x.height)
}

/** Check saved or shared drawing files: pictures only as PNG, JPEG or WebP data URLs. */
export function normalizeSiteFiles(raw: unknown): SiteFiles {
  const r = raw as Partial<SiteFiles> | null
  if (!r || typeof r !== 'object') return emptySiteFiles()
  const drawings: Record<string, DrawingFile> = {}
  if (r.drawings && typeof r.drawings === 'object') {
    for (const [id, x] of Object.entries(r.drawings)) {
      if (!x || typeof x.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(x.image)) continue
      drawings[id] = isVector(x.vector) ? { image: x.image, vector: x.vector } : { image: x.image }
    }
  }
  return { version: 1, extraDxfText: typeof r.extraDxfText === 'string' ? r.extraDxfText : null, drawings }
}

/** Drawing files no overlay uses: once the undo history is gone, nothing can bring their drawings back. */
export function unusedDrawings(data: SiteData, files: SiteFiles): string[] {
  const ids = new Set(data.overlays.map(o => o.id))
  return Object.keys(files.drawings).filter(id => !ids.has(id))
}

/**
 * Show a project's site features: its data and its files, or none. The undo history,
 * selection and tool start afresh; the change isn't an edit, so it isn't saved again.
 */
export function openSite(data: SiteData, files: SiteFiles) {
  const s = useSiteStore.getState()
  for (const url of Object.values(s.images)) if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  const images: Record<string, string> = {}
  const vectors: Record<string, VectorPage> = {}
  for (const [id, d] of Object.entries(files.drawings)) {
    images[id] = d.image
    if (d.vector) vectors[id] = d.vector
  }
  useSiteStore.setState({
    data,
    files,
    loaded: true,
    past: [],
    future: [],
    selected: null,
    tool: null,
    highlight: null,
    notice: null,
    images,
    vectors,
    extraDxfText: data.extraDxf ? files.extraDxfText : null,
  })
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${blob.type || 'image/png'};base64,${btoa(bin)}`
}

/** Keep a drawing's picture and line work with the project. It shows straight away. */
export async function storeOverlayFiles(id: string, image: Blob, vector: VectorPage | null): Promise<void> {
  const st = useSiteStore.getState()
  useSiteStore.setState({
    images: { ...st.images, [id]: URL.createObjectURL(image) },
    vectors: vector ? { ...st.vectors, [id]: vector } : st.vectors,
  })
  const file: DrawingFile = { image: await blobToDataUrl(image), ...(vector ? { vector } : {}) }
  const files = useSiteStore.getState().files
  useSiteStore.setState({ files: { ...files, drawings: { ...files.drawings, [id]: file } } })
}

export async function storeExtraDxf(fileName: string, text: string, roles: Record<string, LayerRole>): Promise<void> {
  useSiteStore.setState(s => ({ extraDxfText: text, files: { ...s.files, extraDxfText: text } }))
  useSiteStore.getState().commit(d => ({ ...d, extraDxf: { fileName, roles } }))
}

// ---------------------------------------------------------------------------
// The features: stored ones plus those read from DXF layers, with their edits.

const dxfCache = new Map<string, { text: string; roles: Record<string, LayerRole>; features: SiteFeature[] }>()

function dxfFeatures(key: string, text: string | null | undefined, roles: Record<string, LayerRole> | undefined): SiteFeature[] {
  if (!text || !roles || !Object.values(roles).some(isFeatureRole)) return []
  const hit = dxfCache.get(key)
  if (hit && hit.text === text && hit.roles === roles) return hit.features
  let features: SiteFeature[] = []
  try {
    features = featuresFromDxf(parseDxf(text), roles, key)
  } catch {
    features = []
  }
  dxfCache.set(key, { text, roles, features })
  return features
}

/** Every site feature, in survey grid coordinates, with edits applied and archived ones left out. */
export function allFeatures(s: Pick<SiteStore, 'data' | 'main' | 'extraDxfText'>): SiteFeature[] {
  const fromDxf = [
    ...dxfFeatures('dxf', s.main?.dxfText, s.main?.roles),
    ...dxfFeatures('dxf2', s.extraDxfText, s.data.extraDxf?.roles),
  ]
  const edited = fromDxf.flatMap(f => {
    const e = s.data.edits[f.id]
    if (!e) return [f]
    if (e.hidden) return []
    return [{ ...f, ...e, id: f.id, source: 'dxf' as const }]
  })
  return [...edited, ...s.data.features]
}

/** Every feature in the survey's local frame (x = E − origin), for drawing and checks. Hidden types are left out unless asked for. */
export function useSiteFeatures(opts: { includeHidden?: boolean } = {}): SiteFeature[] {
  const data = useSiteStore(s => s.data)
  const main = useSiteStore(s => s.main)
  const extraDxfText = useSiteStore(s => s.extraDxfText)
  const origin = useSiteStore(s => s.origin)
  const includeHidden = !!opts.includeHidden
  return useMemo(() => localFeatures({ data, main, extraDxfText, origin }, includeHidden), [data, main, extraDxfText, origin, includeHidden])
}

/** The features `useSiteFeatures` gives, from a state: for downloads started outside React (⌘K). */
export function localFeatures(s: Pick<SiteStore, 'data' | 'main' | 'extraDxfText' | 'origin'> = useSiteStore.getState(), includeHidden = false): SiteFeature[] {
  const origin = s.origin
  if (!origin) return []
  return allFeatures(s)
    .filter(f => includeHidden || !s.data.hidden.includes(f.type))
    .map(f => toLocal(f, origin))
}

/** Change one feature, wherever it came from. `patch` is in survey grid coordinates. */
export function updateFeature(id: string, patch: Partial<SiteFeature>) {
  useSiteStore.getState().commit(d => {
    if (d.features.some(f => f.id === id)) return { ...d, features: d.features.map(f => (f.id === id ? { ...f, ...patch } : f)) }
    return { ...d, edits: { ...d.edits, [id]: { ...d.edits[id], ...patch } } }
  })
}

/** Remove a feature (Undo brings it back); DXF features are hidden, as the DXF still has them. */
export function removeFeature(id: string) {
  useSiteStore.getState().commit(d => {
    if (d.features.some(f => f.id === id)) return { ...d, features: d.features.filter(f => f.id !== id) }
    return { ...d, edits: { ...d.edits, [id]: { ...d.edits[id], hidden: true } } }
  })
  useSiteStore.setState({ selected: null })
}

export function addFeatures(list: SiteFeature[]) {
  if (!list.length) return
  useSiteStore.getState().commit(d => ({ ...d, features: [...d.features, ...list] }))
}

export function updateOverlay(id: string, patch: Partial<Overlay>, undoable = true) {
  const fn = (d: SiteData) => ({ ...d, overlays: d.overlays.map(o => (o.id === id ? { ...o, ...patch } : o)) })
  if (undoable) useSiteStore.getState().commit(fn)
  else useSiteStore.getState().preview(fn)
}

// ---------------------------------------------------------------------------
// With a new survey.

/** How far (m) past the edge of a block a feature or drawing can be and still be counted as on it: a neighbour's tree or the road. */
const NEAR_BLOCK = 30

/**
 * Whether the stored features and drawings all sit away from a block, so they can't belong to
 * its survey grid: true when there are some and none is on the block or within NEAR_BLOCK of it.
 * A revised survey on the same grid has them on it; a survey on other coordinates (a local grid
 * swapped for MGA, or a sketch for the real survey) leaves them all behind.
 * `boundary` is in the survey's local frame, as Survey has it.
 */
export function siteDataOffBlock(d: SiteData, boundary: Vec2[], origin: Vec2): boolean {
  if (!boundary.length) return false
  const points: Vec2[][] = [
    ...d.features.map(f => geomPoints(f.geom)),
    ...d.overlays.map(o => [applyAffine(o.transform, [o.width / 2, o.height / 2])]),
  ]
  if (!points.length) return false
  const c = centroidOf(boundary)
  const reach = Math.max(...boundary.map(p => Math.hypot(p[0] - c[0], p[1] - c[1]))) + NEAR_BLOCK
  const near = (p: Vec2) => {
    const x = p[0] - origin[0]
    const y = p[1] - origin[1]
    return pointInPolygon(x, y, boundary) || Math.hypot(x - c[0], y - c[1]) <= reach
  }
  return !points.some(pts => pts.some(near))
}

/**
 * The stored features and drawing line-ups moved by `m` (survey grid to survey grid): with the
 * house, onto a survey on other coordinates. Features read from a DXF come from their file each
 * time, so they aren't moved here.
 */
export function moveSiteData(d: SiteData, m: Affine): SiteData {
  if (!d.features.length && !d.overlays.length) return d
  return {
    ...d,
    features: d.features.map(f => ({ ...f, geom: mapGeom(f.geom, p => applyAffine(m, p)) })),
    overlays: d.overlays.map(o => ({ ...o, transform: compose(m, o.transform) })),
  }
}

// ---------------------------------------------------------------------------
// In the project file.

/** Site features as kept in a project file. The drawings' pictures are only there when "Put the drawing in the project file" is ticked. */
export interface ProjectSite {
  data: SiteData
  extraDxfText?: string
  drawings?: Record<string, DrawingFile>
}

/** A project file's site part from a project's data and files; nothing when there are no site features. */
export function projectSite(data: SiteData, files: SiteFiles): ProjectSite | undefined {
  if (!data.features.length && !Object.keys(data.edits).length && !data.overlays.length && !data.extraDxf && !data.hidden.length) return undefined
  const drawings: Record<string, DrawingFile> = {}
  for (const o of data.overlays) if (o.include && files.drawings[o.id]) drawings[o.id] = files.drawings[o.id]
  return {
    data,
    extraDxfText: data.extraDxf && files.extraDxfText ? files.extraDxfText : undefined,
    drawings: Object.keys(drawings).length ? drawings : undefined,
  }
}

/** What goes in the project file now, from the project open. */
export async function siteForProject(): Promise<ProjectSite | undefined> {
  const s = useSiteStore.getState()
  return projectSite(s.data, s.files)
}

/** Check the site part of a project file; null when there is none. */
export function normalizeProjectSite(raw: unknown): ProjectSite | null {
  const r = raw as Partial<ProjectSite> | null
  if (!r || typeof r !== 'object' || !r.data) return null
  const data = normalizeSiteData(r.data)
  const files = normalizeSiteFiles({ extraDxfText: r.extraDxfText, drawings: r.drawings })
  return {
    data,
    extraDxfText: data.extraDxf && files.extraDxfText !== null ? files.extraDxfText : undefined,
    drawings: Object.keys(files.drawings).length ? files.drawings : undefined,
  }
}

// ---------------------------------------------------------------------------
// As a project's records.

/** The `site` record: the features, edits, line-ups and settings. */
export interface SiteRecord {
  version: 1
  data: SiteData
}

export const SITE_KIND = 'site'
/** The `site-files` record: the drawings' pictures and line work, and the second DXF. */
export const SITE_FILES_KIND = 'site-files'

/** A shared project's site features as the records of the new project it opens as. */
export function siteRecords(site: ProjectSite | null): Record<string, SiteRecord | SiteFiles> {
  if (!site) return {}
  const files: SiteFiles = { version: 1, extraDxfText: site.extraDxfText ?? null, drawings: site.drawings ?? {} }
  return { [SITE_KIND]: { version: 1, data: site.data }, [SITE_FILES_KIND]: files }
}

/** The site part of a project file, from a project's records (any project, open or not). */
export function projectSiteFromRecords(records: Record<string, unknown> | null): ProjectSite | undefined {
  const site = records?.[SITE_KIND] as Partial<SiteRecord> | undefined
  if (!site?.data) return undefined
  return projectSite(normalizeSiteData(site.data), normalizeSiteFiles(records?.[SITE_FILES_KIND]))
}
