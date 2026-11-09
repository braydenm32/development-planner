import { describe, expect, it } from 'vitest'
import type { Wall } from '../model'
import { MIN_SHARED, nextInStack, pickFromStack, stackNotice, wallsSharing, wallStackAt } from '../wallStack'

const wall = (id: string, a: [number, number], b: [number, number], kind: Wall['kind'] = 'external', thickness = 0.25, level = 'g'): Wall => ({
  id,
  level,
  a,
  b,
  thickness,
  kind,
})

const house = wall('house', [0, 0], [10, 0])
const under = wall('under', [2, 0.05], [8, 0.05], 'retaining', 0.2)
const inner = wall('inner', [4, -0.1], [6, -0.1], 'internal', 0.09)

describe('walls on one another', () => {
  it('lists the walls under a point with the one drawn on top first', () => {
    const stack = wallStackAt([house, under, inner], w => w.id !== 'inner')
    expect(stack.map(w => w.id)).toEqual(['under', 'house'])
  })

  it('leaves out a wall that only meets the top one at a corner', () => {
    const corner = wall('corner', [10, 0], [10, 5])
    expect(wallStackAt([house, corner], () => true).map(w => w.id)).toEqual(['corner'])
    expect(wallStackAt([house, under, corner], () => true).map(w => w.id)).toEqual(['corner'])
    expect(wallStackAt([corner, house, under], () => true).map(w => w.id)).toEqual(['under', 'house'])
  })

  it('picks the selected wall when it is in the stack, else the top one', () => {
    const stack = [under, house]
    expect(pickFromStack(stack, undefined)?.id).toBe('under')
    expect(pickFromStack(stack, 'house')?.id).toBe('house')
    expect(pickFromStack(stack, 'elsewhere')?.id).toBe('under')
    expect(pickFromStack([], 'house')).toBeUndefined()
  })

  it('steps through the stack and round again', () => {
    const stack = [inner, under, house]
    expect(nextInStack(stack, 'inner')?.id).toBe('under')
    expect(nextInStack(stack, 'under')?.id).toBe('house')
    expect(nextInStack(stack, 'house')?.id).toBe('inner')
    expect(nextInStack([], 'house')).toBeUndefined()
  })

  it('says how many walls are here and which is selected, and nothing for one wall', () => {
    expect(stackNotice([house], 'house')).toBeNull()
    expect(stackNotice([under, house], 'house')).toBe(
      '2 walls here (retaining wall and external wall). Selected the external wall, 2 of 2. Click it again for the next.',
    )
    expect(stackNotice([inner, under, house], 'inner')).toContain('(internal wall, retaining wall and external wall)')
  })
})

describe('walls sharing a selected wall', () => {
  it('finds a wall running along it, over or under', () => {
    expect(wallsSharing([house, under, inner], house).map(w => w.id)).toEqual(['under', 'inner'])
    expect(wallsSharing([house, under], under).map(w => w.id)).toEqual(['house'])
  })

  it('leaves out walls meeting it at a corner or a T, beside it, or on another level', () => {
    const corner = wall('corner', [10, 0], [10, 5])
    const tee = wall('tee', [5, 0], [5, 4], 'internal', 0.09)
    const beside = wall('beside', [0, 1], [10, 1])
    const upstairs = wall('upstairs', [0, 0], [10, 0], 'external', 0.25, 'first')
    expect(wallsSharing([house, corner, tee, beside, upstairs], house)).toEqual([])
  })

  it('counts an overlap from MIN_SHARED along the wall', () => {
    const short = wall('short', [9.9 - MIN_SHARED, 0], [10.5, 0], 'retaining')
    const tiny = wall('tiny', [9.95, 0], [10.5, 0], 'retaining')
    expect(wallsSharing([house, short, tiny], house).map(w => w.id)).toEqual(['short'])
  })
})
