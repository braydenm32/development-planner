import { describe, expect, it } from 'vitest'
import { wallPolygons } from '../../plan/geometry'
import type { Wall } from '../../plan/model'
import { snap } from '../../plan/snap'
import { faceGuides } from '../faceSnap'

const wall = (id: string, a: [number, number], b: [number, number], thickness = 0.27): Wall => ({ id, level: 'g', a, b, thickness, kind: 'external' })

describe('Shift keeps the line square (CB-07)', () => {
  const none = { walls: [], tol: 0.25 }

  it('holds a nearly level wall level, where it used to come out crooked', () => {
    // 100 px across and 8 px down at 40 px to the metre.
    const s = snap([2.5, -0.2], { ...none, anchor: [0, 0], ortho: true })
    expect(s.p).toEqual([2.5, 0])
    expect(s.kind).toBe('angle')
  })

  it('holds square however far off the pointer is, to whichever way is nearer', () => {
    expect(snap([3, 2], { ...none, anchor: [0, 0], ortho: true }).p).toEqual([3, 0])
    expect(snap([2, -3], { ...none, anchor: [0, 0], ortho: true }).p).toEqual([0, -3])
    expect(snap([-1.234, 0.5], { ...none, anchor: [1, 1], ortho: true }).p[1]).toBe(1)
  })

  it('without Shift, a pointer well off square is left where it is', () => {
    const s = snap([3, 2], { ...none, anchor: [0, 0] })
    expect(s.p[1]).not.toBe(0)
  })

  it('still stops on a wall it meets, and on the start of the run when that is in line', () => {
    const cross = wall('x', [4, -2], [4, 2])
    expect(snap([3.9, 0.6], { walls: [cross], tol: 0.25, anchor: [0, 0], ortho: true })).toMatchObject({ p: [4, 0], kind: 'wall' })
    expect(snap([5.1, 0.4], { ...none, anchor: [0, 0], points: [[5, 0]], ortho: true })).toMatchObject({ p: [5, 0], kind: 'end' })
  })

  it('never leaves the line for a point that is off it, but lines up with it', () => {
    const s = snap([5.05, 0.1], { ...none, anchor: [0, 0], points: [[5, 3]], ortho: true })
    expect(s).toMatchObject({ p: [5, 0], kind: 'align' })
  })

  it('stays square with snapping off, ending where the pointer is', () => {
    const s = snap([2.5037, -0.2], { ...none, anchor: [0, 0], ortho: true, free: true })
    expect(s.p[0]).toBeCloseTo(2.504, 6)
    expect(s.p[1]).toBe(0)
  })

  it('does nothing before the first point is down', () => {
    expect(snap([2.512, 0.2], { ...none, ortho: true }).kind).toBe('grid')
  })
})

describe('snapping to wall faces (DB-10)', () => {
  // A 5 m wide room on centrelines: 270 mm walls, so 4730 clear.
  const walls = [wall('w', [0, 0], [0, 6]), wall('e', [5, 0], [5, 6]), wall('s', [0, 0], [5, 0]), wall('n', [0, 6], [5, 6])]
  const guides = faceGuides(wallPolygons(walls).values())
  const tol = 0.1

  it('has the corners and sides of every wall’s outline', () => {
    expect(guides.points.some(p => Math.abs(p[0] - 0.135) < 1e-6 && Math.abs(p[1] - 0.135) < 1e-6)).toBe(true)
    expect(guides.segs.length).toBeGreaterThanOrEqual(16)
  })

  it('lands on the inside face when the pointer is nearer it than the centreline', () => {
    const a = snap([0.15, 3.02], { walls, guides, tol })
    expect(a.kind).toBe('wall')
    expect(a.p[0]).toBeCloseTo(0.135, 6)
  })

  it('measures the clear width: across from one face, stopping on the far face', () => {
    const from = snap([0.15, 3.02], { walls, guides, tol }).p
    const to = snap([4.85, 3.03], { walls, guides, tol, anchor: from })
    expect(to.kind).toBe('wall')
    expect(to.p[0] - from[0]).toBeCloseTo(4.73, 6)
  })

  it('still lands on the centreline when the pointer is on it', () => {
    const from = snap([0.15, 3.02], { walls, guides, tol }).p
    const to = snap([5.01, 3.03], { walls, guides, tol, anchor: from })
    expect(to.p[0]).toBeCloseTo(5, 6)
  })

  it('picks up a face corner', () => {
    const s = snap([0.15, 0.16], { walls, guides, tol: 0.05 })
    expect(s.kind).toBe('end')
    expect(s.p[0]).toBeCloseTo(0.135, 6)
    expect(s.p[1]).toBeCloseTo(0.135, 6)
  })
})
