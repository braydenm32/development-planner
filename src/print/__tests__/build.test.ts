import Module, { type Manifold, type ManifoldToplevel } from 'manifold-3d'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import type { Vec2 } from '../../lib/geom'
import { evaluateEarthworks, prepareEarthworks } from '../../lib/earthworks'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { earthworksOf, sortedLevels, type Plan } from '../../plan/model'
import { newFurniture } from '../../plan/furniture'
import { addFurniture, addLevelAbove, addRoof, addStair, newStair, updateRoom } from '../../plan/ops'
import { earthworksBarriers, earthworksPlatforms } from '../../plan/platforms'
import { levelOutlines } from '../../plan/roof'
import { buildPrintModel, DEFAULT_PRINT, fitsBed, type PrintModel, type PrintPart } from '../build'

let wasm: ManifoldToplevel

beforeAll(async () => {
  wasm = await Module()
  wasm.setup()
})

function setup() {
  const doc = parseDxf(planeSurvey())
  const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
  const terrain = buildTerrain(survey)
  // The garage house, two storeys, with a hip roof, an inside stair and the hallway on piers.
  let plan: Plan = { ...garageFloor(), placement: { e: 1006, n: 1006, rotation: 5, ffl: 84 } }
  plan = updateRoom(plan, 'r2', { foundation: 'piers' })
  plan = addLevelAbove(plan).plan
  const [ground, first] = sortedLevels(plan)
  plan = addStair(plan, { ...newStair(plan, ground.id, [1.0, 4.5], 90, { shape: 'straight', width: 0.9, turn: 'left' }) })
  plan = addRoof(plan, first.id, levelOutlines(plan.walls.filter(w => w.level === first.id))[0], { type: 'hip', pitch: 22.5, overhang: 0.45 })
  const prep = prepareEarthworks(terrain.grid, survey.boundary, earthworksPlatforms(plan, survey.origin), earthworksOf(plan))
  return { plan, survey, terrain, ground: evaluateEarthworks(prep).grid }
}

const solidOf = (p: PrintPart, dx = 0, dy = 0): Manifold => {
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices })
  mesh.merge()
  return new wasm.Manifold(mesh).translate([dx, dy, 0])
}

const overlap = (a: PrintPart, b: PrintPart, dx = 0, dy = 0) => {
  const ma = solidOf(a)
  const mb = solidOf(b, dx, dy)
  const i = ma.intersect(mb)
  const v = i.volume()
  ma.delete()
  mb.delete()
  i.delete()
  return v
}

