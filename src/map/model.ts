// A project's place on the map: which lot the survey sits on, how it was laid on it, and what the
// planning maps say there. Kept as the project's own "map" record, apart from the site features,
// so share links never carry it (worker/src/shares.ts sends only the survey, plan, prefs and site)
// and project files only when the owner says so.

import type { Vec2 } from '../lib/geom'
import type { GridFit } from './fit'
import type { LonLat } from './geo'
import type { PlanningFacts } from './planning'
import type { Lot } from './services'

export const MAP_KIND = 'map'

export interface MapPlace {
  version: 1
  /** MGA zone the fit is in. */
  zone: number
  /** Survey grid to MGA. */
  fit: GridFit
  /** How far the survey's boundary sits from the lot's lines (m): RMS and worst. */
  rms: number
  worst: number
  /** Survey boundary area over the lot's. */
  areaRatio: number
  /** The survey was already on MGA. */
  onGrid: boolean
  /** Turned or shifted by hand after the fit. */
  adjusted: boolean
  lot: Lot
  /** Show the aerial photo under the plan. */
  aerial: boolean
  opacity: number
  /** Put the lot and the block's position in project files too. */
  include: boolean
  planning: PlanningFacts | null
  placedAt: string
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isVec = (v: unknown): v is Vec2 => Array.isArray(v) && v.length === 2 && v.every(isNum)

/** Check a saved or opened record; null when it isn't a whole placement. */
export function normalizeMapPlace(raw: unknown): MapPlace | null {
  const r = raw as Partial<MapPlace> | null
  if (!r || typeof r !== 'object' || !r.fit || !r.lot) return null
  const f = r.fit
  if (!isVec(f.from) || !isVec(f.at) || !isNum(f.rotation)) return null
  const lot = r.lot
  if (typeof lot.id !== 'string' || !Array.isArray(lot.ring) || lot.ring.length < 3 || !lot.ring.every(isVec)) return null
  const zone = isNum(r.zone) && r.zone >= 49 && r.zone <= 56 ? r.zone : 56
  return {
    version: 1,
    zone,
    fit: { from: f.from, at: f.at, rotation: f.rotation },
    rms: isNum(r.rms) ? r.rms : 0,
    worst: isNum(r.worst) ? r.worst : 0,
    areaRatio: isNum(r.areaRatio) ? r.areaRatio : 1,
    onGrid: !!r.onGrid,
    adjusted: !!r.adjusted,
    lot: { id: lot.id, label: typeof lot.label === 'string' ? lot.label : lot.id, ring: lot.ring as LonLat[], ...(typeof lot.address === 'string' && lot.address.trim() ? { address: lot.address.trim() } : {}) },
    aerial: r.aerial !== false,
    opacity: isNum(r.opacity) ? Math.min(1, Math.max(0.1, r.opacity)) : 0.8,
    include: !!r.include,
    planning: r.planning && typeof r.planning === 'object' && typeof r.planning.at === 'string' ? normalizeFacts(r.planning) : null,
    placedAt: typeof r.placedAt === 'string' ? r.placedAt : new Date(0).toISOString(),
  }
}

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

function normalizeFacts(p: PlanningFacts): PlanningFacts {
  return {
    at: p.at,
    lga: typeof p.lga === 'string' ? p.lga : null,
    lep: typeof p.lep === 'string' ? p.lep : null,
    zones: arr(p.zones),
    height: isNum(p.height) ? p.height : null,
    fsr: isNum(p.fsr) ? p.fsr : null,
    lotSize: typeof p.lotSize === 'string' ? p.lotSize : null,
    heritage: arr(p.heritage),
    bushfire: arr(p.bushfire),
    flood: arr(p.flood),
    landslide: arr(p.landslide),
    failed: arr(p.failed),
  }
}
