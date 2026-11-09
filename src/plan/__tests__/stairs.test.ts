import { describe, expect, it } from 'vitest'
import { signedArea } from '../../lib/geom'
import { emptyPlan, type Stair } from '../model'
import { addLevelAbove, addStair, defaultRise, deleteLevel, deleteSelection, newStair } from '../ops'
import { riserCount, stairComfort, stairContains, stairLayout } from '../stairs'

const stair = (patch: Partial<Stair> = {}): Stair => ({
  id: 's',
  level: 'level_ground',
  at: [0, 0],
  angle: 0,
  width: 1,
  base: 0,
  rise: 3,
  going: 0.25,
  shape: 'straight',
  turn: 'left',
  ...patch,
})

describe('stairs', () => {
  it('uses risers of at most 190 mm', () => {
    expect(riserCount(3)).toBe(16) // 187.5 mm
    expect(riserCount(2.66)).toBe(14) // exactly 190 mm
    expect(stairLayout(stair()).riser).toBeCloseTo(0.1875, 9)
  })

  it('lays out a straight flight with one tread fewer than risers', () => {
    const L = stairLayout(stair())
    expect(L.steps).toHaveLength(15)
    expect(L.steps.at(-1)!.top).toBeCloseTo(3 - 0.1875, 9)
    // 15 treads of 250 mm along +x, 1 m wide
    expect(Math.abs(signedArea(L.outline))).toBeCloseTo(15 * 0.25 * 1, 9)
    expect(L.walk.at(-1)![0]).toBeCloseTo(3.75, 9)
  })

  it.each(['l', 'u'] as const)('puts a landing halfway up a %s stair', shape => {
    for (const turn of ['left', 'right'] as const) {
      const L = stairLayout(stair({ shape, turn }))
      const landing = L.steps.find(s => Math.abs(s.top - 8 * 0.1875) < 1e-9)!
      expect(landing).toBeDefined()
      // treads plus landing fill the footprint exactly, and the outline runs anticlockwise
      const area = L.steps.reduce((t, s) => t + Math.abs(signedArea(s.pts)), 0)
      expect(signedArea(L.outline)).toBeCloseTo(area, 9)
    }
  })

  it('turns an L stair to the chosen side', () => {
    const left = stairLayout(stair({ shape: 'l', turn: 'left' })).walk.at(-1)!
    const right = stairLayout(stair({ shape: 'l', turn: 'right' })).walk.at(-1)!
    expect(left[1]).toBeGreaterThan(0)
    expect(right[1]).toBeLessThan(0)
  })

  it('rotates with its direction', () => {
    const L = stairLayout(stair({ angle: 90 }))
    expect(L.walk.at(-1)![0]).toBeCloseTo(0, 9)
    expect(L.walk.at(-1)![1]).toBeCloseTo(3.75, 9)
    expect(stairContains(stair({ angle: 90 }), [0, 2])).toBe(true)
    expect(stairContains(stair({ angle: 90 }), [2, 0])).toBe(false)
  })

  it('checks the 2R + G rule', () => {
    expect(stairComfort(stair()).ok).toBe(true) // 625 mm
    expect(stairComfort(stair({ going: 0.4 })).ok).toBe(false) // 775 mm
  })

  it('climbs to the floor above by default', () => {
    const { plan, id } = addLevelAbove(emptyPlan({ e: 0, n: 0, rotation: 0, ffl: 80 }))
    expect(defaultRise(plan, 'level_ground')).toBeCloseTo(3.0, 9)
    // from the top level, a typical storey
    expect(defaultRise(plan, id)).toBeCloseTo(3.0, 9)
  })

  it('is removed with its level or on its own', () => {
    const base = emptyPlan({ e: 0, n: 0, rotation: 0, ffl: 80 })
    const { plan, id } = addLevelAbove(base)
    const s = newStair(plan, id, [1, 1], 0, { shape: 'straight', width: 0.9, turn: 'left' })
    const withStair = addStair(plan, s)
    expect(deleteLevel(withStair, id).stairs).toHaveLength(0)
    expect(deleteSelection(withStair, { type: 'stair', id: s.id }).stairs).toHaveLength(0)
  })
})
