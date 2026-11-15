import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d'
import { convexHull, pointInPolygon, signedArea, type Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Heightfield } from '../lib/terrain'
import { buildSiteSolid } from '../lib/terrainMesh'
import { furnitureSolids } from '../plan/furniture'
import { buildingOutline, planarFaces, postGrid, sliceAlong, wallPieces, wallPolygons } from '../plan/geometry'
import {
  areaKind,
  DECK_DEPTH,
  FLOOR_STRUCTURE,
  floorRL,
  houseWalls,
  isRetaining,
  levelById,
  SLAB_THICKNESS,
  sortedLevels,
  toSite,
  wallDir,
  wallLength,
  type Level,
  type Plan,
  type Wall,
} from '../plan/model'
import { planBounds } from '../plan/ops'
import { pierOutlines } from '../plan/platforms'
import { houseCaps, retainingProfile, retainingSolid } from '../plan/retaining'
import { ROOF_EDGE, roofGeometry } from '../plan/roof'
import { roofEavesRL, wallTopRL } from '../plan/roofline'
import { stairArrivesAt, stairLayout } from '../plan/stairs'
import type { SiteFeature } from '../site/model'
import { featureSolids } from '../site/printFeatures'

/** Print settings; every length here is in millimetres on the printed model. */
export interface PrintSettings {
  /** The model is 1:scale. */
  scale: number
  /** Thinnest wall, post or roof edge worth printing. */
  minFeature: number
  /** Gap left between parts that fit together. */
  clearance: number
  /** How far parts key into each other. */
  key: number
  /** Solid base under the lowest point of the ground. */
  base: number
  /** Printer bed size. */
  bedX: number
  bedY: number
  /** Cut the terrain, and any floor or roof, into pieces when it is bigger than the bed. */
  tiles: boolean
  /** Stand the furniture on the floor of its level. */
  furniture: boolean
  /** Put trees, sheds and fences from Site features on the terrain. */
  siteFeatures: boolean
  /** The terrain: the whole block, or the ground around the house out to `margin`. */
  terrain: 'block' | 'house'
  /** How far the terrain reaches past the house, around the house (m, on the ground). */
  margin: number
  /** Hollow the terrain from underneath, in pockets that bridge without supports. */
  hollow: boolean
}

export const DEFAULT_PRINT: PrintSettings = {
  scale: 100,
  minFeature: 1.2,
  clearance: 0.2,
  key: 1.2,
  base: 3,
  bedX: 225,
  bedY: 225,
  tiles: true,
  furniture: false,
  siteFeatures: false,
  terrain: 'block',
  margin: 5,
  hollow: true,
}

/**
 * The bed before it was 225 × 225 mm was 220 × 220. Settings are saved whole, so a project or
 * browser that kept 220 × 220 kept the old default rather than a bed someone typed: it reads as
 * today's default.
 */
export function withCurrentBed(s: PrintSettings): PrintSettings {
  return s.bedX === 220 && s.bedY === 220 ? { ...s, bedX: DEFAULT_PRINT.bedX, bedY: DEFAULT_PRINT.bedY } : s
}

/**
 * How far over the stated bed a part can be and still count as fitting (mm). A part a millimetre
 * over used to be cut in two; most printers reach a little past their stated bed, and the slicer
 * says so if this one can't.
 */
export const BED_SLACK = 1.5

/** Does a w x d footprint fit the bed, either way round? */
export function fitsBed(w: number, d: number, s: Pick<PrintSettings, 'bedX' | 'bedY'>): boolean {
  const x = s.bedX + BED_SLACK
  const y = s.bedY + BED_SLACK
  return (w <= x && d <= y) || (w <= y && d <= x)
}

/**
 * The turn (radians, counter-clockwise) that lays a ring's smallest bounding rectangle square to
 * the axes with its long side along x: the block's long edge along the bed, before it's cut into
 * tiles. Of equal choices, the smallest turn.
 */
