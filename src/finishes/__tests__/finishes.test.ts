// Finishes (CB-21): stored as optional fields that older plans don't have, one undo step a pick,
// and only the 3D picture changes.

import { beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { normalizePlan, type Plan } from '../../plan/model'
import { parsePlanFile, usePlan } from '../../plan/store'
import { namePlanStep } from '../../shell/undoSteps'
import { houseMaterials } from '../materials'
import {
  floorZoneOf,
  finishesSummary,
  normalizeFinishes,
  pickFloorFinish,
  pickRoofFinish,
  pickWallFinish,
  PLAIN,
  resolveFinishes,
  withFinishes,
} from '../model'
import { floorGeometries, insideTest, metreUVs, splitInsideFaces } from '../surfaces'
import { patternPixels, patternTexture } from '../textures'

describe('finishes in the plan', () => {
  it('leave an older plan without any, so it opens exactly as before', () => {
    const p = normalizePlan(garageFloor())
    expect(p.finishes).toBeUndefined()
    expect(resolveFinishes(p.finishes)).toMatchObject({ walls: 'plain', wallColour: PLAIN.wall, roof: 'plain', roofColour: PLAIN.roof })
  })

  it('keep only what this version knows when a file is read', () => {
    const raw = { ...garageFloor(), finishes: { walls: 'brick', wallColour: '#A0583F', roof: 'gold', roofColour: 'red', floors: { living: 'timber', garage: 'plain', attic: 'tile' } } }
    const p = parsePlanFile(JSON.stringify(raw))
    expect(p.finishes).toEqual({ walls: 'brick', wallColour: '#a0583f', floors: { living: 'timber' } })
    expect(normalizeFinishes({ walls: 'plain', floors: {} })).toBeUndefined()
    // Reading it again changes nothing.
    expect(normalizePlan(p)).toEqual(p)
  })

  it('travel in the plan file', () => {
    const p = withFinishes(garageFloor(), { roof: 'metal', roofColour: '#3b3e42' })
    expect(parsePlanFile(JSON.stringify(p)).finishes).toEqual({ roof: 'metal', roofColour: '#3b3e42' })
  })

  it('come off the plan when set back to plain, and change nothing when nothing changes', () => {
    const plan = garageFloor()
    const brick = pickWallFinish(plan, 'brick')
    expect(brick.finishes).toEqual({ walls: 'brick' })
    const back = pickWallFinish(brick, 'plain')
    expect('finishes' in back).toBe(false)
    expect(pickWallFinish(brick, 'brick')).toBe(brick)
  })

  it('give a new cladding its own colour unless one was picked on purpose', () => {
    const plan = garageFloor()
    expect(resolveFinishes(pickWallFinish(plan, 'brick').finishes).wallColour).toBe('#a0583f')
    expect(resolveFinishes(pickRoofFinish(plan, 'tiles').finishes).roofColour).toBe('#a65a3c')
    const sage = withFinishes(pickWallFinish(plan, 'render'), { wallColour: '#9fab8f' })
    expect(resolveFinishes(pickWallFinish(sage, 'weatherboard').finishes).wallColour).toBe('#9fab8f')
    expect(finishesSummary(sage.finishes)).toBe('Walls: Rendered, sage · Roof: Plain, slate grey')
  })

  it('pick a floor by the kind of room, by type or else by name', () => {
    expect(floorZoneOf({ name: 'Garage' })).toBe('garage')
    expect(floorZoneOf({ name: 'Laundry' })).toBe('wet')
    expect(floorZoneOf({ name: 'Kitchen' })).toBe('living')
    expect(floorZoneOf({ name: 'Bed 2' })).toBe('bedrooms')
    expect(floorZoneOf({ name: 'Room 4', type: 'study' })).toBe('bedrooms')
    expect(floorZoneOf({ name: 'Den', type: 'ensuite' })).toBe('wet')
  })
})

describe('changing a finish', () => {
  beforeEach(() => usePlan.getState().load(garageFloor()))

  it('is one undo step, named for the finishes', () => {
    const st = usePlan.getState()
    st.commit(p => pickWallFinish(p, 'weatherboard'))
    expect(usePlan.getState().past).toHaveLength(1)
    const [before, after] = [usePlan.getState().past[0], usePlan.getState().plan!]
    expect(namePlanStep(before, after)).toMatchObject({ what: 'change finishes', area: 'design', tab: 'finishes' })
    usePlan.getState().undo()
    expect(usePlan.getState().plan!.finishes).toBeUndefined()
  })

  it('makes one step of a drag round the custom colour picker', () => {
    const st = usePlan.getState()
    for (const c of ['#111111', '#222222', '#333333']) st.nudge('finish-wallColour', p => withFinishes(p, { wallColour: c }))
    expect(usePlan.getState().past).toHaveLength(1)
    expect(usePlan.getState().plan!.finishes).toEqual({ wallColour: '#333333' })
  })
})

describe('finishes in 3D', () => {
  it('look as the 3D view always has when plain', () => {
    const m = houseMaterials(undefined)
    expect(m.outsideWalls.map(x => '#' + x.color.getHexString())).toEqual([PLAIN.wall, PLAIN.insideOfOutside])
    expect('#' + m.insideWalls.color.getHexString()).toBe(PLAIN.inside)
    expect('#' + m.roof.color.getHexString()).toBe(PLAIN.roof)
    expect([m.outsideWalls[0].roughness, m.insideWalls.roughness, m.roof.roughness, m.roof.metalness]).toEqual([0.85, 0.9, 0.7, 0.15])
    expect([...m.outsideWalls, m.insideWalls, m.roof].every(x => x.map === null)).toBe(true)
  })

  it('are standard materials with a pattern map, named, sharing one texture per pattern', () => {
    const a = houseMaterials({ walls: 'brick', roof: 'metal' })
    const b = houseMaterials({ walls: 'brick', wallColour: '#4a4d52' })
    expect(a.outsideWalls[0]).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(a.outsideWalls[0].name).toBe('finish-walls-brick')
    expect(a.roof.name).toBe('finish-roof-metal')
    expect(a.outsideWalls[0].map).toBe(b.outsideWalls[0].map)
    expect(a.outsideWalls[0].map).toBe(patternTexture('brick'))
  })

  it('draw brick courses at their real size', () => {
    const brick = patternPixels('brick')
    expect(brick.size[1] / 4).toBeCloseTo(0.086, 3)
    expect(Math.min(...brick.px)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...brick.px)).toBeLessThanOrEqual(1)
  })

  it('lay UVs in metres: level along a wall, up a roof slope', () => {
    const wall = new THREE.BoxGeometry(4, 2.7, 0.27).toNonIndexed()
    metreUVs(wall)
    const uv = wall.getAttribute('uv')
    const us: number[] = []
    const vs: number[] = []
    for (let i = 0; i < uv.count; i++) {
      us.push(uv.getX(i))
      vs.push(uv.getY(i))
    }
    // The long faces run 4 m along and 2.7 m up.
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(4, 5)
    expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(2.7, 5)
    const slope = new THREE.BufferGeometry()
    // A 30° face rising to the north (-z): 2 m across, 2 m up the slope.
    const h = Math.sin(Math.PI / 6) * 2
    const d = Math.cos(Math.PI / 6) * 2
    slope.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 2, 0, 0, 2, h, -d]), 3))
    metreUVs(slope)
    const v = slope.getAttribute('uv')
    expect(v.getY(2) - v.getY(0)).toBeCloseTo(2, 5)
    expect(Math.abs(v.getX(1) - v.getX(0))).toBeCloseTo(2, 5)
  })

  it('give the room side of an outside wall the inside colour', () => {
    const plan = garageFloor()
    const origin: [number, number] = [1000, 1000]
    const inside = insideTest(plan, origin, 80)
    // The study's south wall: centreline y 0.15, 0.3 thick, from x 5.45 to 9.95 (site x + 5).
    const g = new THREE.BoxGeometry(4.5, 2.7, 0.3).toNonIndexed()
    g.translate(5 + 7.7, 84 - 80 + 1.35, -0.15)
    splitInsideFaces(g, inside)
    expect(g.groups.map(x => x.materialIndex)).toEqual([0, 1])
    // One face of the box looks into the study: two triangles.
    expect(g.groups[1].count).toBe(6)
    const n = new THREE.Triangle(
      new THREE.Vector3().fromBufferAttribute(g.getAttribute('position'), g.groups[1].start),
      new THREE.Vector3().fromBufferAttribute(g.getAttribute('position'), g.groups[1].start + 1),
      new THREE.Vector3().fromBufferAttribute(g.getAttribute('position'), g.groups[1].start + 2),
    ).getNormal(new THREE.Vector3())
    // North in the site is -z in the scene: the face looks north, into the room.
    expect(n.z).toBeCloseTo(-1, 5)
  })

  it('lay floors only where a room has a finish other than plain', () => {
    const plain: Plan = garageFloor()
    expect(floorGeometries(plain, [1000, 1000], 80, null).size).toBe(0)
    const p = pickFloorFinish(pickFloorFinish(plain, 'garage', 'concrete'), 'wet', 'tile')
    const g = floorGeometries(p, [1000, 1000], 80, null)
    expect([...g.keys()].sort()).toEqual(['concrete', 'tile'])
    // Just above the floor (FFL 84, scene 80 lower).
    const pos = g.get('tile')!.getAttribute('position')
    expect(pos.getY(0)).toBeCloseTo(4.004, 5)
    expect(g.get('tile')!.getAttribute('uv')).toBeDefined()
    expect(floorGeometries(p, [1000, 1000], 80, new Set(['elsewhere'])).size).toBe(0)
  })
})

describe('finding finishes', () => {
  it('leads colour and texture searches to Design › Finishes, and finds it for material and brick', async () => {
    const { buildIndex, search } = await import('../../nav/search')
    const features = (await import('../../nav/features.json')).default
    const index = buildIndex(features)
    for (const q of ['colour', 'texture']) expect(search(index, q)[0]?.key, q).toBe('tab:design/finishes')
    for (const q of ['material', 'brick', 'weatherboard', 'roof colour', 'carpet']) expect(search(index, q).some(r => r.key === 'tab:design/finishes'), q).toBe(true)
  })
})
