// The BASIX checklist's plain maths: what the official BASIX tool will ask for, read off the plan
// (window area by the way each wall faces, which way the living areas look, floor area, roof and
// tank). It calculates no BASIX score and no star rating: that is the tool's job.

import { pointInPolygon, type Vec2 } from '../lib/geom'
import { buildingOutline, closestOnSegment, faceAround, planarFaces, roomShape, type Face } from '../plan/geometry'
import { pointOnWall, sortedLevels, wallDir, type Opening, type Plan, type Wall } from '../plan/model'
import { isGarageRoom } from '../plan/quantities'
import { stormwaterOf } from '../drainage/model'
import { roofCatchments, tankRoofs, totalCatchment } from '../drainage/stormwater'
import { basixOf, type BasixAnswers, type BasixItemId, type Cooling, type Heating, type HotWater, type Lighting } from './model'

// ---------------------------------------------------------------------------
// Sources and links (see docs/research/compliance-and-swept-path-sources.md, SEPP (Sustainable
// Buildings) 2022 row). Marks: read | secondary | unverified.

export interface BasixLink {
  label: string
  url: string
  confidence: 'read' | 'secondary' | 'unverified'
  /** What the research notes say about it. */
  note: string
}

export const BASIX_LINKS: BasixLink[] = [
  {
    label: 'BASIX standards (NSW Planning Portal)',
    url: 'https://www.planningportal.nsw.gov.au/BASIX-standards',
    confidence: 'read',
    note: 'The standards in force from 1 Oct 2023; page updated 10 Mar 2025, read 8 Nov 2026.',
  },
  {
    // The research notes record the tool as a login-only web form on the planning portal and give no
    // address for it; this is the portal's BASIX landing page, which could not be opened from here.
    label: 'BASIX on the NSW Planning Portal (the tool needs a login)',
    url: 'https://www.planningportal.nsw.gov.au/basix',
    confidence: 'unverified',
    note: 'The official tool. Address not confirmed in the research notes; if it moves, search the portal for BASIX.',
  },
]

/**
 * When a BASIX certificate is needed, from the research notes (SEPP (Sustainable Buildings) 2022,
 * epi-2022-0521, and the BASIX standards page; read, as at 10 Mar 2025 / 8 Nov 2026): a new home,
 * renovations of $50,000 or more, or a pool or spa over 40,000 L. Those three figures are the only
 * rule numbers in this module.
 */
export const WHEN_NEEDED = 'A BASIX certificate is needed for a new home, for renovations of $50,000 or more, and for a pool or spa over 40,000 L.'
export const POOL_LITRES_NEEDING_BASIX = 40_000

// ---------------------------------------------------------------------------
// From the plan

export type Facade = 'N' | 'E' | 'S' | 'W'
export const FACADES: Facade[] = ['N', 'E', 'S', 'W']
export const FACADE_NAMES: Record<Facade, string> = { N: 'North', E: 'East', S: 'South', W: 'West' }

export interface WindowFacing {
  opening: Opening
  wall: Wall
  facade: Facade
  /** Compass bearing the window looks out to. */
  bearing: number
  area: number
}

/** The compass bearing a plan-frame direction points to, given the plan's rotation on the site. */
export function compassOf(dir: Vec2, rotation: number): number {
  const east = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI + rotation
  return ((90 - east) % 360 + 360) % 360
}

export const facadeOf = (bearing: number): Facade => FACADES[Math.round((((bearing % 360) + 360) % 360) / 90) % 4]

/**
 * Every window on an outside wall, with the way it faces. A wall's outside is the side of it that
 * isn't inside the building's outline; a wall inside the house, or standing free, has no facade.
 */
