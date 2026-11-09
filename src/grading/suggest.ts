// Where a retaining wall would do better than a batter: along the edge of the house pad, a slab
// or a painted grading area, looking out the way its batter would run. The rules are data
// (SUGGEST_RULES), each with the one line it gives; suggestWalls applies them to the earthworks.
//
// For each grid node along a levelled area's edge, the batter is walked outward at the project's
// slope until it meets the natural ground. A wall is suggested where, on that walk, the batter
//  - crosses the boundary, or comes within the Housing Code's 1 m of a side or rear boundary
//    (cl 3.30, as hc-works-boundary measures it);
//  - runs into the house or other levelled ground beyond its foot (a step it can't make in the
//    room there), or a tree's protection zone;
//  - ends up taller than a batter alone should be, or so wide it covers more ground than a wall
//    would (the rule: wider than WIDE_BATTER).
// Neighbouring edge nodes with the same finding are joined into one straight wall along the edge.

import { ENGINEER_HEIGHT, needsEngineer } from '../checks/engineer'
import { crosses, type Barrier, type PreparedEarthworks, type PreparedPlatform } from '../lib/earthworks'
import { pointInPolygon, signedArea, type Vec2 } from '../lib/geom'
import { bearingName } from '../lib/terrain'

export type RuleId = 'boundary' | 'clearance' | 'room' | 'tall' | 'wide' | 'implied'

/** Earthworks must stay more than this from a side or rear boundary: Housing Code cl 3.30 (hc-works-boundary) (m). */
export const WORKS_CLEARANCE = 1
/** A batter taller than this is better held by a wall: hard to keep stable, to mow or to walk (m). */
export const TALL_BATTER = 1
/**
 * A batter wider than this covers more ground than a wall would: a wall and its footing take about
 * 0.5 m, so past 3 m the batter uses six times the yard the wall does (m).
 */
export const WIDE_BATTER = 3
/** Walls lower than this aren't worth suggesting (m). */
export const MIN_WALL_HEIGHT = 0.15
/** Nor shorter than this (m). */
export const MIN_WALL_LENGTH = 1
/** From this, a retaining wall needs a professional engineer's certificate: the app's one figure (src/checks/engineer.ts) (m). */
export const ENGINEER_OVER = ENGINEER_HEIGHT
/** Levelled ground within this of the batter's level takes the batter in, rather than blocking it (m). */
const ABSORB = 0.3
/** The furthest a batter is walked (m). */
const MAX_RUN = 40
/** How much steeper than the batter the walk tolerates before calling it met (m). */
const TOUCH = 0.02

export interface WhyFacts {
  kind: 'cut' | 'fill'
  /** The wall's height (m). */
  wall: number
  /** The boundary it crosses or comes near: "east". */
  edge?: string
  /** What the batter runs into: "the house". */
  what?: string
  /** The batter's height and width without a wall (m). */
  height?: number
  width?: number
}

export interface SuggestRule {
  id: RuleId
  /** Short name, for a list. */
  title: string
  /** The rule, in words. */
  rule: string
  /** The one line a suggestion gives. */
  why: (f: WhyFacts) => string
}

const Kind = (k: 'cut' | 'fill') => (k === 'cut' ? 'Cut' : 'Fill')
/** A wall height as the line gives it: up to the next 100 mm, since walls are built up to a height. */
export const wallText = (h: number) => `${(Math.ceil(h * 10 - 1e-6) / 10).toFixed(1)} m`
const mText = (v: number) => `${v.toFixed(1)} m`

