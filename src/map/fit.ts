// Fitting the survey's boundary onto the cadastre lot: the rotation and shift (no scale) that lay
// one outline over the other. A survey on its own local grid (eastings around 5000) has no tie to
// the state's maps, so this is how the app learns where the block really is.
//
// The survey's boundary is compared one way only, against the lot's edges: a battle-axe survey
// often leaves out the access handle that the title includes, so every survey edge should sit on
// a lot edge but not the other way round. Each pairing of a survey edge with a lot edge gives a
// start; a few rounds of nearest-point fitting (ICP, solved in closed form) settle it; the closest
// wins. Square-ish lots match nearly as well turned a quarter or half way, so among fits about as
// close as the best, the one nearest the survey's own north wins (surveyors draw to grid north).

import { signedArea, type Vec2 } from '../lib/geom'

/** Survey grid (the DXF's own eastings and northings) to MGA: rotate about `from`, then put it at `at`. */
export interface GridFit {
  /** A survey grid point (the survey's origin when fitted). */
  from: Vec2
  /** Where that point is in MGA. */
  at: Vec2
  /** Anticlockwise turn from the survey grid to MGA, in degrees. */
  rotation: number
}

export interface FitResult extends GridFit {
  /** Root mean square distance from the survey boundary to the lot's edges (m). */
  rms: number
  /** The worst distance (m). */
  worst: number
  /** Survey boundary area over the lot's area: well under 1 when the survey leaves part out. */
  areaRatio: number
  /** The survey was already on MGA and sits on the lot without moving. */
  onGrid: boolean
}

const RAD = Math.PI / 180

export function gridToMga(fit: GridFit, p: Vec2): Vec2 {
  const c = Math.cos(fit.rotation * RAD)
  const s = Math.sin(fit.rotation * RAD)
  const x = p[0] - fit.from[0]
  const y = p[1] - fit.from[1]
  return [fit.at[0] + c * x - s * y, fit.at[1] + s * x + c * y]
}

export function mgaToGrid(fit: GridFit, q: Vec2): Vec2 {
  const c = Math.cos(fit.rotation * RAD)
  const s = Math.sin(fit.rotation * RAD)
  const x = q[0] - fit.at[0]
  const y = q[1] - fit.at[1]
  return [fit.from[0] + c * x + s * y, fit.from[1] - s * x + c * y]
}

/** Turn the fit by `deg` about a survey point, or shift it by `[dE, dN]` metres: the hand adjustments. */
export function nudgeFit(fit: GridFit, move: { turn?: number; about?: Vec2; shift?: Vec2 }): GridFit {
  let next = fit
  if (move.turn) {
    const about = move.about ?? fit.from
    const pivot = gridToMga(fit, about)
    const turned = { ...fit, rotation: normalizeDeg(fit.rotation + move.turn) }
    const moved = gridToMga(turned, about)
    next = { ...turned, at: [turned.at[0] + pivot[0] - moved[0], turned.at[1] + pivot[1] - moved[1]] }
  }
  if (move.shift) next = { ...next, at: [next.at[0] + move.shift[0], next.at[1] + move.shift[1]] }
  return next
}

const normalizeDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180

function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L = dx * dx + dy * dy
  const t = L > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0
  return [a[0] + t * dx, a[1] + t * dy]
}

function closestOnRing(p: Vec2, ring: Vec2[]): Vec2 {
  let best: Vec2 = ring[0]
  let bd = Infinity
  for (let i = 0; i < ring.length; i++) {
    const q = closestOnSegment(p, ring[i], ring[(i + 1) % ring.length])
    const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2
    if (d < bd) {
      bd = d
      best = q
    }
  }
  return best
}

/** Points along the ring about every `step` metres, corners included. */
export function densify(ring: Vec2[], step = 1): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step))
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  return out
}

interface Rigid {
  /** radians */
  th: number
  tx: number
  ty: number
}