export function windowFacings(plan: Plan): WindowFacing[] {
  const out: WindowFacing[] = []
  const byLevel = new Map<string, Vec2[][]>()
  for (const l of plan.levels) byLevel.set(l.id, buildingOutline(planarFaces(plan.walls.filter(w => w.level === l.id))).outlines)
  const walls = new Map(plan.walls.map(w => [w.id, w]))
  for (const o of plan.openings) {
    if (o.kind !== 'window') continue
    const w = walls.get(o.wall)
    if (!w || w.kind === 'retaining') continue
    const rings = byLevel.get(w.level) ?? []
    const mid = pointOnWall(w, o.offset)
    const d = wallDir(w)
    const n: Vec2 = [-d[1], d[0]]
    const reach = w.thickness / 2 + 0.05
    const inside = (s: number) => rings.some(r => pointInPolygon(mid[0] + n[0] * s * reach, mid[1] + n[1] * s * reach, r))
    const left = inside(1)
    const right = inside(-1)
    if (left === right) continue
    const outward: Vec2 = left ? [-n[0], -n[1]] : n
    const bearing = compassOf(outward, plan.placement.rotation)
    out.push({ opening: o, wall: w, facade: facadeOf(bearing), bearing, area: o.width * o.height })
  }
  return out
}

/** Window area (m²) by facade, from the windows on the plan's outside walls. */
export function windowAreaByFacade(plan: Plan): Record<Facade, number> {
  const t: Record<Facade, number> = { N: 0, E: 0, S: 0, W: 0 }
  for (const f of windowFacings(plan)) t[f.facade] += f.area
  return t
}

export const LIVING_ROOM = /living|lounge|family|dining|kitchen|rumpus|meals|open plan|great room/i

export interface LivingOrientation {
  room: string
  level: string
  /** Window area by facade in this room's own outside walls. */
  windows: Record<Facade, number>
  /** The facade with the most glass, or null with no windows. */
  main: Facade | null
}

/** Which way each living area looks: its windows by facade. */
export function livingOrientations(plan: Plan): LivingOrientation[] {
  const facings = windowFacings(plan)
  const facesByLevel = new Map<string, Face[]>()
  for (const l of plan.levels) facesByLevel.set(l.id, planarFaces(plan.walls.filter(w => w.level === l.id)))
  return plan.rooms
    .filter(r => LIVING_ROOM.test(r.name))
    .map(r => {
      const face = faceAround(r.at, facesByLevel.get(r.level) ?? [])
      const windows: Record<Facade, number> = { N: 0, E: 0, S: 0, W: 0 }
      // A wall can run past several rooms: a window counts for this one when it sits along the room's own edge.
      const onEdge = (p: Vec2) => !!face && face.pts.some((a, i) => closestOnSegment(p, a, face.pts[(i + 1) % face.pts.length]).dist < 0.05)
      if (face) for (const f of facings) if (face.walls.includes(f.wall.id) && onEdge(pointOnWall(f.wall, f.opening.offset))) windows[f.facade] += f.area
      const main = FACADES.reduce<Facade | null>((best, f) => (windows[f] > 0 && (best === null || windows[f] > windows[best]) ? f : best), null)
      return { room: r.name, level: r.level, windows, main }
    })
}

export interface FloorAreas {
  /** All floors to the outside of the walls (m²). */
  gross: number
  /** Garages and carports inside the walls (m²), which BASIX leaves out of the conditioned area. */
  garages: number
  /** Roughly the conditioned floor area: gross less garages. */
  conditioned: number
}

export function floorAreas(plan: Plan): FloorAreas {
  let gross = 0
  let garages = 0
  for (const l of sortedLevels(plan)) {
    const faces = planarFaces(plan.walls.filter(w => w.level === l.id))
    gross += buildingOutline(faces).area
    const seen = new Set<Face>()
    for (const r of plan.rooms) {
      if (r.level !== l.id || !isGarageRoom(r.name)) continue
      const f = faceAround(r.at, faces)
      if (!f || seen.has(f)) continue
      seen.add(f)
      garages += roomShape(r, faces)?.area ?? 0
    }
  }
  return { gross, garages, conditioned: Math.max(0, gross - garages) }
}

