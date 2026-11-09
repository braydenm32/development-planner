// The sun on 21 June, the day councils ask about: the house's shadow at 9 am, 12 pm and 3 pm
// (the shadow diagram), whether it reaches over the boundary through the day, and the hours of
// sun on the living areas' windows. Plans don't change between renders, so each result is kept
// for the last plan and ground it was worked out for and handed to everyone who asks.

import type { Vec2 } from '../lib/geom'
import type { Heightfield } from '../lib/terrain'
import type { Plan } from '../plan/model'
import { andList } from '../plan/keyNumbers'
import { locationOf, type SiteLocation } from './location'
import { facingOf, isLiving, roomWindows, windowSunny, type RoomSun } from './rooms'
import { castFaces, dayFrame, polygonMask, shadowOf, shadowRaster, sidesCrossed, sunRay, type Ground, type Shadow } from './shadow'
import { houseSolids, isEmpty, solidTriangles } from './solids'
import { hourText, sunAt, type SunDate, type SunPosition } from './solar'

/** The winter solstice: the shortest day, with the longest shadows at noon. */
export const WINTER = { month: 6, day: 21 }
/** The times councils ask for shadow diagrams at (AEST minutes after midnight). */
export const DIAGRAM_TIMES = [9 * 60, 12 * 60, 15 * 60]
/** The window of the day the sun rules look at: 9 am to 3 pm. */
export const STUDY_FROM = 9 * 60
export const STUDY_TO = 15 * 60

/** 21 June this year. */
export const winterDay = (year = new Date().getFullYear()): SunDate => ({ year, ...WINTER })

export interface SiteInput {
  plan: Plan
  /** The survey's boundary and origin (survey frame). */
  boundary: Vec2[]
  origin: Vec2
  /** The ground shadows fall on: finished where it's cut or filled. */
  ground: Heightfield | Ground
  date: SunDate
}

export interface DiagramShadow {
  minutes: number
  sun: SunPosition
  /** Null when the sun is down or the house casts nothing. */
  shadow: Shadow | null
}

export interface ShadowDiagram {
  location: SiteLocation
  date: SunDate
  shadows: DiagramShadow[]
}

/** The house's shadows at 9 am, 12 pm and 3 pm on the day. */
export function shadowDiagram(s: SiteInput): ShadowDiagram {
  const location = locationOf(s.plan)
  const solids = houseSolids(s.plan, s.origin)
  const shadows = DIAGRAM_TIMES.map(minutes => {
    const sun = sunAt(location.lat, location.lon, s.date, minutes)
    const ray = sunRay(sun, location)
    return { minutes, sun, shadow: ray && !isEmpty(solids) ? shadowOf(solids, ray, s.ground, s.boundary) : null }
  })
  return { location, date: s.date, shadows }
}

/** One moment in the day's run: how much of the shadow is over the boundary, and beyond which sides. */
export interface OverSample {
  minutes: number
  area: number
  sides: string[]
}

export interface SunFacts {
  location: SiteLocation
  date: SunDate
  /** Nothing to cast a shadow yet (no walls or roofs). */
  empty: boolean
  /** Every half hour from 9 am to 3 pm. */
  over: OverSample[]
  /** The living areas, in plan order. */
  rooms: RoomSun[]
}

/** Shadow over the boundary smaller than this is the grid's edge, not a shadow (m²). */
export const OVER_MIN = 0.2
const OVER_CELL = 0.2
const OVER_STEP = 30
const ROOM_STEP = 15

