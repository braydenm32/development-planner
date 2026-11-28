// A finish for one wall, and two finishes on a wall (the owner's request): which faces get which
// finish, that older plans and files open unchanged, and that each change is one undo step.

import { beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { normalizePlan, wallLength, type Plan, type Roof, type Wall } from '../../plan/model'
import { roofGeometry } from '../../plan/roof'
import { parsePlanFile, usePlan } from '../../plan/store'
import { namePlanStep } from '../../shell/undoSteps'
import { elevationDrawing } from '../../sections/elevation'
import {
  band,
  clearWallFinishes,
  editWallFinishes,
  normalizeWallFinishes,
  pickLowerFinish,
  wallBands,
  wallsWithOwnFinish,
  withFinishes,
  type WallFinishes,
} from '../model'
import { finishPieces, OutsideWalls, type FinishPiece } from '../wallFaces'

const H = 2.7
const plan0 = () => withFinishes(garageFloor(), { walls: 'brick' })
const wallOf = (p: Plan, id: string) => p.walls.find(w => w.id === id)!
const pieces = (p: Plan, id: string) => {
  const w = wallOf(p, id)
  return finishPieces(p, w, wallLength(w), H, p.openings.filter(o => o.wall === w.id))
}
/** Square metres of the wall's elevation in each finish. */
const areaBy = (ps: FinishPiece[]) => {
  const out: Record<string, number> = {}
  for (const p of ps) if (p.band) out[p.band.key] = +((out[p.band.key] ?? 0) + (p.s1 - p.s0) * (p.z1 - p.z0)).toFixed(6)
  return out
}
const BRICK = 'brick|#a0583f'
const WEATHERBOARD = 'weatherboard|#f1ede6'
const two: WallFinishes = { upper: { walls: 'weatherboard' }, lower: { walls: 'brick' }, at: 1 }

describe('which faces get which finish', () => {
  it('the house finish only: every outside piece is the house’s, inside walls none', () => {
    const p = plan0()
    for (const w of p.walls) {
      const ps = pieces(p, w.id)
      expect(ps.every(x => (w.kind === 'external' ? x.band?.key === BRICK : x.band === null))).toBe(true)
    }
  })

  it('one wall with its own finish: that wall alone, the rest the house’s', () => {
    const p = editWallFinishes(plan0(), ['south'], () => ({ upper: { walls: 'weatherboard', colour: '#9fab8f' } }))
    expect(pieces(p, 'south').every(x => x.band?.key === 'weatherboard|#9fab8f')).toBe(true)
    expect(pieces(p, 'east').every(x => x.band?.key === BRICK)).toBe(true)
  })

  it('a wall with two finishes: cut at the change, brick below and weatherboard above', () => {
    const p = editWallFinishes(plan0(), ['south'], () => two)
    const ps = pieces(p, 'south')
    const len = wallLength(wallOf(p, 'south'))
    expect(areaBy(ps)).toEqual({ [BRICK]: +(len * 1).toFixed(6), [WEATHERBOARD]: +(len * 1.7).toFixed(6) })
    for (const x of ps) expect(x.band?.key === BRICK ? x.z1 <= 1 + 1e-9 : x.z0 >= 1 - 1e-9).toBe(true)
  })

  it('the house-wide lower part, with one wall’s own finish overriding it', () => {
    let p = pickLowerFinish(withFinishes(plan0(), { walls: 'weatherboard' }), 'brick')
    p = withFinishes(p, { lowerTo: 0.9 })
    p = editWallFinishes(p, ['south'], () => ({ upper: { walls: 'render' } }))
    const east = areaBy(pieces(p, 'east'))
    // East has the office window (sill 0.9) and the stair gap: the lower part stops at 0.9 all along.
    expect(Object.keys(east).sort()).toEqual([BRICK, WEATHERBOARD])
    expect(pieces(p, 'east').filter(x => x.band?.key === BRICK).every(x => x.z1 <= 0.9 + 1e-9)).toBe(true)
    expect(Object.keys(areaBy(pieces(p, 'south')))).toEqual(['render|#f1ede6'])
  })

  it('an opening crossing the change: the jambs are cut, below the sill one finish, above the head the other', () => {
    // The office window: sill 0.9, head 2.1, so a change at 1.5 crosses it.
    const p = editWallFinishes(plan0(), ['east'], () => ({ ...two, at: 1.5 }))
    const w = wallOf(p, 'east')
    const ps = pieces(p, 'east')
    const win = p.openings.find(o => o.id === 'office_window')!
    const [o0, o1] = [win.offset - win.width / 2, win.offset + win.width / 2]
    const under = ps.filter(x => x.s0 === o0 && x.s1 === o1)
    expect(under.map(x => [x.z0, x.z1, x.band?.key])).toEqual([
      [0, 0.9, BRICK],
      [2.1, H, WEATHERBOARD],
    ])
    // Either side of it, the wall runs full height, cut at 1.5.
    const beside = ps.filter(x => x.s1 === o0)
    expect(beside.map(x => [x.z0, x.z1, x.band?.key])).toEqual([
      [0, 1.5, BRICK],
      [1.5, H, WEATHERBOARD],
    ])
    // Nothing lost or doubled: the same wall face as without the finishes.
    const plain = finishPieces(plan0(), w, wallLength(w), H, p.openings.filter(o => o.wall === w.id))
    const sum = (x: Record<string, number>) => Object.values(x).reduce((a, b) => a + b, 0)
    expect(sum(areaBy(ps))).toBeCloseTo(sum(areaBy(plain)), 9)
  })

  it('keeps a change height inside the wall, and needs two different finishes to show two', () => {
    expect(wallBands(undefined, { ...two, at: 5 }, H).at).toBeCloseTo(2.6, 9)
    expect(wallBands(undefined, { ...two, at: 0.01 }, H).at).toBeCloseTo(0.1, 9)
    expect(wallBands(undefined, { upper: { walls: 'brick' }, lower: { walls: 'brick' }, at: 1 }, H).lower).toBeUndefined()
  })

  it('gathers faces into one mesh per finish, not one per wall, the house’s named as before', () => {
    const p = editWallFinishes(plan0(), ['south', 'east', 'office_w'], () => two)
    const ext = new OutsideWalls(p)
    for (const w of p.walls.filter(x => x.kind === 'external'))
      for (const piece of pieces(p, w.id)) ext.add(piece.band!, new THREE.BoxGeometry(piece.s1 - piece.s0, piece.z1 - piece.z0, 0.3).toNonIndexed())
    const meshes = ext.build(() => false)
    expect(meshes.map(m => m.name)).toEqual(['outside walls', 'outside walls, weatherboard, white'])
    expect(meshes.every(m => m.geometry.getAttribute('uv') && m.geometry.groups.length === 2)).toBe(true)
  })

  it('gives each gable end the finish of the wall below it: that wall’s own, or the house’s', () => {
    // A 6 x 4 box with gable ends on its short (east and west) sides.
    const walls: Wall[] = (
      [
        [[0, 0], [6, 0]],
        [[6, 0], [6, 4]],
        [[6, 4], [0, 4]],
        [[0, 4], [0, 0]],
      ] as [[number, number], [number, number]][]
    ).map(([a, b], i) => ({ id: `w${i}`, level: 'level_ground', a, b, thickness: 0.27, kind: 'external' }))
    const roof: Roof = { id: 'r', level: 'level_ground', pts: [[-0.135, -0.135], [6.135, -0.135], [6.135, 4.135], [-0.135, 4.135]], type: 'gable', pitch: 25, overhang: 0.45, gables: [false, true, false, true], lowEdge: 0 }
    let p: Plan = { ...garageFloor(), walls, openings: [], rooms: [], areas: [], roofs: [roof] }
    p = editWallFinishes(p, ['w1'], () => ({ upper: { walls: 'weatherboard' } }))
    const mesh = roofGeometry(roof).mesh
    const flat = new THREE.BufferGeometry()
    flat.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.pos), 3))
    flat.setIndex(mesh.tris)
    const tris = mesh.tris.length / 3
    const ext = new OutsideWalls(p)
    const rest = ext.takeGables(roof, mesh, flat.toNonIndexed())
    const meshes = ext.build(() => false)
    // The east gable (over w1) went to weatherboard, the west one to the house's finish.
    expect(meshes.map(m => m.name)).toEqual(['outside walls', 'outside walls, weatherboard, white'])
    const count = (k: number) => meshes[k].geometry.getAttribute('position').count / 3
    const xsOf = (k: number) => Array.from(meshes[k].geometry.getAttribute('position').array as Float32Array).filter((_, i) => i % 3 === 0)
    expect(count(0)).toBeGreaterThan(0)
    expect(count(1)).toBe(count(0))
    expect(rest.getAttribute('position').count / 3).toBe(tris - count(0) - count(1))
    expect(Math.max(...xsOf(0))).toBeLessThan(0)
    expect(Math.min(...xsOf(1))).toBeGreaterThan(6)
    // With no wall finish set anywhere, both gables still leave the roof, for the house's finish.
    const plain = new OutsideWalls(clearWallFinishes(p))
    const left = plain.takeGables(roof, mesh, flat.toNonIndexed())
    expect(plain.build(() => false).map(m => m.name)).toEqual(['outside walls'])
    expect(left.getAttribute('position').count / 3).toBe(tris - count(0) - count(1))
    // A gable end with no wall under it takes the house's finish too.
    const bare = new OutsideWalls({ ...p, walls: [] })
    bare.takeGables(roof, mesh, flat.toNonIndexed())
    expect(bare.build(() => false).map(m => m.name)).toEqual(['outside walls'])
    // A hip roof has no gable end, and is handed back as it came.
    const hip = { ...roof, type: 'hip' as const }
    const hipMesh = roofGeometry(hip).mesh
    const hipFlat = new THREE.BufferGeometry()
    hipFlat.setAttribute('position', new THREE.BufferAttribute(new Float32Array(hipMesh.pos), 3))
    const same = hipFlat
    expect(new OutsideWalls(p).takeGables(hip, hipMesh, same)).toBe(same)
  })
})

