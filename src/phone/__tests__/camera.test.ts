// The 3D presets as maths (where each puts the camera, north up, the move between them),
// which way the street is, and remembering the camera for each project.

import { describe, expect, it } from 'vitest'
import {
  bearingWord,
  between,
  edgeNormals,
  fitDistance,
  forgetPose,
  loadPose,
  loadStreetSide,
  moveDuration,
  northUp,
  presetPose,
  projectKey,
  REAR_ELEVATION,
  savePose,
  saveStreetSide,
  shortestTurn,
  streetBearing,
  toSpherical,
  VIEW_ELEVATION,
  type Frame,
  type Pose,
  type Vec3,
} from '../camera'
import { siteFrame } from '../frame'
import { pinLabel } from '../pin'
import { house, loadBlock } from './block'

const frame: Frame = { target: [4, 2, -6], radius: 7, blockRadius: 25, street: 0 }
const FOV = 45
const DEG = Math.PI / 180

const offset = (p: Pose): Vec3 => [p.position[0] - p.target[0], p.position[1] - p.target[1], p.position[2] - p.target[2]]
/** The compass bearing from the target out to the camera. */
const bearingOf = (p: Pose) => {
  const [x, , z] = offset(p)
  return ((Math.atan2(x, -z) / DEG) % 360 + 360) % 360
}
const elevationOf = (p: Pose) => {
  const [x, y, z] = offset(p)
  return Math.atan2(y, Math.hypot(x, z)) / DEG
}
const close3 = (a: Vec3, b: Vec3, digits = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits))

/** A storage that keeps things in memory. */
function memory() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }
}

describe('the presets', () => {
  it('look at the house from the street side, a little above, with the house and some block in view', () => {
    for (const street of [0, 90, 200, 315]) {
      const p = presetPose('street', { ...frame, street }, FOV, 0.56)
      expect(p.target).toEqual(frame.target)
      expect(bearingOf(p)).toBeCloseTo(street, 6)
      expect(elevationOf(p)).toBeCloseTo(VIEW_ELEVATION, 6)
      const r = Math.max(frame.radius * 1.4, frame.blockRadius * 0.45)
      expect(Math.hypot(...offset(p))).toBeCloseTo(fitDistance(r, FOV, 0.56), 6)
    }
  })

  it('look from the rear from the other side, a little higher, over the bank', () => {
    const p = presetPose('rear', { ...frame, street: 30 }, FOV, 1.6)
    expect(bearingOf(p)).toBeCloseTo(210, 6)
    expect(elevationOf(p)).toBeCloseTo(REAR_ELEVATION, 6)
  })

  it('look straight down from above with north at the top of the screen', () => {
    const p = presetPose('above', frame, FOV, 0.56)
    const [x, y, z] = offset(p)
    expect(x).toBe(0)
    expect(y).toBeGreaterThan(0)
    // A hair to the south (+z), so OrbitControls turns the screen's top to the north.
    expect(z).toBeGreaterThan(0)
    expect(z / y).toBeLessThan(0.01)
    expect(y).toBeCloseTo(fitDistance(frame.blockRadius * 1.02, FOV, 0.56), 6)
  })

  it('fit the same sphere whether the phone is upright or sideways', () => {
    // Upright, the narrow width sets the distance; sideways, the height does.
    expect(fitDistance(10, FOV, 0.5)).toBeGreaterThan(fitDistance(10, FOV, 2))
    const v = (FOV / 2) * DEG
    expect(fitDistance(10, FOV, 2)).toBeCloseTo(10 / Math.sin(v), 9)
  })
})

describe('north up', () => {
  it('turns the camera round its target to look north, keeping height and distance', () => {
    const p: Pose = { position: [30, 18, 10], target: [2, 1, -3] }
    const n = northUp(p)
    expect(n.target).toEqual(p.target)
    expect(bearingOf(n)).toBeCloseTo(180, 6)
    expect(Math.hypot(...offset(n))).toBeCloseTo(Math.hypot(...offset(p)), 9)
    expect(offset(n)[1]).toBeCloseTo(offset(p)[1], 9)
    // Looking north: the camera is south of its target.
    expect(toSpherical(offset(n)).theta).toBeCloseTo(0, 9)
  })
})

describe('the move between presets', () => {
  const a = presetPose('street', { ...frame, street: 350 }, FOV, 0.56)
  const b = presetPose('street', { ...frame, street: 20 }, FOV, 0.56)

  it('starts and ends on the poses', () => {
    const c = presetPose('above', frame, FOV, 0.56)
    close3(between(a, c, 0).position, a.position)
    close3(between(a, c, 1).position, c.position)
    close3(between(a, c, 1).target, c.target)
  })

  it('swings the short way round, past north, not the long way', () => {
    const mid = between(a, b, 0.5)
    expect(bearingOf(mid)).toBeLessThan(10)
    expect(bearingOf(mid) > 340 || bearingOf(mid) < 20).toBe(true)
    expect(shortestTurn(350 * DEG, 20 * DEG)).toBeCloseTo(30 * DEG, 9)
    expect(shortestTurn(20 * DEG, 350 * DEG)).toBeCloseTo(-30 * DEG, 9)
  })

  it('keeps its distance from the target on the way (arcs, never cuts through)', () => {
    for (const t of [0.2, 0.5, 0.8]) expect(Math.hypot(...offset(between(a, b, t)))).toBeCloseTo(Math.hypot(...offset(a)), 6)
  })

  it('takes longer for a bigger turn, but never long', () => {
    const near = moveDuration(a, b)
    const far = moveDuration(a, presetPose('rear', { ...frame, street: 350 }, FOV, 0.56))
    expect(near).toBeGreaterThanOrEqual(450)
    expect(far).toBeGreaterThan(near)
    expect(far).toBeLessThanOrEqual(900)
  })
})

