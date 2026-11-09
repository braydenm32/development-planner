import type { Vec2 } from '../lib/geom'

/**
 * Site features: what is on the block besides its levels. Trees, easements, fences,
 * existing paving and buildings, services, kerbs, and anything else worth marking.
 *
 * They are facts about the site, so they live with the survey rather than the house
 * plan. Their coordinates are in the survey's own grid (easting, northing in metres), so
 * they stay put if the plan moves, and line up again with a revised survey of the block.
 */
export type FeatureType = 'tree' | 'easement' | 'fence' | 'paving' | 'building' | 'service' | 'kerb' | 'other'

export type ServiceKind = 'sewer' | 'stormwater' | 'water' | 'gas' | 'power' | 'telecom'
export type PavingKind = 'driveway' | 'path' | 'hardstand'
export type EdgeKind = 'kerb' | 'road' | 'footpath'

export type Geometry = { kind: 'point'; at: Vec2 } | { kind: 'line'; pts: Vec2[] } | { kind: 'area'; pts: Vec2[] }
export type GeometryKind = Geometry['kind']

/** Where a feature came from. Features read from a DXF are worked out again from it; the rest are stored. */
export type FeatureSource = 'dxf' | 'pdf' | 'trace'

export interface SiteFeature {
  id: string
  type: FeatureType
  geom: Geometry
  /** Short name shown on the plan: "T3", "(C)", "Colorbond", "No. 40". */
  label?: string
  source: FeatureSource
  /** Trees: trunk diameter at chest height (m). */
  trunk?: number
  /** Trees: canopy spread (m). */
  canopy?: number
  /** Trees, fences and buildings: height (m). */
  height?: number
  /** Trees: to be removed. Buildings: to be demolished. */
  remove?: boolean
  /** Easements: what it is for, as the title or plan words it ("Drainage of water"). */
  purpose?: string
  /** Easements: width (m), when the plan states one. */
  width?: number
  /** Buildings: on the neighbour's land, not this block. */
  neighbour?: boolean
  /** Buildings: floor, gutter and ridge levels read off the survey. */
  levels?: { name: string; rl: number }[]
  paving?: PavingKind
  service?: ServiceKind
  edge?: EdgeKind
  /** DXF features: the layer they were read from. */
  layer?: string
}

export interface FeatureTypeInfo {
  type: FeatureType
  label: string
  plural: string
  /** The shapes this type can be drawn as, the first being the usual one. */
  geoms: GeometryKind[]
}

export const FEATURE_TYPES: FeatureTypeInfo[] = [
  { type: 'tree', label: 'Tree', plural: 'Trees', geoms: ['point'] },
  { type: 'easement', label: 'Easement', plural: 'Easements', geoms: ['area'] },
  { type: 'fence', label: 'Fence', plural: 'Fences', geoms: ['line'] },
  { type: 'paving', label: 'Driveway or paving', plural: 'Driveways and paving', geoms: ['area'] },
  { type: 'building', label: 'Building or shed', plural: 'Buildings and sheds', geoms: ['area', 'point'] },
  { type: 'service', label: 'Service', plural: 'Services', geoms: ['line', 'point'] },
  { type: 'kerb', label: 'Kerb or road edge', plural: 'Kerbs and road edges', geoms: ['line'] },
  { type: 'other', label: 'Other', plural: 'Other features', geoms: ['point', 'line', 'area'] },
]

export const typeInfo = (t: FeatureType): FeatureTypeInfo => FEATURE_TYPES.find(x => x.type === t) ?? FEATURE_TYPES[FEATURE_TYPES.length - 1]

export const SERVICES: { id: ServiceKind; label: string; code: string; color: string }[] = [
  { id: 'sewer', label: 'Sewer', code: 'S', color: '#8a5a2b' },
  { id: 'stormwater', label: 'Stormwater', code: 'SW', color: '#2e7d55' },
  { id: 'water', label: 'Water', code: 'W', color: '#2367c9' },
  { id: 'gas', label: 'Gas', code: 'G', color: '#c28a00' },
  { id: 'power', label: 'Power', code: 'E', color: '#d9541e' },
  { id: 'telecom', label: 'Telecom', code: 'T', color: '#7a4fbf' },
]

export const serviceInfo = (s: ServiceKind | undefined) => SERVICES.find(x => x.id === s) ?? SERVICES[0]

export const PAVING: { id: PavingKind; label: string }[] = [
  { id: 'driveway', label: 'Driveway' },
  { id: 'path', label: 'Path' },
  { id: 'hardstand', label: 'Hardstand' },
]

export const EDGES: { id: EdgeKind; label: string }[] = [
  { id: 'kerb', label: 'Kerb' },
  { id: 'road', label: 'Road edge' },
  { id: 'footpath', label: 'Footpath edge' },
]

/** Sizes a feature starts with until the survey or the user says otherwise. */
export const TREE_DEFAULT = { trunk: 0.3, canopy: 6, height: 8 }
export const FENCE_HEIGHT = 1.8
export const BUILDING_HEIGHT = 3

/** One name for a feature, for lists, tooltips and warnings. */
export function featureName(f: SiteFeature): string {
  const base =
    f.type === 'service'
      ? `${serviceInfo(f.service).label}${f.geom.kind === 'line' ? ' line' : ''}`
      : f.type === 'paving'
        ? (PAVING.find(p => p.id === f.paving)?.label ?? 'Paving')
        : f.type === 'kerb'
          ? (EDGES.find(e => e.id === f.edge)?.label ?? 'Kerb')
          : f.type === 'building' && f.neighbour
            ? "Neighbour's building"
            : typeInfo(f.type).label
  return f.label ? `${base} ${f.label}` : base
}