describe('wall finishes in the plan', () => {
  it('leave an older plan, file and its walls exactly as they were', () => {
    const old = garageFloor()
    const p = normalizePlan(old)
    expect(p.walls).toBe(old.walls)
    expect(p.walls.some(w => 'finish' in w)).toBe(false)
    expect(parsePlanFile(JSON.stringify(old)).walls).toEqual(old.walls)
    expect(wallBands(undefined, undefined, H)).toEqual({ upper: band({ walls: 'plain' }) })
  })

  it('travel in the plan file, keeping only what this version knows', () => {
    const p = editWallFinishes(garageFloor(), ['south'], () => two)
    const back = parsePlanFile(JSON.stringify(p))
    expect(wallOf(back, 'south').finish).toEqual(two)
    const raw = { ...garageFloor(), walls: garageFloor().walls.map(w => (w.id === 'south' ? { ...w, finish: { upper: { walls: 'gold' } } } : w.id === 'east' ? { ...w, finish: { upper: { walls: 'brick', colour: '#ABCDEF' }, lower: { walls: 'x' }, at: 1 } } : w)) }
    const read = parsePlanFile(JSON.stringify(raw))
    expect('finish' in wallOf(read, 'south')).toBe(false)
    expect(wallOf(read, 'east').finish).toEqual({ upper: { walls: 'brick', colour: '#abcdef' } })
    expect(normalizePlan(read)).toEqual(read)
    expect(normalizeWallFinishes({ upper: { walls: 'render' }, lower: { walls: 'brick' }, at: -1 })).toEqual({ upper: { walls: 'render' }, lower: { walls: 'brick' } })
  })

  it('keep the house-wide lower part, plain included, and drop it cleanly', () => {
    const p = withFinishes(pickLowerFinish(garageFloor(), 'plain'), { lowerTo: 1.2 })
    expect(parsePlanFile(JSON.stringify(p)).finishes).toEqual({ lower: 'plain', lowerTo: 1.2 })
    expect('finishes' in pickLowerFinish(p, undefined)).toBe(false)
  })

  it('go with a wall when it is copied, and only onto outside walls', () => {
    const p = editWallFinishes(garageFloor(), ['south', 'hall_w'], () => two)
    expect(wallOf(p, 'hall_w').finish).toBeUndefined()
    expect(structuredClone(wallOf(p, 'south')).finish).toEqual(two)
    expect(wallsWithOwnFinish(p).map(w => w.id)).toEqual(['south'])
  })

  it('change nothing else: the elevations gain only a line where the finishes meet', () => {
    const p = editWallFinishes(garageFloor(), ['south'], () => two)
    const input = (plan: Plan) => ({ plan, survey: { origin: [0, 0], boundary: [] } as never, terrain: { grid: { sample: () => 83 } } as never })
    const before = elevationDrawing('south', input(garageFloor()))
    const after = elevationDrawing('south', input(p))
    const lines = after.shapes.flatMap(s => (s.kind === 'wall' ? (s.splits ?? []) : []))
    expect(lines).toHaveLength(1)
    expect(lines[0][0][1]).toBeCloseTo(84 + 1, 9)
    // South's own run, 5.45 to 9.95 along its middle, out to the outside corners at both ends.
    expect(lines[0][1][0] - lines[0][0][0]).toBeCloseTo(9.95 + 0.15 - (5.45 - 0.15), 6)
    const strip = (d: typeof before) => ({ ...d, shapes: d.shapes.map(s => (s.kind === 'wall' ? { ...s, splits: undefined } : s)) })
    expect(JSON.stringify(strip(after))).toBe(JSON.stringify(strip(before)))
  })
})

describe('changing a wall’s finish', () => {
  beforeEach(() => usePlan.getState().load(garageFloor()))

  it('sets several walls in one undo step, named for it, and undoes back to the house finish', () => {
    const st = usePlan.getState()
    st.commit(p => editWallFinishes(p, ['south', 'east'], () => two))
    expect(usePlan.getState().past).toHaveLength(1)
    const [before, after] = [usePlan.getState().past[0], usePlan.getState().plan!]
    expect(namePlanStep(before, after)).toMatchObject({ what: 'change wall finishes', area: 'design', tab: 'plan' })
    st.commit(clearWallFinishes)
    expect(usePlan.getState().past).toHaveLength(2)
    expect(wallsWithOwnFinish(usePlan.getState().plan!)).toEqual([])
    st.undo()
    expect(wallsWithOwnFinish(usePlan.getState().plan!).map(w => w.id)).toEqual(['south', 'east'])
    st.undo()
    expect(usePlan.getState().plan!.walls).toEqual(garageFloor().walls)
  })

  it('makes no step when nothing changes', () => {
    usePlan.getState().commit(p => editWallFinishes(p, ['south'], () => undefined))
    expect(usePlan.getState().past).toHaveLength(0)
  })
})
