import { describe, expect, it } from 'vitest'
import { pointInPolygon, signedArea, type Vec2 } from '../../lib/geom'
import { buildingOutline, planarFaces } from '../geometry'
import { Heightfield } from '../../lib/terrain'
import {
  BAND_STEP,
  bandOf,
  cornerOffsets,
  floorVsGround,
  formatOffset,
  groundAtPlan,
  groundLayers,
  groundOverlay,
  groundRange,
  groundUnder,
  isNear,
  levelFloorRL,
  NEAR_HOUSE,
  nearShapes,
} from '../groundOverlay'
import { fromSite, toSite, type Placement, type Plan } from '../model'
import { addLevelAbove } from '../ops'
import { garageFloor } from './fixtures'

/** A 40 m square block on a 0.25 m grid, rising 1 in 10 to the east and 1 in 5 to the north. */
const ground = (x: number, y: number) => 80 + 0.1 * x + 0.2 * y
function site() {
  const cell = 0.25
  const n = 161
  const z = new Float32Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) z[j * n + i] = ground(i * cell, j * cell)
  const grid = new Heightfield(0, 0, cell, n, n, z)
  const boundary: Vec2[] = [
    [1, 1],
    [39, 1],
    [39, 39],
    [1, 39],
  ]
  return { grid, survey: { origin: [5000, 7000] as Vec2, boundary } }
}

/** The house's origin sits at (10, 10) on the block, where the ground is at RL 83, turned 30°. */
const placement = (ffl: number): Placement => ({ e: 5010, n: 7010, rotation: 30, ffl })

const distToLines = (p: Vec2, lines: Vec2[][]) => {
  let best = Infinity
  for (const l of lines) {
    for (let i = 0; i + 1 < l.length; i++) {
      const [a, b] = [l[i], l[i + 1]]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
      best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy))
    }
  }
  return best
}

describe('where the ground meets the floor', () => {
  it('follows the ground at the floor level, inside the block', () => {
    const { grid, survey } = site()
    const o = groundOverlay(grid, survey.boundary, 84)
    // 0.1x + 0.2y = 4: one straight line across the block from (1, 19.5) to (39, 0.5)... clipped at y = 1.
    expect(o.meets).toHaveLength(1)
    for (const p of o.meets[0]) {
      expect(ground(p[0], p[1])).toBeCloseTo(84, 4)
      expect(pointInPolygon(p[0], p[1], survey.boundary)).toBe(true)
    }
    const ends = [o.meets[0][0], o.meets[0].at(-1)!].sort((a, b) => a[0] - b[0])
    expect(ends[0][0]).toBeLessThan(1.3)
    expect(ends[0][1]).toBeCloseTo(19.5, 0)
    expect(ends[1][0]).toBeGreaterThan(37.7)
    expect(o.meetsPath.startsWith('M')).toBe(true)
  })

  it('lands on the plan where the floor is at ground level, however the house is turned', () => {
    const { grid, survey } = site()
    const pl = placement(83)
    const o = groundOverlay(grid, survey.boundary, 83)
    const onPlan = o.meets.map(l => l.map(p => fromSite(p, pl, survey.origin)))
    // The house origin is at ground level, so the line runs through it...
    expect(distToLines([0, 0], onPlan)).toBeLessThan(0.002)
    // ...and along the contour: 2 m along it (direction (2, -1) on the block) is still on the line.
    const along = fromSite([10 + 4 / Math.sqrt(5), 10 - 2 / Math.sqrt(5)], pl, survey.origin)
    expect(distToLines(along, onPlan)).toBeLessThan(0.002)
    // A point 1 m uphill of the origin is well off it.
    expect(distToLines(fromSite([10.45, 10.9], pl, survey.origin), onPlan)).toBeGreaterThan(0.9)
  })

  it('has no line when the floor is clear of the ground everywhere', () => {
    const { grid, survey } = site()
    expect(groundOverlay(grid, survey.boundary, 95).meets).toEqual([])
    expect(groundOverlay(grid, survey.boundary, 95).meetsPath).toBe('')
  })
})

