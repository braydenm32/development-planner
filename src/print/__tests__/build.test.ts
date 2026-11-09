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
import { BED_SLACK, buildPrintModel, DEFAULT_PRINT, fitsBed, longSideTurn, type PrintModel, type PrintPart } from '../build'
import { partGroups, plasticOf, scaleThatFits, scaleUnder } from '../fit'

let wasm: ManifoldToplevel

// Most of these compare volumes across scales and settings, which the terrain's hollow pockets
// (whose ribs and skin don't scale) would blur: they print solid, and hollowing has its own test.
const SOLID = { ...DEFAULT_PRINT, hollow: false }

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

describe('fitting the bed', () => {
  it('lets a part run a little over the stated bed, either way round', () => {
    const bed = { bedX: 256, bedY: 200 }
    expect(fitsBed(256 + BED_SLACK, 200, bed)).toBe(true)
    expect(fitsBed(200, 256.5, bed)).toBe(true)
    expect(fitsBed(256 + BED_SLACK + 0.1, 100, bed)).toBe(false)
  })

  it('turns a block so its long side runs along x, by the smallest turn', () => {
    const deg = (r: number) => (r * 180) / Math.PI
    expect(longSideTurn([[0, 0], [40, 0], [40, 20], [0, 20]])).toBe(0)
    expect(Math.abs(deg(longSideTurn([[0, 0], [20, 0], [20, 40], [0, 40]])))).toBeCloseTo(90, 6)
    // A 40 × 20 block at 30° comes back level.
    const c = Math.cos(Math.PI / 6)
    const s = Math.sin(Math.PI / 6)
    const ring = [[0, 0], [40, 0], [40, 20], [0, 20]].map(([x, y]) => [x * c - y * s, x * s + y * c] as Vec2)
    expect(deg(longSideTurn(ring))).toBeCloseTo(30, 6)
    expect(longSideTurn([[0, 0], [1, 1]])).toBe(0)
  })

  it('finds the largest scale that fits the bed in one piece, and the one under a litre', () => {
    const bed = { bedX: 256, bedY: 256 }
    // 600 × 300 mm at 1:100: at 1:250 it is 240 × 120, the first that fits.
    expect(scaleThatFits([600, 300], 100, bed)).toBe(250)
    // 200 × 100 mm at 1:100: 1:75 makes it 267 mm long, too long by more than the slack.
    expect(scaleThatFits([200, 100], 100, bed)).toBe(100)
    expect(scaleThatFits([100, 50], 100, bed)).toBe(50)
    expect(scaleThatFits([2000, 2000], 100, bed)).toBeNull()
    expect(scaleUnder(800, 100)).toBeNull()
    // 2 litres at 1:100: 1:150 takes (100/150)³ of it, 593 cm³.
    expect(scaleUnder(2000, 100)).toBe(150)
    expect(scaleUnder(1e6, 100)).toBeNull()
  })

  it('groups the pieces of a part cut to fit, with the whole box and the biggest piece', () => {
    const part = (id: string, name: string, min: number[], max: number[], of?: string) =>
      ({ id, name, kind: 'terrain', positions: new Float32Array(), indices: new Uint32Array(), min, max, volume: 10, ...(of ? { of } : {}) }) as PrintPart
    const groups = partGroups({
      parts: [
        part('terrain-A1', 'Terrain A1', [0, 0, 0], [100, 80, 20], 'terrain'),
        part('terrain-B1', 'Terrain B1', [100, 0, 0], [180, 80, 25], 'terrain'),
        { ...part('g', 'Ground floor', [10, 10, 0], [60, 40, 30]), kind: 'floor' },
      ],
    })
    expect(groups.map(g => [g.name, g.ids, g.pieces.map(p => p.name)])).toEqual([
      ['Terrain', ['terrain-A1', 'terrain-B1'], ['A1', 'B1']],
      ['Ground floor', ['g'], []],
    ])
    expect(groups[0].size).toEqual([180, 80, 25])
    expect(groups[0].biggest).toEqual([100, 80])
    expect(groups[0].volume).toBe(20)
    expect(plasticOf({ parts: groups.map(g => ({ volume: g.volume }) as PrintPart) })).toBe(30)
  })
})

