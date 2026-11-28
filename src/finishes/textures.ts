// Small patterns for the finishes, drawn in code (no image files): brick courses, weatherboards,
// render, roof sheet ribs, roof tile rows, floorboards, floor tiles, carpet and concrete. Each is
// a grey pattern that the material's colour tints, so one texture serves every colour. They're
// made once, the first time they're needed, and kept: there are only a handful.
//
// Surfaces carry their UVs in metres (src/finishes/surfaces.ts), so each pattern says how many
// metres one copy of it covers, and courses and ribs come out at their real size.

import * as THREE from 'three'

export type Pattern = 'brick' | 'render' | 'weatherboard' | 'metal' | 'tiles' | 'timber' | 'floorTile' | 'carpet' | 'concrete'

interface Made {
  /** Grey level 0..1 for each pixel, row by row from v = 0. */
  w: number
  h: number
  px: Float32Array
  /** Metres one copy covers along u and v. */
  size: [number, number]
}

/** A repeatable random sequence, so a pattern looks the same every time. */
function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvas(w: number, h: number, size: [number, number], fill: (x: number, y: number) => number): Made {
  const px = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = Math.min(1, Math.max(0, fill(x, y)))
  return { w, h, px, size }
}

/** Fine speckle, for render, carpet and concrete. */
function speckle(seed: number, w: number, h: number, base: number, spread: number) {
  const r = random(seed)
  const n = new Float32Array(w * h)
  for (let i = 0; i < n.length; i++) n[i] = base + (r() - 0.5) * spread
  return (x: number, y: number) => n[(y % h) * w + (x % w)]
}

const MAKERS: Record<Pattern, () => Made> = {
  // Stretcher bond: 230 x 76 mm bricks on 10 mm joints, two bricks by four courses.
  brick: () => {
    const r = random(7)
    const tone = Array.from({ length: 16 }, () => 0.8 + r() * 0.2)
    const grain = speckle(11, 256, 256, 0, 0.06)
    return canvas(256, 256, [0.48, 0.344], (x, y) => {
      const course = Math.floor(y / 64)
      const yy = y % 64
      const xs = (x + (course % 2) * 64) % 256
      const brick = Math.floor(xs / 128)
      const xx = xs % 128
      if (yy < 7 || xx < 5) return 0.55
      return tone[course * 2 + brick] + grain(x, y)
    })
  },
  render: () => {
    const g = speckle(3, 128, 128, 0.96, 0.06)
    return canvas(128, 128, [1, 1], g)
  },
  // Boards 150 mm deep: each lap throws a thin shadow on the board below.
  weatherboard: () =>
    canvas(64, 256, [1.2, 0.6], (_x, y) => {
      const t = (y % 64) / 64
      if (t > 0.94) return 0.5
      return 0.8 + 0.2 * (1 - t)
    }),
  // Ribs every 190 mm, running down the slope.
  metal: () =>
    canvas(128, 8, [0.76, 0.1], x => {
      const t = (x % 32) / 32
      if (t < 0.12) return 1
      if (t < 0.2) return 0.62
      return 0.9
    }),
  // Courses 340 mm up the slope, tiles 300 mm across, each row half a tile along.
  tiles: () =>
    canvas(128, 128, [0.6, 0.68], (x, y) => {
      const row = Math.floor(y / 64)
      const t = (y % 64) / 64
      const xs = (x + row * 32) % 64
      if (t > 0.86) return 0.5
      if (xs < 2) return 0.62
      // Each tile rounds over: lighter in its middle.
      return 0.78 + 0.22 * Math.sin((xs / 64) * Math.PI)
    }),
  // Boards 135 mm wide with joints at random lengths.
  timber: () => {
    const r = random(5)
    const joints = Array.from({ length: 4 }, () => Math.floor(r() * 256))
    const tone = Array.from({ length: 8 }, () => 0.82 + r() * 0.18)
    const grain = speckle(9, 64, 256, 0, 0.05)
    return canvas(64, 256, [0.54, 2.4], (x, y) => {
      const board = Math.floor(x / 16)
      if (x % 16 === 0) return 0.5
      const j = joints[board]
      if (Math.abs(y - j) < 1) return 0.55
      return tone[board + (y > j ? 4 : 0)] + grain(x, y) + 0.03 * Math.sin(y / 9 + board)
    })
  },
  // 600 mm square tiles on 3 mm grout lines.
  floorTile: () => {
    const g = speckle(13, 128, 128, 0.97, 0.04)
    return canvas(128, 128, [0.6, 0.6], (x, y) => (x < 1 || y < 1 ? 0.72 : g(x, y)))
  },
  carpet: () => {
    const g = speckle(17, 128, 128, 0.93, 0.14)
    return canvas(128, 128, [0.4, 0.4], g)
  },
  concrete: () => {
    const g = speckle(19, 128, 128, 0.95, 0.07)
    const r = random(23)
    const blots = Array.from({ length: 6 }, () => [r() * 128, r() * 128, 12 + r() * 20] as const)
    return canvas(128, 128, [2, 2], (x, y) => {
      let v = g(x, y)
      for (const [bx, by, br] of blots) {
        const d = Math.hypot(((x - bx + 192) % 128) - 64, ((y - by + 192) % 128) - 64)
        if (d < br) v -= 0.05 * (1 - d / br)
      }
      return v
    })
  },
}

/** The pattern as numbers, for tests. */
export const patternPixels = (p: Pattern) => MAKERS[p]()

const made = new Map<Pattern, THREE.DataTexture>()

/** The pattern's texture, made the first time and shared after. */
export function patternTexture(p: Pattern): THREE.DataTexture {
  const had = made.get(p)
  if (had) return had
  const m = MAKERS[p]()
  const data = new Uint8Array(m.w * m.h * 4)
  for (let i = 0; i < m.px.length; i++) {
    const v = Math.round(m.px[i] * 255)
    data.set([v, v, v, 255], i * 4)
  }
  const t = new THREE.DataTexture(data, m.w, m.h, THREE.RGBAFormat)
  t.name = `finish-${p}`
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1 / m.size[0], 1 / m.size[1])
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = 4
  t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  made.set(p, t)
  return t
}
