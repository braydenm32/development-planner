import { describe, expect, it } from 'vitest'
import { Heightfield } from '../terrain'
import { buildSiteSolid, isWatertight, type WallStrip } from '../terrainMesh'

// A 3 m step along a 200 mm wall at an angle to the grid, as a retaining wall with the ground cut to a
// level on one side leaves it.
describe('the site solid beside a retaining wall', () => {
  const cell = 0.25
  const n = 41
  const wall: WallStrip = { a: [1.3, 2.1], b: [8.9, 5.4], half: 0.1 }
  const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1])
  const ux = (wall.b[0] - wall.a[0]) / len
  const uy = (wall.b[1] - wall.a[1]) / len
  const across = (x: number, y: number) => -(x - wall.a[0]) * uy + (y - wall.a[1]) * ux
  const along = (x: number, y: number) => (x - wall.a[0]) * ux + (y - wall.a[1]) * uy
  const HIGH = 10
  const LOW = 7
  const z = new Float32Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) z[j * n + i] = across(i * cell, j * cell) >= 0 ? HIGH : LOW
  const grid = new Heightfield(0, 0, cell, n, n, z)
  const boundary: [number, number][] = [
    [0.4, 0.4],
    [9.6, 0.4],
    [9.6, 9.6],
    [0.4, 9.6],
  ]

  /** Surface triangles clear of the wall's ends that reach past a face from inside the wall or across it. */
  const teeth = (strips: WallStrip[]) => {
    const solid = buildSiteSolid(grid, boundary, 0, strips)
    const p = solid.positions
    let count = 0
    for (let t = 0; t < solid.surfaceIndexCount; t += 3) {
      const v = [0, 1, 2].map(k => solid.indices[t + k])
      const s = v.map(k => across(p[3 * k], p[3 * k + 1]))
      const a = v.map(k => along(p[3 * k], p[3 * k + 1]))
      if (Math.min(...a) < 0.5 || Math.max(...a) > len - 0.5) continue
      for (const f of [wall.half, -wall.half]) if (Math.min(...s) < f - 1e-6 && Math.max(...s) > f + 1e-6) count++
    }
    return { solid, count }
  }

  it('without the wall, the grid squares carry the step out past its faces', () => {
    expect(teeth([]).count).toBeGreaterThan(0)
  })

  it('with the wall, the step stays inside its footprint, and the ground either side is that side’s level', () => {
    const { solid, count } = teeth([wall])
    expect(count).toBe(0)
    expect(isWatertight(solid.indices)).toBe(true)
    const p = solid.positions
    for (let t = 0; t < solid.surfaceIndexCount; t++) {
      const k = solid.indices[t]
      const [x, y, h] = [p[3 * k], p[3 * k + 1], p[3 * k + 2]]
      const a = along(x, y)
      if (a < 0.5 || a > len - 0.5) continue
      const s = across(x, y)
      if (s >= wall.half - 1e-9) expect(h).toBeCloseTo(HIGH, 5)
      if (s <= -wall.half + 1e-9) expect(h).toBeCloseTo(LOW, 5)
    }
  })

  it('a wall running off the site, or two walls meeting, still leave a closed solid', () => {
    const off: WallStrip = { a: [5, 5], b: [12, 9], half: 0.1 }
    const other: WallStrip = { a: [8.9, 5.4], b: [7.2, 8.8], half: 0.15 }
    expect(isWatertight(buildSiteSolid(grid, boundary, 0, [wall, other, off]).indices)).toBe(true)
  })
})