export function longSideTurn(ring: Vec2[]): number {
  const hull = convexHull(ring)
  if (hull.length < 3) return 0
  const box = (a: number) => {
    const c = Math.cos(-a)
    const s = Math.sin(-a)
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const [x, y] of hull) {
      const u = x * c - y * s
      const v = x * s + y * c
      x0 = Math.min(x0, u)
      x1 = Math.max(x1, u)
      y0 = Math.min(y0, v)
      y1 = Math.max(y1, v)
    }
    return { w: x1 - x0, h: y1 - y0 }
  }
  // Each edge's direction, folded into (-45°, 45°]: a rectangle looks the same every quarter turn.
  const fold = (a: number) => {
    let x = a % (Math.PI / 2)
    if (x > Math.PI / 4) x -= Math.PI / 2
    if (x <= -Math.PI / 4) x += Math.PI / 2
    return x
  }
  let best = { a: 0, area: Infinity }
  const candidates = [0, ...hull.map((p, i) => {
    const q = hull[(i + 1) % hull.length]
    return fold(Math.atan2(q[1] - p[1], q[0] - p[0]))
  })]
  for (const a of candidates) {
    const b = box(a)
    const area = b.w * b.h
    if (area < best.area * (1 - 1e-6) || (Math.abs(area - best.area) <= best.area * 1e-6 && Math.abs(a) < Math.abs(best.a))) best = { a, area }
  }
  const b = box(best.a)
  // Long side along x: a quarter turn more when it came out along y (and not just about square).
  if (b.h > b.w * 1.001) return best.a > 0 ? best.a - Math.PI / 2 : best.a + Math.PI / 2
  return best.a
}

/** The fewest tiles, nx across and ny up, that cut a w x d footprint into pieces that fit the bed. */
export function tileGrid(w: number, d: number, s: Pick<PrintSettings, 'bedX' | 'bedY'>): [number, number] | null {
  let best: [number, number] | null = null
  for (let nx = 1; nx <= 8; nx++) {
    for (let ny = 1; ny <= 8; ny++) {
      if (!fitsBed(w / nx, d / ny, s)) continue
      if (!best || nx * ny < best[0] * best[1]) best = [nx, ny]
    }
  }
  return best
}

export type PartKind = 'terrain' | 'floor' | 'roof'

export interface PrintPart {
  id: string
  name: string
  kind: PartKind
  /** Millimetres, with every part in its assembled place: x east, y north, z up from the underside of the base. */
  positions: Float32Array
  indices: Uint32Array
  min: [number, number, number]
  max: [number, number, number]
  /** cm³ of plastic if printed solid. */
  volume: number
  /** The part this piece was cut from to fit the bed (its id), so the pieces lift off together. */
  of?: string
}

export interface PrintModel {
  parts: PrintPart[]
  /** Things changed to make the model printable, in plain words. */
  notes: string[]
  /** Degrees the model is turned (counter-clockwise from east) so the block's long side runs along the bed. */
  turn: number
  /** The whole terrain's footprint (mm), before it's cut into tiles; null without one. */
  terrainSize: [number, number] | null
}

export interface PrintInput {
  plan: Plan
  survey: Survey
  /** The finished ground (after cut and fill), in the survey's frame. */
  ground: Heightfield
  /** Site features in the survey's local frame, printed when the settings ask. */
  features?: SiteFeature[]
}

const SKIN = 0.6 // mm of plastic left above a slot
const PIER = 0.2 // m
const DECK_POST = 0.1 // m

interface LevelPart {
  level: Level
  walls: Wall[]
  /** Outside of the walls, in the site frame. */
  outlines: Vec2[][]
  ffl: number
  /** Top of the walls: the ceiling. */
  top: number
  /** Each wall's top RL, which is higher than the ceiling where it rises to meet a roof. */
  wallTop: Map<string, number>
  /** The walls grouped by their top RL, each group as one plan shape in the site frame. */
  byTop: { top: number; shape: CrossSection | null }[]
  /** Underside of this level's floor part. */
  bottom: number
  /** Walls as one plan shape, in the site frame. */
  footprint: CrossSection | null
}

const ccw = (ring: Vec2[]): Vec2[] => (signedArea(ring) < 0 ? [...ring].reverse() : ring)

/** Narrowest width of a convex outline: the least, over its edges, of how far it reaches from that edge. */
function minWidth(pts: Vec2[]): number {
  let best = Infinity
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 1e-9) continue
    let far = 0
    for (const p of pts) far = Math.max(far, Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / len)
    best = Math.min(best, far)
  }
  return best
}

/**
 * Turn the plan and the ground into solid parts that print separately and stack:
 * the ground (with its slabs, decks, outdoor stairs and piers), each floor with its
 * walls, and each level's roof. Parts key together: walls stand a little proud and
 * drop into slots under the part above, and the lowest floor sits in a shallow pocket
 * in the ground.
 */
