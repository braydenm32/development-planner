// Clicking a room's floor with the Select tool (CB-06): what lies under the point, and the order
// clicks go through it. Uses the made-up split level in fixtures.ts.

import { describe, expect, it } from 'vitest'
import { floorStack, menuPick, nextOnFloor } from '../floorPick'
import { planarFaces } from '../geometry'
import { addRoof } from '../ops'
import type { Selection } from '../store'
import { splitLevels } from './fixtures'

const MID = 'level_mid'
const base = splitLevels()
// The middle wing: a room, the slab drawn under it, and a hip roof with 450 mm eaves over it.
const plan = addRoof(base, MID, [[0, 6], [8, 6], [8, 12], [0, 12]], { type: 'hip', pitch: 22.5, overhang: 0.45 })
const roof = plan.roofs.at(-1)!
const faces = planarFaces(plan.walls.filter(w => w.level === MID))
const at = (x: number, y: number) => floorStack(plan, MID, faces, plan.roofs.filter(r => r.level === MID), [x, y], 0.1)

describe('a click on a floor', () => {
  it('finds the room anywhere on its floor, well away from its label, then its slab and its roof', () => {
    expect(at(1, 7)).toEqual([
      { type: 'room', id: 'r_mid' },
      { type: 'area', id: 'mid_slab' },
      { type: 'roof', id: roof.id },
    ])
    expect(at(7.5, 11.5)[0]).toEqual({ type: 'room', id: 'r_mid' })
  })

  it('finds only the roof out under the eaves, and nothing beyond them', () => {
    expect(at(8.3, 9)).toEqual([{ type: 'roof', id: roof.id }])
    expect(at(12, 9)).toEqual([])
  })

  it('finds no room where the walls don’t close, or where the closed space has no room', () => {
    const open = faces.filter(() => false)
    expect(floorStack(plan, MID, open, [], [1, 7], 0.1)).toEqual([{ type: 'area', id: 'mid_slab' }])
    expect(floorStack({ ...plan, rooms: [] }, MID, faces, [], [1, 7], 0.1)).toEqual([{ type: 'area', id: 'mid_slab' }])
    // Another level's room at the same spot isn't this floor's.
    expect(floorStack(plan, 'level_low', planarFaces(plan.walls.filter(w => w.level === 'level_low')), [], [4, 3], 0.1)).toEqual([{ type: 'room', id: 'r_low' }])
  })

  it('goes room, slab, roof and round again on each further click', () => {
    const stack = at(1, 7)
    const picked = (sel: Selection | null) => (s: Selection) => s.id === sel?.id
    let sel: Selection | null = null
    const seen: string[] = []
    for (let i = 0; i < 4; i++) {
      sel = nextOnFloor(stack, picked(sel))
      seen.push(sel!.type)
    }
    expect(seen).toEqual(['room', 'area', 'roof', 'room'])
    expect(nextOnFloor([], () => false)).toBeNull()
  })
})

describe('a right-click on a floor', () => {
  const none = () => false
  it('opens the room’s menu, as a left click picks it, not the empty-space menu', () => {
    expect(menuPick(null, at(1, 7), none)).toEqual({ type: 'room', id: 'r_mid' })
    // The roof over it or the slab under it is what pickAt found: still the room, as a left click.
    expect(menuPick({ type: 'roof', id: roof.id }, at(1, 7), none)).toEqual({ type: 'room', id: 'r_mid' })
  })
  it('keeps the slab or roof already picked there, and anything else that was hit', () => {
    const slab = { type: 'area' as const, id: 'mid_slab' }
    expect(menuPick(slab, at(1, 7), s => s.id === 'mid_slab')).toEqual(slab)
    expect(menuPick({ type: 'wall', id: 'w1' }, at(1, 7), none)).toEqual({ type: 'wall', id: 'w1' })
  })
  it('is bare ground beyond the house', () => {
    expect(menuPick(null, at(12, 9), none)).toBeNull()
  })
})