/** Everything the checklist reads off the plan. */
export interface BasixFacts {
  living: LivingOrientation[]
  windows: Record<Facade, number>
  windowTotal: number
  floor: FloorAreas
  /** Window area as a share of the conditioned floor area; null with no floor. */
  glazingRatio: number | null
  /** Roof plan area (m²), all roofs, and the part draining to the tank. */
  roofArea: number
  tankRoofArea: number
  tankLitres: number
}

export function basixFacts(plan: Plan): BasixFacts {
  const windows = windowAreaByFacade(plan)
  const windowTotal = FACADES.reduce((t, f) => t + windows[f], 0)
  const floor = floorAreas(plan)
  const roofs = roofCatchments(plan)
  return {
    living: livingOrientations(plan),
    windows,
    windowTotal,
    floor,
    glazingRatio: floor.conditioned > 0 ? windowTotal / floor.conditioned : null,
    roofArea: totalCatchment(roofs),
    tankRoofArea: totalCatchment(tankRoofs(plan, roofs)),
    tankLitres: stormwaterOf(plan).tankLitres,
  }
}

// ---------------------------------------------------------------------------
// The checklist's items, in words

export const HOT_WATER: { id: HotWater; label: string }[] = [
  { id: 'undecided', label: 'Not decided yet' },
  { id: 'heat-pump', label: 'Electric heat pump' },
  { id: 'solar-electric', label: 'Solar, electric boosted' },
  { id: 'solar-gas', label: 'Solar, gas boosted' },
  { id: 'gas-instant', label: 'Gas instantaneous' },
  { id: 'gas-storage', label: 'Gas storage' },
  { id: 'electric-storage', label: 'Electric storage' },
]

export const HEATING: { id: Heating; label: string }[] = [
  { id: 'undecided', label: 'Not decided yet' },
  { id: 'none', label: 'None' },
  { id: 'reverse-cycle', label: 'Reverse-cycle air conditioner (split system)' },
  { id: 'ducted-reverse-cycle', label: 'Ducted reverse-cycle' },
  { id: 'gas', label: 'Gas heater' },
  { id: 'electric-other', label: 'Other electric heater' },
]

export const COOLING: { id: Cooling; label: string }[] = [
  { id: 'undecided', label: 'Not decided yet' },
  { id: 'none', label: 'None' },
  { id: 'fans', label: 'Ceiling fans only' },
  { id: 'reverse-cycle', label: 'Reverse-cycle air conditioner (split system)' },
  { id: 'ducted-reverse-cycle', label: 'Ducted reverse-cycle' },
  { id: 'evaporative', label: 'Evaporative cooler' },
]

export const LIGHTING: { id: Lighting; label: string }[] = [
  { id: 'undecided', label: 'Not decided yet' },
  { id: 'led-all', label: 'LED throughout' },
  { id: 'led-most', label: 'Mostly LED' },
  { id: 'mixed', label: 'Mixed fittings' },
]

const labelOf = <T extends string>(list: { id: T; label: string }[], id: T | undefined) => list.find(x => x.id === id)?.label ?? 'Not decided yet'

export interface ChecklistRow {
  id: BasixItemId
  item: string
  /** What the plan or the person says. */
  value: string
  /** What the BASIX tool asks for, in one plain sentence. */
  why: string
  /** Comes from the plan (true) or from the person. */
  fromPlan: boolean
}

const m2 = (n: number) => `${n.toFixed(1)} m²`
const pct = (n: number) => `${(n * 100).toFixed(0)}%`

