// Storeys over each other: a roof moves up when a level goes on over it, a roof left under a
// storey is flagged and not counted, storey heights are checked against each other, new levels
// are named by where they are, and deleting the level under another says what it leaves.
// Uses the made-up plans in fixtures.ts only.

import { beforeEach, describe, expect, it } from 'vitest'
import { questionsFor } from '../../flow/questions'
import { useSafety } from '../../safety/store'
import { deleteLevelWithReview } from '../editActions'
import { FLOOR_STRUCTURE, floorRL, normalizePlan, type Plan, type Roof, type Wall } from '../model'
import { addLevelAbove, addLevelAt, addLevelBelow, addRoof, deleteLevel, newLevelName, setLevelRL, updateLevel } from '../ops'
import { designQuantities } from '../quantities'
import { levelOutlines } from '../roof'
import { coveredRoofs, moveRoofUp, roofCoveredBy, roofEavesRL, roofTarget } from '../roofline'
import { levelLeftAbove, levelsStacked, storeyWarnings } from '../storeys'
import { usePlan } from '../store'
import { garageFloor, splitLevels } from './fixtures'

const G = 'level_ground'
const HIP = { type: 'hip' as const, pitch: 22.5, overhang: 0.45 }

/** A made-up box house: four 270 mm outside walls, 10 × 8 m, on the test garage's block (ground floor RL 84). */
function boxHouse(): Plan {
  const ring: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ]
  const walls = ring.map((a, i): Wall => ({ id: `box_${i}`, level: G, a, b: ring[(i + 1) % 4], thickness: 0.27, kind: 'external' }))
  return normalizePlan({ ...garageFloor(), walls, openings: [], rooms: [{ id: 'r1', level: G, name: 'Living', at: [5, 4] }], areas: [] })
}

/** The box house with a hip roof over all of its walls. */
function roofed(): Plan {
  const p = boxHouse()
  return addRoof(p, G, levelOutlines(p.walls)[0], HIP)
}

describe('adding a level above a roofed one', () => {
  it('moves the roof up onto the new level in the same step, and says how many moved', () => {
    const before = roofed()
    const { plan, id, roofsMoved } = addLevelAbove(before)
    expect(roofsMoved).toBe(1)
    expect(plan.roofs).toHaveLength(1)
    expect(plan.roofs[0].level).toBe(id)
    // It sits on the new storey's walls: its eaves are the new ceiling.
    expect(roofEavesRL(plan, plan.roofs[0])).toBeCloseTo(floorRL(plan, id) + 2.7, 9)
    expect(coveredRoofs(plan)).toEqual([])
  })

  it('lets go of an eaves RL typed for the old level, and keeps a roofline two moved roofs share', () => {
    const p = roofed()
    const first = p.roofs[0]
    const second: Roof = { ...first, id: 'roof_b', eaves: { roof: first.id } }
    const typed: Plan = { ...p, roofs: [{ ...first, eaves: { rl: 86.9 } }, second] }
    const { plan, id, roofsMoved } = addLevelAbove(typed)
    expect(roofsMoved).toBe(2)
    expect(plan.roofs[0].eaves).toBeUndefined()
    expect(plan.roofs[1].eaves).toEqual({ roof: first.id })
    expect(plan.roofs.every(r => r.level === id)).toBe(true)
  })

  it('leaves a roof the new storey doesn’t cover where it is, and adds nothing to say', () => {
    // A roof over only part of the house's outline, reaching past the walls: not wholly under the new storey.
    const p = boxHouse()
    const porch = addRoof(p, G, [[-3, 0], [3, 0], [3, 3], [-3, 3]], HIP)
    const { plan, roofsMoved } = addLevelAbove(porch)
    expect(roofsMoved).toBe(0)
    expect(plan.roofs[0].level).toBe(G)
    expect(addLevelAbove(p).roofsMoved).toBe(0)
  })

  it('is one undo step with the level', () => {
    const st = usePlan.getState()
    st.load(roofed())
    st.commit(p => addLevelAbove(p).plan)
    expect(usePlan.getState().plan!.roofs[0].level).not.toBe(G)
    usePlan.getState().undo()
    expect(usePlan.getState().plan!.levels).toHaveLength(1)
    expect(usePlan.getState().plan!.roofs[0].level).toBe(G)
  })
})

