// Every starter house is a sound plan: it builds, its rooms close and are found, its doors and
// windows fit their walls, no walls lie on top of each other, and its card says what it has.

import { describe, expect, it } from 'vitest'
import { pointInPolygon, type Vec2 } from '../../lib/geom'
import { furnitureCorners } from '../../plan/furniture'
import { closestOnSegment, faceAround, planarFaces, roomShape, type Face } from '../../plan/geometry'
import { roomsForNewSpaces } from '../../plan/autoRooms'
import { emptyPlan, normalizePlan, pointOnWall, wallDir, wallLength, type Plan, type Wall } from '../../plan/model'
import { fitOpenings, openingWallHeight } from '../../plan/openingFit'
import { roomWet } from '../../plan/roomTypes'
import { stairLayout, stairMeetsNoFloor, stairRules, stairTopLevel } from '../../plan/stairs'
import { buildStarter, door, rect, type StarterSpec } from '../build'
import { factsLine, sizeLine, starterFacts } from '../facts'
import { STARTER_SPECS, starters } from '../houses'

/** What each card should say: bedrooms, bathrooms, cars, storeys, and the floor area to the nearest m². */
const CLAIMS: Record<string, { beds: number; baths: number; cars: number; storeys: number; split?: boolean; area: number }> = {
  'studio-1': { beds: 1, baths: 1, cars: 0, storeys: 1, area: 60 },
  'compact-2': { beds: 2, baths: 1, cars: 0, storeys: 1, area: 101 },
  'narrow-3': { beds: 3, baths: 2, cars: 1, storeys: 1, area: 156 },
  'family-3': { beds: 3, baths: 2, cars: 1, storeys: 1, area: 169 },
  'split-3': { beds: 3, baths: 1, cars: 2, storeys: 1, split: true, area: 187 },
  'family-4': { beds: 4, baths: 2, cars: 2, storeys: 1, area: 202 },
  'two-storey-4': { beds: 4, baths: 2, cars: 2, storeys: 2, area: 314 },
}

/** Rooms that need light and air: a window each. */
const HABITABLE = new Set(['bedroom', 'living', 'kitchen', 'open', 'dining', 'study'])

const faceOn = (plan: Plan, level: string) => planarFaces(plan.walls.filter(w => w.level === level))

/** The point is on the face's outline (its wall centrelines). */
const onOutline = (p: Vec2, f: Face) => f.pts.some((a, i) => closestOnSegment(p, a, f.pts[(i + 1) % f.pts.length]).dist < 1e-3)

/** Walls on the same line that share more than a point. */
function overlapping(walls: Wall[]): string[] {
  const out: string[] = []
  walls.forEach((w, i) =>
    walls.slice(i + 1).forEach(o => {
      if (o.level !== w.level) return
      const d = wallDir(w)
      const cross = (p: Vec2) => (p[0] - w.a[0]) * d[1] - (p[1] - w.a[1]) * d[0]
      if (Math.abs(cross(o.a)) > 1e-6 || Math.abs(cross(o.b)) > 1e-6) return
      const along = (p: Vec2) => (p[0] - w.a[0]) * d[0] + (p[1] - w.a[1]) * d[1]
      const [s0, s1] = [along(o.a), along(o.b)].sort((a, b) => a - b)
      if (Math.min(s1, wallLength(w)) - Math.max(s0, 0) > 1e-6) out.push(`${w.id} and ${o.id}`)
    }),
  )
  return out
}

