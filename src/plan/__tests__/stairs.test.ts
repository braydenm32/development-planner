import { describe, expect, it } from 'vitest'
import { signedArea } from '../../lib/geom'
import { emptyPlan, normalizePlan, type Plan, type Stair } from '../model'
import { addLevelAbove, addStair, defaultRise, deleteLevel, deleteSelection, newStair, updateLevel, updateStair } from '../ops'
import { parsePlanFile, usePlan } from '../store'
import {
  followLevels,
  linkStairs,
  riserCount,
  stairArrivesAt,
  stairComfort,
  stairContains,
  stairLayout,
  stairMeetsNoFloor,
  stairTopLevel,
} from '../stairs'
import { splitLevels } from './fixtures'

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

describe('stairs joined to the levels they climb between', () => {
  const up = (p: Plan) => p.stairs.find(s => s.id === 'stair_up')!

  it('goes up to the floor above when drawn, and follows it when that floor moves', () => {
    const plan = splitLevels()
    const s = newStair(plan, 'level_low', [6, 4], 90, { shape: 'straight', width: 0.9, turn: 'left' })
    expect(s.toLevel).toBe('level_mid')
    expect(s.rise).toBeCloseTo(1.2, 9)

    // The middle level goes up 300 mm: the stair now climbs 1.5 m, and still comes up through it.
    const raised = updateLevel(plan, 'level_mid', { elevation: 1.5 })
    expect(up(raised).rise).toBeCloseTo(1.5, 9)
    expect(stairArrivesAt(raised, up(raised), 'level_mid')).toBe(true)
    expect(stairMeetsNoFloor(raised, up(raised))).toBe(false)
    // ...and the lower floor going down 100 mm adds that too.
    expect(up(updateLevel(raised, 'level_low', { elevation: -0.1 })).rise).toBeCloseTo(1.6, 9)
  })

  it('follows a level changed through the store, as the Floors panel changes it', () => {
    usePlan.getState().load(splitLevels())
    usePlan.getState().commit(p => ({ ...p, levels: p.levels.map(l => (l.id === 'level_mid' ? { ...l, elevation: 1.35 } : l)) }))
    const p = usePlan.getState().plan!
    expect(up(p).rise).toBeCloseTo(1.35, 9)
    expect(stairArrivesAt(p, up(p), 'level_mid')).toBe(true)
  })

  it('keeps its bottom step where it is: a stair starting 200 mm up climbs the rest', () => {
    const plan = updateStair(splitLevels(), 'stair_up', { base: 0.2 })
    expect(up(followLevels(plan)).rise).toBeCloseTo(1.0, 9)
  })

  it('leaves a typed top alone', () => {
    const custom = updateStair(splitLevels(), 'stair_up', { toLevel: null, rise: 1.0 })
    const moved = updateLevel(custom, 'level_mid', { elevation: 1.5 })
    expect(up(moved).rise).toBe(1.0)
    expect(up(moved).toLevel).toBeNull()
    // Its top meets no floor, which the plan and the stair's panel say.
    expect(stairMeetsNoFloor(moved, up(moved))).toBe(true)
    expect(stairArrivesAt(moved, up(moved), 'level_mid')).toBe(false)
  })

  it('is let go, keeping its top, when the level it goes to is deleted or drops below it', () => {
    const gone = deleteLevel(splitLevels(), 'level_mid')
    expect(up(gone).toLevel).toBeNull()
    expect(up(gone).rise).toBeCloseTo(1.2, 9)
    const below = updateLevel(splitLevels(), 'level_mid', { elevation: -0.5 })
    expect(up(below).toLevel).toBeNull()
    expect(up(below).rise).toBeCloseTo(1.2, 9)
  })

  it('joins a stair drawn on the top floor to a level added above it', () => {
    const base = emptyPlan({ e: 0, n: 0, rotation: 0, ffl: 80 })
    const s = newStair(base, 'level_ground', [1, 1], 0, { shape: 'straight', width: 0.9, turn: 'left' })
    expect(s.toLevel).toBeUndefined()
    const { plan, id } = addLevelAbove(addStair(base, s))
    expect(plan.stairs[0].toLevel).toBe(id)
    expect(stairArrivesAt(plan, plan.stairs[0], id)).toBe(true)
  })

  it('joins an older file’s stairs on load to the floor their top meets', () => {
    const legacy = splitLevels()
    // Saved before stairs were joined: no toLevel, and a top 30 mm short of the middle floor.
    const { toLevel: _, ...old } = up(legacy)
    const lost = { ...old, id: 'stair_lost', rise: 0.6 } // meets no floor: left as it is
    const text = JSON.stringify({ ...legacy, stairs: [{ ...old, rise: 1.17 }, lost] })
    const plan = parsePlanFile(text)
    expect(up(plan).toLevel).toBe('level_mid')
    expect(up(plan).rise).toBeCloseTo(1.2, 9)
    expect(plan.stairs[1]).toEqual(lost)
    expect(stairTopLevel(plan, up(plan))?.name).toBe('Middle level')
    // A floor moved after loading takes the stair with it.
    expect(up(updateLevel(plan, 'level_mid', { elevation: 1.4 })).rise).toBeCloseTo(1.4, 9)
  })

  it('leaves an older stair unjoined when its top meets two floors', () => {
    const legacy = splitLevels()
    const { toLevel: _, ...old } = up(legacy)
    const two = { ...legacy, levels: [...legacy.levels, { id: 'level_mid2', name: 'Study level', elevation: 1.22, height: 2.4 }], stairs: [old] }
    const plan = normalizePlan(two)
    expect(plan.stairs[0].toLevel).toBeUndefined()
    expect(plan.stairs[0].rise).toBe(1.2)
  })

  it('loads a file without stairs, or with joined ones, exactly as saved', () => {
    const p = splitLevels()
    expect(normalizePlan(p).stairs).toEqual(p.stairs)
    expect(linkStairs(p)).toBe(p)
    expect(followLevels(p)).toBe(p)
  })
})
