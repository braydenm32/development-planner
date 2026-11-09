import { describe, expect, it } from 'vitest'
import type { PrintPart } from '../build'
import { APART_LIFT, APART_SPREAD, fitDistance, freeFrame, partOffsets, sceneBox } from '../previewFit'

/** A box-shaped part, in print millimetres (x east, y north, z up). */
const part = (id: string, kind: PrintPart['kind'], min: [number, number, number], max: [number, number, number]): PrintPart => ({
  id,
  name: id,
  kind,
  positions: new Float32Array(),
  indices: new Uint32Array(),
  min,
  max,
  volume: 0,
})

// One terrain tile 200 × 150 mm and 10–30 mm high, a 20 mm ground floor and a 30 mm roof on it.
const model = {
  parts: [
    part('roof', 'roof', [40, 30, 50], [160, 120, 80]),
    part('terrain', 'terrain', [0, 0, 0], [200, 150, 30]),
    part('ground', 'floor', [50, 40, 30], [150, 110, 50]),
  ],
}

describe('print preview, assembled or apart', () => {
  it('leaves every part in place, assembled', () => {
    for (const o of partOffsets(model, false).values()) expect(o).toEqual([0, 0, 0])
  })

  it('lifts each floor and roof further than the one below, apart', () => {
    const o = partOffsets(model, true)
    expect(o.get('terrain')).toEqual([0, 0, 0])
    expect(o.get('ground')).toEqual([0, APART_LIFT, 0])
    expect(o.get('roof')).toEqual([0, 2 * APART_LIFT, 0])
  })

  it('spreads terrain tiles from each other', () => {
    const tiles = { parts: [part('w', 'terrain', [0, 0, 0], [100, 100, 10]), part('e', 'terrain', [100, 0, 0], [200, 100, 10])] }
    const o = partOffsets(tiles, true)
    expect(o.get('w')).toEqual([-APART_SPREAD, 0, -0])
    expect(o.get('e')).toEqual([APART_SPREAD, 0, -0])
  })

  it('lifts the pieces of a floor cut to fit the bed together, and spreads them a little', () => {
    const piece = (id: string, x0: number, x1: number) => ({ ...part(id, 'floor', [x0, 40, 30], [x1, 110, 50]), of: 'ground' })
    const cut = { parts: [part('terrain', 'terrain', [0, 0, 0], [200, 150, 30]), piece('ground-A1', 50, 100), piece('ground-B1', 100, 150), part('roof', 'roof', [40, 30, 50], [160, 120, 80])] }
    const o = partOffsets(cut, true)
    expect(o.get('ground-A1')).toEqual([-APART_SPREAD, APART_LIFT, -0])
    expect(o.get('ground-B1')).toEqual([APART_SPREAD, APART_LIFT, -0])
    expect(o.get('roof')).toEqual([0, 2 * APART_LIFT, 0])
    expect(o.get('terrain')).toEqual([0, 0, 0])
  })

  it('frames the lifted stack: taller apart, so the camera stands further back', () => {
    // Scene y is print z. Assembled: 0..80. Apart: the roof's top lifts by 2 × 25 to 130.
    const together = sceneBox(model, false)
    const apart = sceneBox(model, true)
    expect([together.min[1], together.max[1]]).toEqual([0, 80])
    expect([apart.min[1], apart.max[1]]).toEqual([0, 80 + 2 * APART_LIFT])
    // Scene z is south: print y 0..150 becomes −150..0.
    expect([together.min[2], together.max[2]]).toEqual([-150, 0])
    expect(fitDistance(apart, 40, 1.6)).toBeGreaterThan(fitDistance(together, 40, 1.6))
  })

  it('stands far enough back to see the whole box, on a wide or a tall canvas', () => {
    // A 100 mm cube: radius 50√3 ≈ 86.6 mm. Vertical field 40°: 86.6 / sin 20° ≈ 253.2, × 1.08 ≈ 273.5.
    const box = { min: [0, 0, 0] as [number, number, number], max: [100, 100, 100] as [number, number, number] }
    expect(fitDistance(box, 40, 2)).toBeCloseTo((50 * Math.sqrt(3) * 1.08) / Math.sin((20 * Math.PI) / 180), 6)
    // On a phone held upright (aspect 0.5) the narrower horizontal field decides: further back.
    const h = 2 * Math.atan(Math.tan((20 * Math.PI) / 180) * 0.5)
    expect(fitDistance(box, 40, 0.5)).toBeCloseTo((50 * Math.sqrt(3) * 1.08) / Math.sin(h / 2), 6)
    expect(fitDistance(box, 40, 0.5)).toBeGreaterThan(fitDistance(box, 40, 2))
  })

  it('fits the whole canvas when nothing covers it', () => {
    const f = freeFrame(800, 400, { l: 0, r: 0, t: 0, b: 0 }, 40)
    expect(f.dx).toBe(0)
    expect(f.dy).toBe(0)
    expect(f.aspect).toBe(2)
    expect(f.fov).toBeCloseTo(40, 9)
  })

  it('fits the part the panels leave free, and centres the view there', () => {
    // 800 × 400, a 300 px panel on the left and a 200 px sheet along the bottom: 500 × 200 free.
    const f = freeFrame(800, 400, { l: 300, r: 0, t: 0, b: 200 }, 40)
    // The middle moves 150 px right and 100 px up: dx = (0 − 300) / 2, dy = (200 − 0) / 2.
    expect(f.dx).toBe(-150)
    expect(f.dy).toBe(100)
    expect(f.aspect).toBe(2.5)
    // Half the height sees tan 20° × ½ = 0.18199, atan 10.31°, so a 20.63° field.
    expect(f.fov).toBeCloseTo(20.63, 2)
    // So the camera stands further back than on the whole canvas.
    const box = { min: [0, 0, 0] as [number, number, number], max: [100, 100, 100] as [number, number, number] }
    expect(fitDistance(box, f.fov, f.aspect)).toBeGreaterThan(fitDistance(box, 40, 2))
  })

  it('keeps at least 120 px free, however much is covered', () => {
    const f = freeFrame(390, 600, { l: 0, r: 60, t: 62, b: 560 }, 40)
    expect(f.aspect).toBeCloseTo(330 / 120, 9)
  })
})
