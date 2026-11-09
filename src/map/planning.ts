// What the NSW planning maps say about a placed lot: its council and LEP, zone, the LEP map values,
// heritage, and the bushfire, flood and landslide maps. Read once when the block is placed (and
// again on request), then kept with the project so the checks work offline.
//
// Each layer is asked about the lot's middle, and about points spread inside it at least
// EDGE_GAP from its lines. A hit inside but not at the middle reads as "part of the lot". Points,
// not the outline, because an outline touches the next lot's zone and the road's.

import { centroidOf, pointInPolygon, signedArea, type Vec2 } from '../lib/geom'
import { fromMga, toMga, zoneOf, type LonLat } from './geo'
import { layerAt, LAYERS, type Attrs, type LayerKey } from './services'

export interface Hit {
  /** What it is, in the layer's words: "R2 Low Density Residential", "Vegetation Category 1". */
  name: string
  /** It covers the lot's middle, not only part of the lot. */
  middle: boolean
}

export interface HeritageHit extends Hit {
  /** "Item - General", "Conservation Area - General". */
  kind: string
  /** Its number in the LEP schedule. */
  item?: string
  significance?: string
}

export interface PlanningFacts {
  /** When it was read (ISO). */
  at: string
  /** The council, in the layer's capitals: "WOLLONGONG". */
  lga: string | null
  /** "Wollongong Local Environmental Plan 2009". */
  lep: string | null
  zones: (Hit & { code: string })[]
  /** Height of buildings map (m), at the middle. */
  height: number | null
  /** Floor space ratio map (n:1), at the middle. */
  fsr: number | null
  /** Minimum lot size map, at the middle: "449 m²". */
  lotSize: string | null
  heritage: HeritageHit[]
  bushfire: Hit[]
  flood: Hit[]
  landslide: Hit[]
  /** Layers that didn't answer, so their rows say so instead of reading as clear. */
  failed: LayerKey[]
}

/** How far inside the lot's lines a point has to be: the cadastre and the LEP maps disagree by a metre or so. */
export const EDGE_GAP = 1.5
const MAX_POINTS = 40

/** The lot's middle and a spread of points inside it, clear of its lines (GDA2020 lon/lat). */
export function samplePoints(ring: LonLat[]): { middle: LonLat; inside: LonLat[] } {
  const zone = zoneOf(ring[0][0])
  const poly = ring.map(p => toMga(p, zone))
  let middle = centroidOf(poly)
  const inside: Vec2[] = []
  const xs = poly.map(p => p[0])
  const ys = poly.map(p => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const area = Math.abs(signedArea(poly))
  let step = Math.max(2, Math.sqrt(area / MAX_POINTS))
  for (let tries = 0; tries < 4; tries++) {
    inside.length = 0
    for (let x = x0 + step / 2; x < x1; x += step)
      for (let y = y0 + step / 2; y < y1; y += step) if (pointInPolygon(x, y, poly) && edgeDistance([x, y], poly) >= EDGE_GAP) inside.push([x, y])
    if (inside.length >= 4 || step <= 1) break
    step /= 2
  }
  // An L-shaped or battle-axe lot's centroid can fall outside it, or on its line: use the inside point nearest it.
  if (!pointInPolygon(middle[0], middle[1], poly) || edgeDistance(middle, poly) < EDGE_GAP) {
    const near = inside.reduce<Vec2 | null>((b, p) => (!b || dist(p, middle) < dist(b, middle) ? p : b), null)
    if (near) middle = near
  }
  const thin = inside.length > MAX_POINTS ? inside.filter((_, i) => i % Math.ceil(inside.length / MAX_POINTS) === 0) : inside
  return { middle: fromMga(middle, zone), inside: thin.map(p => fromMga(p, zone)) }
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1])

