// The level being drawn on never goes missing: Undo, Redo and a level delete move to the nearest
// level left, and things saved on a level the plan no longer has come back on one it has.
// Uses the made-up plans in fixtures.ts only.

import { beforeEach, describe, expect, it } from 'vitest'
import { useSafety } from '../../safety/store'
import { adoptOrphans, normalizePlan, type Plan } from '../model'
import { addLevelAbove, addWall, deleteLevel } from '../ops'
import { levelStillThere, usePlan } from '../store'
import { garageFloor, splitLevels } from './fixtures'

const st = () => usePlan.getState()

describe('the level being drawn on', () => {
  beforeEach(() => {
    st().load(normalizePlan(garageFloor()))
    useSafety.setState({ toast: null })
  })

  it('goes back to a level that exists when Undo takes its level away, and says so', async () => {
    await import('../undoLevel')
    let id = ''
    st().commit(p => {
      const r = addLevelAbove(p)
      id = r.id
      return r.plan
    })
    st().setActiveLevel(id)
    st().undo()
    expect(st().activeLevel).toBe('level_ground')
    expect(useSafety.getState().toast?.text).toBe('Undone: First floor is gone, so Ground floor is showing now.')
    // Redo brings the level back and shows it, as any step on another level does.
    st().redo()
    expect(st().activeLevel).toBe(id)
    // A wall drawn now is on a level the plan has.
    st().commit(p => addWall(p, st().activeLevel, [20, 0], [24, 0], { kind: 'external', thickness: 0.27 }))
    expect(st().plan!.walls.every(w => st().plan!.levels.some(l => l.id === w.level))).toBe(true)
  })

  it('moves to the nearest level by height when Redo deletes the one showing', () => {
    st().load(normalizePlan(splitLevels()))
    st().setActiveLevel('level_mid')
    st().commit(p => deleteLevel(p, 'level_mid'))
    // Middle (1.2 m up) is nearer the lower level (0) than the top (3.0).
    expect(st().activeLevel).toBe('level_low')
    st().undo()
    st().setActiveLevel('level_mid')
    st().redo()
    expect(st().activeLevel).toBe('level_low')
    expect(st().selection).toBeNull()
  })

  it('picks the nearest level left', () => {
    const p = splitLevels()
    const without = (id: string): Plan => deleteLevel(p, id)
    expect(levelStillThere(without('level_top'), p, 'level_top')).toBe('level_mid')
    expect(levelStillThere(without('level_low'), p, 'level_low')).toBe('level_mid')
    expect(levelStillThere(p, p, 'level_top')).toBe('level_top')
  })
})

describe('things on a level the plan no longer has', () => {
  it('come back on the lowest level when the plan opens, and a tidy plan is left alone', () => {
    const p = garageFloor()
    expect(adoptOrphans(p)).toBe(p)
    const lost: Plan = { ...p, walls: [...p.walls, { id: 'stray', level: 'level_gone', a: [20, 0], b: [24, 0], thickness: 0.27, kind: 'external' }] }
    const opened = normalizePlan(lost)
    expect(opened.walls.find(w => w.id === 'stray')?.level).toBe('level_ground')
    expect(opened.walls).toHaveLength(lost.walls.length)
  })

  it('are never made: a wall added on a missing level lands on one that exists', () => {
    st().load(normalizePlan(garageFloor()))
    st().commit(p => addWall(p, 'level_gone', [20, 0], [24, 0], { kind: 'external', thickness: 0.27 }))
    expect(st().plan!.walls.at(-1)?.level).toBe('level_ground')
  })
})