const apply = (r: Rigid, p: Vec2): Vec2 => {
  const c = Math.cos(r.th)
  const s = Math.sin(r.th)
  return [c * p[0] - s * p[1] + r.tx, s * p[0] + c * p[1] + r.ty]
}

/** The rigid motion (no scale) that best lays points `a` onto points `b`, least squares, closed form. */
function solveRigid(a: Vec2[], b: Vec2[]): Rigid {
  const n = a.length
  let ax = 0
  let ay = 0
  let bx = 0
  let by = 0
  for (let i = 0; i < n; i++) {
    ax += a[i][0]
    ay += a[i][1]
    bx += b[i][0]
    by += b[i][1]
  }
  ax /= n
  ay /= n
  bx /= n
  by /= n
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    const px = a[i][0] - ax
    const py = a[i][1] - ay
    const qx = b[i][0] - bx
    const qy = b[i][1] - by
    sxx += px * qx + py * qy
    sxy += px * qy - py * qx
  }
  const th = Math.atan2(sxy, sxx)
  const c = Math.cos(th)
  const s = Math.sin(th)
  return { th, tx: bx - (c * ax - s * ay), ty: by - (s * ax + c * ay) }
}

/** Share of the survey boundary that has to match: the rest may be where the two outlines differ (a handle's mouth). */
const KEEP = 0.85

function errors(r: Rigid, pts: Vec2[], ring: Vec2[]): { rms: number; worst: number } {
  const d = pts
    .map(p => {
      const q = apply(r, p)
      const c = closestOnRing(q, ring)
      return Math.hypot(c[0] - q[0], c[1] - q[1])
    })
    .sort((a, b) => a - b)
  const kept = d.slice(0, Math.max(3, Math.ceil(d.length * KEEP)))
  return { rms: Math.sqrt(kept.reduce((s, x) => s + x * x, 0) / kept.length), worst: d[d.length - 1] }
}

/** Nearest-point fitting, trimmed: the worst-matching points sit out each round, so a part the survey and lot don't share can't drag the fit. */
function icp(start: Rigid, pts: Vec2[], ring: Vec2[], rounds = 12): Rigid {
  let r = start
  for (let i = 0; i < rounds; i++) {
    const pairs = pts.map(p => {
      const q = apply(r, p)
      const c = closestOnRing(q, ring)
      return { p, c, d: Math.hypot(c[0] - q[0], c[1] - q[1]) }
    })
    const sorted = pairs.map(x => x.d).sort((a, b) => a - b)
    const cut = Math.max(0.05, sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * KEEP))])
    const use = pairs.filter(x => x.d <= cut)
    if (use.length < 3) break
    const next = solveRigid(
      use.map(x => x.p),
      use.map(x => x.c),
    )
    const done = Math.abs(next.th - r.th) < 1e-8 && Math.hypot(next.tx - r.tx, next.ty - r.ty) < 1e-6
    r = next
    if (done) break
  }
  return r
}

/** How close (m RMS) a fit can be to the best and still win by being nearer the survey's own north. */
const NORTH_SLACK = 0.25

/**
 * Lay the survey boundary (survey grid) onto the lot (MGA). `from` is the survey point the result is
 * pinned by (the survey's origin, so numbers stay small).
 */
