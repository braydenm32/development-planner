// The plan's side of the retaining wall suggestions: what suggestWalls looks along and what blocks
// a batter, read from the plan, and Add and Dismiss.

import { tpzRadius } from '../checks/trees'
import { checkSettingsOf } from '../checks/councils'
import type { CheckTree } from '../checks/types'
import type { PreparedPlatform } from '../lib/earthworks'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import { fromSite, newId, sortedLevels, type Plan, type Wall } from '../plan/model'
import { BENCH_PREFIX, PAD_ID, PIERS_ID } from '../plan/platforms'
import type { Earth } from '../plan/useEarthworks'
import { GRADE_CELL } from './model'
import { lineDir, segmentsOf, suggestWalls, type WallSuggestion } from './suggest'

/** Thickness of a suggested wall: concrete block, as the retaining wall offer uses (m). */
export const SUGGESTED_THICKNESS = 0.2

const isHouse = (id: string | undefined) => id === PAD_ID || id === PIERS_ID || !!id?.startsWith('slab:')

/** The house pad, its piers and its slabs are one family; the ground beside retaining walls is already held. */
function family(p: PreparedPlatform): string | null {
  if (isHouse(p.id)) return 'house'
  if (p.id?.startsWith(BENCH_PREFIX)) return null
  return p.id ?? 'other'
}

function label(p: PreparedPlatform): string {
  if (p.id === PAD_ID || p.id === PIERS_ID) return 'the house'
  if (p.id?.startsWith('slab:')) return 'a slab'
  if (p.id?.startsWith('grade:')) return 'other painted ground'
  if (p.isRamp) return 'the driveway'
  return 'other levelled ground'
}

/** The side and rear boundary edges: every edge but the street side, once it's known (and not on a battle-axe lot). */
export function sideAndRear(plan: Plan, boundary: Vec2[]): number[] {
  const s = checkSettingsOf(plan.checks)
  const front = !s.battleAxe && s.frontEdge !== undefined && s.frontEdge < boundary.length ? s.frontEdge : undefined
  return boundary.map((_, i) => i).filter(i => i !== front)
}

const cache = new WeakMap<Earth, { key: string; value: WallSuggestion[] }>()

/** Where the plan's earthworks would be better with a retaining wall, worked out once for each earthworks result. */
export function planWallSuggestions(plan: Plan, survey: Pick<Survey, 'origin' | 'boundary'>, earth: Earth | null, trees: CheckTree[] = []): WallSuggestion[] {
  if (!earth || !earth.platforms.length) return []
  const o = survey.origin
  const counted = sideAndRear(plan, survey.boundary)
  const zones = trees.filter(t => !t.remove).map(t => ({ at: t.at, r: tpzRadius(t.trunk) }))
  const dismissed = (plan.grading?.dismissed ?? []).map(d => ({ at: [d.at[0] - o[0], d.at[1] - o[1]] as Vec2, dir: d.dir }))
  const key = JSON.stringify([counted, zones, dismissed])
  const hit = cache.get(earth)
  if (hit && hit.key === key) return hit.value
  const house = earth.platforms.filter(p => p.id === PAD_ID || p.id === PIERS_ID).flatMap(p => p.include)
  const value = suggestWalls({ ...inputs(survey, earth), counted, trees: zones, dismissed, house })
  cache.set(earth, { key, value })
  return value
}

/** What suggestWalls looks along and what stops a batter, from the earthworks. */
const inputs = (survey: Pick<Survey, 'boundary'>, earth: Earth) => ({
  prep: earth.prep,
  boundary: survey.boundary,
  barriers: earth.strips.map(s => [s.a, s.b] as [Vec2, Vec2]),
  sources: earth.prep.platforms.flatMap(p => (p.id && (p.id === PAD_ID || p.id.startsWith('slab:') || p.id.startsWith('grade:')) ? [p.id] : [])),
  family,
  label,
  thickness: SUGGESTED_THICKNESS,
})

const impliedCache = new WeakMap<Earth, WallSuggestion[]>()

/**
 * Only the implied walls (src/grading/implied.ts): the vertical edges, which don't depend on the
 * trees, the boundary's sides or what was dismissed, so the strip and Costs can have them without
 * those. Worked out once for each earthworks result.
 */
export function planImpliedWalls(survey: Pick<Survey, 'boundary'>, earth: Earth | null): WallSuggestion[] {
  if (!earth || !earth.platforms.length) return []
  const hit = impliedCache.get(earth)
  if (hit) return hit
  const house = earth.platforms.filter(p => p.id === PAD_ID || p.id === PIERS_ID).flatMap(p => p.include)
  const value = suggestWalls({ ...inputs(survey, earth), counted: [], trees: [], impliedOnly: true, house })
  impliedCache.set(earth, value)
  return value
}

/**
 * The suggestion as real retaining walls on the lowest floor, in the house frame: one for each
 * straight run, end to end. The levelled area is on their left (as the suggestion runs), so for
 * cut the earth is held on the right and for fill on the left. Neither side is given a level: the
 * levelled area is already levelled on its side, and the other side stays natural ground now the
 * walls stop the batter.
 */
export function suggestedWalls(plan: Plan, s: Pick<WallSuggestion, 'path' | 'kind'>, origin: Vec2): Wall[] {
  const r3 = (p: Vec2): Vec2 => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]
  const level = sortedLevels(plan)[0]?.id ?? plan.levels[0]?.id ?? 'level_ground'
  const pts = s.path.map(p => r3(fromSite(p, plan.placement, origin)))
  return segmentsOf(pts).map(([a, b]) => ({
    id: newId('wall'),
    level,
    a,
    b,
    thickness: SUGGESTED_THICKNESS,
    kind: 'retaining',
    retain: { high: s.kind === 'cut' ? 'right' : 'left' },
  }))
}

/** The plan with the suggested walls added: one undo step. */
export function addSuggestedWall(plan: Plan, s: Pick<WallSuggestion, 'path' | 'kind'>, origin: Vec2): { plan: Plan; walls: Wall[] } {
  const walls = suggestedWalls(plan, s, origin)
  return { plan: { ...plan, walls: [...plan.walls, ...walls] }, walls }
}

/** The plan with a suggestion turned down: remembered with the grading, by where it ran (survey coordinates). */
export function dismissSuggestion(plan: Plan, s: Pick<WallSuggestion, 'a' | 'b'>, origin: Vec2): Plan {
  const g = plan.grading ?? { cell: GRADE_CELL, areas: [] }
  const at: Vec2 = [Math.round(((s.a[0] + s.b[0]) / 2 + origin[0]) * 1000) / 1000, Math.round(((s.a[1] + s.b[1]) / 2 + origin[1]) * 1000) / 1000]
  return { ...plan, grading: { ...g, dismissed: [...(g.dismissed ?? []), { at, dir: Math.round(lineDir(s.a, s.b) * 10) / 10 }] } }
}

/** The plan with every turned-down suggestion back. */
export function undismissAll(plan: Plan): Plan {
  const g = plan.grading
  if (!g?.dismissed?.length) return plan
  const rest = { ...g }
  delete rest.dismissed
  if (!rest.areas.length) {
    const p = { ...plan }
    delete p.grading
    return p
  }
  return { ...plan, grading: rest }
}
