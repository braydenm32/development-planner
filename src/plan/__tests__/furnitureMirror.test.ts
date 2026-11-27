// Mirroring a handed piece of furniture (a corner sofa, a bath's tap end), and the pantry, tank
// and pool in the catalogue. Uses the made-up garage plan only.

import { describe, expect, it } from 'vitest'
import { catalogItem, furnitureSolids, furnitureSymbol, isHanded, mirrored, mirrorFurniture, newFurniture } from '../furniture'
import { normalizePlan, type Furniture } from '../model'
import { addFurniture } from '../ops'
import { flipPlan } from '../transform'
import { garageFloor } from './fixtures'

const L = 'level_ground'
const piece = (kind: string, at: [number, number] = [4, 4], rotation = 30): Furniture => newFurniture(kind, L, at, rotation)!
const round = (pts: [number, number][]) => pts.map(p => p.map(x => (Math.round(x * 1e3) / 1e3 + 0).toFixed(3)).join(",")).sort()
const symbolPts = (f: Furniture) => round(furnitureSymbol(f).parts.flatMap(p => p.pts) as [number, number][])

describe('mirroring furniture', () => {
  it('offers it only for handed pieces', () => {
    for (const k of ['sofa-corner', 'bench-l', 'desk-l', 'bath', 'pool']) expect(isHanded({ kind: k }), k).toBe(true)
    for (const k of ['bed-queen', 'sofa-3', 'fridge', 'tank', 'pantry']) expect(isHanded({ kind: k }), k).toBe(false)
  })

  it('draws the piece as its mirror image across its own width, in plan and in 3D', () => {
    const f = piece('sofa-corner', [0, 0], 0)
    const m = mirrored(f)
    expect(m.mirrored).toBe(true)
    const flip = (pts: [number, number][]) => round(pts.map(([x, y]) => [-x, y] as [number, number]))
    expect(symbolPts(m)).toEqual(flip(furnitureSymbol(f).parts.flatMap(p => p.pts) as [number, number][]))
    expect(round(furnitureSolids(m).flatMap(s => s.pts) as [number, number][])).toEqual(flip(furnitureSolids(f).flatMap(s => s.pts) as [number, number][]))
    // The bath's tap moves to the other end.
    const bath = piece('bath', [0, 0], 0)
    const tap = (b: Furniture) => furnitureSymbol(b).parts.at(-1)!.pts.reduce((s, p) => s + p[0], 0)
    expect(Math.sign(tap(bath))).toBe(-1)
    expect(Math.sign(tap(mirrored(bath)))).toBe(1)
  })

  it('goes back with a second mirror, leaving no flag, and older pieces open as drawn', () => {
    const f = piece('desk-l')
    expect('mirrored' in f).toBe(false)
    expect(mirrored(mirrored(f))).toEqual(f)
    const plan = addFurniture(normalizePlan(garageFloor()), f)
    const once = mirrorFurniture(plan, f.id)
    expect(once.furniture[0].mirrored).toBe(true)
    expect(mirrorFurniture(once, f.id).furniture[0]).toEqual(f)
    expect(mirrorFurniture(plan, 'nothing')).toBe(plan)
  })

  it('keeps a handed piece the true mirror image when the whole plan is flipped', () => {
    const f = piece('sofa-corner', [4, 4], 30)
    const plan = addFurniture(normalizePlan(garageFloor()), f)
    for (const axis of ['x', 'y'] as const) {
      const flipped = flipPlan(plan, axis).furniture[0]
      expect(flipped.mirrored).toBe(true)
      // Every point of the flipped symbol is a point of the original, mirrored about the same line.
      const pts = furnitureSymbol(f).parts.flatMap(p => p.pts)
      const after = new Set(symbolPts(flipped))
      const xs = pts.map(p => p[0])
      const ys = pts.map(p => p[1])
      // flipPlan mirrors about the middle of everything; find it from where the centre went.
      const c: [number, number] = [(f.at[0] + flipped.at[0]) / 2, (f.at[1] + flipped.at[1]) / 2]
      const map = (p: [number, number]): [number, number] => (axis === 'x' ? [2 * c[0] - p[0], p[1]] : [p[0], 2 * c[1] - p[1]])
      expect(xs.length).toBe(ys.length)
      for (const q of round(pts.map(p => map(p as [number, number])))) expect(after.has(q), q).toBe(true)
    }
    // A piece that isn't handed only moves and turns.
    const bed = piece('bed-queen')
    expect('mirrored' in flipPlan(addFurniture(normalizePlan(garageFloor()), bed), 'x').furniture[0]).toBe(false)
  })
})

describe('the pantry, tank and pool', () => {
  it('are in the catalogue at their usual sizes, the tank and pool with the outdoor pieces', () => {
    expect(catalogItem('pantry')).toMatchObject({ group: 'kitchen', size: [0.9, 0.6, 2.1], wall: true })
    expect(catalogItem('tank')).toMatchObject({ group: 'outdoor', size: [1.85, 1.85, 2.1] })
    expect(catalogItem('pool')).toMatchObject({ group: 'outdoor', size: [7, 3.5, 0.1], wall: false })
    // A 1.85 m round tank 2.1 m tall holds about 5000 L, as its name says.
    const [w, , h] = catalogItem('tank')!.size
    expect(Math.PI * (w / 2) ** 2 * h * 1000).toBeGreaterThan(5000)
  })

  it('draws the pool as coping round the water, low enough to step over in 3D', () => {
    const pool = piece('pool', [0, 0], 0)
    const solids = furnitureSolids(pool)
    expect(solids).toHaveLength(5)
    expect(Math.max(...solids.map(s => s.z1))).toBeCloseTo(0.1, 9)
    expect(furnitureSymbol(pool).parts.length).toBeGreaterThan(2)
  })
})
