// The open project's place on the map, saved as its own "map" record (see model.ts for why).

import { create } from 'zustand'
import { projectsNow, registerRecordKind } from '../projects/session'
import { councilFromMap } from '../checks/settings'
import { showToast } from '../safety/store'
import type { Vec2 } from '../lib/geom'
import { demPlace, type DemBlock } from './demSite'
import { errorsOf, fitBoundary, nudgeFit, type GridFit } from './fit'
import { toMga, zoneOf } from './geo'
import { MAP_KIND, normalizeMapPlace, type MapPlace } from './model'
import { readPlanning } from './planning'
import { MapServiceError, type Lot } from './services'

interface MapStore {
  place: MapPlace | null
  /** Reading the planning layers now. */
  reading: boolean
  error: string | null
}

export const useMap = create<MapStore>(() => ({ place: null, reading: false, error: null }))

const SAVE_DELAY = 400
let started = false
let applying = false
let save: ((value: MapPlace | null, id?: string) => Promise<void>) | null = null
let pending: { id: string; place: MapPlace | null } | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let reader: AbortController | null = null

export function flushMap(): Promise<void> {
  clearTimeout(timer)
  const job = pending
  pending = null
  return job && save ? save(job.place, job.id) : Promise.resolve()
}

/** Load and save the map record with each project. Called once at start-up. */
export function startMapRecords() {
  if (started) return
  started = true
  save = registerRecordKind<MapPlace | null>(MAP_KIND, value => {
    void flushMap()
    reader?.abort()
    applying = true
    try {
      useMap.setState({ place: normalizeMapPlace(value), reading: false, error: null })
    } finally {
      applying = false
    }
  })
  useMap.subscribe((s, prev) => {
    if (applying || s.place === prev.place) return
    const id = projectsNow().currentId
    if (!id) return
    if (pending && pending.id !== id) void flushMap()
    pending = { id, place: s.place }
    clearTimeout(timer)
    timer = setTimeout(() => void flushMap(), SAVE_DELAY)
  })
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => void flushMap())
}

/** Survey boundary (survey grid) as the map needs it. */
export interface SurveyOutline {
  /** The survey's own grid coordinates of its boundary corners. */
  boundary: Vec2[]
  /** The survey's origin, which the fit is pinned by. */
  origin: Vec2
}

/** Lay the survey on a lot: fit its boundary to the lot's lines, keep it, and read the planning layers. */
export function placeOnLot(survey: SurveyOutline, lot: Lot): MapPlace {
  const zone = zoneOf(lot.ring[0][0])
  const lotMga = lot.ring.map(p => toMga(p, zone))
  const r = fitBoundary(survey.boundary, lotMga, survey.origin)
  const before = useMap.getState().place
  const place: MapPlace = {
    version: 1,
    zone,
    fit: { from: r.from, at: r.at, rotation: r.rotation },
    rms: r.rms,
    worst: r.worst,
    areaRatio: r.areaRatio,
    onGrid: r.onGrid,
    adjusted: false,
    lot,
    aerial: before?.aerial ?? true,
    opacity: before?.opacity ?? 0.8,
    include: before?.include ?? false,
    planning: before?.lot.id === lot.id ? before.planning : null,
    placedAt: new Date().toISOString(),
  }
  useMap.setState({ place, error: null })
  if (!place.planning) void refreshPlanning()
  return place
}

/** Turn or shift the placement by hand, and say again how well it sits. */
export function adjustPlace(survey: SurveyOutline, move: { turn?: number; shift?: Vec2 }) {
  const p = useMap.getState().place
  if (!p) return
  const about = survey.boundary.length ? mid(survey.boundary) : p.fit.from
  const fit: GridFit = nudgeFit(p.fit, { ...move, about })
  const lotMga = p.lot.ring.map(q => toMga(q, p.zone))
  const e = errorsOf(fit, survey.boundary, lotMga)
  useMap.setState({ place: { ...p, fit, rms: e.rms, worst: e.worst, adjusted: true, onGrid: false } })
}

const mid = (ps: Vec2[]): Vec2 => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length]

export function setMapOptions(patch: Partial<Pick<MapPlace, 'aerial' | 'opacity' | 'include'>>) {
  const p = useMap.getState().place
  if (p) useMap.setState({ place: { ...p, ...patch } })
}

/** Take the block off the map, with Undo. */
export function removePlace() {
  const p = useMap.getState().place
  if (!p) return
  reader?.abort()
  useMap.setState({ place: null, reading: false, error: null })
  showToast({ text: 'Taken off the map.', undo: () => useMap.setState({ place: p }) })
}

/** Read the planning layers for the placed lot again. */
export async function refreshPlanning(): Promise<void> {
  const p = useMap.getState().place
  if (!p) return
  reader?.abort()
  const ctrl = new AbortController()
  reader = ctrl
  useMap.setState({ reading: true, error: null })
  try {
    const planning = await readPlanning(p.lot.ring, ctrl.signal)
    const now = useMap.getState().place
    // Still the same lot (not taken off, or moved to another, while reading).
    if (ctrl.signal.aborted || !now || now.lot.id !== p.lot.id) return
    useMap.setState({ place: { ...now, planning }, reading: false })
    // Approvals › Checks' "DA with …" follows the council the maps name, unless one was picked by hand.
    councilFromMap(planning)
  } catch (e) {
    if (ctrl.signal.aborted) return
    useMap.setState({ reading: false, error: e instanceof MapServiceError ? e.message : 'The planning layers couldn’t be read. Try again in a minute.' })
  } finally {
    if (reader === ctrl) reader = null
  }
}

/** What goes in the project file: the placement only when the owner switched that on. */
export function mapForProject(): MapPlace | undefined {
  const p = useMap.getState().place
  return p?.include ? p : undefined
}

export function mapFromRecords(records: Record<string, unknown> | null): MapPlace | undefined {
  const p = normalizeMapPlace(records?.[MAP_KIND])
  return p?.include ? p : undefined
}

/** Put a block made from the state's ground levels on its lot (exactly: the lot is its boundary), and read the planning layers. */
export function placeDemBlock(block: DemBlock, lot: Lot) {
  const place = demPlace(block, lot, useMap.getState().place)
  useMap.setState({ place, error: null })
  if (!place.planning) void refreshPlanning()
}