describe('shading above and below the ground', () => {
  it('sorts each spot by how far the floor is above or below the ground', () => {
    expect(bandOf(0.3)).toBe(0)
    expect(bandOf(0.75)).toBe(1)
    expect(bandOf(0)).toBe(0)
    expect(bandOf(-0.4)).toBe(-1)
    expect(bandOf(-1.2)).toBe(-3)
    expect(bandOf(12)).toBe(4)
    expect(bandOf(-12)).toBe(-5)
  })

  it('tints the block blue where the floor is above the ground and orange where it is below', () => {
    const { grid } = site()
    const rl = 84
    const layers = groundLayers(grid, rl)
    // Layers are filled even-odd, and stack: a spot's shade is how many of them it is in.
    const inLayer = (p: Vec2, rings: Vec2[][]) => rings.filter(r => pointInPolygon(p[0], p[1], r)).length % 2 === 1
    const count = (p: Vec2, side: Vec2[][][]) => side.filter(rings => inLayer(p, rings)).length
    for (const p of [
      [3, 3],
      [20, 5],
      [35.3, 12.1],
      [10, 30],
      [30, 30],
      [2.2, 17.7],
      [25, 6.6],
      [12, 16],
    ] as Vec2[]) {
      const above = rl - ground(p[0], p[1])
      // Clear of the steps, a spot is shaded for its depth, on one side only.
      if (Math.abs(above / BAND_STEP - Math.round(above / BAND_STEP)) < 0.02) continue
      const up = count(p, layers.above)
      const down = count(p, layers.below)
      expect(up > 0 ? up - 1 : -down).toBe(bandOf(above))
      expect(up === 0 || down === 0).toBe(true)
    }
    // Everywhere the floor is above the ground is the triangle below 0.1x + 0.2y = 4, and the rest is below it.
    const area = (rings: Vec2[][]) => rings.reduce((t, r) => t + signedArea(r), 0)
    expect(area(layers.above[0])).toBeCloseTo((40 * 20) / 2, 3)
    expect(area(layers.below[0])).toBeCloseTo(40 * 40 - 400, 3)
    // 0.5 m further down is 2.5 m further across: the triangle below 0.1x + 0.2y = 3.5.
    expect(area(layers.above[1])).toBeCloseTo((35 * 17.5) / 2, 3)
  })

  it('outlines hollows and humps that close on themselves', () => {
    // A round hump 2 m high in the middle of flat ground at RL 80.
    const cell = 0.25
    const n = 81
    const z = new Float32Array(n * n)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) z[j * n + i] = 80 + 2 * Math.max(0, 1 - Math.hypot(i * cell - 10, j * cell - 10) / 5)
    const grid = new Heightfield(0, 0, cell, n, n, z)
    const area = (rings: Vec2[][]) => rings.reduce((t, r) => t + signedArea(r), 0)
    // A floor at RL 81 meets the hump on a circle 2.5 m out from the middle; outside it, the floor is above the ground.
    const { above, below } = groundLayers(grid, 81)
    expect(area(below[0])).toBeCloseTo(Math.PI * 2.5 * 2.5, 0)
    expect(area(above[0])).toBeCloseTo(400 - Math.PI * 2.5 * 2.5, 0)
    const o = groundOverlay(grid, [[0.5, 0.5], [19.5, 0.5], [19.5, 19.5], [0.5, 19.5]], 81)
    expect(o.meets).toHaveLength(1)
    for (const p of o.meets[0]) expect(Math.hypot(p[0] - 10, p[1] - 10)).toBeCloseTo(2.5, 1)
  })

  it('closes lines that cross the edge of the grid many times', () => {
    // Rolling ground, so the floor meets it in several pieces running off every side.
    const cell = 0.25
    const n = 81
    const at = (x: number, y: number) => 80 + Math.sin(x / 1.7) + Math.cos(y / 2.3) + 0.05 * x
    const z = new Float32Array(n * n)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) z[j * n + i] = at(i * cell, j * cell)
    const grid = new Heightfield(0, 0, cell, n, n, z)
    const { above, below } = groundLayers(grid, 80.4)
    const area = (rings: Vec2[][]) => rings.reduce((t, r) => t + signedArea(r), 0)
    expect(area(above[0]) + area(below[0])).toBeCloseTo(400, 3)
    // Every grid point clear of the line is on the right side of it.
    const inLayer = (p: Vec2, rings: Vec2[][]) => rings.filter(r => pointInPolygon(p[0], p[1], r)).length % 2 === 1
    for (let j = 1; j < n - 1; j += 7) {
      for (let i = 1; i < n - 1; i += 7) {
        const d = 80.4 - z[j * n + i]
        if (Math.abs(d) < 0.05) continue
        // Nudged off the node, which can sit on a ring's corner.
        const p: Vec2 = [i * cell + 0.003, j * cell + 0.001]
        expect(inLayer(p, above[0])).toBe(d > 0)
        expect(inLayer(p, below[0])).toBe(d < 0)
      }
    }
  })

  it('is kept as path data per shade, nearest the floor first', () => {
    const { grid, survey } = site()
    const o = groundOverlay(grid, survey.boundary, 84)
    expect(o.above).toHaveLength(5)
    expect(o.below).toHaveLength(5)
    expect(o.above[0]).not.toBe('')
    // The ground climbs to RL 92 at the far corner: 8 m above the floor, in the deepest shade of cut.
    expect(o.below[4]).not.toBe('')
    expect(o.clip.startsWith('M4 4 ')).toBe(true)
  })
})

