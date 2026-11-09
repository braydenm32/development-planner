import { signedArea, type Vec2 } from './geom'

/**
 * Ear-clipping triangulation of a simple polygon that keeps every vertex, including
 * ones in the middle of a straight run, so neighbouring faces share their edges exactly.
 */
export function triangulate(pts: Vec2[]): [number, number, number][] {
  const sign = signedArea(pts) >= 0 ? 1 : -1
  let scale = 0
  for (const p of pts) scale = Math.max(scale, Math.abs(p[0] - pts[0][0]), Math.abs(p[1] - pts[0][1]))
  const eps = 1e-12 * Math.max(1, scale * scale)
  const idx = pts.map((_, i) => i)
  const out: [number, number, number][] = []
  const area2 = (a: Vec2, b: Vec2, c: Vec2) => sign * ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
  const blocks = (a: Vec2, b: Vec2, c: Vec2, p: Vec2, strict: boolean) => {
    const ab = area2(a, b, p)
    const bc = area2(b, c, p)
    const ca = area2(c, a, p)
    // inside, or on the new diagonal c-a (which would leave a crack)
    if (ab > eps && bc > eps && ca > eps) return true
    return strict && ab >= -eps && bc >= -eps && ca >= -eps
  }
  for (let guard = 0; idx.length > 3 && guard < 10000; guard++) {
    let clipped = false
    for (const strict of [true, false]) {
      for (let k = 0; k < idx.length && !clipped; k++) {
        const ia = idx[(k - 1 + idx.length) % idx.length]
        const ib = idx[k]
        const ic = idx[(k + 1) % idx.length]
        const [a, b, c] = [pts[ia], pts[ib], pts[ic]]
        if (area2(a, b, c) <= eps) continue
        let ok = true
        for (const j of idx) {
          if (j === ia || j === ib || j === ic) continue
          const p = pts[j]
          if ((p[0] === a[0] && p[1] === a[1]) || (p[0] === c[0] && p[1] === c[1])) continue
          if (blocks(a, b, c, p, strict)) {
            ok = false
            break
          }
        }
        if (!ok) continue
        out.push([ia, ib, ic])
        idx.splice(k, 1)
        clipped = true
      }
      if (clipped) break
    }
    if (!clipped) {
      // Only straight runs remain (no area left), or the outline crosses itself.
      if (idx.every((_, k) => Math.abs(area2(pts[idx[(k - 1 + idx.length) % idx.length]], pts[idx[k]], pts[idx[(k + 1) % idx.length]])) <= eps)) break
      // drop a flat vertex and carry on
      const k = idx.findIndex((_, k) => area2(pts[idx[(k - 1 + idx.length) % idx.length]], pts[idx[k]], pts[idx[(k + 1) % idx.length]]) <= eps)
      if (k < 0) break
      idx.splice(k, 1)
    }
  }
  if (idx.length === 3 && Math.abs(area2(pts[idx[0]], pts[idx[1]], pts[idx[2]])) > eps) out.push([idx[0], idx[1], idx[2]])
  return out
}
