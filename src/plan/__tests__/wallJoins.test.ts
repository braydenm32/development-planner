// Typed wall lengths that keep the plan square, walls that butt into a moved wall following it,
// inside walls told from outside ones, and a wall drawn on top of another. Made-up boxes only.

import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import { translateSelection } from '../editing'
import { planarFaces } from '../geometry'
import { emptyPlan, wallLength, type Plan, type Wall, type WallKind } from '../model'
import { addLevelAbove, addOpening, addWall, moveJoint, moveWall, setWallKind, setWallLength, wallAlreadyThere, wallStyleAt } from '../ops'
import { insideHouse, stillerEnd, wallLengthProblem } from '../wallJoins'

const L = 'level_ground'
const ext: { kind: WallKind; thickness: number } = { kind: 'external', thickness: 0.27 }
const int: { kind: WallKind; thickness: number } = { kind: 'internal', thickness: 0.11 }
const wall = (id: string, a: Vec2, b: Vec2, style = ext): Wall => ({ id, level: L, a, b, ...style })

/** A 10 × 8 m box: south, east, north and west walls, drawn round anticlockwise. */
function box(): Plan {
  return {
    ...emptyPlan({ e: 0, n: 0, rotation: 0, ffl: 80 }),
    walls: [wall('s', [0, 0], [10, 0]), wall('e', [10, 0], [10, 8]), wall('n', [10, 8], [0, 8]), wall('w', [0, 8], [0, 0])],
  }
}

/** The box with a wall down the middle (x = 5) and one across its east half (y = 4), a T at each end. */
function rooms(): Plan {
  const p = box()
  return { ...p, walls: [...p.walls, wall('mid', [5, 0], [5, 8], int), wall('cross', [5, 4], [10, 4], int)] }
}

const by = (p: Plan, id: string) => p.walls.find(w => w.id === id)!
const square = (p: Plan) => p.walls.every(w => Math.abs(w.a[0] - w.b[0]) < 1e-9 || Math.abs(w.a[1] - w.b[1]) < 1e-9)
const close = (p: Vec2, q: Vec2) => {
  expect(p[0]).toBeCloseTo(q[0], 6)
  expect(p[1]).toBeCloseTo(q[1], 6)
}