/** The rules, most pressing first: a suggestion gives the first one that holds anywhere along it. */
export const SUGGEST_RULES: SuggestRule[] = [
  {
    id: 'boundary',
    title: 'Crosses the boundary',
    rule: 'The batter would run over the boundary onto the neighbour’s land or the street.',
    why: f => `${Kind(f.kind)} batter crosses the ${f.edge ?? ''} boundary: a ${wallText(f.wall)} wall here keeps it inside`.replace('  ', ' '),
  },
  {
    id: 'clearance',
    title: 'Too close to the boundary',
    rule: `The batter would come within ${WORKS_CLEARANCE} m of a side or rear boundary (Housing Code cl 3.30).`,
    why: f => `${Kind(f.kind)} batter comes within ${WORKS_CLEARANCE} m of the ${f.edge ?? ''} boundary: a ${wallText(f.wall)} wall here keeps it clear`.replace('  ', ' '),
  },
  {
    id: 'room',
    title: 'No room for the batter',
    rule: 'The batter would run into the house, other levelled ground at a different level, or a tree’s protection zone.',
    why: f => `No room for the ${f.kind} batter before it meets ${f.what ?? 'other works'}: a ${wallText(f.wall)} wall here holds it`,
  },
  {
    id: 'tall',
    title: 'Batter too tall',
    rule: `The batter would be more than ${TALL_BATTER} m high: taller than a batter alone should be.`,
    why: f => `${Kind(f.kind)} batter would be ${mText(f.height ?? 0)} high, more than the ${TALL_BATTER} m a batter alone should be: a ${wallText(f.wall)} wall holds it`,
  },
  {
    id: 'wide',
    title: 'Batter covers too much ground',
    rule: `The batter would be more than ${WIDE_BATTER} m wide: more ground than a wall and its footing take, about six times over.`,
    why: f => `${Kind(f.kind)} batter would be ${mText(f.width ?? 0)} wide, more ground than a wall takes: a ${wallText(f.wall)} wall gives that strip back as level ground`,
  },
]

/**
 * Not a suggestion but a wall the design already has: with the cut (or fill) slopes set to
 * Retaining wall the ground stops in a vertical face, and someone has to build the wall that holds
 * it. Traced like the suggestions, it shows dashed with its height, and counts as an implied wall
 * (./implied.ts).
 */
export const IMPLIED_RULE: SuggestRule = {
  id: 'implied',
  title: 'Vertical edge',
  rule: 'The slopes are set to Retaining wall, so the ground stops in a vertical face here: a wall someone has to build.',
  why: f => `${Kind(f.kind)} slopes are set to Retaining wall, so this ${f.kind} edge is a ${wallText(f.wall)} wall someone has to build`,
}

// The implied walls come before every suggestion: they're already in the design.
const RANK: Record<RuleId, number> = { implied: -1, ...(Object.fromEntries(SUGGEST_RULES.map((r, i) => [r.id, i])) as Record<Exclude<RuleId, 'implied'>, number>) }
export const ruleOf = (id: RuleId) => (id === 'implied' ? IMPLIED_RULE : SUGGEST_RULES[RANK[id]])

/** A retaining wall worth adding, with why. */
export interface WallSuggestion {
  key: string
  /** The levelled area it's along (its platform id). */
  source: string
  kind: 'cut' | 'fill'
  rule: RuleId
  /**
   * The wall's centreline, in the survey's local frame, with the levelled area on its left: one
   * straight run, or several joined round the area's corners.
   */
  path: Vec2[]
  /** Its longest straight run, which its tag sits by. */
  a: Vec2
  b: Vec2
  /** The level of the levelled area (RL). */
  level: number
  /** Ground it holds back, at most (m). */
  height: number
  /** Its face, ground to ground: each straight run's length times the ground it holds there on average (m²). */
  face: number
  why: string
  /** Needs a professional engineer's certificate (needsEngineer). */
  engineer: boolean
}

/** A suggestion already turned down: a point on its line and its direction (degrees, 0 to 180), in the survey's local frame. */
export interface Dismissal {
  at: Vec2
  dir: number
}

