import { signedArea, type Vec2 } from '../lib/geom'

/**
 * Weighted straight skeleton of a simple polygon, used to build hip and gable roofs.
 *
 * Every edge moves inwards at its own speed; where the moving edges meet they trace
 * the ridges, hips and valleys of the roof. With "time" taken as height, an edge's
 * speed is the cotangent of its pitch, so 0 makes a vertical gable end.
 */

export interface SkeletonNode {
  p: Vec2
  /** Time the wavefront reached this node, which is its height above the eaves. */
  t: number
}

export interface Skeleton {
  /** The polygon's own corners come first (indices 0..n-1, at t = 0). */
  nodes: SkeletonNode[]
  /** For each edge i (pts[i] to pts[i+1]), its face as node indices, starting i, i+1. */
  faces: number[][]
  /** Ridge, hip and valley lines between nodes. */
  arcs: [number, number][]
}

interface WVertex {
  p0: Vec2
  t0: number
  v: Vec2
  prevEdge: number
  nextEdge: number
  node: number
  reflex: boolean
}

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1]
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0]

/** Polygon must be counter-clockwise with no repeated or collinear points. */
export function straightSkeleton(pts: Vec2[], speeds: number[]): Skeleton {
  const n = pts.length
  if (n < 3) throw new Error('A roof outline needs at least three corners.')
  if (signedArea(pts) <= 0) throw new Error('Roof outline must be counter-clockwise.')
  let scale = 0
  for (const p of pts) scale = Math.max(scale, Math.abs(p[0] - pts[0][0]), Math.abs(p[1] - pts[0][1]))
  const eps = 1e-7 * Math.max(1, scale)

  const dirs: Vec2[] = []
  const normals: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const d: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
    dirs.push(d)
    normals.push([-d[1], d[0]])
  }

  const nodes: SkeletonNode[] = pts.map(p => ({ p: [p[0], p[1]], t: 0 }))
  const faceNodes: Set<number>[] = pts.map(() => new Set<number>())
  const arcs: [number, number][] = []
  const arcKeys = new Set<string>()

  const addNode = (p: Vec2, t: number): number => {
    for (let i = 0; i < nodes.length; i++) {
      const q = nodes[i]
      if (Math.abs(q.p[0] - p[0]) <= eps * 10 && Math.abs(q.p[1] - p[1]) <= eps * 10 && Math.abs(q.t - t) <= eps * 10) return i
    }
    nodes.push({ p: [p[0], p[1]], t })
    return nodes.length - 1
  }
  const addArc = (a: number, b: number) => {
    if (a === b) return
    const key = a < b ? `${a},${b}` : `${b},${a}`
    if (arcKeys.has(key)) return
    arcKeys.add(key)
    arcs.push([a, b])
  }

  const velocity = (a: number, b: number): Vec2 => {
    const na = normals[a]
    const nb = normals[b]
    const wa = speeds[a]
    const wb = speeds[b]
    const det = cross(na, nb)
    if (Math.abs(det) > 1e-9) return [(wa * nb[1] - na[1] * wb) / det, (na[0] * wb - wa * nb[0]) / det]
    // Parallel edges: collinear ones move together; opposite ones have closed up.
    if (dot(na, nb) > 0) return [na[0] * (wa + wb) * 0.5, na[1] * (wa + wb) * 0.5]
    return [0, 0]
  }

  const makeVertex = (p: Vec2, t: number, prevEdge: number, nextEdge: number, node: number): WVertex => ({
    p0: [p[0], p[1]],
    t0: t,
    v: velocity(prevEdge, nextEdge),
    prevEdge,
    nextEdge,
    node,
    reflex: cross(dirs[prevEdge], dirs[nextEdge]) < -1e-9,
  })

  const pos = (V: WVertex, t: number): Vec2 => [V.p0[0] + V.v[0] * (t - V.t0), V.p0[1] + V.v[1] * (t - V.t0)]

  let loops: WVertex[][] = [pts.map((p, i) => makeVertex(p, 0, (i - 1 + n) % n, i, i))]
  let now = 0

  /** The wavefront has closed up: what is left are flat ridges at the current height. */
  const finish = (loop: WVertex[]) => {
    const ends = loop.map(V => {
      const x = pos(V, now)
      const start = nodes[V.node]
      if (Math.hypot(x[0] - start.p[0], x[1] - start.p[1]) <= eps * 10 && Math.abs(start.t - now) <= eps * 10) return V.node
      const node = addNode(x, now)
      addArc(V.node, node)
      faceNodes[V.prevEdge].add(node)
      faceNodes[V.nextEdge].add(node)
      return node
    })
    // The loop has folded flat, so its two sides run along the same ridge: each side's
    // stretch of ridge passes every node the other side stops at.
    const stops = [...new Set(ends)]
    for (let k = 0; k < loop.length; k++) {
      const a = nodes[ends[k]].p
      const b = nodes[ends[(k + 1) % loop.length]].p
      const ab = sub(b, a)
      const len2 = dot(ab, ab)
      const e = loop[k].nextEdge
      if (len2 <= eps * eps) {
        faceNodes[e].add(ends[k])
        continue
      }
      const on = stops
        .map(s => {
          const ap = sub(nodes[s].p, a)
          const u = len2 > 0 ? dot(ap, ab) / len2 : 0
          return { s, u, off: Math.abs(cross(ap, ab)) / Math.sqrt(len2) }
        })
        .filter(x => x.off <= eps * 10 && x.u >= -1e-9 && x.u <= 1 + 1e-9)
        .sort((p, q) => p.u - q.u)
      for (let i = 0; i < on.length; i++) {
        faceNodes[e].add(on[i].s)
        if (i > 0) addArc(on[i - 1].s, on[i].s)
      }
    }
  }

  const maxSteps = 40 * n + 200
  for (let step = 0; step < maxSteps && loops.length; step++) {
    // Retire loops that have closed up.
    const live: WVertex[][] = []
    for (const loop of loops) {
      if (loop.length < 3 || Math.abs(signedArea(loop.map(V => pos(V, now)))) <= eps * Math.max(1, scale)) finish(loop)
      else live.push(loop)
    }
    loops = live
    if (!loops.length) break

    type Ev =
      | { kind: 'edge'; t: number; loop: number; k: number }
      | { kind: 'split'; t: number; loop: number; k: number; j: number; x: Vec2 }
    let best: Ev | null = null
    const consider = (ev: Ev) => {
      if (!best) best = ev
      else if (ev.t < best.t - eps) best = ev
      else if (Math.abs(ev.t - best.t) <= eps && ev.kind === 'edge' && best.kind === 'split') best = ev
    }

    loops.forEach((loop, li) => {
      const m = loop.length
      for (let k = 0; k < m; k++) {
        const A = loop[k]
        const B = loop[(k + 1) % m]
        const d = dirs[A.nextEdge]
        const len = dot(pos(B, now), d) - dot(pos(A, now), d)
        const rate = dot(sub(B.v, A.v), d)
        if (len <= eps) consider({ kind: 'edge', t: now, loop: li, k })
        else if (rate < -1e-12) consider({ kind: 'edge', t: now + len / -rate, loop: li, k })
      }
      for (let k = 0; k < m; k++) {
        const V = loop[k]
        if (!V.reflex) continue
        const P = pos(V, now)
        for (let j = 0; j < m; j++) {
          const A = loop[j]
          const B = loop[(j + 1) % m]
          if (A === V || B === V) continue
          const e = A.nextEdge
          if (e === V.prevEdge || e === V.nextEdge) continue
          const f = dot(sub(P, pts[e]), normals[e]) - speeds[e] * now
          if (f < -eps) continue
          const rate = dot(V.v, normals[e]) - speeds[e]
          if (rate >= -1e-12) continue
          const t = now + Math.max(f, 0) / -rate
          const x = pos(V, t)
          const d = dirs[e]
          const sx = dot(x, d)
          if (sx < dot(pos(A, t), d) - eps * 10 || sx > dot(pos(B, t), d) + eps * 10) continue
          consider({ kind: 'split', t, loop: li, k, j, x })
        }
      }
    })

    const ev = best as Ev | null
    if (!ev) {
      // Nothing left can meet (e.g. every remaining edge is a gable): stop here.
      for (const loop of loops) finish(loop)
      loops = []
      break
    }
    now = Math.max(now, ev.t)
    const loop = loops[ev.loop]
    const m = loop.length

    if (ev.kind === 'edge') {
      const A = loop[ev.k]
      const B = loop[(ev.k + 1) % m]
      const pa = pos(A, now)
      const pb = pos(B, now)
      const x: Vec2 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2]
      const node = addNode(x, now)
      addArc(A.node, node)
      addArc(B.node, node)
      faceNodes[A.prevEdge].add(node)
      faceNodes[A.nextEdge].add(node)
      faceNodes[B.nextEdge].add(node)
      const C = makeVertex(x, now, A.prevEdge, B.nextEdge, node)
      const next = loop.filter((_, i) => i !== ev.k && i !== (ev.k + 1) % m)
      // put C where A was
      const at = ev.k + 1 === m ? next.length : ev.k
      next.splice(at > next.length ? next.length : at, 0, C)
      loops[ev.loop] = next
    } else {
      const V = loop[ev.k]
      const A = loop[ev.j]
      const e = A.nextEdge
      const node = addNode(ev.x, now)
      addArc(V.node, node)
      faceNodes[V.prevEdge].add(node)
      faceNodes[V.nextEdge].add(node)
      faceNodes[e].add(node)
      const V1 = makeVertex(ev.x, now, V.prevEdge, e, node)
      const V2 = makeVertex(ev.x, now, e, V.nextEdge, node)
      const rot = [...loop.slice(ev.k), ...loop.slice(0, ev.k)] // V first
      const a = rot.indexOf(A)
      const loopA = [V2, ...rot.slice(1, a + 1)] // V2, Vn ... A
      const loopB = [V1, ...rot.slice(a + 1)] // V1, B ... Vp
      loops.splice(ev.loop, 1, loopA, loopB)
    }
  }
  if (loops.length) throw new Error('The roof shape could not be worked out.')

  // Each face's top runs from the end of its edge back to the start along skeleton
  // arcs. Walk those arcs; faces are monotone along their edge, which settles any choice.
  const adjacent = new Map<number, number[]>()
  for (const [a, b] of arcs) {
    adjacent.set(a, [...(adjacent.get(a) ?? []), b])
    adjacent.set(b, [...(adjacent.get(b) ?? []), a])
  }
  const faces = pts.map((p, i) => {
    const d = dirs[i]
    const j = (i + 1) % n
    const along = (k: number) => dot(sub(nodes[k].p, p), d)
    const members = new Set([...faceNodes[i]].filter(k => k !== i && k !== j))
    const chain: number[] = []
    let cur = j
    for (;;) {
      const options = (adjacent.get(cur) ?? []).filter(k => members.has(k) && !chain.includes(k))
      if (!options.length) break
      cur = options.reduce((a, b) => (along(b) > along(a) ? b : a))
      chain.push(cur)
    }
    if (chain.length !== members.size) {
      chain.length = 0
      chain.push(...[...members].sort((a, b) => along(b) - along(a)))
    }
    return [i, j, ...chain]
  })
  return { nodes, faces, arcs }
}