describe('print model', () => {
  let input: ReturnType<typeof setup>
  let model100: PrintModel
  let model200: PrintModel

  beforeAll(() => {
    input = setup()
    model100 = buildPrintModel(wasm, input, { ...SOLID, tiles: false })
    model200 = buildPrintModel(wasm, input, { ...SOLID, scale: 200, tiles: false })
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

  it('is to scale, with the block turned so its long side runs along x', () => {
    // The block's long side, (19, 0) to (25, 31), is 31.6 m and runs at 79° to east: turned that
    // much, the terrain is a little over 316 mm long at 1:100 and about 190 mm across.
    expect(model100.turn).toBeCloseTo(79.05, 1)
    const [terrain, floor] = model100.parts
    expect(terrain.max[0] - terrain.min[0]).toBeGreaterThan(316)
    expect(terrain.max[0] - terrain.min[0]).toBeLessThan(330)
    expect(terrain.max[1] - terrain.min[1]).toBeGreaterThan(185)
    expect(terrain.max[1] - terrain.min[1]).toBeLessThan(200)
    expect(model100.terrainSize).toEqual([terrain.max[0] - terrain.min[0], terrain.max[1] - terrain.min[1]])
    const w = floor.max[0] - floor.min[0]
    const half = model200.parts[1]
    expect((half.max[0] - half.min[0]) * 2).toBeCloseTo(w, 0)
    expect(model100.notes.join(' ')).toMatch(/turned 79° so the block’s long side runs along the bed/)
  })

  it('hollows the terrain underneath, keeping it one closed solid with the same top', () => {
    const hollow = buildPrintModel(wasm, input, { ...DEFAULT_PRINT, tiles: false })
    expect(DEFAULT_PRINT.hollow).toBe(true)
    const [t, solid] = [hollow.parts[0], model100.parts[0]]
    // Far less plastic, and the same outside box: the pockets are all underneath.
    expect(t.volume).toBeLessThan(solid.volume * 0.6)
    for (const i of [0, 1, 2]) {
      expect(t.min[i]).toBeCloseTo(solid.min[i], 1)
      expect(t.max[i]).toBeCloseTo(solid.max[i], 1)
    }
    const m = solidOf(t)
    expect(m.status()).toBe('NoError')
    m.delete()
    // The house still keys into it, and nothing else changes.
    expect(overlap(t, hollow.parts[1], 1, 0)).toBeGreaterThan(1)
    for (let i = 1; i < hollow.parts.length; i++) expect(hollow.parts[i].volume).toBeCloseTo(model100.parts[i].volume, 3)
    expect(hollow.notes.join(' ')).toMatch(/hollow underneath/)
  })

  it('prints only the ground around the house when asked, inside the block', () => {
    const near = buildPrintModel(wasm, input, { ...SOLID, tiles: false, terrain: 'house', margin: 3 })
    const [t] = near.parts
    const [whole] = model100.parts
    expect((t.max[0] - t.min[0]) * (t.max[1] - t.min[1])).toBeLessThan((whole.max[0] - whole.min[0]) * (whole.max[1] - whole.min[1]) * 0.6)
    expect(t.volume).toBeLessThan(whole.volume * 0.6)
    // The house still stands wholly on the ground around it.
    const f = near.parts[1]
    for (const i of [0, 1]) {
      expect(t.min[i]).toBeLessThan(f.min[i])
      expect(t.max[i]).toBeGreaterThan(f.max[i])
    }
    const m = solidOf(t)
    expect(m.status()).toBe('NoError')
    m.delete()
    for (let i = 1; i < near.parts.length; i++) expect(near.parts[i].volume).toBeCloseTo(model100.parts[i].volume, 3)
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
    const walled = buildPrintModel(wasm, { plan, survey: input.survey, ground: evaluateEarthworks(prep).grid }, { ...SOLID, tiles: false })
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
    const without = buildPrintModel(wasm, furnished, { ...SOLID, tiles: false })
    expect(DEFAULT_PRINT.furniture).toBe(false)
    without.parts.forEach((p, i) => expect(p.volume).toBeCloseTo(model100.parts[i].volume, 6))
    expect(without.notes.join(' ')).not.toMatch(/furniture/)

    const withIt = buildPrintModel(wasm, furnished, { ...SOLID, tiles: false, furniture: true })
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
    const model75 = buildPrintModel(wasm, input, { ...SOLID, scale: 75, tiles: false })
    const width = (m: PrintModel) => m.parts[1].max[0] - m.parts[1].min[0]
    expect(width(model75)).toBeCloseTo((width(model100) * 4) / 3, 0)
    expect(model75.parts.map(p => p.name)).toEqual(model100.parts.map(p => p.name))
    const vol = (m: PrintModel) => m.parts.reduce((t, p) => t + p.volume, 0)
    // (100 / 75)³ ≈ 2.37; the base and the thinnest walls don't scale, so allow a little.
    expect(vol(model75) / vol(model100)).toBeGreaterThan(2.2)
    expect(vol(model75) / vol(model100)).toBeLessThan(2.5)
  })

  it('prints at 1:50 twice the size of 1:100, with every terrain tile on the bed', () => {
    const model50 = buildPrintModel(wasm, input, { ...SOLID, scale: 50, tiles: false })
    const width = (m: PrintModel) => m.parts[1].max[0] - m.parts[1].min[0]
    expect(width(model50)).toBeCloseTo(width(model100) * 2, 0)
    expect(model50.parts.map(p => p.name)).toEqual(model100.parts.map(p => p.name))
    const tiled = buildPrintModel(wasm, input, { ...SOLID, scale: 50 })
    const tiles = tiled.parts.filter(p => p.kind === 'terrain')
    expect(tiles.length).toBeGreaterThan(1)
    for (const t of tiles) expect(fitsBed(t.max[0] - t.min[0], t.max[1] - t.min[1], DEFAULT_PRINT)).toBe(true)
  })

  it('cuts a terrain bigger than the bed into tiles that fit', () => {
    const tiled = buildPrintModel(wasm, input, { ...SOLID, bedX: 180, bedY: 200 })
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
    const cut = buildPrintModel(wasm, input, { ...SOLID, ...bed })
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
    const uncut = buildPrintModel(wasm, input, { ...SOLID, ...bed, tiles: false })
    expect(uncut.parts.map(p => p.name)).toEqual(['Terrain', 'Ground floor', 'First floor', 'Roof'])
    expect(uncut.parts.every(p => p.of === undefined)).toBe(true)
  })
})