export interface SuggestInput {
  prep: PreparedEarthworks
  /** The lot, in the survey's local frame. */
  boundary: Vec2[]
  /** The boundary edges (by index) the clearance is measured to: the side and rear ones. */
  counted: number[]
  /** Retaining walls already drawn, which batters stop at. */
  barriers: Barrier[]
  /** Trees' protection zones to keep batters out of. */
  trees: { at: Vec2; r: number }[]
  /** The platform ids to look along (the house pad, slabs, painted areas). */
  sources: string[]
  /** Platforms of one family never block each other (the house pad, its piers and its slabs). Null: they don't block anything. */
  family: (p: PreparedPlatform) => string | null
  /** What a platform is called when a batter runs into it: "the house". */
  label: (p: PreparedPlatform) => string
  dismissed?: Dismissal[]
  /** The wall's thickness, so its face sits on the levelled area's edge (m). */
  thickness?: number
  /** Only the implied walls (vertical edges), which skip the batter walk: cheap, and the same whatever the trees and dismissals. */
  impliedOnly?: boolean
  /**
   * The house's outline. A vertical edge along it (no level ground past the slab) is held by the
   * house's own walls and footings, so it isn't an implied wall; only edges outside the house are.
   */
  house?: Vec2[][]
}

/** A vertical edge this close to the house's outline is the house's own wall (m). */
export const HOUSE_HOLDS = 0.3

