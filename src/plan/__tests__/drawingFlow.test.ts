// The stair panel's words and NCC limits, and the drawing flow's small fixes: paste in place on
// another level, Undo that shows the level it changed, gable ends that say when they hip a
// neighbour, the cut under a floor on piers below the ground, and earth against a wall. Uses the
// made-up plans in fixtures.ts only.

import { beforeEach, describe, expect, it } from 'vitest'
import { useSafety } from '../../safety/store'
import { copySelected, forgetCopied, pasteCopied } from '../editActions'
import { earthAgainstWall } from '../keyNumbers'
import { floorRL, normalizePlan, type Stair } from '../model'
import { addLevelAbove, updateLevel, updateStair } from '../ops'
import { cutUnderPiers } from '../platforms'
import { toggleGable } from '../roof'
import { stairJoins, stairPlanTag, stairRules } from '../stairs'
import { usePlan } from '../store'
import { levelsChanged } from '../undoLevel'
import { garageFloor, splitLevels } from './fixtures'

const plan = () => usePlan.getState().plan!

describe('the stair panel', () => {
  const p = splitLevels()
  const s = p.stairs[0]

  it('says which levels a stair joins, and its risers', () => {
    expect(stairJoins(p, s)).toEqual({ from: 'Lower level 82.00', to: 'Middle level 83.20', risers: '7 risers of 171.4 mm', joined: true })
  })

  it('says an RL where an end isn’t on a floor', () => {
    const loose: Stair = { ...s, toLevel: null, rise: 1 }
    const j = stairJoins(p, loose)
    expect(j.to).toBe('RL 83.00')
    expect(j.joined).toBe(false)
    expect(stairJoins(p, { ...s, base: -0.4, rise: 1.6 }).from).toBe('RL 81.60 (Lower level)')
  })

  it('puts the risers and where it goes on the plan, both ways', () => {
    expect(stairPlanTag(p, s, false)).toBe('7R to Middle level')
    expect(stairPlanTag(p, s, true)).toBe('7R to Lower level')
  })

  it('checks the NCC’s riser, going and 2R + G limits', () => {
    const ok = stairRules(s)
    expect(ok.map(r => [r.id, r.ok])).toEqual([
      ['riser', true],
      ['going', true],
      ['twoRG', true],
    ])
    expect(Math.round(ok[2].value * 1000)).toBe(593)
    // A 190 mm riser is in; a going of 230 mm isn't, nor are risers of 100 mm.
    expect(stairRules({ ...s, rise: 2.66 })[0].ok).toBe(true)
    expect(stairRules({ ...s, going: 0.23 })[1].ok).toBe(false)
    expect(stairRules({ ...s, rise: 0.2 })[0].ok).toBe(false)
    expect(stairRules({ ...s, going: 0.4 })[2].ok).toBe(false)
  })
})

describe('paste on another level', () => {
  beforeEach(() => {
    usePlan.getState().load(normalizePlan({ ...garageFloor(), name: 'Sample house' }))
    forgetCopied()
    useSafety.setState({ review: null, toast: null, busy: false })
  })

  it('lands in the same place on another floor, and says so', () => {
    const added = addLevelAbove(plan())
    usePlan.getState().commit(() => added.plan)
    usePlan.getState().select({ type: 'room', id: 'r1' })
    copySelected()
    usePlan.getState().setActiveLevel(added.id)
    pasteCopied()
    const pasted = plan().rooms.find(r => r.id === usePlan.getState().selection!.id)!
    expect(pasted.level).toBe(added.id)
    expect(pasted.at).toEqual(plan().rooms.find(r => r.id === 'r1')!.at)
    expect(useSafety.getState().toast?.text).toBe('Pasted in place on First floor.')
  })

  it('pastes in place on the same floor with Shift, and a little off without', () => {
    usePlan.getState().select({ type: 'room', id: 'r1' })
    copySelected()
    const at = plan().rooms.find(r => r.id === 'r1')!.at
    pasteCopied(true)
    expect(plan().rooms.find(r => r.id === usePlan.getState().selection!.id)!.at).toEqual(at)
    pasteCopied()
    expect(plan().rooms.find(r => r.id === usePlan.getState().selection!.id)!.at[0]).toBeCloseTo(at[0] + 0.3, 9)
  })
})