describe('the street side', () => {
  // 40 m deep, 20 m wide: the long sides face east and west.
  const rect: [number, number][] = [
    [0, 0],
    [20, 0],
    [20, 40],
    [0, 40],
  ]

  it('works out the bearing out of each side, either way round', () => {
    const out = edgeNormals(rect).map(e => Math.round(e.bearing))
    expect(out).toEqual([180, 90, 0, 270])
    expect(
      edgeNormals([...rect].reverse())
        .map(e => Math.round(e.bearing))
        .sort((x, y) => x - y),
    ).toEqual([0, 90, 180, 270])
  })

  it('is the low side until picked, square to the block', () => {
    // The block falls a little east of north: the street is the north side.
    expect(streetBearing(rect, 15)).toBeCloseTo(0, 9)
    expect(streetBearing(rect, 170)).toBeCloseTo(180, 9)
  })

  it('is the side picked by hand', () => {
    expect(streetBearing(rect, 15, 'W')).toBeCloseTo(270, 9)
    expect(streetBearing(rect, 15, 'E')).toBeCloseTo(90, 9)
    expect(streetBearing(rect, 15, 'S')).toBeCloseTo(180, 9)
  })

  it('says the bearing in words', () => {
    expect(bearingWord(0)).toBe('north')
    expect(bearingWord(44)).toBe('north-east')
    expect(bearingWord(-90)).toBe('west')
    expect(bearingWord(359)).toBe('north')
  })

  it('frames the house on the synthetic block, looking from its low (north) side', () => {
    const { survey, terrain } = loadBlock()
    const plan = house()
    const f = siteFrame(plan, survey, terrain, 0, 1, 'auto')
    expect(bearingWord(f.street)).toBe('north')
    expect(f.radius).toBeGreaterThan(5)
    expect(f.blockRadius).toBeCloseTo(25, 6)
    // The house's middle, 1.5 m above its floor.
    expect(f.target[1]).toBeCloseTo(28.6 + 1.5, 6)
    expect(siteFrame(plan, survey, terrain, 0, 1, 'E').street).toBeCloseTo(90, 6)
    // Before there is a house it frames the block.
    expect(siteFrame(null, survey, terrain, 0, 1, 'auto').radius).toBeCloseTo(25, 6)
  })
})

describe('remembering the camera', () => {
  const pose: Pose = { position: [10.12345, 20, -30], target: [1, 2, 3] }

  it('keeps it for each project, rounded to the millimetre, with the Top of view it was left under', () => {
    const s = memory()
    savePose('a', pose, 15, s)
    expect(loadPose('a', s)).toEqual({ position: [10.123, 20, -30], target: [1, 2, 3], up: 15 })
    expect(loadPose('b', s)).toBeNull()
    savePose('b', pose, undefined, s)
    expect(loadPose('b', s)).toEqual({ position: [10.123, 20, -30], target: [1, 2, 3] })
  })

  it('forgets it on Reset', () => {
    const s = memory()
    savePose('a', pose, 0, s)
    forgetPose('a', s)
    expect(loadPose('a', s)).toBeNull()
  })

  it('ignores anything broken, and storage that throws', () => {
    const s = memory()
    s.setItem('camera-v1:a', '{nonsense')
    expect(loadPose('a', s)).toBeNull()
    s.setItem('camera-v1:a', JSON.stringify({ position: [1, 2], target: [0, 0, 0] }))
    expect(loadPose('a', s)).toBeNull()
    s.setItem('camera-v1:a', JSON.stringify({ position: [1, 2, null], target: [0, 0, 0] }))
    expect(loadPose('a', s)).toBeNull()
    const throws = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('full')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadPose('a', throws)).toBeNull()
    expect(() => savePose('a', pose, 0, throws)).not.toThrow()
    expect(() => forgetPose('a', throws)).not.toThrow()
    expect(loadPose('a', null)).toBeNull()
  })

  it('keeps the street side picked for each project', () => {
    const s = memory()
    expect(loadStreetSide('a', s)).toBe('auto')
    saveStreetSide('a', 'W', s)
    expect(loadStreetSide('a', s)).toBe('W')
    expect(loadStreetSide('b', s)).toBe('auto')
    s.setItem('street-side-v1:b', 'up')
    expect(loadStreetSide('b', s)).toBe('auto')
  })

  it('tells projects apart by their survey before they have an id', () => {
    const a = projectKey({ fileName: 'survey.dxf', dxfText: 'one\ntwo' })
    expect(projectKey({ fileName: 'survey.dxf', dxfText: 'one\ntwo' })).toBe(a)
    expect(projectKey({ fileName: 'survey.dxf', dxfText: 'one\nthree' })).not.toBe(a)
    expect(projectKey({ fileName: 'other.dxf', dxfText: 'one\ntwo' })).not.toBe(a)
  })
})

describe('the level read off the ground', () => {
  it('says whether the ground there is natural, cut or filled', () => {
    expect(pinLabel(0)).toBe('Natural ground')
    expect(pinLabel(0.015)).toBe('Natural ground')
    expect(pinLabel(-0.42)).toBe('Finished ground · 0.42 m cut')
    expect(pinLabel(1.2)).toBe('Finished ground · 1.20 m fill')
  })
})