interface Hit {
  k: number
  i: number
  j: number
  pos: Vec2
  n: Vec2
  kind: 'cut' | 'fill'
  rule: RuleId
  wall: number
  edge?: number
  what?: string
  height: number
  width: number
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

/** Which way each boundary edge faces, outward: "east". */
export function edgeNames(boundary: Vec2[]): string[] {
  const ccw = signedArea(boundary) > 0
  return boundary.map((a, i) => {
    const b = boundary[(i + 1) % boundary.length]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    // Outward is to the right of a counter-clockwise ring.
    const out: Vec2 = ccw ? [dy, -dx] : [-dy, dx]
    return bearingName(((Math.atan2(out[0], out[1]) * 180) / Math.PI + 360) % 360)
  })
}

/** Direction of a line, degrees in [0, 180). */
export const lineDir = (a: Vec2, b: Vec2) => (((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI) % 180 + 180) % 180

const angleApart = (p: number, q: number) => {
  const d = Math.abs(p - q) % 180
  return Math.min(d, 180 - d)
}

/** The retaining walls the earthworks would be better with, most pressing first. */
export function suggestWalls(inp: SuggestInput): WallSuggestion[] {
  const { prep, boundary } = inp
  const f = prep.natural
  const { nx, ny, cell, x0, y0 } = f
  const names = edgeNames(boundary)
  const thickness = inp.thickness ?? 0.2
  const nodeAt = (p: Vec2) => {
    const i = Math.round((p[0] - x0) / cell)
    const j = Math.round((p[1] - y0) / cell)
    return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i
  }
  const nearestEdge = (p: Vec2, among: number[]) => {
    let best = -1
    let d = Infinity
    for (const e of among) {
      const x = distToSegment(p, boundary[e], boundary[(e + 1) % boundary.length])
      if (x < d) {
        d = x
        best = e
      }
    }
    return { edge: best, dist: d }
  }
  const all = boundary.map((_, i) => i)
  const reach = Math.max(1, 3 * cell)
  const rr = Math.ceil(reach / cell)
  const out: WallSuggestion[] = []

  for (const id of inp.sources) {
    const P = prep.platforms.find(q => q.id === id)
    if (!P || P.isRamp) continue
    const fam = inp.family(P)
    const L = P.level
    const hits: Hit[] = []
    for (let k = 0; k < P.dist.length; k++) {
      if (P.dist[k] !== 0 || !prep.inside[k]) continue
      const i = k % nx
      const j = (k - i) / nx
      let edge = false
      for (let dj = -1; dj <= 1 && !edge; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = i + di
          const jj = j + dj
          if (ii >= 0 && jj >= 0 && ii < nx && jj < ny && P.dist[jj * nx + ii] > 0) {
            edge = true
            break
          }
        }
      }
      // Not where it gives way to firmer levelled ground (a painted area under the house pad).
      if (!edge || prep.platforms.some(q => q !== P && q.rank < P.rank && q.dist[k] === 0)) continue
      // Outward: away from the middle of the area's own nodes nearby.
      let sx = 0
      let sy = 0
      let cnt = 0
      for (let dj = -rr; dj <= rr; dj++) {
        for (let di = -rr; di <= rr; di++) {
          if (di * di + dj * dj > rr * rr) continue
          const ii = i + di
          const jj = j + dj
          if (ii < 0 || jj < 0 || ii >= nx || jj >= ny || P.dist[jj * nx + ii] !== 0) continue
          sx += di
          sy += dj
          cnt++
        }
      }
      const len = Math.hypot(sx, sy) / cnt
      if (!cnt || len < 0.15) continue
      const n: Vec2 = [-sx / cnt / len, -sy / cnt / len]
      const node: Vec2 = [x0 + i * cell, y0 + j * cell]
      const pos: Vec2 = [node[0] + n[0] * cell * 0.5, node[1] + n[1] * cell * 0.5]
      const outside = f.sample(pos[0] + n[0] * 0.3, pos[1] + n[1] * 0.3)
      const kind = outside > L + TOUCH ? 'cut' : outside < L - TOUCH ? 'fill' : null
      if (!kind || (kind === 'cut' && !P.cut) || (kind === 'fill' && !P.fill)) continue
      const batter = kind === 'cut' ? prep.opts.cutBatter : prep.opts.fillBatter
      const wall = Math.abs(outside - L)
      if (wall < MIN_WALL_HEIGHT) continue
      // No batter: a vertical edge, which is a wall whatever else is near it.
      if (batter <= 0) {
        if (inp.house?.some(r => pointInPolygon(pos[0], pos[1], r) || segmentsOf([...r, r[0]]).some(([a, b]) => distToSegment(pos, a, b) < HOUSE_HOLDS))) continue
        hits.push({ k, i, j, pos, n, kind, wall, height: wall, width: 0, rule: 'implied' })
        continue
      }
      if (inp.impliedOnly) continue
      // Walk the batter out.
      let prev = node
      let run = 0
      let hit = null as Pick<Hit, 'rule' | 'edge' | 'what'> | null
      for (let s = cell * 0.5; s < MAX_RUN; s += cell * 0.5) {
        const p: Vec2 = [node[0] + n[0] * s, node[1] + n[1] * s]
        if (inp.barriers.some(([a, b]) => crosses(prev, p, a, b))) break
        prev = p
        const zb = kind === 'cut' ? L + (s - cell * 0.5) / batter : L - (s - cell * 0.5) / batter
        const g = f.sample(p[0], p[1])
        if (kind === 'cut' ? g <= zb + TOUCH : g >= zb - TOUCH) break
        run = s - cell * 0.5
        if (!pointInPolygon(p[0], p[1], boundary)) {
          hit = { rule: 'boundary', edge: nearestEdge(p, all).edge }
          break
        }
        // Too close to a side or rear boundary; carry on to see whether it goes right over.
        if (hit) continue
        const near = nearestEdge(p, inp.counted)
        if (near.edge >= 0 && near.dist < WORKS_CLEARANCE) {
          hit = { rule: 'clearance', edge: near.edge }
          continue
        }
        const kk = nodeAt(p)
        let absorbed = false
        if (kk >= 0) {
          for (const Q of prep.platforms) {
            if (Q === P || Q.dist[kk] !== 0) continue
            const qf = inp.family(Q)
            // Ground on the near side of the batter (higher than a fill batter, lower than a cut one)
            // takes it in, as does ground at about its level; ground beyond it is a step a wall must hold.
            const lvl = Q.levels ? Q.levels[kk] : Q.level
            const beyond = kind === 'fill' ? lvl < zb - ABSORB : lvl > zb + ABSORB
            if (qf === null || (fam !== null && qf === fam) || !beyond) {
              absorbed = true
              break
            }
            hit = { rule: 'room', what: inp.label(Q) }
            break
          }
        }
        if (hit || absorbed) break
        if (inp.trees.some(t => Math.hypot(p[0] - t.at[0], p[1] - t.at[1]) < t.r)) {
          hit = { rule: 'room', what: 'a tree’s protection zone' }
          break
        }
      }
      const height = run / batter
      if (!hit && height > TALL_BATTER) hit = { rule: 'tall' }
      else if (!hit && run > WIDE_BATTER) hit = { rule: 'wide' }
      if (hit) hits.push({ k, i, j, pos, n, kind, wall, height, width: run, ...hit })
    }
    out.push(...joinPieces(groupHits(hits, { cell, nx, reach, thickness, names }), id, L))
  }

  // Most pressing first, then the tallest; one wall where two areas both want one along the same line.
  out.sort((p, q) => RANK[p.rule] - RANK[q.rule] || q.height - p.height)
  const kept: WallSuggestion[] = []
  for (const s of out) {
    // Compared by its longest run: the same line as one already kept or a wall already drawn, or one turned down.
    const dir = lineDir(s.a, s.b)
    const m: Vec2 = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2]
    const near = (a: Vec2, b: Vec2, tol: number) => angleApart(dir, lineDir(a, b)) < 25 && distToSegment(m, a, b) < tol
    if (kept.some(t => segmentsOf(t.path).some(([a, b]) => near(a, b, 1.5)))) continue
    if (inp.barriers.some(([a, b]) => near(a, b, 1.5))) continue
    // An implied wall is in the design already: turning it down doesn't take it away.
    if (s.rule !== 'implied' && inp.dismissed?.some(d => angleApart(dir, d.dir) < 20 && distToSegment(d.at, s.a, s.b) < 1)) continue
    kept.push(s)
  }
  return kept
}

