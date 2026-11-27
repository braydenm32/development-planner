import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { bearingOf, fovFromFocal35, phoneFov, project, rayThrough, verticalFov, type Shot } from '../camera'
import { partsFor, solveAim, type PointPair } from '../solve'

const W = 4032
const H = 3024

/** A camera 1.6 m up at the street, looking roughly north-east at a made-up house. */
const TRUE: Shot = { eye: new THREE.Vector3(2, 1.6, 30), heading: 35, tilt: -4, roll: 1.5, fov: 66, aspect: W / H }

/** Corners of a made-up house, 10 × 12 m, 2.7 m walls with a roof ridge. */
const CORNERS = [
  [10, 0, 10],
  [22, 0, 10],
  [22, 0, -2],
  [10, 2.7, 10],
  [22, 2.7, 10],
  [16, 5.2, 4],
  [10, 2.7, -2],
].map(([x, y, z]) => new THREE.Vector3(x, y, z))

/** Pairs as the person would click them: each corner where the true camera saw it. */
const pairsFrom = (pts: THREE.Vector3[]): PointPair[] => pts.map(model => ({ model, photo: project(TRUE, model)! }))

describe('the photo camera', () => {
  it('puts a point back where its ray came from', () => {
    const p = CORNERS[4]
    const [u, v] = project(TRUE, p)!
    const d = rayThrough(TRUE, u, v)
    const back = p.clone().sub(TRUE.eye).normalize()
    expect(d.distanceTo(back)).toBeLessThan(1e-9)
  })

  it('faces the heading it is given: a point due along it lands mid-photo', () => {
    const s: Shot = { ...TRUE, roll: 0, tilt: 0 }
    const h = (s.heading * Math.PI) / 180
    const ahead = s.eye.clone().add(new THREE.Vector3(Math.sin(h), 0, -Math.cos(h)).multiplyScalar(20))
    const [u, v] = project(s, ahead)!
    expect(u).toBeCloseTo(0.5, 9)
    expect(v).toBeCloseTo(0.5, 9)
    expect(bearingOf(ahead.clone().sub(s.eye)).bearing).toBeCloseTo(35, 9)
  })

  it('leans clockwise: the horizon rises to the right', () => {
    const s: Shot = { ...TRUE, tilt: 0, roll: 5 }
    const h = (s.heading * Math.PI) / 180
    const side = new THREE.Vector3(Math.cos(h), 0, Math.sin(h))
    const fwd = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h))
    const left = project(s, s.eye.clone().add(fwd.clone().multiplyScalar(50)).sub(side.clone().multiplyScalar(10)))!
    const right = project(s, s.eye.clone().add(fwd.clone().multiplyScalar(50)).add(side.clone().multiplyScalar(10)))!
    expect(right[1]).toBeLessThan(left[1])
  })

  it('reads the lens angle from a 35 mm figure, and a phone lens with none', () => {
    // 26 mm on a 4:3 photo is about 67° across its long side.
    expect(fovFromFocal35(26, 4032, 3024)).toBeCloseTo(67.4, 0)
    expect(fovFromFocal35(26, 3024, 4032)).toBeLessThan(55)
    expect(phoneFov(4000, 3000)).toBeCloseTo(65, 6)
    expect(verticalFov({ fov: 90, aspect: 1 })).toBeCloseTo(90, 9)
  })
})

describe('lining up from point pairs', () => {
  it('asks for the direction and tilt from one pair, a lens angle or lean from two, all four from three', () => {
    expect(partsFor(1, 'fov')).toEqual(['heading', 'tilt'])
    expect(partsFor(2, 'roll')).toEqual(['heading', 'tilt', 'roll'])
    expect(partsFor(3, 'fov')).toEqual(['heading', 'tilt', 'fov', 'roll'])
  })

  it('recovers a direction 25° out, and the tilt, from one pair', () => {
    const wrong: Shot = { ...TRUE, heading: TRUE.heading + 25, tilt: 6 }
    const r = solveAim(wrong, pairsFrom([CORNERS[4]]), ['heading', 'tilt'], W, H)
    expect(r.problem).toBeNull()
    // One pair can't fix the lean, which is still right here, so the direction comes back exactly.
    expect(r.aim.heading).toBeCloseTo(TRUE.heading, 3)
    expect(r.aim.tilt).toBeCloseTo(TRUE.tilt, 3)
  })

  it('recovers the direction from the far side of north', () => {
    const t: Shot = { ...TRUE, heading: 355 }
    const pt = t.eye.clone().add(new THREE.Vector3(-3, 1, -20))
    const pairs = [{ model: pt, photo: project(t, pt)! }]
    const r = solveAim({ ...t, heading: 20 }, pairs, ['heading', 'tilt'], W, H)
    expect(r.problem).toBeNull()
    expect(r.aim.heading).toBeCloseTo(355, 3)
  })

  it('recovers the lens angle from two pairs, and the lean from two', () => {
    const lens = solveAim({ ...TRUE, heading: 50, fov: 50 }, pairsFrom([CORNERS[0], CORNERS[4]]), ['heading', 'tilt', 'fov'], W, H)
    expect(lens.problem).toBeNull()
    expect(lens.aim.fov).toBeCloseTo(TRUE.fov, 2)
    expect(lens.aim.heading).toBeCloseTo(TRUE.heading, 2)
    const lean = solveAim({ ...TRUE, heading: 20, roll: -6 }, pairsFrom([CORNERS[0], CORNERS[4]]), ['heading', 'tilt', 'roll'], W, H)
    expect(lean.problem).toBeNull()
    expect(lean.aim.roll).toBeCloseTo(TRUE.roll, 2)
  })

  it('recovers all four from four pairs', () => {
    const r = solveAim({ ...TRUE, heading: 10, tilt: 5, roll: -4, fov: 80 }, pairsFrom(CORNERS.slice(0, 4)), ['heading', 'tilt', 'fov', 'roll'], W, H)
    expect(r.problem).toBeNull()
    expect(r.aim.heading).toBeCloseTo(TRUE.heading, 2)
    expect(r.aim.tilt).toBeCloseTo(TRUE.tilt, 2)
    expect(r.aim.roll).toBeCloseTo(TRUE.roll, 2)
    expect(r.aim.fov).toBeCloseTo(TRUE.fov, 2)
    expect(r.worstPx).toBeLessThan(0.5)
  })

  it('says so, and changes nothing, when the pairs are no use', () => {
    const near = solveAim(TRUE, pairsFrom([CORNERS[0], CORNERS[0].clone().add(new THREE.Vector3(0.01, 0, 0))]), ['heading', 'tilt', 'fov'], W, H)
    expect(near.problem).toMatch(/too close together/)
    expect(near.aim.heading).toBe(TRUE.heading)
    // Two pairs that can't both be right from here.
    const bad: PointPair[] = [
      { model: CORNERS[0], photo: [0.1, 0.5] },
      { model: CORNERS[1], photo: [0.15, 0.9] },
      { model: CORNERS[5], photo: [0.9, 0.1] },
    ]
    expect(solveAim(TRUE, bad, ['heading', 'tilt', 'fov', 'roll'], W, H).problem).not.toBeNull()
    expect(solveAim(TRUE, [{ model: TRUE.eye.clone(), photo: [0.5, 0.5] }], ['heading', 'tilt'], W, H).problem).toMatch(/where the photo was taken/)
  })
})
