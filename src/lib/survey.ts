import type { DxfDocument, Vec3 } from './dxf'
import { bounds, convexHull, normalizeRing, signedArea, type Vec2 } from './geom'

/** What a layer holds: the shape of the ground, or a kind of site feature (see src/site). */
export type SurveyRole = 'contour' | 'boundary' | 'levels' | 'reference' | 'ignore'
export type FeatureRole =
  | 'tree'
  | 'easement'
  | 'fence'
  | 'paving'
  | 'building'
  | 'service-sewer'
  | 'service-stormwater'
  | 'service-water'
  | 'service-gas'
  | 'service-power'
  | 'service-telecom'
  | 'kerb'
  | 'feature'
export type LayerRole = SurveyRole | FeatureRole

export const ROLE_LABELS: Record<LayerRole, string> = {
  contour: 'Contours',
  boundary: 'Site boundary',
  levels: 'Spot levels (shape terrain)',
  reference: 'Reference points (display only)',
  ignore: 'Ignore',
  tree: 'Trees',
  easement: 'Easements',
  fence: 'Fences',
  paving: 'Driveways and paving',
  building: 'Buildings and sheds',
  'service-sewer': 'Sewer',
  'service-stormwater': 'Stormwater',
  'service-water': 'Water',
  'service-gas': 'Gas',
  'service-power': 'Power',
  'service-telecom': 'Telecom',
  kerb: 'Kerb or road edge',
  feature: 'Other site features',
}

export const SURVEY_ROLES: SurveyRole[] = ['contour', 'boundary', 'levels', 'reference', 'ignore']
export const FEATURE_ROLES: FeatureRole[] = [
  'tree',
  'easement',
  'fence',
  'paving',
  'building',
  'service-sewer',
  'service-stormwater',
  'service-water',
  'service-gas',
  'service-power',
  'service-telecom',
  'kerb',
  'feature',
]
export const isFeatureRole = (r: LayerRole | undefined): r is FeatureRole => !!r && (FEATURE_ROLES as string[]).includes(r)

export interface LayerInfo {
  name: string
  polylines: number
  closedPolylines: number
  points: number
  texts: number
  faces: number
  circles: number
  /** Blocks placed on the layer (trees, pits, poles). */
  inserts: number
  /** Polylines whose vertices all share one non-zero elevation. */
  levelPolylines: number
}

export interface SurveyPoint {
  x: number
  y: number
  z: number
  layer: string
}

export interface Contour {
  layer: string
  /** Representative elevation (median of vertices). */
  z: number
  major: boolean
  pts: Vec3[]
}

/** Survey data in a local frame: x = easting - origin[0], y = northing - origin[1], z = RL. */
export interface Survey {
  origin: Vec2
  boundary: Vec2[]
  boundaryIsGuess: boolean
  contours: Contour[]
  levels: SurveyPoint[]
  reference: SurveyPoint[]
  warnings: string[]
}

function isClosedRing(pts: Vec3[], closedFlag: boolean): boolean {
  if (pts.length < 3) return false
  if (closedFlag) return true
  const a = pts[0]
  const b = pts[pts.length - 1]
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6
}