describe.each(STARTER_SPECS.map(s => [s.id, s] as const))('starter %s', (id, spec) => {
  const plan = buildStarter(spec)

  it('builds into a plan that loads as it is', () => {
    expect(plan.walls.length).toBeGreaterThan(4)
    expect(normalizePlan(plan)).toEqual(plan)
    // The store adds a room to any closed space without one: there are none for it to add.
    expect(roomsForNewSpaces(emptyPlan(plan.placement), plan).rooms).toEqual(plan.rooms)
  })

  it('has every room closed, found by the room finder, and in a space of its own', () => {
    for (const l of plan.levels) {
      const faces = faceOn(plan, l.id)
      const rooms = plan.rooms.filter(r => r.level === l.id)
      const seen = new Set<Face>()
      for (const r of rooms) {
        const f = faceAround(r.at, faces)
        expect(f, `${r.name} is closed`).not.toBeNull()
        expect(seen.has(f!), `${r.name} has its own space`).toBe(false)
        seen.add(f!)
        expect(roomShape(r, faces)!.area, r.name).toBeGreaterThan(1)
      }
      // And every closed space has its room.
      expect(seen.size).toBe(faces.filter(f => f.area > 0).length)
    }
  })

  it('gives every room a way in, habitable rooms a window and the garage its door', () => {
    for (const r of plan.rooms) {
      const f = faceAround(r.at, faceOn(plan, r.level))!
      const here = plan.openings.filter(o => {
        const w = plan.walls.find(x => x.id === o.wall)!
        return w.level === r.level && onOutline(pointOnWall(w, o.offset), f)
      })
      expect(
        here.some(o => o.kind !== 'window'),
        `${r.name} has a door`,
      ).toBe(true)
      if (HABITABLE.has(r.type!)) expect(here.some(o => o.kind === 'window' || o.style === 'sliding'), `${r.name} has a window`).toBe(true)
      if (r.type === 'garage') expect(here.some(o => o.kind === 'garage'), `${r.name} has a garage door`).toBe(true)
    }
  })

  it('fits every door and window in its wall, clear of corners, the walls that meet it and each other', () => {
    const fitted = fitOpenings(plan)
    expect(fitted.fixes).toEqual([])
    expect(fitted.plan).toBe(plan)
    for (const w of plan.walls) {
      const mine = plan.openings.filter(o => o.wall === w.id).sort((a, b) => a.offset - b.offset)
      for (const o of mine) expect(o.height + o.sill, o.id).toBeLessThanOrEqual(openingWallHeight(plan, w) + 1e-9)
      // Not across a wall that meets this one part way along.
      for (const o of plan.walls) {
        if (o === w || o.level !== w.level) continue
        for (const e of [o.a, o.b]) {
          const c = closestOnSegment(e, w.a, w.b)
          if (c.dist > 1e-6 || c.t < 1e-6 || c.t > 1 - 1e-6) continue
          const at = c.t * wallLength(w)
          for (const x of mine) expect(Math.abs(at - x.offset), `${x.id} clear of ${o.id}`).toBeGreaterThanOrEqual(x.width / 2 + o.thickness / 2 - 1e-9)
        }
      }
      for (let i = 1; i < mine.length; i++) expect(mine[i].offset - mine[i].width / 2, `${mine[i].id} clear of ${mine[i - 1].id}`).toBeGreaterThanOrEqual(mine[i - 1].offset + mine[i - 1].width / 2 + 0.1)
    }
  })

  it('has no walls lying on top of one another', () => {
    expect(overlapping(plan.walls)).toEqual([])
  })

  it('has stairs that join its levels within the rules, and furniture inside its rooms', () => {
    for (const s of plan.stairs) {
      expect(stairTopLevel(plan, s)?.id).toBe(s.toLevel)
      expect(stairMeetsNoFloor(plan, s)).toBe(false)
      expect(stairRules(s).every(r => r.ok)).toBe(true)
      const f = faceAround(s.at, faceOn(plan, s.level))
      expect(f).not.toBeNull()
      // Inside the room it starts in, up to the wall it climbs through (1 mm in from the outline).
      const inner = roomShape({ ...plan.rooms[0], level: s.level, at: s.at }, faceOn(plan, s.level))!.inner
      const out = stairLayout(s).outline
      const mid: Vec2 = [out.reduce((t, p) => t + p[0], 0) / out.length, out.reduce((t, p) => t + p[1], 0) / out.length]
      for (const p of out) {
        const d = Math.hypot(mid[0] - p[0], mid[1] - p[1])
        expect(pointInPolygon(p[0] + ((mid[0] - p[0]) / d) * 0.001, p[1] + ((mid[1] - p[1]) / d) * 0.001, inner), s.id).toBe(true)
      }
    }
    for (const piece of plan.furniture) {
      const shape = roomShape({ ...plan.rooms[0], level: piece.level, at: piece.at }, faceOn(plan, piece.level))!
      for (const p of furnitureCorners(piece)) expect(pointInPolygon(p[0], p[1], shape.inner), piece.id).toBe(true)
    }
    // Two storeys or a split level have a stair between them.
    expect(plan.stairs.length).toBe(plan.levels.length - 1)
  })

  it('says on its card what it has', () => {
    const f = starterFacts(plan)
    const c = CLAIMS[id]
    expect(c, `claims for ${id}`).toBeDefined()
    expect({ beds: f.bedrooms, baths: f.bathrooms, cars: f.cars, storeys: f.storeys, split: f.split || undefined, area: Math.round(f.area) }).toEqual({ ...c, split: c.split })
    expect(f.bedrooms).toBe(plan.rooms.filter(r => /bedroom/i.test(r.name)).length)
    expect(f.bathrooms).toBe(plan.rooms.filter(r => roomWet(r) === 'bathroom').length)
    expect(factsLine(f)).toContain(`${c.beds} bed`)
    expect(sizeLine(f)).toMatch(/^\d+\.\d × \d+\.\d m · \d+ m²$/)
    // A roof over every part of the house.
    for (const l of plan.levels) {
      const above = plan.levels.some(o => o.elevation >= l.elevation + l.height)
      expect(plan.roofs.some(r => r.level === l.id), `${l.name} roofed`).toBe(!above)
    }
  })
})

describe('the starters', () => {
  it('cover the common cases, each with its own id and name', () => {
    const list = starters()
    expect(list.length).toBeGreaterThanOrEqual(6)
    expect(new Set(list.map(s => s.id)).size).toBe(list.length)
    expect(new Set(list.map(s => s.name)).size).toBe(list.length)
    const facts = list.map(s => starterFacts(s.plan))
    expect(facts.some(f => f.storeys === 2)).toBe(true)
    expect(facts.some(f => f.split)).toBe(true)
    expect(facts.some(f => f.width < 8)).toBe(true)
    expect(facts.some(f => f.area <= 60)).toBe(true)
  })

  it('refuse a door that isn’t on a wall', () => {
    const bad: StarterSpec = { id: 'bad', name: 'Bad', blurb: '', levels: [{ name: 'G', floor: 'slab', outline: rect(4, 4), inside: [], rooms: [], openings: [door(2, 2)] }] }
    expect(() => buildStarter(bad)).toThrow(/no wall/)
  })
})
