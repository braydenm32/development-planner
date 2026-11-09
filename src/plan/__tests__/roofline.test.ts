// Rooflines across levels on the made-up split level (fixtures.ts): eaves RLs, matching a roof to
// another level or roof, one roof over levels whose ceilings line up, and the Floors helper.

import { describe, expect, it } from 'vitest'
import { pointInPolygon } from '../../lib/geom'
import { floorRL, normalizePlan, type Plan, type Roof } from '../model'
import { addRoof, deleteSelection, updateLevel } from '../ops'
import { levelOutlines, outlineAround } from '../roof'
import {
  ceilingHeightToMatch,
  ceilingLinedUpWith,
  ceilingRL,
  levelsSharingCeiling,
  matchRoofline,
  roofEavesRL,
  roofLineKey,
  roofName,
  roofsOverLevel,
  setEavesRL,
  wallsUnderRoofline,
} from '../roofline'
import { splitLevels } from './fixtures'

const DEFAULTS = { type: 'hip' as const, pitch: 22.5, overhang: 0.45 }

/** The split level with a roof over the lower wing and one over the middle wing. */
function roofed(): Plan {
  let p = splitLevels()
  for (const level of ['level_low', 'level_mid']) p = addRoof(p, level, levelOutlines(p.walls.filter(w => w.level === level))[0], DEFAULTS)
  return p
}
const roofOn = (p: Plan, level: string) => p.roofs.find(r => r.level === level)!

describe('a roof’s eaves RL', () => {
  it('sits on its own level’s walls when nothing else is said', () => {
    const p = roofed()
    // Lower level: floor RL 82, ceiling 2.7 m up.
    expect(roofEavesRL(p, roofOn(p, 'level_low'))).toBeCloseTo(84.7, 9)
    expect(roofEavesRL(p, roofOn(p, 'level_mid'))).toBeCloseTo(82 + 1.2 + 2.7, 9)
    expect('eaves' in roofOn(p, 'level_low')).toBe(false)
  })

  it('takes a typed RL, and drops it when typed back to its own ceiling', () => {
    let p = roofed()
    const id = roofOn(p, 'level_low').id
    p = setEavesRL(p, id, 85.5)
    expect(roofOn(p, 'level_low').eaves).toEqual({ rl: 85.5 })
    expect(roofEavesRL(p, roofOn(p, 'level_low'))).toBe(85.5)
    p = setEavesRL(p, id, 84.7)
    expect('eaves' in roofOn(p, 'level_low')).toBe(false)
  })

  it('matches another level’s ceiling, and follows it when that level changes', () => {
    const base = roofed()
    let p = matchRoofline(base, roofOn(base, 'level_low').id, 'level:level_mid')
    expect(roofLineKey(roofOn(p, 'level_low'))).toBe('level:level_mid')
    expect(roofEavesRL(p, roofOn(p, 'level_low'))).toBeCloseTo(ceilingRL(p, 'level_mid'), 9)
    p = updateLevel(p, 'level_mid', { height: 3 })
    expect(roofEavesRL(p, roofOn(p, 'level_low'))).toBeCloseTo(82 + 1.2 + 3, 9)
    // Its own level is the same as its own walls.
    p = matchRoofline(p, roofOn(p, 'level_low').id, 'level:level_low')
    expect('eaves' in roofOn(p, 'level_low')).toBe(false)
  })

  it('matches another roof’s eaves and pitch, so the two read as one roofline', () => {
    let p = roofed()
    const mid = roofOn(p, 'level_mid')
    p = { ...p, roofs: p.roofs.map(r => (r.id === mid.id ? { ...r, pitch: 4 } : r)) }
    p = matchRoofline(p, roofOn(p, 'level_low').id, `roof:${mid.id}`)
    const low = roofOn(p, 'level_low')
    expect(low.pitch).toBe(4)
    expect(roofEavesRL(p, low)).toBeCloseTo(roofEavesRL(p, roofOn(p, 'level_mid')), 9)
    // ...and moves with it.
    p = setEavesRL(p, mid.id, 87.5)
    expect(roofEavesRL(p, roofOn(p, 'level_low'))).toBe(87.5)
  })

  it('goes back to its own walls when what it matched is gone, or the matches go round in a ring', () => {
    let p = roofed()
    const low = roofOn(p, 'level_low')
    const mid = roofOn(p, 'level_mid')
    p = matchRoofline(p, low.id, `roof:${mid.id}`)
    p = deleteSelection(p, { type: 'roof', id: mid.id })
    expect(roofEavesRL(p, roofOn(p, 'level_low'))).toBeCloseTo(84.7, 9)
    const ring: Roof[] = [
      { ...low, eaves: { roof: mid.id } },
      { ...mid, eaves: { roof: low.id } },
    ]
    const q = { ...roofed(), roofs: ring }
    expect(roofEavesRL(q, ring[0])).toBeCloseTo(84.7, 9)
    const gone = { ...q, roofs: [{ ...low, eaves: { level: 'nowhere' } }] }
    expect(roofEavesRL(gone, gone.roofs[0])).toBeCloseTo(84.7, 9)
  })

  it('loads an older plan’s roofs as they were', () => {
    const p = normalizePlan(roofed())
    expect(p.roofs.every(r => !('eaves' in r))).toBe(true)
  })

  it('names roofs by their level', () => {
    const p = roofed()
    expect(roofName(p, roofOn(p, 'level_mid'))).toBe('Roof over Middle level')
    const two = addRoof(p, 'level_mid', [[0, 6], [2, 6], [2, 8], [0, 8]], DEFAULTS)
    expect(roofName(two, two.roofs.at(-1)!)).toBe('Roof 2 over Middle level')
  })
})

