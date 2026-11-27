// Doors and windows in 3D by their kind (openingDetail), and the marks the elevations draw on them
// (openingMarks). Uses the made-up garage plan only.

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { openingDetailGeometry } from '../../components/openingMeshes'
import { normalizePlan, type Opening } from '../model'
import { bifoldPanels, openingDetail, type DetailPart } from '../openingDetail'
import { openingMarks } from '../../sections/openingMarks'
import { garageFloor } from './fixtures'

const door = (style: Opening['style'], width = 0.82, height = 2.04): Opening => ({ id: 'd', wall: 'w', kind: 'door', offset: 2, width, height, sill: 0, flipHinge: false, flipSwing: false, ...(style ? { style } : {}) })
const win = (style: Opening['style'], width = 1.81, height = 1.2): Opening => ({ id: 'n', wall: 'w', kind: 'window', offset: 2, width, height, sill: 0.9, flipHinge: false, flipSwing: false, ...(style ? { style } : {}) })
const count = (o: Opening, part: DetailPart, t = 0.27) => openingDetail(o, t).filter(s => s.part === part).length

describe('doors and windows in 3D', () => {
  it('gives each kind of door its own leaves', () => {
    expect(count(door(undefined), 'leaf')).toBe(1)
    expect(count(door('hinged'), 'glass')).toBe(0)
    // French doors: two glazed leaves.
    expect(count(door('double', 1.64), 'glass')).toBe(2)
    // A slider: two glazed panels on a track.
    expect(count(door('sliding', 2.1), 'glass')).toBe(2)
    expect(count(door('sliding', 2.1), 'track')).toBe(1)
    // A bifold: as many narrow panels as its plan symbol folds.
    expect(bifoldPanels(2.4)).toBe(4)
    expect(count(door('bifold', 2.4), 'glass')).toBe(4)
  })

  it('gives every window a frame and a sill, with the bars its kind has', () => {
    for (const style of [undefined, 'sliding', 'awning', 'double-hung', 'fixed'] as const) {
      expect(count(win(style), 'sill'), style).toBe(1)
      expect(count(win(style), 'frame'), style).toBeGreaterThanOrEqual(4)
    }
    expect(count(win('fixed'), 'frame')).toBe(4)
    expect(count(win('sliding'), 'frame')).toBe(6)
    expect(count(win('double-hung'), 'frame')).toBe(6)
    expect(count(win('awning'), 'frame')).toBe(8)
    // No kind: a mullion only on a wide one, as the elevations always drew it.
    expect(count(win(undefined, 1.81), 'frame')).toBe(5)
    expect(count(win(undefined, 1.2), 'frame')).toBe(4)
  })

  it('ribs a garage door and leaves a plain opening open', () => {
    const garage: Opening = { ...door(undefined, 4.8, 2.1), kind: 'garage' }
    expect(count(garage, 'rib')).toBe(3)
    expect(openingDetail({ ...door(undefined), kind: 'opening' }, 0.27)).toEqual([])
  })

  it('stays inside its opening, across the wall and under the ceiling', () => {
    const t = 0.27
    for (const o of [door('hinged'), door('double', 1.64), door('sliding', 2.1), door('bifold', 2.4), win('sliding'), win('awning'), win('double-hung'), win('fixed')]) {
      for (const s of openingDetail(o, t, 2.0)) {
        expect(s.z1, o.style).toBeLessThanOrEqual(2.0 + 1e-9)
        expect(s.z1).toBeGreaterThan(s.z0)
        for (const [a, b] of s.pts) {
          // Only the sill reaches past the jambs and the faces.
          const pad = s.part === 'sill' ? 0.04 + 1e-9 : 1e-9
          expect(a).toBeGreaterThanOrEqual(-pad)
          expect(a).toBeLessThanOrEqual(o.width + pad)
          expect(Math.abs(b)).toBeLessThanOrEqual(t / 2 + pad)
        }
      }
    }
  })

  it('merges the pieces into a few named meshes, with every face looking outwards', () => {
    const plan = normalizePlan(garageFloor())
    const wall = plan.walls.find(w => w.kind === 'external')!
    const withKinds = { ...plan, openings: [...plan.openings, { ...door('sliding', 2.1), wall: wall.id, offset: 1.5 }, { ...win('awning', 0.85), wall: wall.id, offset: 3.5 }] }
    const meshes = openingDetailGeometry(withKinds, [0, 0], 0, null)
    expect([...meshes.keys()]).toEqual(expect.arrayContaining(['door-frame', 'door-glass', 'door-track', 'window-frame', 'window-sill']))
    expect(meshes.size).toBeLessThanOrEqual(8)
    // A block's faces all point away from its middle.
    const g = meshes.get('door-track')!.geometry
    const pos = g.getAttribute('position')
    const nor = g.getAttribute('normal')
    const mid = new THREE.Vector3()
    for (let i = 0; i < 36; i++) mid.add(new THREE.Vector3().fromBufferAttribute(pos, i))
    mid.divideScalar(36)
    for (let i = 0; i < 36; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i).sub(mid)
      expect(p.dot(new THREE.Vector3().fromBufferAttribute(nor, i))).toBeGreaterThan(0)
    }
    meshes.forEach(m => m.geometry.dispose())
    // Levels that are hidden draw nothing.
    expect(openingDetailGeometry(withKinds, [0, 0], 0, new Set()).size).toBe(0)
  })
})