export function fitBoundary(survey: Vec2[], lot: Vec2[], from: Vec2): FitResult {
  if (survey.length < 3 || lot.length < 3) throw new Error('Both outlines need at least three corners.')
  // Work about the outlines' own middles, so turning doesn't fling them far away.
  const sc = mean(survey)
  const lc = mean(lot)
  const S = survey.map(p => [p[0] - sc[0], p[1] - sc[1]] as Vec2)
  const L = lot.map(p => [p[0] - lc[0], p[1] - lc[1]] as Vec2)
  const pts = densify(S, 1)
  const coarse = densify(S, 3)

  const starts: Rigid[] = []
  const edges = (ring: Vec2[]) =>
    ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length]
      return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]) }
    })
  const se = edges(S).filter(e => e.len > 2)
  const le = edges(L).filter(e => e.len > 2)
  for (const s of se) {
    for (const l of le) {
      for (const flip of [0, Math.PI]) {
        const th = l.ang - s.ang + flip
        const c = Math.cos(th)
        const sn = Math.sin(th)
        // Pin the survey edge's middle to the lot edge's middle: right for edges both outlines share in full.
        const sm: Vec2 = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2]
        const lm: Vec2 = [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2]
        starts.push({ th, tx: lm[0] - (c * sm[0] - sn * sm[1]), ty: lm[1] - (sn * sm[0] + c * sm[1]) })
        // And its corner to the lot edge's corner: right for a shared corner on a part-shared edge.
        const sa = flip ? s.b : s.a
        starts.push({ th, tx: l.a[0] - (c * sa[0] - sn * sa[1]), ty: l.a[1] - (sn * sa[0] + c * sa[1]) })
      }
    }
  }
  for (let d = 0; d < 360; d += 15) starts.push({ th: d * RAD, tx: 0, ty: 0 })

  // A cheap first pass on the coarse points, then refine the promising ones on the fine points.
  const rough = starts.map(r0 => {
    const r = icp(r0, coarse, L, 6)
    return { r, e: errors(r, coarse, L).rms }
  })
  rough.sort((a, b) => a.e - b.e)
  const seen: Rigid[] = []
  const fine: { r: Rigid; rms: number; worst: number }[] = []
  for (const { r } of rough) {
    if (fine.length >= 12) break
    if (seen.some(q => Math.abs(angleDiff(q.th, r.th)) < 0.5 * RAD && Math.hypot(q.tx - r.tx, q.ty - r.ty) < 0.5)) continue
    seen.push(r)
    const rf = icp(r, pts, L, 60)
    fine.push({ r: rf, ...errors(rf, pts, L) })
  }
  fine.sort((a, b) => a.rms - b.rms)
  const best = fine[0]
  // Only a fit turned well away from the best one (a quarter or half turn) can win on north; a
  // nearby angle that fits a little worse is just a worse fit.
  const rivals = fine.filter(f => f === best || (f.rms <= best.rms + NORTH_SLACK && Math.abs(angleDiff(f.r.th, best.r.th)) > 5 * RAD))
  const pick = rivals.sort((a, b) => Math.abs(angleDiff(a.r.th, 0)) - Math.abs(angleDiff(b.r.th, 0)))[0]

  // The fit is about the middles; express it as MGA = R·(p − from) + at.
  const th = pick.r.th
  const atMid = apply(pick.r, [from[0] - sc[0], from[1] - sc[1]])
  const at: Vec2 = [atMid[0] + lc[0], atMid[1] + lc[1]]
  const result: FitResult = {
    from,
    at,
    rotation: normalizeDeg(th / RAD),
    rms: pick.rms,
    worst: pick.worst,
    areaRatio: Math.abs(signedArea(survey)) / Math.abs(signedArea(lot)),
    onGrid: false,
  }

  // A survey already on MGA: keep it where it is when that fits about as well.
  const identity: GridFit = { from, at: from, rotation: 0 }
  const asIs = errorsOf(identity, survey, lot)
  if (asIs.rms <= Math.max(1, result.rms + NORTH_SLACK)) return { ...identity, ...asIs, areaRatio: result.areaRatio, onGrid: true }
  return result
}

/** How far the survey boundary sits from the lot's edges under a fit (m). */
export function errorsOf(fit: GridFit, survey: Vec2[], lot: Vec2[]): { rms: number; worst: number } {
  const pts = densify(survey, 1).map(p => gridToMga(fit, p))
  return errors({ th: 0, tx: 0, ty: 0 }, pts, lot)
}

const mean = (ps: Vec2[]): Vec2 => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length]
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))