/** The straight runs of a path. */
export const segmentsOf = (path: Vec2[]): [Vec2, Vec2][] => path.slice(1).map((p, i) => [path[i], p])

/** A path's length (m). */
export const pathLength = (path: Vec2[]) => segmentsOf(path).reduce((t, [a, b]) => t + Math.hypot(b[0] - a[0], b[1] - a[1]), 0)

/** Runs whose ends are this close (m) are one wall turning a corner. */
const JOIN = 2

/**
 * Join straight runs end to end round the area's corners into one wall each: a run's end meets
 * the start of the next one round (every run has the area on its left), at the corner where their
 * lines cross when that's near, else half way between. Walls shorter than MIN_WALL_LENGTH go.
 */
function joinPieces(pieces: Piece[], source: string, level: number): WallSuggestion[] {
  const next = new Map<Piece, Piece>()
  const prev = new Map<Piece, Piece>()
  const gap = (p: Vec2, q: Vec2) => Math.hypot(p[0] - q[0], p[1] - q[1])
  const pairs: [number, Piece, Piece][] = []
  for (const p of pieces) for (const q of pieces) if (p !== q && p.kind === q.kind && gap(p.b, q.a) < JOIN) pairs.push([gap(p.b, q.a), p, q])
  pairs.sort((x, y) => x[0] - y[0])
  for (const [, p, q] of pairs) {
    if (next.has(p) || prev.has(q)) continue
    next.set(p, q)
    prev.set(q, p)
  }
  const corner = (p: Piece, q: Piece): Vec2 => {
    const d1: Vec2 = [p.b[0] - p.a[0], p.b[1] - p.a[1]]
    const d2: Vec2 = [q.b[0] - q.a[0], q.b[1] - q.a[1]]
    const den = d1[0] * d2[1] - d1[1] * d2[0]
    const mid: Vec2 = [(p.b[0] + q.a[0]) / 2, (p.b[1] + q.a[1]) / 2]
    if (Math.abs(den) < 1e-9) return mid
    const t = ((q.a[0] - p.a[0]) * d2[1] - (q.a[1] - p.a[1]) * d2[0]) / den
    const x: Vec2 = [p.a[0] + d1[0] * t, p.a[1] + d1[1] * t]
    return gap(x, p.b) < JOIN && gap(x, q.a) < JOIN ? x : mid
  }
  const r3 = (v: Vec2): Vec2 => [Math.round(v[0] * 1000) / 1000, Math.round(v[1] * 1000) / 1000]
  const seen = new Set<Piece>()
  const out: WallSuggestion[] = []
  // Chains from their first run; then any closed loops left.
  for (const start of [...pieces.filter(p => !prev.has(p)), ...pieces]) {
    if (seen.has(start)) continue
    const chain: Piece[] = []
    for (let p: Piece | undefined = start; p && !seen.has(p); p = next.get(p)) {
      seen.add(p)
      chain.push(p)
    }
    const closed = chain.length > 1 && next.get(chain[chain.length - 1]) === chain[0]
    const path: Vec2[] = [closed ? corner(chain[chain.length - 1], chain[0]) : chain[0].a]
    chain.forEach((p, i) => {
      const q = chain[i + 1]
      path.push(q ? corner(p, q) : closed ? path[0] : p.b)
    })
    const clean = path.map(r3).filter((v, i, all) => i === 0 || gap(v, all[i - 1]) > 1e-3)
    if (clean.length < 2 || pathLength(clean) < MIN_WALL_LENGTH) continue
    const top = chain.reduce((t, p) => (RANK[p.rule] < RANK[t.rule] || (p.rule === t.rule && p.height > t.height) ? p : t), chain[0])
    const height = Math.max(...chain.map(p => p.height))
    let main: [Vec2, Vec2] = [clean[0], clean[1]]
    for (const [a, b] of segmentsOf(clean)) if (gap(a, b) > gap(main[0], main[1])) main = [a, b]
    out.push({
      key: `${source}|${top.kind}|${Math.round(main[0][0])}|${Math.round(main[0][1])}|${Math.round(lineDir(main[0], main[1]) / 10)}`,
      source,
      kind: top.kind,
      rule: top.rule,
      path: clean,
      a: main[0],
      b: main[1],
      level,
      height,
      face: chain.reduce((t, p) => t + gap(p.a, p.b) * p.mean, 0),
      why: ruleOf(top.rule).why({ ...top.facts, wall: height }),
      engineer: needsEngineer(height),
    })
  }
  return out
}