describe('floor against the ground on the plan', () => {
  it('measures how far the floor is above the ground at each corner', () => {
    const { grid, survey } = site()
    const pl = placement(83.5)
    // Corners in the house frame, and the ground there.
    const corners: Vec2[] = [
      [0, 0],
      [8, 0],
      [8, 5],
      [-30, 0],
    ]
    const d = cornerOffsets(corners, 83.5, pl, survey, grid)
    for (let i = 0; i < 3; i++) {
      const q = toSite(corners[i], pl, survey.origin)
      expect(d[i]).toBeCloseTo(83.5 - ground(q[0], q[1]), 4)
    }
    expect(d[0]).toBeCloseTo(0.5, 4)
    // Off the block there is no ground to measure from.
    expect(d[3]).toBeNull()
    expect(groundAtPlan([-30, 0], pl, survey, grid)).toBeNull()
  })

  it('writes corner offsets and the pointer readout in plain words', () => {
    expect(formatOffset(0.75)).toBe('+0.75')
    expect(formatOffset(-0.4)).toBe('−0.40')
    expect(formatOffset(0.003)).toBe('0.00')
    expect(floorVsGround(82.4, 83.15, true)).toBe('floor 0.75 m above ground (fill or piers)')
    expect(floorVsGround(83.55, 83.15, true)).toBe('floor 0.40 m below ground (cut)')
    expect(floorVsGround(83.15, 83.15, true)).toBe('floor level with the ground')
    expect(floorVsGround(82.4, 86.15, false)).toBe('this floor is 3.75 m above ground')
    expect(floorVsGround(86.55, 86.15, false)).toBe('this floor is 0.40 m below ground (cut)')
  })

  it('gives the range of ground under a room, and the cut and fill to its floor', () => {
    const { grid, survey } = site()
    const pl: Placement = { e: 5010, n: 7010, rotation: 0, ffl: 83.5 }
    const room: Vec2[] = [
      [0, 0],
      [5, 0],
      [5, 4],
      [0, 4],
    ]
    // Ground from RL 83 at the house origin to 83 + 0.5 + 0.8 at the far corner.
    const r = groundRange(room, pl, survey.origin, grid)!
    expect(r.min).toBeCloseTo(83, 4)
    expect(r.max).toBeCloseTo(84.3, 4)
    expect(groundUnder(r, 83.5, 'slab')).toBe('Ground under this room RL 83.00 to 84.30: up to 0.80 m of cut and up to 0.50 m of fill.')
    expect(groundUnder(r, 83.5, 'piers')).toBe('Ground under this room RL 83.00 to 84.30: up to 0.80 m of cut and the floor up to 0.50 m above it.')
    expect(groundUnder(r, 86.5, 'upper')).toBe('Ground under this room RL 83.00 to 84.30: this floor is 2.20 m to 3.50 m above it.')
    expect(groundUnder(r, 84, 'upper')).toBe('Ground under this room RL 83.00 to 84.30: this floor is up to 1.00 m above it and 0.30 m below it (cut).')
  })
})

