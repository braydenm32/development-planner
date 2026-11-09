// Retaining walls named by where they are, so a list reads as the site does: "West wall by
// Living", "North boundary wall", "East yard wall". The side is the compass way from the middle
// of the house; the feature is the room it's beside, or the boundary it runs along.

import { pointInPolygon, type Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import { bearingName } from '../lib/terrain'
import { buildingOutline, planarFaces } from './geometry'
import { houseWalls, isRetaining, sortedLevels, toSite, type Plan, type Wall } from './model'
import { ringsCentre } from './placement'

/** A wall this close to the boundary (m) is a boundary wall. */
const BOUNDARY_NEAR = 1.5
/** A room whose outline is this close to a wall (m) is what the wall is by. */
const ROOM_NEAR = 4

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

const ringDist = (p: Vec2, ring: Vec2[]) => (pointInPolygon(p[0], p[1], ring) ? 0 : Math.min(...ring.map((a, i) => distToSegment(p, a, ring[(i + 1) % ring.length]))))

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/** Each retaining wall's name, by id. Two that would read the same are numbered. */
export function retainingNames(plan: Plan, survey: Pick<Survey, 'origin' | 'boundary'>): Map<string, string> {
  const walls = plan.walls.filter(isRetaining)
  const levels = sortedLevels(plan)
  const rings = levels.flatMap(l => buildingOutline(planarFaces(houseWalls(plan.walls.filter(w => w.level === l.id)))).outlines)
  const centre = ringsCentre(rings)
  const rooms = plan.rooms.map(r => {
    const face = planarFaces(plan.walls.filter(w => w.level === r.level)).find(f => f.area > 0 && pointInPolygon(r.at[0], r.at[1], f.pts))
    return { name: r.name, level: r.level, ring: face?.pts ?? null, at: r.at }
  })
  const names = new Map<string, string>()
  for (const w of walls) names.set(w.id, nameOf(w))
  // Number any that read the same, in the order they were drawn.
  const counts = new Map<string, number>()
  for (const n of names.values()) counts.set(n, (counts.get(n) ?? 0) + 1)
  const seen = new Map<string, number>()
  for (const [id, n] of names)
    if ((counts.get(n) ?? 0) > 1) {
      const k = (seen.get(n) ?? 0) + 1
      seen.set(n, k)
      names.set(id, `${n} (${k})`)
    }
  return names

  function nameOf(w: Wall): string {
    const mid: Vec2 = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]
    const site = toSite(mid, plan.placement, survey.origin)
    const c = centre ? toSite(centre, plan.placement, survey.origin) : null
    const side = c && Math.hypot(site[0] - c[0], site[1] - c[1]) > 0.5 ? cap(bearingName(((Math.atan2(site[0] - c[0], site[1] - c[1]) * 180) / Math.PI + 360) % 360)) : null
    const b = survey.boundary
    const toBoundary = b.length > 1 ? Math.min(...b.map((p, i) => distToSegment(site, p, b[(i + 1) % b.length]))) : Infinity
    const lead = side ?? 'Retaining'
    if (toBoundary < BOUNDARY_NEAR) return `${lead} boundary wall`
    // The nearest room on the wall's level (or the lowest), by its outline.
    let best: { name: string; d: number } | null = null
    for (const r of rooms) {
      if (r.level !== w.level && r.level !== levels[0]?.id) continue
      const d = r.ring ? Math.min(ringDist(w.a, r.ring), ringDist(w.b, r.ring), ringDist(mid, r.ring)) : Math.hypot(r.at[0] - mid[0], r.at[1] - mid[1])
      if (d < ROOM_NEAR && (!best || d < best.d)) best = { name: r.name, d }
    }
    if (best) return `${lead} wall by ${best.name}`
    return `${lead} yard wall`
  }
}