describe('typing a wall’s length (CB-01)', () => {
  it('keeps a rectangle a rectangle: the wall at the moving end slides, the parallel one stretches', () => {
    const p = setWallLength(box(), 'n', 12)
    expect(square(p)).toBe(true)
    expect(wallLength(by(p, 'n'))).toBeCloseTo(12, 9)
    expect(wallLength(by(p, 's'))).toBeCloseTo(12, 9)
    expect(wallLength(by(p, 'e'))).toBeCloseTo(8, 9)
    expect(wallLength(by(p, 'w'))).toBeCloseTo(8, 9)
    // Then the side wall, shorter.
    const q = setWallLength(p, 'e', 6)
    expect(square(q)).toBe(true)
    expect(wallLength(by(q, 'e'))).toBeCloseTo(6, 9)
    expect(wallLength(by(q, 'w'))).toBeCloseTo(6, 9)
    expect(wallLength(by(q, 'n'))).toBeCloseTo(12, 9)
  })

  it('moves the end asked for and leaves the other where it was', () => {
    const a = setWallLength(box(), 'n', 12, 'a')
    close(by(a, 'n').b, [0, 8])
    close(by(a, 'n').a, [12, 8])
    close(by(a, 'e').a, [12, 0])
    const b = setWallLength(box(), 'n', 12, 'b')
    close(by(b, 'n').a, [10, 8])
    close(by(b, 'n').b, [-2, 8])
    close(by(b, 'w').b, [-2, 0])
    expect(square(a) && square(b)).toBe(true)
  })

  it('carries walls that butt into the sliding wall, and leaves the rest alone', () => {
    const p = setWallLength(rooms(), 's', 12, 'b')
    expect(square(p)).toBe(true)
    // The east wall slid out 2 m; the cross wall stretched to stay on it; the middle wall didn't move.
    close(by(p, 'e').a, [12, 0])
    close(by(p, 'cross').b, [12, 4])
    close(by(p, 'cross').a, [5, 4])
    expect(by(p, 'mid')).toEqual(by(rooms(), 'mid'))
  })

  it('slides the wall it butts into when its T end is the one that moves', () => {
    // The cross wall runs from the middle wall to the east wall: lengthening it pushes the east wall out.
    const p = setWallLength(rooms(), 'cross', 7, 'b')
    expect(square(p)).toBe(true)
    close(by(p, 'cross').b, [12, 4])
    close(by(p, 'e').a, [12, 0])
    close(by(p, 'e').b, [12, 8])
    expect(wallLength(by(p, 'n'))).toBeCloseTo(12, 9)
    expect(wallLength(by(p, 's'))).toBeCloseTo(12, 9)
  })

  it('just moves a free end', () => {
    const base = box()
    const p0 = { ...base, walls: [...base.walls, wall('spur', [5, 0], [5, 3], int)] }
    const p = setWallLength(p0, 'spur', 4)
    close(by(p, 'spur').b, [5, 4])
    expect(p.walls.filter(w => w.id !== 'spur')).toEqual(base.walls)
    // The free end is the one that moves by default: it disturbs nothing else.
    expect(stillerEnd(p0, 'spur')).toBe('b')
    expect(stillerEnd({ ...base, walls: [...base.walls, wall('spur', [5, 3], [5, 0], int)] }, 'spur')).toBe('a')
  })

  it('a wall in line with it takes up the difference, and can’t be squeezed to nothing', () => {
    // The north side in two pieces, with the middle wall coming up to the join.
    const base = box()
    const p0: Plan = { ...base, walls: [...base.walls.filter(w => w.id !== 'n'), wall('n1', [10, 8], [5, 8]), wall('n2', [5, 8], [0, 8]), wall('mid', [5, 0], [5, 8], int)] }
    const p = setWallLength(p0, 'n1', 7, 'b')
    expect(square(p)).toBe(true)
    expect(wallLength(by(p, 'n2'))).toBeCloseTo(3, 9)
    close(by(p, 'mid').a, [3, 0])
    expect(wallLengthProblem(p0, 'n1', 10.5, 'b')).toBe('Max 9950 mm, or a wall joined to it is squeezed to nothing')
    expect(setWallLength(p0, 'n1', 10.5, 'b')).toBe(p0)
  })

  it('keeps doors and windows where they are, and refuses a length that would cut one off', () => {
    let p = box()
    p = addOpening(p, by(p, 'n'), 'garage', 3, { width: 4.8, height: 2.1, sill: 0 })
    p = addOpening(p, by(p, 's'), 'window', 9, { width: 1.2, height: 1.2, sill: 0.9 })
    // The north wall starts at the east; growing it from that end, its door stays put on the plan.
    const grown = setWallLength(p, 'n', 12, 'a')
    expect(grown.openings[0].offset).toBeCloseTo(5, 9)
    // The south wall's start didn't move, so its window's offset is as it was.
    expect(grown.openings[1].offset).toBeCloseTo(9, 9)
    // 4 m is too short for the 4.8 m garage door: said, and nothing changes.
    expect(wallLengthProblem(p, 'n', 4, 'b')).toBe('Min 5535 mm, to keep its garage door in the wall')
    expect(setWallLength(p, 'n', 4, 'b')).toBe(p)
    // From the other end it's the window opposite that gets in the way first.
    expect(wallLengthProblem(p, 'n', 8, 'a')).toBe('Min 9735 mm, to keep the window in a wall that changes with it')
    expect(wallLengthProblem(p, 'n', 9.5, 'b')).toBeNull()
  })
})

describe('walls that butt into a moved wall follow it (DB-07)', () => {
  const faces = (p: Plan) => planarFaces(p.walls).filter(f => f.area > 0).length

  it('dragging the wall a cross wall starts on stretches the cross wall', () => {
    const start = rooms()
    const p = moveWall(start, 'mid', [1, 0], start)
    close(by(p, 'cross').a, [6, 4])
    close(by(p, 'cross').b, [10, 4])
    expect(faces(p)).toBe(3)
  })

  it('dragging the outside wall it ends on keeps the rooms closed', () => {
    const start = rooms()
    const p = moveWall(start, 'e', [1, 0], start)
    close(by(p, 'cross').b, [11, 4])
    expect(faces(p)).toBe(3)
    // And back in again, past where it was.
    const q = moveWall(start, 'e', [-2, 0], start)
    close(by(q, 'cross').b, [8, 4])
  })

  it('nudging or group-moving the wall does the same', () => {
    const p = translateSelection(rooms(), [{ type: 'wall', id: 'e' }], [0.1, 0])
    close(by(p, 'cross').b, [10.1, 4])
    // A wall moved with the one it meets isn't stretched as well.
    const q = translateSelection(rooms(), [{ type: 'wall', id: 'e' }, { type: 'wall', id: 'cross' }], [0, 0.5])
    close(by(q, 'cross').a, [5, 4.5])
    close(by(q, 'cross').b, [10, 4.5])
  })

  it('a corner dragged off square takes the wall that meets it along its own line', () => {
    const p = moveJoint(rooms(), L, [10, 8], [12, 8])
    // The east wall now leans from (10,0) to (12,8); the cross wall at y = 4 meets it at x = 11.
    close(by(p, 'cross').b, [11, 4])
  })

  it('leaves alone a wall whose end isn’t on the moved wall', () => {
    const start = rooms()
    const p = moveWall(start, 'w', [-1, 0], start)
    expect(by(p, 'cross')).toEqual(by(start, 'cross'))
    expect(by(p, 'mid')).toEqual(by(start, 'mid'))
  })
})