export function analyzeLayers(doc: DxfDocument): LayerInfo[] {
  const map = new Map<string, LayerInfo>()
  const get = (name: string) => {
    let info = map.get(name)
    if (!info) {
      info = { name, polylines: 0, closedPolylines: 0, points: 0, texts: 0, faces: 0, circles: 0, inserts: 0, levelPolylines: 0 }
      map.set(name, info)
    }
    return info
  }
  for (const e of doc.entities) {
    const info = get(e.layer)
    if (e.kind === 'polyline') {
      info.polylines++
      if (isClosedRing(e.points, e.closed)) info.closedPolylines++
      const z0 = e.points[0]?.[2] ?? 0
      if (z0 !== 0 && e.points.every(p => Math.abs(p[2] - z0) < 1e-6)) info.levelPolylines++
    } else if (e.kind === 'point') info.points++
    else if (e.kind === 'text') info.texts++
    else if (e.kind === 'circle') info.circles++
    else if (e.kind === 'insert') info.inserts++
    else info.faces++
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Layer names that say what site feature a layer holds, checked word by word so that
 * "SW" (stormwater) doesn't match inside "SWALE_LEVELS". Earlier entries win.
 */
const FEATURE_NAMES: [RegExp, FeatureRole][] = [
  [/\b(easements?|ease|esmt|eas|row)\b/, 'easement'],
  [/\b(trees?|veg|vegetation|canopy|shrubs?|tpz|palms?)\b/, 'tree'],
  [/\b(fences?|fencing|fnc|fen)\b/, 'fence'],
  [/\b(kerbs?|curbs?|k ?& ?g|kg|road|roads|footpath|fp|edge of road|bitumen|seal)\b/, 'kerb'],
  [/\b(drive|driveway|dw|dwy|conc|concrete|pave|paving|pavement|pavers|path|paths|hardstand|crossover)\b/, 'paving'],
  [/\b(bldg|bldgs|building|buildings|shed|sheds|struct|structure|structures|house|dwelling|garage|carport)\b/, 'building'],
  [/\b(sew|sewer|sewerage|smh|sm)\b/, 'service-sewer'],
  [/\b(storm|stormwater|sw|swp|drain|drainage|pits?|rcp)\b/, 'service-stormwater'],
  [/\b(water|wtr|wm|hyd|hydrant)\b/, 'service-water'],
  [/\b(gas)\b/, 'service-gas'],
  [/\b(elec|electric|electrical|electricity|power|pwr|poles?|oh|ohw|lv|hv)\b/, 'service-power'],
  [/\b(tel|telstra|telecom|telecoms|comms|nbn|optic|optus)\b/, 'service-telecom'],
]

/** The site feature a layer's name suggests, if any. */
export function featureRoleFromName(name: string): FeatureRole | null {
  // Words: split on anything that isn't a letter or digit, and between letters and digits.
  const words = ` ${name
    .toLowerCase()
    .replace(/&/g, ' & ')
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/[^a-z0-9&]+/g, ' ')} `
  for (const [re, role] of FEATURE_NAMES) if (re.test(words)) return role
  return null
}

export function guessRole(info: LayerInfo): LayerRole {
  const n = info.name.toLowerCase()
  if (info.closedPolylines > 0 && /bound|lot|title|cadast|property|parcel|site/.test(n)) return 'boundary'
  if (info.polylines > 0 && /contour|cont|topo|^c[-_ ]/.test(n)) return 'contour'
  const feature = featureRoleFromName(info.name)
  if (feature) return feature
  if (info.texts > 0 && info.points + info.polylines + info.faces === 0) return 'ignore'
  if (info.points + info.faces > 0) {
    if (/sketch|check|ref|my|own|tape/.test(n)) return 'reference'
    return 'levels'
  }
  if (info.polylines > 0 && info.levelPolylines >= info.polylines * 0.8) return 'contour'
  return 'ignore'
}

export function guessRoles(layers: LayerInfo[]): Record<string, LayerRole> {
  const roles: Record<string, LayerRole> = {}
  for (const l of layers) roles[l.name] = guessRole(l)
  return roles
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function buildSurvey(doc: DxfDocument, roles: Record<string, LayerRole>): Survey {
  const warnings: string[] = []
  const rawContours: { layer: string; pts: Vec3[] }[] = []
  const rings: Vec2[][] = []
  const levels: SurveyPoint[] = []
  const reference: SurveyPoint[] = []

  for (const e of doc.entities) {
    const role = roles[e.layer] ?? 'ignore'
    if (role === 'ignore') continue
    if (e.kind === 'polyline') {
      if (role === 'contour' && e.points.length >= 2) rawContours.push({ layer: e.layer, pts: e.points })
      else if (role === 'boundary' && isClosedRing(e.points, e.closed)) {
        rings.push(e.points.map(p => [p[0], p[1]] as Vec2))
      }
    } else if (e.kind === 'point' || e.kind === 'face') {
      const pts = e.kind === 'point' ? [e.p] : e.points
      const target = role === 'levels' ? levels : role === 'reference' ? reference : null
      if (target) for (const p of pts) target.push({ x: p[0], y: p[1], z: p[2], layer: e.layer })
    }
  }

  // Pick the largest closed ring as the site boundary.
  let boundaryWorld: Vec2[] | null = null
  let best = 0
  for (const r of rings) {
    const ring = normalizeRing(r)
    const a = Math.abs(signedArea(ring))
    if (ring.length >= 3 && a > best) {
      best = a
      boundaryWorld = ring
    }
  }

  const allXY: Vec2[] = [
    ...rawContours.flatMap(c => c.pts.map(p => [p[0], p[1]] as Vec2)),
    ...levels.map(p => [p.x, p.y] as Vec2),
  ]
  if (allXY.length < 3) {
    throw new Error('No contours or spot levels found. Check which layers are set as contours or spot levels.')
  }

  let boundaryIsGuess = false
  if (!boundaryWorld) {
    boundaryWorld = normalizeRing(convexHull(allXY))
    boundaryIsGuess = true
    warnings.push('No site boundary found, so the extent of the survey data is used instead.')
  }

  const b = bounds(boundaryWorld)
  const origin: Vec2 = [Math.floor(b.minX), Math.floor(b.minY)]
  const local = (x: number, y: number): Vec2 => [x - origin[0], y - origin[1]]

  let zeroContours = 0
  const contours: Contour[] = rawContours.map(c => {
    const z = median(c.pts.map(p => p[2]))
    if (z === 0) zeroContours++
    const layerMajor = /major|index/i.test(c.layer)
    return {
      layer: c.layer,
      z,
      major: layerMajor || Math.abs(z - Math.round(z)) < 1e-6,
      pts: c.pts.map(p => {
        const [x, y] = local(p[0], p[1])
        return [x, y, p[2]] as Vec3
      }),
    }
  })
  if (zeroContours > 0) {
    warnings.push(`${zeroContours} contour line(s) have an elevation of 0, so they may be missing their heights.`)
  }

  const toLocal = (p: SurveyPoint): SurveyPoint => {
    const [x, y] = local(p.x, p.y)
    return { ...p, x, y }
  }

  return {
    origin,
    boundary: boundaryWorld.map(p => local(p[0], p[1])),
    boundaryIsGuess,
    contours,
    levels: levels.map(toLocal),
    reference: reference.map(toLocal),
    warnings,
  }
}