describe('a roof left under the storey above', () => {
  // The upper storey added first, then a roof put on the ground floor under all of it.
  const buried = (): Plan => {
    const up = addLevelAbove(boxHouse()).plan
    return addRoof(up, G, levelOutlines(up.walls.filter(w => w.level === G))[0], HIP)
  }

  it('is found, with the level over it', () => {
    const p = buried()
    expect(roofCoveredBy(p, p.roofs[0])?.name).toBe('First floor')
    expect(coveredRoofs(p).map(c => c.under.name)).toEqual(['First floor'])
    // On the top level it's in the open.
    const top = { ...p, roofs: [{ ...p.roofs[0], level: p.levels[1].id }] }
    expect(roofCoveredBy(top, top.roofs[0])).toBeUndefined()
    // Matched to the upper ceiling, it's the upper storey's roof in all but name.
    const matched = { ...p, roofs: [{ ...p.roofs[0], eaves: { level: p.levels[1].id } }] }
    expect(roofCoveredBy(matched, matched.roofs[0])).toBeUndefined()
  })

  it('isn’t found for split levels side by side, or a lower roof that reaches past the storey above', () => {
    const s = normalizePlan(splitLevels())
    // A roof over the middle wing, beside the top level (which is over the lower wing).
    const mid = addRoof(s, 'level_mid', [[0, 6], [8, 6], [8, 12], [0, 12]], HIP)
    expect(coveredRoofs(mid)).toEqual([])
    // A roof on the lower level over both wings' footprint: only half of it is under the top level.
    const wide = addRoof(s, 'level_low', [[0, 0], [8, 0], [8, 12], [0, 12]], HIP)
    expect(coveredRoofs(wide)).toEqual([])
    // Over the lower wing alone, the top level covers all of it.
    const under = addRoof(s, 'level_low', [[0, 0], [8, 0], [8, 6], [0, 6]], HIP)
    expect(coveredRoofs(under).map(c => c.under.id)).toEqual(['level_top'])
  })

  it('moves up onto the storey over it, sitting on that storey’s walls', () => {
    const p = buried()
    const up = moveRoofUp(p, p.roofs[0].id)
    expect(up.roofs[0].level).toBe(p.levels[1].id)
    expect(coveredRoofs(up)).toEqual([])
    // A roof in the open stays put.
    expect(moveRoofUp(up, up.roofs[0].id)).toBe(up)
  })

  it('is never made by Roof this building: a click under a storey roofs the top storey over it', () => {
    const up = addLevelAbove(boxHouse()).plan
    const top = up.levels[1].id
    expect(roofTarget(up, G, [5, 4])?.level).toBe(top)
    expect(roofTarget(up, top, [5, 4])?.level).toBe(top)
    // One storey: its own walls. Outside any walls: nothing.
    expect(roofTarget(boxHouse(), G, [5, 4])?.level).toBe(G)
    expect(roofTarget(up, G, [50, 40])).toBeNull()
    // Split levels: the lower wing is under the top level; the middle wing beside it is in the open.
    const s = normalizePlan(splitLevels())
    expect(roofTarget(s, 'level_low', [4, 3])?.level).toBe('level_top')
    expect(roofTarget(s, 'level_mid', [4, 9])?.level).toBe('level_mid')
  })

  it('isn’t counted in the quantities the estimate prices', () => {
    const p = buried()
    const q = designQuantities(p, null, [])
    expect(q.roofs.count).toBe(0)
    expect(q.roofs.area).toBe(0)
    const open = designQuantities(addLevelAbove(roofed()).plan, null, [])
    expect(open.roofs.count).toBe(1)
    expect(open.roofs.area).toBeGreaterThan(90)
  })
})