/** The day's sun facts for the checks, the Overview and the rooms. */
export function sunFacts(s: SiteInput): SunFacts {
  const location = locationOf(s.plan)
  const solids = houseSolids(s.plan, s.origin)
  const empty = isEmpty(solids)
  const sun = (m: number) => sunAt(location.lat, location.lon, s.date, m)

  const over: OverSample[] = []
  if (!empty) {
    const times: number[] = []
    for (let m = STUDY_FROM; m <= STUDY_TO; m += OVER_STEP) times.push(m)
    const lowest = Math.min(...times.map(m => Math.max(sun(m).elevation, 1)))
    const frame = dayFrame(solids, s.boundary, s.ground, Math.tan((lowest * Math.PI) / 180), OVER_CELL)
    const block = polygonMask(frame, s.boundary)
    for (const m of times) {
      const ray = sunRay(sun(m), location)
      if (!ray) {
        over.push({ minutes: m, area: 0, sides: [] })
        continue
      }
      const off = shadowRaster(castFaces(solids, ray, s.ground), OVER_CELL, frame).minus(block)
      const area = off.area()
      over.push({ minutes: m, area, sides: area >= OVER_MIN ? sidesCrossed(off, s.boundary) : [] })
    }
  }

  const living = s.plan.rooms.filter(isLiving)
  const rooms: RoomSun[] = []
  if (living.length) {
    const tris = solidTriangles(solids)
    let ceiling = solids.top
    const z = (s.ground as Partial<Heightfield>).z
    if (z) for (let k = 0; k < z.length; k++) ceiling = Math.max(ceiling, z[k])
    else for (const p of s.boundary) ceiling = Math.max(ceiling, s.ground.sample(p[0], p[1]) + 50)
    const rays: (ReturnType<typeof sunRay>)[] = []
    for (let m = STUDY_FROM + ROOM_STEP / 2; m < STUDY_TO; m += ROOM_STEP) rays.push(sunRay(sun(m), location))
    const tn = location.trueNorth ?? 0
    for (const r of living) {
      const wins = roomWindows(s.plan, r, s.origin)
      const lit = wins.map(w => rays.map(ray => !!ray && windowSunny(w, ray, tris, s.ground, ceiling)))
      const any = rays.map((_, i) => lit.some(l => l[i]))
      rooms.push({
        room: r.id,
        name: r.name,
        level: r.level,
        windows: wins.map((w, k) => ({ opening: w.opening, facing: facingOf(w.out, tn), hours: (lit[k].filter(Boolean).length * ROOM_STEP) / 60 })),
        hours: (any.filter(Boolean).length * ROOM_STEP) / 60,
      })
    }
  }
  return { location, date: s.date, empty, over, rooms }
}

// ---------------------------------------------------------------------------
// Kept results: the last one worked out for each, by the identity of what went in.

function lastOne<T>(fn: (s: SiteInput) => T): (s: SiteInput) => T {
  let last: { s: SiteInput; out: T } | null = null
  return s => {
    const l = last?.s
    if (l && l.plan === s.plan && l.boundary === s.boundary && l.origin === s.origin && l.ground === s.ground && l.date.year === s.date.year && l.date.month === s.date.month && l.date.day === s.date.day) return last!.out
    const out = fn(s)
    last = { s, out }
    return out
  }
}

export const keptShadowDiagram = lastOne(shadowDiagram)
export const keptSunFacts = lastOne(sunFacts)

// ---------------------------------------------------------------------------
// In words

/** "4.5 h", "6 h", "0.25 h"; "no sun" for none. */
export function hoursText(h: number): string {
  return h <= 0 ? 'no sun' : `${Number(h.toFixed(2))} h`
}

/** Runs of the day when the shadow is over the boundary: [from, to] in minutes. */
export function overRuns(over: OverSample[]): [number, number][] {
  const runs: [number, number][] = []
  for (const o of over) {
    if (o.area < OVER_MIN) continue
    const last = runs[runs.length - 1]
    if (last && o.minutes - last[1] <= OVER_STEP) last[1] = o.minutes
    else runs.push([o.minutes, o.minutes])
  }
  return runs
}

/** "9 am to 11:30 am, and 2:30 pm to 3 pm". */
export function runsText(runs: [number, number][]): string {
  return andList(runs.map(([a, b]) => (a === b ? `at ${hourText(a)}` : `${hourText(a)} to ${hourText(b)}`)))
}

/** The sides the shadow goes over, all day: "south and west". */
export function overSides(over: OverSample[]): string[] {
  const seen = new Map<string, number>()
  for (const o of over) for (const s of o.sides) seen.set(s, (seen.get(s) ?? 0) + o.area)
  return [...seen].sort((a, b) => b[1] - a[1]).map(([s]) => s)
}

/** "the south boundary", "the east and south boundaries". */
export const boundaryText = (sides: string[]) => `the ${andList(sides)} boundar${sides.length > 1 ? 'ies' : 'y'}`

/** One line on where the shadow goes from 9 to 3. */
export function overText(f: SunFacts): string {
  const runs = overRuns(f.over)
  if (!runs.length) return `The house’s shadow stays on your block from ${hourText(STUDY_FROM)} to ${hourText(STUDY_TO)}.`
  const most = Math.max(...f.over.map(o => o.area))
  const sides = overSides(f.over)
  return `Over ${boundaryText(sides)} ${runsText(runs)}, up to ${most.toFixed(1)} m² of the neighbours’ land.`
}

/** "Living 4.5 h, Dining 2 h". */
export function roomsText(rooms: RoomSun[]): string {
  return rooms.map(r => `${r.name} ${hoursText(r.hours)}`).join(', ')
}