describe('inside and outside walls (HO-06, CB-40, DB-20)', () => {
  it('a wall drawn wholly inside a closed outline is an inside wall', () => {
    const p = box()
    expect(insideHouse(p.walls, L, [5, 0], [5, 8])).toBe(true)
    expect(insideHouse(p.walls, L, [2, 2], [6, 2])).toBe(true)
    expect(wallStyleAt(p, L, [5, 0], [5, 8], ext)).toEqual({ kind: 'internal', thickness: 0.11 })
    // A partition between two inside walls too.
    expect(insideHouse(rooms().walls, L, [7, 4], [7, 8])).toBe(true)
  })

  it('walls of the outline, outside it, or along it are not', () => {
    const p = box()
    expect(insideHouse(p.walls, L, [10, 0], [14, 0])).toBe(false)
    expect(insideHouse(p.walls, L, [10, 2], [14, 2])).toBe(false)
    expect(insideHouse(p.walls, L, [2, 0], [6, 0])).toBe(false)
    // Three sides drawn: the fourth closes the outline, it isn't inside one.
    expect(insideHouse(p.walls.slice(0, 3), L, [0, 8], [0, 0])).toBe(false)
    expect(wallStyleAt(p, L, [10, 0], [14, 0], ext)).toEqual(ext)
    // A type picked on purpose for inside walls, or a custom one, is kept.
    expect(wallStyleAt(p, L, [5, 0], [5, 8], { kind: 'internal', thickness: 0.09 })).toEqual({ kind: 'internal', thickness: 0.09 })
  })

  it('changing Kind takes the new kind’s usual thickness, unless one was typed', () => {
    const p = rooms()
    expect(by(setWallKind(p, 'e', 'internal'), 'e')).toMatchObject({ kind: 'internal', thickness: 0.11 })
    expect(by(setWallKind(p, 'mid', 'external'), 'mid')).toMatchObject({ kind: 'external', thickness: 0.3 })
    // The Wall tool's own type for that kind, when given.
    expect(by(setWallKind(p, 'mid', 'external', 0.27), 'mid')).toMatchObject({ kind: 'external', thickness: 0.27 })
    const typed = { ...p, walls: p.walls.map(w => (w.id === 'e' ? { ...w, thickness: 0.25 } : w)) }
    expect(by(setWallKind(typed, 'e', 'internal'), 'e')).toMatchObject({ kind: 'internal', thickness: 0.25 })
    expect(setWallKind(p, 'e', 'external')).toBe(p)
  })

  it('a level above copies the outside walls only, even when an inside wall is marked external', () => {
    const base = rooms()
    const p = { ...base, walls: base.walls.map(w => (w.id === 'mid' ? { ...w, ...ext } : w)) }
    const { plan, id } = addLevelAbove(p)
    expect(plan.walls.filter(w => w.level === id)).toHaveLength(4)
    // Inside walls marked internal were never copied.
    const up = addLevelAbove(base)
    expect(up.plan.walls.filter(w => w.level === up.id)).toHaveLength(4)
  })
})

describe('a wall drawn on top of another (LD-33)', () => {
  it('is refused, either way round, and so is one along part of it', () => {
    const p = box()
    expect(wallAlreadyThere(p, L, [0, 0], [10, 0], 'external')).toBe(true)
    expect(addWall(p, L, [10, 0], [0, 0], ext)).toBe(p)
    expect(addWall(p, L, [2, 0], [6, 0], int)).toBe(p)
  })

  it('a wall that only shares an end, or runs on past it, is drawn', () => {
    const p = box()
    expect(addWall(p, L, [10, 0], [14, 0], ext).walls).toHaveLength(5)
    expect(addWall(p, L, [5, 0], [5, 8], int).walls).toHaveLength(5)
    // A retaining wall can sit under a house wall.
    expect(wallAlreadyThere(p, L, [0, 0], [10, 0], 'retaining')).toBe(false)
  })
})