/** Every point a feature's shape is made of. */
export function geomPoints(g: Geometry): Vec2[] {
  return g.kind === 'point' ? [g.at] : g.pts
}

/** The same shape with every point moved. */
export function mapGeom(g: Geometry, fn: (p: Vec2) => Vec2): Geometry {
  return g.kind === 'point' ? { kind: 'point', at: fn(g.at) } : { kind: g.kind, pts: g.pts.map(fn) }
}

/** A shape in the kind a feature type needs: lines close into areas, areas open into lines, anything shrinks to a point. */
export function convertGeom(g: Geometry, to: GeometryKind): Geometry | null {
  if (g.kind === to) return g
  const pts = geomPoints(g)
  if (to === 'point') {
    const n = pts.length
    return { kind: 'point', at: [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n] }
  }
  if (to === 'line') return pts.length >= 2 ? { kind: 'line', pts } : null
  return pts.length >= 3 ? { kind: 'area', pts } : null
}

/** A feature turned into another type, keeping what still applies. */
export function retype(f: SiteFeature, type: FeatureType): SiteFeature | null {
  const info = typeInfo(type)
  const geom = info.geoms.includes(f.geom.kind) ? f.geom : info.geoms.map(k => convertGeom(f.geom, k)).find(g => g) ?? null
  if (!geom) return null
  return withDefaults({ id: f.id, type, geom, label: f.label, source: f.source, layer: f.layer, purpose: f.purpose, service: f.service, levels: f.levels })
}

/** Fill in the sizes a feature of its type needs. */
export function withDefaults(f: SiteFeature): SiteFeature {
  switch (f.type) {
    case 'tree':
      return {
        ...f,
        trunk: f.trunk ?? TREE_DEFAULT.trunk,
        canopy: f.canopy ?? TREE_DEFAULT.canopy,
        height: f.height ?? TREE_DEFAULT.height,
        remove: f.remove ?? false,
      }
    case 'fence':
      return { ...f, height: f.height ?? FENCE_HEIGHT }
    case 'building':
      return { ...f, height: f.height ?? BUILDING_HEIGHT, remove: f.remove ?? false }
    case 'service':
      return { ...f, service: f.service ?? 'sewer' }
    case 'paving':
      return { ...f, paving: f.paving ?? 'driveway' }
    case 'kerb':
      return { ...f, edge: f.edge ?? 'kerb' }
    default:
      return f
  }
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isVec = (p: unknown): p is Vec2 => Array.isArray(p) && p.length >= 2 && finite(p[0]) && finite(p[1])

function cleanGeom(g: unknown): Geometry | null {
  const x = g as Partial<Geometry> & { at?: unknown; pts?: unknown }
  if (!x || typeof x !== 'object') return null
  if (x.kind === 'point') return isVec(x.at) ? { kind: 'point', at: [x.at[0], x.at[1]] } : null
  if (x.kind === 'line' || x.kind === 'area') {
    const pts = Array.isArray(x.pts) ? x.pts.filter(isVec).map(p => [p[0], p[1]] as Vec2) : []
    return pts.length >= (x.kind === 'line' ? 2 : 3) ? { kind: x.kind, pts } : null
  }
  return null
}

/** Check a feature read from storage or a project file, dropping anything malformed. */
export function normalizeFeature(raw: unknown): SiteFeature | null {
  const f = raw as Partial<SiteFeature>
  if (!f || typeof f !== 'object' || typeof f.id !== 'string') return null
  const type = FEATURE_TYPES.some(t => t.type === f.type) ? (f.type as FeatureType) : 'other'
  const geom = cleanGeom(f.geom)
  if (!geom) return null
  const num = (v: unknown) => (finite(v) ? v : undefined)
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
  const out: SiteFeature = {
    id: f.id,
    type,
    geom,
    source: f.source === 'dxf' || f.source === 'pdf' ? f.source : 'trace',
    label: str(f.label),
    trunk: num(f.trunk),
    canopy: num(f.canopy),
    height: num(f.height),
    remove: typeof f.remove === 'boolean' ? f.remove : undefined,
    purpose: str(f.purpose),
    width: num(f.width),
    neighbour: typeof f.neighbour === 'boolean' ? f.neighbour : undefined,
    levels: Array.isArray(f.levels) ? f.levels.filter(l => l && typeof l.name === 'string' && finite(l.rl)) : undefined,
    paving: PAVING.some(p => p.id === f.paving) ? f.paving : undefined,
    service: SERVICES.some(s => s.id === f.service) ? f.service : undefined,
    edge: EDGES.some(e => e.id === f.edge) ? f.edge : undefined,
    layer: str(f.layer),
  }
  for (const k of Object.keys(out) as (keyof SiteFeature)[]) if (out[k] === undefined) delete out[k]
  return withDefaults(out)
}

let counter = 0
export function featureId(): string {
  counter = (counter + 1) % 1_000_000
  return `sf_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** A feature in the survey's local frame (x = E − origin E, y = N − origin N), for drawing and checks. */
export function toLocal(f: SiteFeature, origin: Vec2): SiteFeature {
  return { ...f, geom: mapGeom(f.geom, p => [p[0] - origin[0], p[1] - origin[1]]) }
}

export function toWorld(f: SiteFeature, origin: Vec2): SiteFeature {
  return { ...f, geom: mapGeom(f.geom, p => [p[0] + origin[0], p[1] + origin[1]]) }
}