export function buildPrintModel(wasm: ManifoldToplevel, input: PrintInput, settings: PrintSettings): PrintModel {
  const { Manifold, CrossSection, Mesh } = wasm
  const { plan, survey, ground } = input
  const pl = plan.placement
  const k = 1000 / settings.scale
  const toM = (mm: number) => mm / k
  const minW = toM(settings.minFeature)
  const c = toM(settings.clearance)
  const eps = toM(0.01)
  const notes: string[] = []

  // Every WASM object made along the way, freed at the end.
  const pool: { delete(): void }[] = []
  const keep = <T extends { delete(): void }>(x: T): T => {
    pool.push(x)
    return x
  }
  const site = (ring: Vec2[]) => ring.map(p => toSite(p, pl, survey.origin))
  const shape = (rings: Vec2[][]): CrossSection | null => {
    const rs = rings.filter(r => r.length >= 3 && Math.abs(signedArea(r)) > 1e-8).map(ccw)
    return rs.length ? keep(new CrossSection(rs, 'NonZero')) : null
  }
  const extrude = (cs: CrossSection | null, z0: number, z1: number): Manifold | null => {
    if (!cs || cs.isEmpty() || z1 - z0 < 1e-6) return null
    return keep(keep(cs.extrude(z1 - z0)).translate([0, 0, z0]))
  }
  const prism = (rings: Vec2[][], z0: number, z1: number) => extrude(shape(rings), z0, z1)
  const union = (list: (Manifold | null)[]): Manifold | null => {
    const ms = list.filter((m): m is Manifold => !!m)
    if (!ms.length) return null
    return ms.length === 1 ? ms[0] : keep(Manifold.union(ms))
  }
  const minus = (a: Manifold | null, b: Manifold | null) => (a && b ? keep(a.subtract(b)) : a)
  const grow = (cs: CrossSection | null, d: number) => (cs ? keep(cs.offset(d, 'Miter', 4)) : null)
  const square = (p: Vec2, size: number): Vec2[] => {
    const h = size / 2
    return [
      [p[0] - h, p[1] - h],
      [p[0] + h, p[1] - h],
      [p[0] + h, p[1] + h],
      [p[0] - h, p[1] + h],
    ]
  }
  const groundAt = (p: Vec2) => ground.sample(p[0], p[1])

  // Thin walls are thickened to print.
  const thin = plan.walls.filter(w => w.thickness < minW)
  if (thin.length) {
    const t = Math.min(...thin.map(w => w.thickness))
    notes.push(
      `Walls thinner than ${settings.minFeature} mm are printed ${settings.minFeature} mm thick (the thinnest would be ${(t * k).toFixed(1)} mm at 1:${settings.scale}).`,
    )
  }

  const key = toM(settings.key)
  // Slots under a floor can't go deeper than its plate allows.
  const plateMm = FLOOR_STRUCTURE * k
  const slotMm = Math.min(settings.key, plateMm - settings.clearance - SKIN)
  const slot = slotMm >= 0.4 ? toM(slotMm) : 0
  const edge = Math.max(ROOF_EDGE, minW, toM(settings.key + settings.clearance + SKIN))
  if (plan.roofs.length && edge > ROOF_EDGE + 1e-9) notes.push(`Roof edges are printed ${(edge * k).toFixed(1)} mm deep so the roof can key onto the walls.`)

  const levels = sortedLevels(plan)
  const parts: { id: string; name: string; kind: PartKind; solid: Manifold }[] = []
  const furnitureLeftOut: string[] = []
  let furnitureThickened = false

  const info: LevelPart[] = levels.map((level, i) => {
    const walls = houseWalls(plan.walls.filter(w => w.level === level.id)).map(w => (w.thickness < minW ? { ...w, thickness: minW } : w))
    const outlines = buildingOutline(planarFaces(walls)).outlines.map(site)
    const ffl = floorRL(plan, level.id)
    const wp = wallPolygons(walls)
    const polys = [...wp.values()].map(site)
    // Outside walls under a roof whose eaves sit above the ceiling rise to meet it.
    const wallTop = new Map(walls.map(w => [w.id, wallTopRL(plan, w)]))
    const groups = new Map<number, Vec2[][]>()
    for (const w of walls) {
      const poly = wp.get(w.id)
      if (!poly) continue
      const t = Math.round(wallTop.get(w.id)! * 1000) / 1000
      groups.set(t, [...(groups.get(t) ?? []), site(poly)])
    }
    return {
      level,
      walls,
      outlines,
      ffl,
      top: ffl + level.height,
      wallTop,
      byTop: [...groups].map(([top, rings]) => ({ top, shape: shape(rings) })),
      bottom: ffl - FLOOR_STRUCTURE - (i === 0 ? key : 0),
      footprint: shape(polys),
    }
  })
  if (levels.length > 1 && !slot) notes.push('The floors are too thin at this scale to key into the walls below; they just sit on them.')

  const ground0 = info[0]
  const piers = pierOutlines(plan)
  const pierSize = Math.max(PIER, minW)
  const pierPosts = piers.flatMap(r => postGrid(r, 1.8)).map(p => toSite(p, pl, survey.origin))

  /** Stairs that stand on the ground outside the house belong to the terrain. */
  const outdoorStair = (levelIndex: number, st: (typeof plan.stairs)[number]) => {
    const L = info[levelIndex]
    const outline = stairLayout(st).outline
    const mid = site([outline.reduce<Vec2>((a, p) => [a[0] + p[0] / outline.length, a[1] + p[1] / outline.length], [0, 0])])[0]
    const inside = L.outlines.some(r => pointInPolygon(mid[0], mid[1], r))
    return !inside && (levelIndex === 0 || st.base < -0.01)
  }

  // ---- Levels ----
  info.forEach((L, i) => {
    const above = info[i + 1]
    const pieces: (Manifold | null)[] = []

    // Floor plate, with holes where stairs come up through it.
    let plate = prism(L.outlines, L.bottom, L.ffl)
    const arriving = plan.stairs.filter(st => stairArrivesAt(plan, st, L.level.id))
    for (const st of arriving) plate = minus(plate, extrude(grow(shape([site(stairLayout(st).outline)]), c), L.bottom - 1, L.ffl + 1))
    pieces.push(plate)

    // Walls, with their openings left open.
    const polys = wallPolygons(L.walls)
    const wallSolids: (Manifold | null)[] = []
    for (const w of L.walls) {
      const poly = polys.get(w.id)
      if (!poly) continue
      const len = wallLength(w)
      const d = wallDir(w)
      const openings = plan.openings.filter(o => o.wall === w.id)
      for (const piece of wallPieces(len, (L.wallTop.get(w.id) ?? L.top) - L.ffl, openings)) {
        const s0 = piece.s0 <= 1e-6 ? -1e3 : piece.s0
        const s1 = piece.s1 >= len - 1e-6 ? 1e3 : piece.s1
        wallSolids.push(prism([site(sliceAlong(poly, w.a, d, s0, s1))], L.ffl + piece.z0, L.ffl + piece.z1))
      }
    }
    let walls = union(wallSolids)

    // Whatever sits on these walls: the next floor, and every roof whose eaves meet their tops,
    // whichever level it's drawn on, so one roofline over a split level keys onto all its walls.
    const aboveShape = above ? shape(above.outlines) : null
    if (above && aboveShape) {
      if (above.bottom < Math.max(L.top, ...L.wallTop.values())) walls = minus(walls, extrude(grow(aboveShape, eps), above.bottom, above.bottom + 100))
      if (L.footprint) {
        const under = keep(L.footprint.intersect(aboveShape))
        pieces.push(extrude(under, Math.min(above.bottom, L.top), above.bottom + slot))
      }
    }
    for (const { top, shape: carry } of L.byTop) {
      const meeting = plan.roofs.filter(r => Math.abs(roofEavesRL(plan, r) - top) < 1e-3)
      const roofShape = shape(meeting.map(r => roofGeometry(r).outline).filter(o => o.length >= 3).map(site))
      if (!roofShape || !carry) continue
      const free = aboveShape ? keep(roofShape.subtract(aboveShape)) : roofShape
      pieces.push(extrude(keep(carry.intersect(free)), top - eps, top + key))
    }
    pieces.push(walls)

    // Stairs inside the house.
    for (const st of plan.stairs.filter(x => x.level === L.level.id)) {
      if (outdoorStair(i, st)) continue
      const base = L.ffl + st.base
      const bottom = Math.max(base, L.bottom)
      for (const step of stairLayout(st).steps) pieces.push(prism([site(step.pts)], bottom, base + step.top))
    }

    // Furniture stands on the floor, below the ceiling, thickened where it is too thin to print.
    // Pieces outside the house would have no floor under them, so they are left out.
    if (settings.furniture) {
      for (const f of plan.furniture.filter(x => x.level === L.level.id)) {
        const mid = toSite(f.at, pl, survey.origin)
        if (!L.outlines.some(r => pointInPolygon(mid[0], mid[1], r))) {
          furnitureLeftOut.push(L.level.name)
          continue
        }
        for (const s of furnitureSolids(f)) {
          const top = Math.min(L.ffl + s.z1, L.top - c)
          let cs = shape([site(s.pts)])
          const thin = minWidth(s.pts)
          if (thin < minW) {
            cs = grow(cs, (minW - thin) / 2)
            furnitureThickened = true
          }
          if (top > L.ffl + s.z0) pieces.push(extrude(cs, L.ffl + s.z0 - eps, top))
        }
      }
    }

    // Balconies and decks on upper levels go with their floor.
    if (i > 0) {
      for (const a of plan.areas.filter(x => x.level === L.level.id)) {
        const kind = areaKind(a)
        const top = L.ffl + (a.top ?? 0)
        if (kind === 'slab') pieces.push(prism([site(a.pts)], top - SLAB_THICKNESS, top))
        if (kind === 'deck') pieces.push(prism([site(a.pts)], top - DECK_DEPTH, top))
      }
    }

    let solid = union(pieces)
    // Slots for the walls below, or sockets for the piers under the lowest floor.
    if (i > 0) {
      const below = info[i - 1]
      if (slot && below.footprint) solid = minus(solid, extrude(grow(below.footprint, c), L.bottom - eps, L.bottom + slot + c))
    } else if (pierPosts.length) {
      solid = minus(
        solid,
        prism(
          pierPosts.map(p => square(p, pierSize + 2 * c)),
          L.bottom - eps,
          L.bottom + key + c,
        ),
      )
    }
    if (solid) parts.push({ id: L.level.id, name: L.level.name, kind: 'floor', solid })
  })

  // ---- Roofs ----
  // Each roof sits on its eaves line. Roofs drawn on one level go together, and so do roofs that
  // share a roofline (the same eaves RL), so one roofline over a split level prints as one roof.
  const roofLevels = plan.roofs.filter(r => levelById(plan, r.level))
  const groupOf = roofLevels.map((_, i) => i)
  const find = (i: number): number => (groupOf[i] === i ? i : (groupOf[i] = find(groupOf[i])))
  const eavesOf = roofLevels.map(r => roofEavesRL(plan, r))
  for (let i = 0; i < roofLevels.length; i++)
    for (let j = 0; j < i; j++) if (roofLevels[i].level === roofLevels[j].level || Math.abs(eavesOf[i] - eavesOf[j]) < 1e-3) groupOf[find(i)] = find(j)
  const order = levels.map(l => l.id)
  const groups = new Map<number, number[]>()
  roofLevels
    .map((r, i) => ({ r, i }))
    .sort((a, b) => order.indexOf(a.r.level) - order.indexOf(b.r.level))
    .forEach(({ i }) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]))
  const roofNames = new Map<string, string>()
  for (const members of groups.values()) {
    const solids: (Manifold | null)[] = []
    const levelIds = [...new Set(members.map(i => roofLevels[i].level))]
    const levelNames = levelIds.map(id => levelById(plan, id)!.name)
    for (const i of members) {
      const r = roofLevels[i]
      const base = eavesOf[i]
      const g = roofGeometry(r, edge)
      if (g.error || !g.mesh.tris.length) continue
      const pos = new Float32Array(g.mesh.pos.length)
      for (let k = 0; k < g.mesh.pos.length; k += 3) {
        const s = toSite([g.mesh.pos[k], g.mesh.pos[k + 1]], pl, survey.origin)
        pos[k] = s[0]
        pos[k + 1] = s[1]
        pos[k + 2] = base + g.mesh.pos[k + 2]
      }
      const mesh = new Mesh({ numProp: 3, vertProperties: pos, triVerts: new Uint32Array(g.mesh.tris) })
      mesh.merge()
      let m: Manifold | null = keep(new Manifold(mesh))
      if (m.status() !== 'NoError') {
        notes.push(`One of the roofs on ${levelById(plan, r.level)!.name} couldn't be made solid, so it is left out.`)
        continue
      }
      // Sockets for the walls it sits on, which key into it, and room for any wall that stands
      // taller than its eaves (a roof set lower than the ceiling): the roof rests on those.
      for (const L of info) {
        for (const { top, shape: walls } of L.byTop) {
          if (top < base - 1e-3) continue
          const meets = top < base + 1e-3
          m = minus(m, extrude(grow(walls, c), Math.max(base, L.ffl) - eps, meets ? base + key + c : top))
        }
      }
      solids.push(m)
    }
    const solid = union(solids)
    if (!solid) continue
    const id = `roof-${levelIds.join('-')}`
    roofNames.set(id, `Roof over ${levelNames.map(n => n.toLowerCase()).join(' and ')}`)
    parts.push({ id, name: 'Roof', kind: 'roof', solid })
  }
  if (furnitureThickened) notes.push(`Thin parts of the furniture are printed ${settings.minFeature} mm thick.`)
  if (furnitureLeftOut.length) {
    const n = furnitureLeftOut.length
    notes.push(`${n} piece${n > 1 ? 's' : ''} of furniture outside the house ${n > 1 ? 'are' : 'is'} left out, as there is no floor part under ${n > 1 ? 'them' : 'it'}.`)
  }

  const roofParts = parts.filter(p => p.kind === 'roof')
  if (roofParts.length > 1) for (const p of roofParts) p.name = roofNames.get(p.id) ?? p.name

  // ---- Terrain ----
  // The whole block, or the ground around the house out to the margin, inside the block.
  let lot: Vec2[] = survey.boundary
  const cropped = settings.terrain === 'house'
  if (cropped) {
    const b = planBounds(plan)
    const m = Math.max(0, settings.margin)
    const block = shape([survey.boundary])
    if (b && block) {
      const rect = shape([site([[b.minX - m, b.minY - m], [b.maxX + m, b.minY - m], [b.maxX + m, b.maxY + m], [b.minX - m, b.maxY + m]])])
      const rings = rect ? keep(rect.intersect(block)).toPolygons().map(r => r.map(p => [p[0], p[1]] as Vec2)) : []
      const ring = rings.sort((x, y) => Math.abs(signedArea(y)) - Math.abs(signedArea(x)))[0]
      if (ring && Math.abs(signedArea(ring)) > 1) lot = ring
    }
  }
  const first = buildSiteSolid(ground, lot, -1e4)
  let minZ = Infinity
  for (let i = 0; i < first.surfaceIndexCount; i++) minZ = Math.min(minZ, first.positions[3 * first.indices[i] + 2])
  const baseZ = minZ - toM(settings.base)
  const solid = buildSiteSolid(ground, lot, baseZ)
  const mesh = new Mesh({ numProp: 3, vertProperties: solid.positions, triVerts: solid.indices })
  mesh.merge()
  let terrain: Manifold | null = keep(new Manifold(mesh))
  if (terrain.status() !== 'NoError') throw new Error('The ground could not be made into a solid for printing.')

  const extras: (Manifold | null)[] = []
  if (ground0) {
    for (const a of plan.areas.filter(x => x.level === ground0.level.id)) {
      const kind = areaKind(a)
      const top = ground0.ffl + (a.top ?? 0)
      const ring = site(a.pts)
      if (kind === 'slab') extras.push(prism([ring], top - SLAB_THICKNESS - 0.05, top))
      if (kind === 'deck') {
        extras.push(prism([ring], top - DECK_DEPTH, top))
        for (const p of postGrid(a.pts, 1.8).map(q => toSite(q, pl, survey.origin))) {
          extras.push(prism([square(p, Math.max(DECK_POST, minW))], groundAt(p) - 0.2, top - DECK_DEPTH + eps))
        }
      }
    }
    info.forEach((L, i) => {
      for (const st of plan.stairs.filter(x => x.level === L.level.id)) {
        if (!outdoorStair(i, st)) continue
        const lay = stairLayout(st)
        const base = L.ffl + st.base
        const lowest = Math.min(...site(lay.outline).map(groundAt))
        const bottom = Math.min(base, lowest) - 0.2
        for (const step of lay.steps) extras.push(prism([site(step.pts)], bottom, base + step.top))
      }
    })
  }
  // Retaining walls stand on the terrain, as tall as the ground they hold back, trimmed to the site.
  const retaining = plan.walls.filter(isRetaining).map(w => (w.thickness < minW ? { ...w, thickness: minW } : w))
  if (retaining.length) {
    const rPolys = wallPolygons(retaining)
    const walls: (Manifold | null)[] = []
    for (const w of retaining) {
      const poly = rPolys.get(w.id)
      if (!poly) continue
      const prof = retainingProfile(w, plan, survey.origin, ground)
      const solid = retainingSolid(poly, prof, Math.min(...prof.samples.map(x => Math.min(x.left, x.right))) - 0.2, houseCaps(prof, plan))
      const vert = new Float32Array(solid.pts.length * 3)
      solid.pts.forEach((p, i) => vert.set([...site([p])[0], solid.z[i]], i * 3))
      const m = new Mesh({ numProp: 3, vertProperties: vert, triVerts: new Uint32Array(solid.tris) })
      m.merge()
      const wall = keep(new Manifold(m))
      if (wall.status() === 'NoError') walls.push(wall)
    }
    const inLot = prism([lot], baseZ, 1e4)
    const all = union(walls)
    if (all && inLot) extras.push(keep(all.intersect(inLot)))
  }
  if (settings.siteFeatures && input.features?.length) {
    const { solids, summary } = featureSolids(input.features, survey.boundary, { Manifold, prism, keep, groundAt, minW })
    const all = union(solids)
    const inLot = prism([lot], baseZ, 1e4)
    if (all && inLot) extras.push(keep(all.intersect(inLot)))
    if (summary) notes.push(summary)
  }
  terrain = union([terrain, ...extras])
  // Around the house, slabs, decks and driveways stop where the ground does.
  if (cropped && terrain) terrain = keep(terrain.intersect(prism([lot], baseZ - 1, 1e4)!))
  if (ground0 && ground0.outlines.length) {
    // A shallow pocket the lowest floor drops into.
    terrain = minus(terrain, extrude(grow(shape(ground0.outlines), c), ground0.bottom, ground0.top + 1000))
    terrain = union([
      terrain,
      ...pierPosts.map(p => prism([square(p, pierSize)], groundAt(p) - 0.2, ground0.bottom + key)),
    ])
  }
  // Hollow from underneath: a grid of pockets open at the bottom, each roofed a little below the
  // lowest ground over it, with thin ribs between them so each roof is a short bridge that prints
  // without supports. The edges stay solid. A solid block of ground is most of the plastic.
  if (settings.hollow && terrain) {
    const pockets = hollowPockets()
    if (pockets) {
      terrain = minus(terrain, pockets)
      notes.push('The terrain is hollow underneath, in pockets with thin ribs between, so it uses far less plastic; print it flat side down as usual.')
    }
  }
  if (terrain) parts.unshift({ id: 'terrain', name: 'Terrain', kind: 'terrain', solid: terrain })

  function hollowPockets(): Manifold | null {
    const inset = shape([lot]) ? keep(shape([lot])!.offset(-toM(2.4), 'Miter', 4)) : null
    if (!inset || inset.isEmpty()) return null
    const box = inset.bounds()
    const rib = toM(1.6)
    const skin = toM(2)
    let cellMm = 20
    const count = (mm: number) => ((box.max[0] - box.min[0]) / toM(mm)) * ((box.max[1] - box.min[1]) / toM(mm))
    while (cellMm < 40 && count(cellMm) > 900) cellMm += 5
    const cell = toM(cellMm)
    const house = ground0 && ground0.outlines.length ? grow(shape(ground0.outlines), c + rib) : null
    const prisms: (Manifold | null)[] = []
    for (let x = box.min[0]; x < box.max[0]; x += cell) {
      for (let y = box.min[1]; y < box.max[1]; y += cell) {
        const x0 = x + rib / 2
        const x1 = x + cell - rib / 2
        const y0 = y + rib / 2
        const y1 = y + cell - rib / 2
        // The lowest ground over the pocket and just round it; posts, walls and steps reach 0.2 m below the ground.
        let low = Infinity
        for (let i = 0; i <= 5; i++)
          for (let j = 0; j <= 5; j++) {
            const z = groundAt([x0 - rib + ((x1 - x0 + 2 * rib) * i) / 5, y0 - rib + ((y1 - y0 + 2 * rib) * j) / 5])
            if (Number.isFinite(z)) low = Math.min(low, z)
          }
        if (!Number.isFinite(low)) continue
        let top = low - 0.25 - skin
        const r = shape([
          [
            [x0, y0],
            [x1, y0],
            [x1, y1],
            [x0, y1],
          ],
        ])
        if (!r) continue
        if (house && !keep(r.intersect(house)).isEmpty()) top = Math.min(top, ground0!.bottom - skin)
        if (top - baseZ < toM(3)) continue
        const inside = keep(r.intersect(inset))
        if (inside.isEmpty()) continue
        prisms.push(extrude(inside, baseZ - toM(1), top))
      }
    }
    return union(prisms)
  }

  // ---- To millimetres ----
  // Turned so the block's long side runs along the bed (x), then moved to start at 0, 0.
  const turn = (longSideTurn(lot) * 180) / Math.PI
  const cosT = Math.cos((-turn * Math.PI) / 180)
  const sinT = Math.sin((-turn * Math.PI) / 180)
  let ox = Infinity
  let oy = Infinity
  for (const p of lot) {
    ox = Math.min(ox, p[0] * cosT - p[1] * sinT)
    oy = Math.min(oy, p[0] * sinT + p[1] * cosT)
  }
  if (Math.abs(turn) >= 0.5) notes.push(`The model is turned ${Math.abs(Math.round(turn))}° so the block’s long side runs along the bed${cropped ? '' : ', which takes fewer tiles'}.`)
  let terrainSize: [number, number] | null = null
  const out: PrintPart[] = []
  const emit = (id: string, name: string, kind: PartKind, m: Manifold, of?: string) => {
    if (m.isEmpty()) return
    if (m.status() !== 'NoError') {
      notes.push(`${name} couldn't be made into a clean solid and is left out.`)
      return
    }
    const g = m.getMesh()
    const box = m.boundingBox()
    out.push({
      id,
      name,
      kind,
      positions: new Float32Array(g.vertProperties),
      indices: new Uint32Array(g.triVerts),
      min: [box.min[0], box.min[1], box.min[2]],
      max: [box.max[0], box.max[1], box.max[2]],
      volume: m.volume() / 1000,
      ...(of ? { of } : {}),
    })
  }
  for (const p of parts) {
    const turned = Math.abs(turn) > 1e-9 ? keep(p.solid.rotate([0, 0, -turn])) : p.solid
    const m = keep(keep(keep(turned.translate([-ox, -oy, -baseZ])).scale(k)).simplify(0.01))
    const box = m.boundingBox()
    const w = box.max[0] - box.min[0]
    const d = box.max[1] - box.min[1]
    if (p.kind === 'terrain') terrainSize = [w, d]
    const grid = settings.tiles && !fitsBed(w, d, settings) ? tileGrid(w, d, settings) : null
    if (!grid || grid[0] * grid[1] === 1) {
      emit(p.id, p.name, p.kind, m)
      continue
    }
    // Cut it into a grid of pieces, lettered along x and numbered along y (west to east and south to north when not turned). A floor
    // or roof is cut the same way: its pieces glue back into one before it sits on the one below.
    const [nx, ny] = grid
    const labels: string[] = []
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let t = m
        if (i > 0) t = keep(t.trimByPlane([1, 0, 0], box.min[0] + (w * i) / nx))
        if (i < nx - 1) t = keep(t.trimByPlane([-1, 0, 0], -(box.min[0] + (w * (i + 1)) / nx)))
        if (j > 0) t = keep(t.trimByPlane([0, 1, 0], box.min[1] + (d * j) / ny))
        if (j < ny - 1) t = keep(t.trimByPlane([0, -1, 0], -(box.min[1] + (d * (j + 1)) / ny)))
        const label = `${String.fromCharCode(65 + i)}${j + 1}`
        labels.push(label)
        emit(`${p.id}-${label}`, `${p.name} ${label}`, p.kind, t, p.id)
      }
    }
    notes.push(
      p.kind === 'terrain'
        ? `The terrain is ${Math.round(w)} × ${Math.round(d)} mm, so it is cut into ${nx * ny} tiles to fit a ${settings.bedX} × ${settings.bedY} mm bed: letters run ${Math.abs(turn) >= 0.5 ? 'along the block’s long side' : 'west to east'} and numbers ${Math.abs(turn) >= 0.5 ? 'across it' : 'south to north'}. Glue them together on a flat board.`
        : `${p.name} is ${Math.round(w)} × ${Math.round(d)} mm, so it is cut into ${nx * ny} pieces (${labels.join(', ')}) to fit a ${settings.bedX} × ${settings.bedY} mm bed. Glue them together before it goes on the part below.`,
    )
  }
  for (const x of pool) x.delete()
  return { parts: out, notes, turn, terrainSize }
}