function edgeDistance(p: Vec2, poly: Vec2[]): number {
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const L = dx * dx + dy * dy
    const t = L > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0
    best = Math.min(best, Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]))
  }
  return best
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() && v !== '<Null>' ? v.trim() : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Attribute rows to hits, by a name, marking those also at the middle. Same name once. */
function hits(middle: Attrs[], inside: Attrs[], name: (a: Attrs) => string | null): Hit[] {
  const atMiddle = new Set(middle.map(name).filter((x): x is string => !!x))
  const out = new Map<string, Hit>()
  for (const a of [...middle, ...inside]) {
    const n = name(a)
    if (n && !out.has(n)) out.set(n, { name: n, middle: atMiddle.has(n) })
  }
  return [...out.values()]
}

const zoneName = (a: Attrs) => {
  const code = str(a.SYM_CODE)
  if (!code) return null
  const purpose = str(a.PURPOSE)
  return `${code} ${str(a.LAY_CLASS) ?? ''}${purpose ? ` (${purpose})` : ''}`.trim()
}
const heritageName = (a: Attrs) => str(a.H_NAME) ?? str(a.LAY_CLASS)
const bushfireName = (a: Attrs) => str(a.d_Category) ?? 'Bushfire prone land'
const hazardName = (fallback: string) => (a: Attrs) => str(a.LAY_CLASS) ?? fallback

/** What the layers' replies say, as kept with the project. Pure, so the recorded replies test it. */
export function factsFrom(
  replies: Partial<Record<LayerKey, { middle: Attrs[]; inside: Attrs[] } | null>>,
  at = new Date().toISOString(),
): PlanningFacts {
  const r = (k: LayerKey) => replies[k] ?? { middle: [], inside: [] }
  const first = (k: LayerKey) => r(k).middle[0] ?? null
  const lep = first('lep') ?? first('zone')
  const zones = hits(r('zone').middle, r('zone').inside, zoneName).map(h => ({ ...h, code: h.name.split(' ')[0] }))
  const heritageRows = [...r('heritage').middle, ...r('heritage').inside]
  const heritage: HeritageHit[] = hits(r('heritage').middle, r('heritage').inside, heritageName).map(h => {
    const row = heritageRows.find(a => heritageName(a) === h.name) ?? {}
    return { ...h, kind: str(row.LAY_CLASS) ?? 'Heritage', item: str(row.H_ID) ?? undefined, significance: str(row.SIG) ?? undefined }
  })
  const ls = first('lotSize')
  const lotSize = ls && num(ls.LOT_SIZE) !== null ? `${num(ls.LOT_SIZE)} ${str(ls.UNITS) ?? 'm²'}` : null
  return {
    at,
    lga: str(lep?.LGA_NAME),
    lep: str(lep?.EPI_NAME),
    zones,
    height: num(first('height')?.MAX_B_H_M) ?? num(first('height')?.MAX_B_H),
    fsr: num(first('fsr')?.FSR),
    lotSize,
    heritage,
    bushfire: hits(r('bushfire').middle, r('bushfire').inside, bushfireName),
    flood: hits(r('flood').middle, r('flood').inside, hazardName('Flood planning area')),
    landslide: hits(r('landslide').middle, r('landslide').inside, hazardName('Landslide risk land')),
    failed: (Object.keys(LAYERS) as LayerKey[]).filter(k => replies[k] === null),
  }
}

/** Layers whose value at the middle is all the checks need. */
const MIDDLE_ONLY: LayerKey[] = ['lep', 'height', 'fsr', 'lotSize']

/** Ask every layer about the lot, side by side. A layer that fails is noted, not fatal. */
export async function readPlanning(ring: LonLat[], signal?: AbortSignal): Promise<PlanningFacts> {
  const { middle, inside } = samplePoints(ring)
  const keys = Object.keys(LAYERS) as LayerKey[]
  const replies = await Promise.all(
    keys.map(async k => {
      try {
        const [m, i] = await Promise.all([layerAt(k, [middle], signal), MIDDLE_ONLY.includes(k) || !inside.length ? Promise.resolve([]) : layerAt(k, inside, signal)])
        return [k, { middle: m, inside: i }] as const
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e
        return [k, null] as const
      }
    }),
  )
  return factsFrom(Object.fromEntries(replies))
}