describe('levels whose ceilings line up', () => {
  it('finds none until a ceiling is lined up with another', () => {
    const p = splitLevels()
    expect(levelsSharingCeiling(p, 'level_low').map(l => l.id)).toEqual(['level_low'])
    expect(ceilingLinedUpWith(p, 'level_low')).toBeUndefined()
  })

  it('sets the ceiling height that lines one level up with another', () => {
    let p = splitLevels()
    // Lower floor RL 82; the middle level's ceiling is at 83.2 + 2.7 = 85.9.
    const h = ceilingHeightToMatch(p, 'level_low', 'level_mid')
    expect(h).toBeCloseTo(3.9, 9)
    p = updateLevel(p, 'level_low', { height: h! })
    expect(ceilingRL(p, 'level_low')).toBeCloseTo(ceilingRL(p, 'level_mid'), 9)
    expect(ceilingLinedUpWith(p, 'level_low')?.id).toBe('level_mid')
    expect(levelsSharingCeiling(p, 'level_mid').map(l => l.id)).toEqual(['level_mid', 'level_low'])
    // A ceiling below the floor it would sit over can't be lined up.
    expect(ceilingHeightToMatch(p, 'level_top', 'level_low')).toBeNull()
  })

  it('puts one roof over both: Roof this building takes the walls of every level whose ceiling lines up', () => {
    let p = splitLevels()
    p = updateLevel(p, 'level_low', { height: ceilingHeightToMatch(p, 'level_low', 'level_mid')! })
    // A click inside the lower wing gets the outline of both wings together, y 0 to 12.
    const outline = outlineAround(wallsUnderRoofline(p, 'level_low'), [4, 3])!
    expect(outline).not.toBeNull()
    expect(pointInPolygon(4, 9, outline)).toBe(true)
    expect(pointInPolygon(4, 3, outline)).toBe(true)
    // Without lining up, it's only the lower wing.
    const alone = outlineAround(wallsUnderRoofline(splitLevels(), 'level_low'), [4, 3])!
    expect(pointInPolygon(4, 9, alone)).toBe(false)
    // That roof shows on the middle level's plan too.
    p = addRoof(p, 'level_low', outline, DEFAULTS)
    expect(roofsOverLevel(p, 'level_mid').map(r => r.level)).toEqual(['level_low'])
    expect(roofsOverLevel(splitLevels(), 'level_mid')).toEqual([])
    expect(roofEavesRL(p, p.roofs[0])).toBeCloseTo(floorRL(p, 'level_mid') + 2.7, 9)
  })
})