/** The checklist as rows, from the plan's facts and the person's answers. */
export function checklistRows(facts: BasixFacts, a: BasixAnswers): ChecklistRow[] {
  const living = facts.living.length
    ? facts.living.map(l => `${l.room}: ${l.main ? `mostly ${FACADE_NAMES[l.main].toLowerCase()}` : 'no outside windows yet'}`).join('; ')
    : 'No living, kitchen or dining room named yet'
  const windows = FACADES.map(f => `${FACADE_NAMES[f]} ${m2(facts.windows[f])}`).join(', ')
  return [
    { id: 'orientation', item: 'Living areas face', value: living, why: 'The tool asks which way each living area’s glass faces; north-facing living gets winter sun.', fromPlan: true },
    {
      id: 'glazing',
      item: 'Window area by facade',
      value: `${windows}; ${m2(facts.windowTotal)} in all${facts.glazingRatio !== null ? `, ${pct(facts.glazingRatio)} of the floor area` : ''}`,
      why: 'Glass area and the way it faces drive the thermal result; the tool asks for every window’s size and orientation.',
      fromPlan: true,
    },
    {
      id: 'floor-area',
      item: 'Conditioned floor area',
      value: `${m2(facts.floor.conditioned)} (${m2(facts.floor.gross)} to the outside of the walls, garages ${m2(facts.floor.garages)} left out)`,
      why: 'The heated and cooled floor area, which the energy and water targets are set against.',
      fromPlan: true,
    },
    {
      id: 'roof-tank',
      item: 'Roof area and rainwater tank',
      value: `${m2(facts.roofArea)} of roof, ${m2(facts.tankRoofArea)} draining to the tank; tank ${facts.tankLitres > 0 ? `${facts.tankLitres.toLocaleString()} L` : 'not set yet (Earthworks › Stormwater)'}`,
      why: 'The water target counts rainwater collected from the roof and what the tank supplies (toilets, laundry, garden).',
      fromPlan: true,
    },
    { id: 'insulation', item: 'Insulation you intend', value: a.insulation?.trim() || 'Not decided yet', why: 'Ceiling, wall and floor insulation (R-values) go into the thermal assessment.', fromPlan: false },
    { id: 'hot-water', item: 'Hot water system', value: labelOf(HOT_WATER, a.hotWater), why: 'The hot water system is the biggest single item in the energy target.', fromPlan: false },
    { id: 'heating', item: 'Heating', value: labelOf(HEATING, a.heating), why: 'The tool asks what heats the living areas and bedrooms, and its efficiency.', fromPlan: false },
    { id: 'cooling', item: 'Cooling', value: labelOf(COOLING, a.cooling), why: 'The tool asks what cools the living areas and bedrooms, and its efficiency.', fromPlan: false },
    { id: 'lighting', item: 'Lighting', value: labelOf(LIGHTING, a.lighting), why: 'The share of efficient (LED or fluorescent) fittings counts towards the energy target.', fromPlan: false },
    {
      id: 'pool',
      item: 'Pool or spa',
      value: a.pool ? `Yes${a.poolLitres ? `, about ${a.poolLitres.toLocaleString()} L` : ''}` : 'None',
      why: `A pool or spa adds pumps and heating to the energy target, and one over ${POOL_LITRES_NEEDING_BASIX.toLocaleString()} L needs BASIX on its own.`,
      fromPlan: false,
    },
  ]
}

/** How many items are ticked ready, of all of them. */
export function readyCount(rows: ChecklistRow[], a: BasixAnswers): { done: number; of: number } {
  return { done: rows.filter(r => a.done?.[r.id]).length, of: rows.length }
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/** The checklist as a CSV: item, what the plan or you say, what BASIX asks for, ready. */
export function basixCsv(plan: Plan, title: string, date: string): string {
  const a = basixOf(plan)
  const rows = checklistRows(basixFacts(plan), a)
  const lines = [
    [`BASIX checklist: ${title}`, date, '', ''],
    ['This does not calculate a BASIX score or issue a certificate: it gathers what the BASIX tool will ask for.', '', '', ''],
    ['Item', 'From the plan or you', 'What BASIX asks for', 'Ready'],
    ...rows.map(r => [r.item, r.value, r.why, a.done?.[r.id] ? 'yes' : 'no']),
    ...BASIX_LINKS.map(l => [l.label, l.url, l.note, '']),
  ]
  return lines.map(l => l.map(csvCell).join(',')).join('\n') + '\n'
}