describe('print model', () => {
  let input: ReturnType<typeof setup>
  let model100: PrintModel
  let model200: PrintModel

  beforeAll(() => {
    input = setup()
    model100 = buildPrintModel(wasm, input, { ...DEFAULT_PRINT, tiles: false })
    model200 = buildPrintModel(wasm, input, { ...DEFAULT_PRINT, scale: 200, tiles: false })
  })

  it('makes the ground, each floor and the roof as separate closed solids', () => {
    expect(model100.parts.map(p => p.name)).toEqual(['Terrain', 'Ground floor', 'First floor', 'Roof'])
    for (const p of model100.parts) {
      const m = solidOf(p)
      expect(m.status()).toBe('NoError')
      expect(m.volume()).toBeGreaterThan(100)
      expect(Math.abs(m.volume() - p.volume * 1000) / m.volume()).toBeLessThan(0.001)
      m.delete()
    }
  })

  it('is to scale', () => {
    const [, floor] = model100.parts
    // The house is 10.1 m across its outside walls, so about 101 mm at 1:100; turned 5 degrees,
    // its corners span 10.1 cos 5° + 10.605 sin 5° = 10.99 m, about 110 mm.
    const w = floor.max[0] - floor.min[0]
    expect(w).toBeGreaterThan(100)
    expect(w).toBeLessThan(115)
    const half = model200.parts[1]
    expect((half.max[0] - half.min[0]) * 2).toBeCloseTo(w, 0)
  })

  it('stacks without the parts running into each other', () => {
    for (const model of [model100, model200]) {
      const ps = model.parts
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(overlap(ps[i], ps[j])).toBeLessThan(0.5)
    }
  })

  it('keys each part onto the one below so it cannot slide', () => {
    for (const model of [model100, model200]) {
      const [terrain, ground, first, roof] = model.parts
      for (const [a, b] of [
        [terrain, ground],
        [ground, first],
        [first, roof],
      ]) {
        expect(overlap(a, b, 1, 0)).toBeGreaterThan(1)
        expect(overlap(a, b, 0, -1)).toBeGreaterThan(1)
      }
    }
  })

  it('thickens walls too thin to print, and says so', () => {
    expect(model100.notes.join(' ')).toMatch(/printed 1.2 mm thick/)
  })

  it('stands retaining walls on the terrain, and leaves them out of the floors', () => {
    const wall = { id: 'rw', level: sortedLevels(input.plan)[0].id, a: [-1, 17] as Vec2, b: [10, 17] as Vec2, thickness: 0.2, kind: 'retaining' as const }
    const plan: Plan = { ...input.plan, walls: [...input.plan.walls, wall] }
    const prep = prepareEarthworks(
      input.terrain.grid,
      input.survey.boundary,
      earthworksPlatforms(plan, input.survey.origin),
      earthworksOf(plan),
      earthworksBarriers(plan, input.survey.origin),
    )
    const walled = buildPrintModel(wasm, { plan, survey: input.survey, ground: evaluateEarthworks(prep).grid }, { ...DEFAULT_PRINT, tiles: false })
    expect(walled.parts.map(p => p.name)).toEqual(model100.parts.map(p => p.name))
    // The wall is about 11 m long, 0.2 m thick and 1 to 2 m tall, so a few cm³ at 1:100, and the ground behind it is no longer cut.
    expect(walled.parts[0].volume - model100.parts[0].volume).toBeGreaterThan(3)
    for (let i = 1; i < walled.parts.length; i++) expect(walled.parts[i].volume).toBeCloseTo(model100.parts[i].volume, 3)
    const m = solidOf(walled.parts[0])
    expect(m.status()).toBe('NoError')
    m.delete()
  })

  it('leaves furniture out unless asked, then stands it on its floor', () => {
    const ground = sortedLevels(input.plan)[0].id
    let plan = addFurniture(input.plan, newFurniture('car', ground, [2.5, 7])!)
    plan = addFurniture(plan, newFurniture('bed-queen', ground, [5.5, 7])!)
    plan = addFurniture(plan, newFurniture('bbq', ground, [3, 13])!) // out in the open area
    const furnished = { ...input, plan }
    const without = buildPrintModel(wasm, furnished, { ...DEFAULT_PRINT, tiles: false })
    expect(DEFAULT_PRINT.furniture).toBe(false)
    without.parts.forEach((p, i) => expect(p.volume).toBeCloseTo(model100.parts[i].volume, 6))
    expect(without.notes.join(' ')).not.toMatch(/furniture/)

    const withIt = buildPrintModel(wasm, furnished, { ...DEFAULT_PRINT, tiles: false, furniture: true })
    expect(withIt.parts.map(p => p.name)).toEqual(model100.parts.map(p => p.name))
    // A car is 1.9 x 4.9 x up to 1.5 m, so several cm³ at 1:100; the bed adds more.
    expect(withIt.parts[1].volume - model100.parts[1].volume).toBeGreaterThan(8)
    for (const i of [0, 2, 3]) expect(withIt.parts[i].volume).toBeCloseTo(model100.parts[i].volume, 6)
    const m = solidOf(withIt.parts[1])
    expect(m.status()).toBe('NoError')
    m.delete()
    // It still lifts off the floor above, and the bed's thin headboard is thickened to print.
    expect(overlap(withIt.parts[1], withIt.parts[2])).toBeLessThan(0.5)
    expect(withIt.notes.join(' ')).toMatch(/Thin parts of the furniture are printed 1.2 mm thick/)
    expect(withIt.notes.join(' ')).toMatch(/1 piece of furniture outside the house is left out/)
  })

  it('prints at 1:75 four thirds the size of 1:100 each way, about 2.4 times the plastic', () => {
    const model75 = buildPrintModel(wasm, input, { ...DEFAULT_PRINT, scale: 75, tiles: false })
    const width = (m: PrintModel) => m.parts[1].max[0] - m.parts[1].min[0]
    expect(width(model75)).toBeCloseTo((width(model100) * 4) / 3, 0)
    expect(model75.parts.map(p => p.name)).toEqual(model100.parts.map(p => p.name))
    const vol = (m: PrintModel) => m.parts.reduce((t, p) => t + p.volume, 0)
    // (100 / 75)³ ≈ 2.37; the base and the thinnest walls don't scale, so allow a little.
    expect(vol(model75) / vol(model100)).toBeGreaterThan(2.2)
    expect(vol(model75) / vol(model100)).toBeLessThan(2.5)
  })

  it('prints at 1:50 twice the size of 1:100, with every terrain tile on the bed', () => {
    const model50 = buildPrintModel(wasm, input, { ...DEFAULT_PRINT, scale: 50, tiles: false })
    const width = (m: PrintModel) => m.parts[1].max[0] - m.parts[1].min[0]
    expect(width(model50)).toBeCloseTo(width(model100) * 2, 0)
    expect(model50.parts.map(p => p.name)).toEqual(model100.parts.map(p => p.name))
    const tiled = buildPrintModel(wasm, input, { ...DEFAULT_PRINT, scale: 50 })
    const tiles = tiled.parts.filter(p => p.kind === 'terrain')
    expect(tiles.length).toBeGreaterThan(1)
    for (const t of tiles) expect(fitsBed(t.max[0] - t.min[0], t.max[1] - t.min[1], DEFAULT_PRINT)).toBe(true)
  })

  it('cuts a terrain bigger than the bed into tiles that fit', () => {
    const tiled = buildPrintModel(wasm, input, { ...DEFAULT_PRINT, bedX: 180, bedY: 200 })
    const tiles = tiled.parts.filter(p => p.kind === 'terrain')
    expect(tiles.length).toBeGreaterThan(1)
    for (const t of tiles) expect(fitsBed(t.max[0] - t.min[0], t.max[1] - t.min[1], { bedX: 180, bedY: 200 })).toBe(true)
    const whole = model100.parts[0].volume
    expect(tiles.reduce((v, t) => v + t.volume, 0)).toBeCloseTo(whole, 0)
    expect(tiled.notes.join(' ')).toMatch(/cut into \d+ tiles/)
  })

  it('cuts a floor or roof bigger than the bed into pieces that fit, which glue back into the whole', () => {
    // The ground floor is about 92 × 64 mm at 1:100: a 70 mm bed takes it in two pieces.
    const bed = { bedX: 70, bedY: 70 }
    const cut = buildPrintModel(wasm, input, { ...DEFAULT_PRINT, ...bed })
    for (const p of cut.parts) expect(fitsBed(p.max[0] - p.min[0], p.max[1] - p.min[1], bed), p.name).toBe(true)
    const whole = model100.parts.find(p => p.name === 'Ground floor')!
    const pieces = cut.parts.filter(p => p.name.startsWith('Ground floor '))
    expect(pieces.length).toBeGreaterThan(1)
    expect(pieces.map(p => p.name).every(n => /^Ground floor [A-H]\d$/.test(n))).toBe(true)
    expect(new Set(pieces.map(p => p.of)).size).toBe(1)
    expect(pieces.reduce((v, p) => v + p.volume, 0)).toBeCloseTo(whole.volume, 0)
    // Together they fill the whole floor's box.
    for (const i of [0, 1, 2]) {
      expect(Math.min(...pieces.map(p => p.min[i]))).toBeCloseTo(whole.min[i], 1)
      expect(Math.max(...pieces.map(p => p.max[i]))).toBeCloseTo(whole.max[i], 1)
    }
    expect(cut.notes.join(' ')).toMatch(/Ground floor is \d+ × \d+ mm, so it is cut into \d+ pieces \(A1, /)
    // With cutting off, it stays whole (and the panel says it doesn't fit).
    const uncut = buildPrintModel(wasm, input, { ...DEFAULT_PRINT, ...bed, tiles: false })
    expect(uncut.parts.map(p => p.name)).toEqual(['Terrain', 'Ground floor', 'First floor', 'Roof'])
    expect(uncut.parts.every(p => p.of === undefined)).toBe(true)
  })
})