describe('Undo on another level', () => {
  beforeEach(() => {
    usePlan.getState().load(normalizePlan(splitLevels()))
    useSafety.setState({ review: null, toast: null, busy: false })
  })

  it('finds the levels a step changed', () => {
    const p = plan()
    expect(levelsChanged(p, p)).toEqual([])
    const moved = updateStair(p, 'stair_up', { going: 0.26 })
    expect(levelsChanged(p, moved)).toEqual(['level_low'])
    expect(levelsChanged(p, updateLevel(p, 'level_top', { height: 2.4 }))).toEqual(['level_top'])
    const door = { ...p, openings: [{ id: 'd', wall: 'mid_0', kind: 'door' as const, offset: 2, width: 0.82, height: 2.04, sill: 0, flipHinge: false, flipSwing: false }] }
    expect(levelsChanged(p, door)).toEqual(['level_mid'])
    expect(levelsChanged(p, { ...p, placement: { ...p.placement, e: 1 } })).toEqual([])
  })

  it('goes to the level it changed, and says so', async () => {
    await import('../undoLevel')
    const st = usePlan.getState()
    st.setActiveLevel('level_mid')
    st.commit(p => updateLevel(p, 'level_top', { height: 2.4 }))
    st.setActiveLevel('level_low')
    usePlan.getState().undo()
    expect(usePlan.getState().activeLevel).toBe('level_top')
    expect(useSafety.getState().toast?.text).toBe('Undone on Top level, so it’s showing now.')
    // A step on the level shown stays quiet.
    useSafety.setState({ toast: null })
    usePlan.getState().redo()
    expect(usePlan.getState().activeLevel).toBe('level_top')
    expect(useSafety.getState().toast).toBeNull()
  })
})

describe('gable ends', () => {
  it('hips the ends either side of a new gable, and counts them', () => {
    expect(toggleGable([true, false, true, false], 4, 1)).toEqual({ gables: [false, true, false, false], hipped: 2 })
    expect(toggleGable([false, false, true, false], 4, 0)).toEqual({ gables: [true, false, true, false], hipped: 0 })
    expect(toggleGable([true, false, false, false], 4, 0)).toEqual({ gables: [false, false, false, false], hipped: 0 })
  })
})

describe('the ground against a floor', () => {
  const p = garageFloor()
  const flat = (rl: number) => ({ sample: () => rl })
  const floor = floorRL(p)
  const study: [number, number][] = [
    [5.6, 0.3],
    [9.8, 0.3],
    [9.8, 2.9],
    [5.6, 2.9],
  ]

  it('says how deep a floor on piers has to be dug out under, with the framing and the gap', () => {
    // Floor 84, framing 300, gap 400: the ground must be at RL 83.3 or lower.
    expect(cutUnderPiers(p, [study], [0, 0], flat(83.3))).toBeCloseTo(0, 9)
    expect(cutUnderPiers(p, [study], [0, 0], flat(84.5))).toBeCloseTo(1.2, 9)
    expect(cutUnderPiers(p, [study], [0, 0], flat(82))).toBe(0)
  })

  it('finds how far the ground comes up a wall', () => {
    const wall = p.walls.find(w => w.id === 'south')!
    // Ground rising to the south (−y), read 200 mm out from the face (y −0.2): RL 84.4.
    const slope = ([, y]: [number, number]) => 84 - y * 2
    expect(earthAgainstWall(wall, floor, slope)).toBeCloseTo(0.4, 6)
    expect(earthAgainstWall(wall, floor, () => 83)).toBeCloseTo(-1, 9)
  })
})