describe('storey heights against each other', () => {
  const two = (): Plan => addLevelAbove(boxHouse()).plan
  const ids = (p: Plan, level: string) => storeyWarnings(p, level).map(w => `${w.tone}:${w.id.split(':')[0]}`)

  it('says nothing for a storey with the usual heights', () => {
    const p = two()
    expect(storeyWarnings(p, G)).toEqual([])
    expect(storeyWarnings(p, p.levels[1].id)).toEqual([])
  })

  it('flags a ceiling above the next floor, on both levels', () => {
    const p = two()
    const up = p.levels[1].id
    const tall = updateLevel(p, G, { height: 3.3 })
    expect(ids(tall, G)).toEqual(['bad:ceiling-over'])
    expect(storeyWarnings(tall, G)[0].text).toContain('300 mm above First floor’s floor (RL 87.00)')
    expect(storeyWarnings(tall, G)[0].text).toContain('Bring the ceiling down to 2700 mm or less')
    expect(ids(tall, up)).toEqual(['bad:floor-in'])
  })

  it('flags an upper floor set inside the storey below', () => {
    const p = two()
    const up = p.levels[1].id
    // Ground floor RL 84, ceiling RL 86.70: the upper floor at RL 85.90 is 800 mm below it.
    const sunk = setLevelRL(p, up, 85.9)
    expect(ids(sunk, up)).toEqual(['bad:floor-in'])
    expect(storeyWarnings(sunk, up)[0].text).toContain('800 mm below Ground floor’s ceiling (RL 86.70)')
    expect(storeyWarnings(sunk, up)[0].text).toContain('Raise it to RL 87.00 or more')
  })

  it('warns when there’s too little room for the floor’s structure', () => {
    const p = two()
    const tight = updateLevel(p, G, { height: 2.9 })
    expect(ids(tight, G)).toEqual(['warn:thin-over'])
    expect(storeyWarnings(tight, G)[0].text).toContain('Only 100 mm between its ceiling and First floor’s floor above')
    expect(ids(tight, p.levels[1].id)).toEqual(['warn:thin-under'])
  })

  it('warns under 2400 mm, and says no under 2100 mm', () => {
    const p = boxHouse()
    expect(ids(updateLevel(p, G, { height: 2.4 }), G)).toEqual([])
    expect(ids(updateLevel(p, G, { height: 2.3 }), G)).toEqual(['warn:low-ceiling'])
    expect(ids(updateLevel(p, G, { height: 1.8 }), G)).toEqual(['bad:low-ceiling'])
  })

  it('leaves split levels side by side alone: a floor part-way up the wing beside it is what a split level is', () => {
    const s = normalizePlan(splitLevels())
    expect(levelsStacked(s, 'level_low', 'level_mid')).toBe(false)
    expect(levelsStacked(s, 'level_low', 'level_top')).toBe(true)
    expect(storeyWarnings(s, 'level_mid')).toEqual([])
    expect(storeyWarnings(s, 'level_low')).toEqual([])
    // A level with no walls yet can't be told either way.
    const empty = addLevelAt(s, 83).plan
    expect(storeyWarnings(empty, empty.levels.at(-1)!.id)).toEqual([])
  })
})

describe('what a new level is called', () => {
  it('says where it is', () => {
    const one = normalizePlan(garageFloor())
    const up = addLevelAbove(one)
    expect(up.plan.levels.at(-1)!.name).toBe('First floor')
    expect(addLevelAbove(up.plan).plan.levels.at(-1)!.name).toBe('Second floor')
    const below = addLevelBelow(one)
    expect(below.plan.levels.at(-1)!.name).toBe('Lower floor')
    expect(addLevelBelow(below.plan).plan.levels.at(-1)!.name).toBe('Basement level')
    const beside = addLevelAt(one, 85.2)
    expect(beside.plan.levels.at(-1)!.name).toBe('Split level')
    expect(addLevelAt(beside.plan, 86).plan.levels.at(-1)!.name).toBe('Split level 2')
  })

  it('never repeats a name a level already has', () => {
    const p = normalizePlan(garageFloor())
    const taken: Plan = { ...p, levels: [...p.levels, { id: 'x', name: 'first floor', elevation: 3, height: 2.7 }] }
    expect(newLevelName(taken, 'above')).toBe('Second floor')
    expect(newLevelName(p, 'below')).toBe('Lower floor')
  })
})