describe('working it out once', () => {
  it('reuses the overlay until the floor level or the survey changes', () => {
    const { grid, survey } = site()
    const plan: Plan = { ...garageFloor(), placement: placement(83.15) }
    const { plan: two, id } = addLevelAbove(plan)
    const rl = levelFloorRL(two, 'level_ground')
    expect(rl).toBeCloseTo(83.15, 9)
    // An upper level's floor is the ground floor's plus its height above it.
    expect(levelFloorRL(two, id)).toBeCloseTo(83.15 + 3, 9)
    const o = groundOverlay(grid, survey.boundary, rl)
    expect(groundOverlay(grid, survey.boundary, rl)).toBe(o)
    // Moving or turning the house, or drawing, leaves the floor level, so the same overlay is used.
    const moved: Plan = { ...two, placement: { ...two.placement, e: two.placement.e + 3, rotation: 12 }, walls: two.walls.slice(1) }
    expect(groundOverlay(grid, survey.boundary, levelFloorRL(moved, 'level_ground'))).toBe(o)
    // Raising the floor, or a different level, works it out again.
    expect(groundOverlay(grid, survey.boundary, rl + 0.1)).not.toBe(o)
    expect(groundOverlay(grid, survey.boundary, levelFloorRL(two, id)).rl).toBeCloseTo(86.15, 9)
    // Flipping back to a level seen a moment ago is instant.
    expect(groundOverlay(grid, survey.boundary, rl)).toBe(o)
    // A different survey (a new grid) starts again.
    const again = site()
    expect(groundOverlay(again.grid, again.survey.boundary, rl)).not.toBe(o)
  })
})

describe('the tint keeps near the house', () => {
  const outline = (plan: Plan) => (id: string) => buildingOutline(planarFaces(plan.walls.filter(w => w.level === id))).outlines

  it('reaches NEAR_HOUSE metres past the walls and covers inside them', () => {
    const plan = garageFloor()
    const level = plan.levels[0].id
    const s = nearShapes(plan, level, outline(plan), [])!
    const xs = plan.walls.flatMap(w => [w.a[0], w.b[0]])
    const ys = plan.walls.flatMap(w => [w.a[1], w.b[1]])
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const mid: Vec2 = [(minX + maxX) / 2, (minY + maxY) / 2]
    expect(isNear(mid, s, NEAR_HOUSE)).toBe(true)
    expect(isNear([maxX + NEAR_HOUSE - 0.5, mid[1]], s, NEAR_HOUSE)).toBe(true)
    expect(isNear([maxX + NEAR_HOUSE + 0.5, mid[1]], s, NEAR_HOUSE)).toBe(false)
    expect(isNear([mid[0], minY - NEAR_HOUSE - 0.5], s, NEAR_HOUSE)).toBe(false)
  })

  it('tints the whole block until something is drawn, then follows what is being drawn', () => {
    const plan = { ...garageFloor(), walls: [], areas: [] }
    const level = plan.levels[0].id
    expect(nearShapes(plan, level, outline(plan), [])).toBeNull()
    const s = nearShapes(plan, level, outline(plan), [[[0, 0], [5, 0]]])!
    expect(isNear([2.5, 3], s, NEAR_HOUSE)).toBe(true)
    expect(isNear([2.5, 6], s, NEAR_HOUSE)).toBe(false)
  })

  it('an empty upper level starts round the house below', () => {
    const base = garageFloor()
    const { plan: two, id } = addLevelAbove(base)
    const empty = { ...two, walls: two.walls.filter(w => w.level !== id) }
    const s = nearShapes(empty, id, outline(empty), [])!
    const ground = nearShapes(empty, base.levels[0].id, outline(empty), [])!
    expect(s.filled.length).toBe(ground.filled.length)
    expect(s.lines.length).toBe(ground.lines.length)
  })
})