describe('the marks on an elevation', () => {
  const box = { s0: 0, s1: 1, z0: 0, z1: 2 }
  const marks = (o: Parameters<typeof openingMarks>[0]) => openingMarks(o, 0, 100, 0, 200, 100)
  const swings = (o: Parameters<typeof openingMarks>[0]) => marks(o).filter(m => m.style === 'swing')

  it('points a hinged door’s dashed triangle at its hinge side', () => {
    const left = swings({ kind: 'door', hinge: 'left', box })
    expect(left).toHaveLength(1)
    // The middle point of the triangle is its point: on the left jamb, halfway up.
    expect(left[0].pts[1][0]).toBeLessThan(10)
    expect(left[0].pts[1][1]).toBeCloseTo(100, 6)
    const right = swings({ kind: 'door', style: 'hinged', hinge: 'right', box })
    expect(right[0].pts[1][0]).toBeGreaterThan(90)
  })

  it('draws a pair of doors hinged at both jambs, an awning hinged at its head, and arrows on sliders', () => {
    const pair = swings({ kind: 'door', style: 'double', hinge: 'left', box })
    expect(pair.map(m => m.pts[1][0] < 50)).toEqual([true, false])
    const awning = swings({ kind: 'window', style: 'awning', hinge: 'left', box })
    expect(awning).toHaveLength(1)
    expect(awning[0].pts[1][1]).toBeLessThan(10)
    // An arrow is a shaft and a head; the slider moves towards its fixed side.
    const slide = marks({ kind: 'door', style: 'sliding', hinge: 'left', box: { ...box, s1: 2.1 } })
    const shaft = slide.filter(m => m.pts.length === 2 && m.pts[0][1] === m.pts[1][1] && m.pts[0][1] === 100)[0]
    expect(shaft.pts[1][0]).toBeLessThan(shaft.pts[0][0])
    expect(swings({ kind: 'window', style: 'sliding', hinge: 'left', box })).toHaveLength(0)
  })

  it('zigzags a bifold, keeps a garage door’s ribs, and leaves a plain opening bare', () => {
    const bi = swings({ kind: 'door', style: 'bifold', hinge: 'left', box: { s0: 0, s1: 2.4, z0: 0, z1: 2.1 } })
    expect(bi).toHaveLength(4)
    const toward = bi.map(m => (m.pts[1][0] < Math.min(m.pts[0][0], m.pts[2][0]) ? 'l' : 'r'))
    expect(toward).toEqual(['l', 'r', 'l', 'r'])
    expect(marks({ kind: 'garage', hinge: 'left', box }).length).toBeGreaterThan(0)
    expect(marks({ kind: 'opening', hinge: 'left', box })).toEqual([])
  })
})
