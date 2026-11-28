// The 3D pieces of every door and window (src/plan/openingDetail.ts) placed on their walls and
// merged into one geometry per named piece, for OpeningDetail3D to draw.

import * as THREE from 'three'
import type { Vec2 } from '../lib/geom'
import { floorRL, houseWalls, levelById, toSite, wallDir, type Plan } from '../plan/model'
import { openingDetail, type DetailPart } from '../plan/openingDetail'

/** A block on a four-cornered site footprint, between two scene heights: 12 triangles. */
function block(pts: Vec2[], y0: number, y1: number): number[] {
  // Anticlockwise on the site, so every face looks outwards: a wall run the other way gives a clockwise one.
  let area = 0
  for (let i = 0; i < pts.length; i++) area += pts[i][0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * pts[i][1]
  const c = area < 0 ? [...pts].reverse() : pts
  const v = (i: number, y: number) => [c[i][0], y, -c[i][1]]
  const quad = (a: number[], b: number[], cc: number[], d: number[]) => [...a, ...b, ...cc, ...a, ...cc, ...d]
  const out = [...quad(v(0, y1), v(1, y1), v(2, y1), v(3, y1)), ...quad(v(3, y0), v(2, y0), v(1, y0), v(0, y0))]
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    out.push(...quad(v(i, y0), v(j, y0), v(j, y1), v(i, y1)))
  }
  return out
}

/** What each piece's mesh is called, for anyone reading the scene (an export, a test). */
const NAMES: Record<string, string> = {
  'door:frame': 'door-frame',
  'door:leaf': 'door-leaf',
  'door:glass': 'door-glass',
  'door:track': 'door-track',
  'window:frame': 'window-frame',
  'window:sill': 'window-sill',
  'garage:frame': 'garage-door-frame',
  'garage:rib': 'garage-door-ribs',
}

/** The pieces of every door and window on the levels shown, merged by name. */
export function openingDetailGeometry(plan: Plan, origin: Vec2, refZ: number, showLevels: Set<string> | null): Map<string, { part: DetailPart; geometry: THREE.BufferGeometry }> {
  const lists = new Map<string, { part: DetailPart; xyz: number[] }>()
  for (const w of houseWalls(plan.walls)) {
    if (showLevels && !showLevels.has(w.level)) continue
    const level = levelById(plan, w.level)
    if (!level) continue
    const floorY = floorRL(plan, level.id) - refZ
    const d = wallDir(w)
    const n: Vec2 = [-d[1], d[0]]
    for (const o of plan.openings) {
      if (o.wall !== w.id) continue
      const start = o.offset - o.width / 2
      const at = (p: Vec2) => toSite([w.a[0] + d[0] * (start + p[0]) + n[0] * p[1], w.a[1] + d[1] * (start + p[0]) + n[1] * p[1]], plan.placement, origin)
      // Cut to the ceiling, as the hole in the wall is.
      for (const s of openingDetail(o, w.thickness, level.height)) {
        const name = NAMES[`${o.kind}:${s.part}`] ?? `${o.kind}-${s.part}`
        let list = lists.get(name)
        if (!list) lists.set(name, (list = { part: s.part, xyz: [] }))
        list.xyz.push(...block(s.pts.map(at), floorY + s.z0, floorY + s.z1))
      }
    }
  }
  const out = new Map<string, { part: DetailPart; geometry: THREE.BufferGeometry }>()
  for (const [name, { part, xyz }] of lists) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3))
    g.computeVertexNormals()
    out.set(name, { part, geometry: g })
  }
  return out
}
