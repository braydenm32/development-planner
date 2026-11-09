import Delaunator from 'delaunator'

/**
 * Triangulated irregular network over scattered (x, y, z) samples, with
 * linear interpolation inside the hull and flat extension outside it.
 */
export class Tin {
  readonly xs: Float64Array
  readonly ys: Float64Array
  readonly zs: Float64Array
  private readonly d: Delaunator<Float64Array>
  private readonly sign: number
  private last = 0

  constructor(points: { x: number; y: number; z: number }[]) {
    // Merge samples closer than 1 mm (averaging their heights).
    const key = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`
    const merged = new Map<string, { x: number; y: number; z: number; n: number }>()
    for (const p of points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue
      const k = key(p.x, p.y)
      const m = merged.get(k)
      if (m) {
        m.z += p.z
        m.n++
      } else merged.set(k, { ...p, n: 1 })
    }
    const pts = [...merged.values()]
    if (pts.length < 3) throw new Error('Need at least three survey points to build a terrain.')
    this.xs = new Float64Array(pts.map(p => p.x))
    this.ys = new Float64Array(pts.map(p => p.y))
    this.zs = new Float64Array(pts.map(p => p.z / p.n))
    const coords = new Float64Array(pts.length * 2)
    pts.forEach((p, i) => {
      coords[2 * i] = p.x
      coords[2 * i + 1] = p.y
    })
    this.d = new Delaunator(coords)
    if (this.d.triangles.length === 0) throw new Error('Survey points are all in a line, so no terrain can be built.')
    const t = this.d.triangles
    this.sign = Math.sign(this.orient(t[0], t[1], this.xs[t[2]], this.ys[t[2]])) || 1
  }

  get triangleCount(): number {
    return this.d.triangles.length / 3
  }

  private orient(a: number, b: number, px: number, py: number): number {
    return (this.xs[b] - this.xs[a]) * (py - this.ys[a]) - (this.ys[b] - this.ys[a]) * (px - this.xs[a])
  }

  /** Triangle containing (x, y), or -1 when outside the hull. Uses a walk from the last hit. */
  locate(x: number, y: number): number {
    const tri = this.d.triangles
    const half = this.d.halfedges
    let t = this.last
    const maxSteps = tri.length
    for (let step = 0; step < maxSteps; step++) {
      let moved = false
      // Start from a varying edge so the walk can't cycle forever.
      const start = step % 3
      for (let k = 0; k < 3; k++) {
        const e = 3 * t + ((start + k) % 3)
        const a = tri[e]
        const b = tri[e % 3 === 2 ? e - 2 : e + 1]
        if (this.orient(a, b, x, y) * this.sign < -1e-12) {
          const opp = half[e]
          if (opp < 0) return -1
          t = Math.floor(opp / 3)
          moved = true
          break
        }
      }
      if (!moved) {
        this.last = t
        return t
      }
    }
    return -1
  }

  /** Interpolated height at (x, y). */
  heightAt(x: number, y: number): number {
    const t = this.locate(x, y)
    if (t >= 0) return this.interpolate(t, x, y)
    return this.hullHeight(x, y)
  }

  private interpolate(t: number, x: number, y: number): number {
    const tri = this.d.triangles
    const a = tri[3 * t]
    const b = tri[3 * t + 1]
    const c = tri[3 * t + 2]
    const area = this.orient(a, b, this.xs[c], this.ys[c])
    if (Math.abs(area) < 1e-12) return (this.zs[a] + this.zs[b] + this.zs[c]) / 3
    const wa = this.orient(b, c, x, y) / area
    const wb = this.orient(c, a, x, y) / area
    const wc = 1 - wa - wb
    return wa * this.zs[a] + wb * this.zs[b] + wc * this.zs[c]
  }

  /** Height at the nearest point on the hull boundary. */
  private hullHeight(x: number, y: number): number {
    const hull = this.d.hull
    let best = Infinity
    let z = 0
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i]
      const b = hull[(i + 1) % hull.length]
      const ax = this.xs[a]
      const ay = this.ys[a]
      const dx = this.xs[b] - ax
      const dy = this.ys[b] - ay
      const len2 = dx * dx + dy * dy
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0
      const px = ax + t * dx
      const py = ay + t * dy
      const d2 = (px - x) ** 2 + (py - y) ** 2
      if (d2 < best) {
        best = d2
        z = this.zs[a] + t * (this.zs[b] - this.zs[a])
      }
    }
    return z
  }
}