describe('deleting the level under another', () => {
  const plan = () => usePlan.getState().plan!
  const two = (): Plan => addLevelAbove(roofed()).plan

  beforeEach(() => useSafety.setState({ review: null, toast: null }))

  it('knows the level that would be left in the air', () => {
    const p = two()
    expect(levelLeftAbove(p, G)).toMatchObject({ level: { name: 'First floor' }, drop: 3 })
    // Deleting the upper level leaves nothing in the air.
    expect(levelLeftAbove(p, p.levels[1].id)).toBeNull()
    // A split level beside the lowest sits on its own ground: it isn't left in the air.
    const s = normalizePlan(splitLevels())
    expect(levelLeftAbove(s, 'level_low')).toBeNull()
    const noTop = deleteLevel(s, 'level_mid')
    expect(levelLeftAbove(noTop, 'level_low')).toMatchObject({ level: { name: 'Top level' }, drop: 3 })
  })

  it('brings the level left down to where the deleted floor was, with its roof and the levels above', () => {
    const p = addLevelAbove(two()).plan
    const lowered = deleteLevel(p, G, true)
    expect(lowered.levels.map(l => [l.name, l.elevation])).toEqual([
      ['Ground floor', 0],
      ['Second floor', 3],
    ])
    expect(floorRL(lowered)).toBe(84)
    // Left where it was, it keeps its height and its name.
    const kept = deleteLevel(p, G)
    expect(kept.levels.map(l => [l.name, l.elevation])).toEqual([
      ['First floor', 3],
      ['Second floor', 6],
    ])
    expect(FLOOR_STRUCTURE).toBe(0.3)
  })

  it('says so in the review, offers to bring it down, and undoes in one step', async () => {
    usePlan.getState().load(two())
    usePlan.getState().setActiveLevel(G)
    const done = deleteLevelWithReview(G)
    const review = useSafety.getState().review!
    expect(review.warning).toBe('First floor is built over Ground floor. Without it, First floor is the lowest level, 3.00 m above where Ground floor’s floor is now.')
    expect(review.choices?.map(c => c.label)).toEqual(['Bring it down to RL 84.00', 'Leave it at RL 87.00'])
    expect(review.choice).toBe('lower')
    review.answer('lower')
    expect(await done).toBe(true)
    expect(plan().levels.map(l => l.name)).toEqual(['Ground floor'])
    expect(floorRL(plan())).toBe(84)
    // The plan shows the level that's left.
    expect(usePlan.getState().activeLevel).toBe(plan().levels[0].id)
    expect(useSafety.getState().toast!.text).toBe('Ground floor deleted, and First floor brought down to RL 84.00')
    useSafety.getState().toast!.undo!()
    expect(plan().levels.map(l => l.name)).toEqual(['Ground floor', 'First floor'])
    expect(usePlan.getState().activeLevel).toBe(G)
  })

  it('leaves it where it is when asked to', async () => {
    usePlan.getState().load(two())
    const done = deleteLevelWithReview(G)
    useSafety.getState().review!.answer('keep')
    expect(await done).toBe(true)
    expect(plan().levels.map(l => [l.name, l.elevation])).toEqual([['First floor', 3]])
  })

  it('asks nothing more when the level deleted has nothing over it', async () => {
    usePlan.getState().load(two())
    const up = plan().levels[1].id
    const done = deleteLevelWithReview(up)
    const review = useSafety.getState().review!
    expect(review.warning).toBeUndefined()
    expect(review.choices).toBeUndefined()
    review.answer('ok')
    expect(await done).toBe(true)
    expect(plan().levels).toHaveLength(1)
  })
})

describe('a split level on the ground with no floor type yet', () => {
  it('keeps its question waiting in the list, through a reload, and says it builds framed until then', () => {
    const s = normalizePlan({ ...splitLevels(), floorsByLevel: true })
    const ask = (onGround?: Set<string>, dismissed = new Set<string>()) =>
      questionsFor({ plan: s, level: 'level_low', street: false, ask: null, dismissed, onGround, offer: null, hints: { hidden: [], off: true }, facts: 0 })
    // Without the ground known, only the lowest level is asked.
    expect(ask().map(q => q.id)).toEqual(['floor-type:level_low'])
    // The middle wing sits on the ground beside it: it's asked too, with nothing held in memory.
    expect(ask(new Set(['level_low', 'level_mid'])).map(q => q.id)).toEqual(['floor-type:level_low', 'floor-type:level_mid'])
    expect(ask(new Set(['level_mid']), new Set(['level_mid'])).find(q => q.level === 'level_mid')!.detail).toBe('Put off for now. It builds as a framed floor until it’s set.')
  })
})