/** A straight run of wall along one stretch of edge, before runs are joined round corners. */
interface Piece {
  a: Vec2
  b: Vec2
  kind: 'cut' | 'fill'
  rule: RuleId
  height: number
  /** The ground it holds, on average along it (m). */
  mean: number
  facts: WhyFacts
}

/** Join neighbouring edge nodes with the same finding, turning by no more than 30°, into straight runs along the edge. */
function groupHits(hits: Hit[], c: { cell: number; nx: number; reach: number; thickness: number; names: string[] }): Piece[] {
  const byK = new Map(hits.map(h => [h.k, h]))
  const seen = new Set<number>()
  const groups: Hit[][] = []
  const COS = Math.cos((30 * Math.PI) / 180)
  for (const seed of hits) {
    if (seen.has(seed.k)) continue
    seen.add(seed.k)
    const group = [seed]
    for (let q = 0; q < group.length; q++) {
      const h = group[q]
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const o = byK.get((h.j + dj) * c.nx + h.i + di)
          if (!o || seen.has(o.k) || o.kind !== seed.kind || o.n[0] * seed.n[0] + o.n[1] * seed.n[1] < COS) continue
          if (Math.abs(o.i - h.i) > 1) continue
          seen.add(o.k)
          group.push(o)
        }
      }
    }
    groups.push(group)
  }
  // The longest runs first: each carries on round to the corners, and the few corner nodes left
  // over (facing partway round) don't make walls of their own.
  groups.sort((p, q) => q.length - p.length)
  const claimed = new Set<number>()
  const out: Piece[] = []
  for (const all of groups) {
    const group = all.filter(h => !claimed.has(h.k))
    if (group.length < all.length / 2 || !group.length) continue
    const seed = group[0]
    let nx = 0
    let ny = 0
    let cx = 0
    let cy = 0
    for (const h of group) {
      nx += h.n[0]
      ny += h.n[1]
      cx += h.pos[0]
      cy += h.pos[1]
    }
    cx /= group.length
    cy /= group.length
    // The line through the edge points (their principal axis), facing out the way the batters ran.
    let sxx = 0
    let syy = 0
    let sxy = 0
    for (const h of group) {
      const dx = h.pos[0] - cx
      const dy = h.pos[1] - cy
      sxx += dx * dx
      syy += dy * dy
      sxy += dx * dy
    }
    const nl = Math.hypot(nx, ny) || 1
    let N: Vec2 = [nx / nl, ny / nl]
    if (sxx + syy > c.cell * c.cell) {
      const th = Math.atan2(2 * sxy, sxx - syy) / 2
      const n2: Vec2 = [-Math.sin(th), Math.cos(th)]
      N = n2[0] * N[0] + n2[1] * N[1] >= 0 ? n2 : [-n2[0], -n2[1]]
    }
    const D: Vec2 = [-N[1], N[0]]
    let t0 = Infinity
    let t1 = -Infinity
    let o1 = -Infinity
    for (const h of group) {
      const t = (h.pos[0] - cx) * D[0] + (h.pos[1] - cy) * D[1]
      t0 = Math.min(t0, t)
      t1 = Math.max(t1, t)
      o1 = Math.max(o1, (h.pos[0] - cx) * N[0] + (h.pos[1] - cy) * N[1])
    }
    // On to the corners: edge nodes there face partway round, so they fell to neither side's group.
    const slack = c.reach + c.cell
    for (const h of hits) {
      if (h.kind !== seed.kind) continue
      const t = (h.pos[0] - cx) * D[0] + (h.pos[1] - cy) * D[1]
      const o = (h.pos[0] - cx) * N[0] + (h.pos[1] - cy) * N[1]
      if (o < o1 - slack || o > o1 + c.cell || t < t0 - slack || t > t1 + slack) continue
      t0 = Math.min(t0, t)
      t1 = Math.max(t1, t)
      claimed.add(h.k)
    }
    for (const h of group) claimed.add(h.k)
    t0 -= c.cell / 2
    t1 += c.cell / 2
    // Its face on the area's outermost edge here, so it never cuts into the levelled ground.
    const off = o1 + c.thickness / 2
    const base: Vec2 = [cx + N[0] * off, cy + N[1] * off]
    const r3 = (v: number) => Math.round(v * 1000) / 1000
    const a: Vec2 = [r3(base[0] + D[0] * t0), r3(base[1] + D[1] * t0)]
    const b: Vec2 = [r3(base[0] + D[0] * t1), r3(base[1] + D[1] * t1)]
    const rule = group.reduce((r, h) => (RANK[h.rule] < RANK[r] ? h.rule : r), seed.rule)
    const top = group.filter(h => h.rule === rule)
    const height = Math.max(...group.map(h => h.wall))
    const edgeCount = new Map<number, number>()
    for (const h of top) if (h.edge !== undefined) edgeCount.set(h.edge, (edgeCount.get(h.edge) ?? 0) + 1)
    const edge = [...edgeCount.entries()].sort((p, q) => q[1] - p[1])[0]?.[0]
    const facts: WhyFacts = {
      kind: seed.kind,
      wall: height,
      edge: edge !== undefined ? c.names[edge] : undefined,
      what: top.find(h => h.what)?.what,
      height: Math.max(...top.map(h => h.height)),
      width: Math.max(...top.map(h => h.width)),
    }
    out.push({ a, b, kind: seed.kind, rule, height, mean: group.reduce((t, h) => t + h.wall, 0) / group.length, facts })
  }
  return out
}

/** What the engineer note says, as the hc-retaining check does: worded once, in src/checks/engineer.ts. */
export { ENGINEER_NOTE } from '../checks/engineer'
