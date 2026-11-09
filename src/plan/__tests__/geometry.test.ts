import { describe, expect, it } from 'vitest'
import { signedArea } from '../../lib/geom'
import { buildingOutline, planarFaces, roomShape, wallPieces, wallPolygons } from '../geometry'
import { fromSite, toSite, type Wall } from '../model'
import { garageFloor } from './fixtures'

const w = (id: string, a: [number, number], b: [number, number], thickness = 0.2): Wall => ({
  id,
  level: 'l',
  a,
  b,
  thickness,
  kind: 'external',
})

describe('wall joins', () => {
  it('mitres an L corner so the two walls meet on a shared diagonal', () => {
    const polys = wallPolygons([w('x', [0, 0], [4, 0]), w('y', [0, 0], [0, 3])])
    const x = polys.get('x')!
    const y = polys.get('y')!
    // outer corner at (-0.1, -0.1), inner corner at (0.1, 0.1), shared by both walls
    expect(x).toContainEqual([-0.1, -0.1])
    expect(x).toContainEqual([0.1, 0.1])
    expect(y.map(p => p.map(v => +v.toFixed(9)))).toContainEqual([-0.1, -0.1])
    expect(y.map(p => p.map(v => +v.toFixed(9)))).toContainEqual([0.1, 0.1])
    expect(signedArea(x)).toBeGreaterThan(0)
  })

  it('stops a wall that tees into another at the face of that wall', () => {
    const polys = wallPolygons([w('host', [-2, 0], [2, 0], 0.3), w('tee', [0, 0], [0, 2], 0.1)])
    const tee = polys.get('tee')!
    expect(Math.min(...tee.map(p => p[1]))).toBeCloseTo(0.15, 9)
    expect(polys.get('host')!.length).toBe(4)
  })
})

describe('rooms', () => {
  const plan = garageFloor()
  const faces = planarFaces(plan.walls)
  const area = (name: string) => {
    const room = plan.rooms.find(r => r.name === name)!
    return roomShape(room, faces)?.area
  }

  it('finds each room and measures it on the inside faces of its walls', () => {
    expect(area('Garage')).toBeCloseTo(7.745 * 6.095, 2) // 47.21 m²
    expect(area('Entry')).toBeCloseTo(1.645 * 9.3, 2) // 15.30 m²
    expect(area('Laundry')).toBeCloseTo(4.2 * 1.09, 2) // 4.58 m²
    expect(area('Study')).toBeCloseTo(4.2 * 2.6, 2) // 10.92 m²
  })

  it('reports a room as open when its walls do not enclose it', () => {
    const faces = planarFaces(plan.walls.filter(x => x.id !== 'garage_n'))
    const garage = plan.rooms.find(r => r.name === 'Garage')!
    expect(roomShape(garage, faces)).toBeNull()
  })

  it('still finds a room with a dangling wall in it (the stub is not subtracted)', () => {
    const walls = [w('a', [0, 0], [4, 0]), w('b', [4, 0], [4, 3]), w('c', [4, 3], [0, 3]), w('d', [0, 3], [0, 0]), w('stub', [0, 1.5], [1.5, 1.5])]
    const shape = roomShape({ id: 'r', level: 'l', name: 'r', at: [3, 2] }, planarFaces(walls))
    expect(shape!.area).toBeCloseTo(3.8 * 2.8, 2)
  })

  it('measures the building outline on the outside faces', () => {
    const { area: gross } = buildingOutline(planarFaces(plan.walls))
    // Outside faces: garage block x 0..8.155, y 4.1..10.605; hall strip x 8.045..10.1 up to
    // y 14.0; office block x 5.3..10.1, y 0..4.1.
    const garageBlock = 8.155 * (10.605 - 4.1)
    const hallBlock = (10.1 - 8.045) * (14.0 - 4.1)
    const officeBlock = (10.1 - 5.3) * 4.1
    const overlap = (8.155 - 8.045) * (10.605 - 4.1)
    expect(gross).toBeCloseTo(garageBlock + hallBlock + officeBlock - overlap, 1)
  })
})

describe('openings', () => {
  it('cuts doors and windows out of a wall', () => {
    const pieces = wallPieces(5, 2.7, [
      { offset: 1, width: 0.8, height: 2.1, sill: 0 },
      { offset: 3.5, width: 1.2, height: 1.2, sill: 0.9 },
    ])
    expect(pieces).toEqual([
      { s0: 0, s1: 0.6, z0: 0, z1: 2.7 },
      { s0: 0.6, s1: 1.4, z0: 2.1, z1: 2.7 },
      { s0: 1.4, s1: 2.9, z0: 0, z1: 2.7 },
      { s0: 2.9, s1: 4.1, z0: 0, z1: 0.9 },
      { s0: 2.9, s1: 4.1, z0: 2.1, z1: 2.7 },
      { s0: 4.1, s1: 5, z0: 0, z1: 2.7 },
    ].map(p => ({ ...p, s0: expect.closeTo(p.s0, 9), s1: expect.closeTo(p.s1, 9), z0: expect.closeTo(p.z0, 9), z1: expect.closeTo(p.z1, 9) })))
  })
})

describe('placement', () => {
  it('round-trips between house and site frames', () => {
    const pl = { e: 1010, n: 1005, rotation: 32, ffl: 83 }
    const origin: [number, number] = [1000, 996]
    const p = toSite([3, 4], pl, origin)
    const back = fromSite(p, pl, origin)
    expect(back[0]).toBeCloseTo(3, 9)
    expect(back[1]).toBeCloseTo(4, 9)
  })
})
