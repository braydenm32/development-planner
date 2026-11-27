// How the levels stand over each other: which ones are stacked (one over the other, not beside it
// as split levels are), and what's wrong with their heights when they are: a ceiling above the
// next floor, too little room for the floor's structure, a very low ceiling. Design › Floors shows
// these beside the level's fields, and Check everything lists them.

import { pointInPolygon, type Vec2 } from '../lib/geom'
import { FLOOR_STRUCTURE, floorRL, houseWalls, levelById, sortedLevels, type Level, type Plan } from './model'
import { levelOutlines } from './roof'
import { ceilingRL } from './roofline'

/** The least a ceiling can be for a living room or bedroom (NCC Housing Provisions 10.3.1), m. */
export const MIN_CEILING = 2.4
/** And for a kitchen, bathroom, laundry or hall. */
export const MIN_CEILING_SERVICE = 2.1

/** How far inside both outlines a spot must be for two levels to count as stacked (m), and how far apart spots are tried. */
const STACK_INSET = 0.5
const STACK_STEP = 0.5

const ringsCache = new WeakMap<Plan, Map<string, Vec2[][]>>()

/** The outlines of a level's walls (their outside face), worked out once per plan. */
export function levelRings(plan: Plan, levelId: string): Vec2[][] {
  let m = ringsCache.get(plan)
  if (!m) ringsCache.set(plan, (m = new Map()))
  let o = m.get(levelId)
  if (!o) m.set(levelId, (o = levelOutlines(houseWalls(plan.walls.filter(w => w.level === levelId)))))
  return o
}

function distToRing(p: Vec2, ring: Vec2[]): number {
  let d = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const l2 = dx * dx + dy * dy
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
    d = Math.min(d, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy))
  }
  return d
}

const wellInside = (p: Vec2, rings: Vec2[][]) => rings.some(r => pointInPolygon(p[0], p[1], r) && distToRing(p, r) >= STACK_INSET)

/**
 * Is one of these levels built over the other? True when some spot is well inside both outlines.
 * Split levels side by side share only the line where they meet (their walls overlap there by a
 * wall's thickness), so they aren't. False while either has no walls round a space: it can't be told yet.
 */
export function levelsStacked(plan: Plan, a: string, b: string): boolean {
  const ra = levelRings(plan, a)
  const rb = levelRings(plan, b)
  if (!ra.length || !rb.length) return false
  const xs = ra.flat().map(p => p[0])
  const ys = ra.flat().map(p => p[1])
  for (let x = Math.min(...xs) + STACK_STEP / 2; x < Math.max(...xs); x += STACK_STEP)
    for (let y = Math.min(...ys) + STACK_STEP / 2; y < Math.max(...ys); y += STACK_STEP) if (wellInside([x, y], ra) && wellInside([x, y], rb)) return true
  return false
}

export interface StoreyWarning {
  id: string
  /** `bad` can't be built as set (red); `warn` is worth a look (amber). */
  tone: 'bad' | 'warn'
  text: string
}

const mm = (m: number) => `${Math.round(m * 1000)} mm`
const rl = (z: number) => `RL ${z.toFixed(2)}`

/**
 * What's wrong with a level's heights against the levels built over and under it: its ceiling
 * above the next floor, its floor inside the storey below, too little room between them for the
 * floor's structure, and a ceiling too low for a living room. Empty when all is well.
 */
export function storeyWarnings(plan: Plan, levelId: string): StoreyWarning[] {
  const l = levelById(plan, levelId)
  if (!l) return []
  const out: StoreyWarning[] = []
  const floor = floorRL(plan, l.id)
  const ceiling = ceilingRL(plan, l.id)
  for (const o of sortedLevels(plan)) {
    if (o.id === l.id || !levelsStacked(plan, l.id, o.id)) continue
    const oFloor = floorRL(plan, o.id)
    if (oFloor > floor + 0.05) {
      // `o` is the storey above.
      const gap = oFloor - ceiling
      const fits = Math.max(0, oFloor - FLOOR_STRUCTURE - floor)
      if (gap < -0.0005)
        out.push({ id: `ceiling-over:${o.id}`, tone: 'bad', text: `Its ceiling (${rl(ceiling)}) is ${mm(-gap)} above ${o.name}’s floor (${rl(oFloor)}), which is built over it. Bring the ceiling down to ${mm(fits)} or less, or raise ${o.name}.` })
      else if (gap < FLOOR_STRUCTURE - 0.0005)
        out.push({ id: `thin-over:${o.id}`, tone: 'warn', text: `Only ${mm(gap)} between its ceiling and ${o.name}’s floor above: the floor’s structure needs about ${mm(FLOOR_STRUCTURE)}. A ceiling of ${mm(fits)} leaves room.` })
    } else if (oFloor < floor - 0.05) {
      // `o` is the storey below.
      const oCeiling = ceilingRL(plan, o.id)
      const gap = floor - oCeiling
      if (gap < -0.0005)
        out.push({ id: `floor-in:${o.id}`, tone: 'bad', text: `Its floor (${rl(floor)}) is ${mm(-gap)} below ${o.name}’s ceiling (${rl(oCeiling)}): it’s set inside the storey under it. Raise it to ${rl(oCeiling + FLOOR_STRUCTURE)} or more, or lower ${o.name}’s ceiling.` })
      else if (gap < FLOOR_STRUCTURE - 0.0005)
        out.push({ id: `thin-under:${o.id}`, tone: 'warn', text: `Only ${mm(gap)} between ${o.name}’s ceiling below and this floor: its structure needs about ${mm(FLOOR_STRUCTURE)}. ${rl(oCeiling + FLOOR_STRUCTURE)} or more leaves room.` })
    }
  }
  if (l.height < MIN_CEILING - 0.0005)
    out.push({
      id: 'low-ceiling',
      tone: l.height < MIN_CEILING_SERVICE - 0.0005 ? 'bad' : 'warn',
      text:
        l.height < MIN_CEILING_SERVICE - 0.0005
          ? `A ${mm(l.height)} ceiling is too low to live under: the building code (NCC) asks for ${mm(MIN_CEILING)} in living rooms and bedrooms, and ${mm(MIN_CEILING_SERVICE)} in kitchens, bathrooms, laundries and halls.`
          : `A ${mm(l.height)} ceiling is too low for living rooms and bedrooms: the building code (NCC) asks for ${mm(MIN_CEILING)} there (${mm(MIN_CEILING_SERVICE)} does for kitchens, bathrooms, laundries and halls).`,
    })
  return out
}

/**
 * Deleting `levelId` when it's the lowest level and the next one up is built over it (or has no
 * walls yet to say otherwise): that level is left as the lowest, `drop` metres above where the
 * deleted floor was. Null when the delete leaves nothing in the air (a higher level deleted, or
 * the next level is a split level beside it, sitting on its own ground).
 */
export function levelLeftAbove(plan: Plan, levelId: string): { level: Level; drop: number } | null {
  const levels = sortedLevels(plan)
  if (levels.length < 2 || levels[0].id !== levelId) return null
  const next = levels[1]
  const drop = Math.round((next.elevation - levels[0].elevation) * 1000) / 1000
  if (drop < 0.3) return null
  const beside = levelRings(plan, levelId).length > 0 && levelRings(plan, next.id).length > 0 && !levelsStacked(plan, levelId, next.id)
  return beside ? null : { level: next, drop }
}
