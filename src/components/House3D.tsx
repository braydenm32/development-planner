import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { drapePolygon } from '../lib/drape'
import { pointInPolygon, type Vec2 } from '../lib/geom'
import type { Heightfield } from '../lib/terrain'
import { buildingOutline, planarFaces, postGrid, sliceAlong, wallPieces, wallPolygons } from '../plan/geometry'
import {
  areaKind,
  DECK_DEPTH,
  FLOOR_STRUCTURE,
  floorRL,
  houseWalls,
  isRetaining,
  SLAB_THICKNESS,
  sortedLevels,
  toSite,
  wallDir,
  wallLength,
  type Plan,
} from '../plan/model'
import { furnitureSolids } from '../plan/furniture'
import { garagePanelFootprint } from '../plan/garageDoor'
import { pierOutlines } from '../plan/platforms'
import { retainingProfile, retainingSolid } from '../plan/retaining'
import { roofGeometry } from '../plan/roof'
import { stairArrivesAt, stairLayout } from '../plan/stairs'
import { roofEavesRL } from '../plan/roofline'

interface Props {
  plan: Plan
  origin: Vec2
  /** Scene heights are RL minus this. */
  refZ: number
  showLevels: Set<string> | null
  showRoof: boolean
  showFurniture?: boolean
  /** Finished ground level, for posts and anything laid on the ground. */
  ground: Heightfield
}

/** Extrude a site-frame polygon between two scene heights. */
function prism(pts: Vec2[], y0: number, y1: number, holes: Vec2[][] = []): THREE.BufferGeometry | null {
  if (pts.length < 3 || y1 - y0 < 1e-4) return null
  const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])))
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], p[1]))))
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false })
  // shape (x, y) -> scene (x, -z); extrusion -> up
  g.rotateX(-Math.PI / 2)
  g.translate(0, y0, 0)
  return g.index ? g.toNonIndexed() : g
}

export function House3D({ plan, origin, refZ, showLevels, showRoof, showFurniture = true, ground }: Props) {
  const geoms = useMemo(() => {
    const pl = plan.placement
    const site = (p: Vec2) => toSite(p, pl, origin)
    const ext: THREE.BufferGeometry[] = []
    const int: THREE.BufferGeometry[] = []
    const slabs: THREE.BufferGeometry[] = []
    const glass: THREE.BufferGeometry[] = []
    const garageDoors: THREE.BufferGeometry[] = []
    const concrete: THREE.BufferGeometry[] = []
    const timber: THREE.BufferGeometry[] = []
    const posts: THREE.BufferGeometry[] = []
    const roofs: THREE.BufferGeometry[] = []
    const stairs: THREE.BufferGeometry[] = []
    const retaining: THREE.BufferGeometry[] = []
    const furniture: THREE.BufferGeometry[] = []
    const draped = { concrete: [] as number[], garden: [] as number[] }
    const shown = (id: string) => !showLevels || showLevels.has(id)
    const levels = sortedLevels(plan)
    const groundY = (p: Vec2) => {
      const s = site(p)
      return ground.sample(s[0], s[1]) - refZ
    }
    const post = (p: Vec2, top: number, size: number) => {
      const bottom = groundY(p) - 0.2
      if (top - bottom < 0.05) return
      const h = size / 2
      const g = prism(
        [
          [p[0] - h, p[1] - h],
          [p[0] + h, p[1] - h],
          [p[0] + h, p[1] + h],
          [p[0] - h, p[1] + h],
        ].map(q => site(q as Vec2)),
        bottom,
        top,
      )
      if (g) posts.push(g)
    }

    for (const level of plan.levels) {
      if (!shown(level.id)) continue
      const floorY = floorRL(plan, level.id) - refZ
      const walls = houseWalls(plan.walls.filter(w => w.level === level.id))
      const polys = wallPolygons(walls)
      for (const w of walls) {
        const poly = polys.get(w.id)
        if (!poly) continue
        const len = wallLength(w)
        const d = wallDir(w)
        const openings = plan.openings.filter(o => o.wall === w.id)
        // Pieces are measured along the centreline; mitred ends reach past 0 and len.
        for (const piece of wallPieces(len, level.height, openings)) {
          const s0 = piece.s0 <= 1e-6 ? -1e3 : piece.s0
          const s1 = piece.s1 >= len - 1e-6 ? 1e3 : piece.s1
          const part = sliceAlong(poly, w.a, d, s0, s1)
          const g = prism(part.map(site), floorY + piece.z0, floorY + piece.z1)
          if (g) (w.kind === 'external' ? ext : int).push(g)
        }
        for (const o of openings.filter(x => x.kind === 'window')) {
          const n: Vec2 = [-d[1] * 0.01, d[0] * 0.01]
          const c0: Vec2 = [w.a[0] + d[0] * (o.offset - o.width / 2), w.a[1] + d[1] * (o.offset - o.width / 2)]
          const c1: Vec2 = [w.a[0] + d[0] * (o.offset + o.width / 2), w.a[1] + d[1] * (o.offset + o.width / 2)]
          const pane: Vec2[] = [
            [c0[0] - n[0], c0[1] - n[1]],
            [c1[0] - n[0], c1[1] - n[1]],
            [c1[0] + n[0], c1[1] + n[1]],
            [c0[0] + n[0], c0[1] + n[1]],
          ]
          const g = prism(pane.map(site), floorY + o.sill, floorY + Math.min(o.sill + o.height, level.height))
          if (g) glass.push(g)
        }
        // A garage door's panel closes its opening, down the middle of the wall.
        for (const o of openings.filter(x => x.kind === 'garage')) {
          const g = prism(garagePanelFootprint(w, o).map(site), floorY, floorY + Math.min(o.height, level.height))
          if (g) garageDoors.push(g)
        }
      }

      // Floor structure under the outside of the walls, with a hole where a stair comes up.
      const arriving = plan.stairs.filter(st => stairArrivesAt(plan, st, level.id))
      for (const outline of buildingOutline(planarFaces(walls)).outlines) {
        const holes = arriving.map(st => stairLayout(st).outline).filter(h => h.every(p => pointInPolygon(p[0], p[1], outline)))
        const g = prism(
          outline.map(site),
          floorY - FLOOR_STRUCTURE,
          floorY,
          holes.map(h => h.map(site)),
        )
        if (g) slabs.push(g)
      }

      // Piers under the parts of each floor built on the ground that aren't a slab.
      for (const ring of pierOutlines(plan, level.id)) for (const p of postGrid(ring, 1.8)) post(p, floorY - FLOOR_STRUCTURE, 0.2)

      for (const a of plan.areas.filter(x => x.level === level.id)) {
        const kind = areaKind(a)
        const top = floorY + (a.top ?? 0)
        if (kind === 'slab') {
          const g = prism(a.pts.map(site), top - SLAB_THICKNESS, top)
          if (g) concrete.push(g)
        } else if (kind === 'deck') {
          const g = prism(a.pts.map(site), top - DECK_DEPTH, top)
          if (g) timber.push(g)
          for (const p of postGrid(a.pts, 1.8)) post(p, top - DECK_DEPTH, 0.1)
        } else {
          const tris = drapePolygon(ground, a.pts.map(site), kind === 'driveway' ? 0.05 : 0.02)
          ;(kind === 'driveway' ? draped.concrete : draped.garden).push(...tris)
        }
      }

      for (const st of plan.stairs.filter(x => x.level === level.id)) {
        const base = floorY + st.base
        const L = stairLayout(st)
        // Stairs on the lowest level, or that start below their floor, stand on the ground.
        const onGround = level.id === levels[0]?.id || st.base < -0.01
        const bottom = onGround ? Math.min(base, groundY(st.at)) : base
        for (const step of L.steps) {
          const g = prism(step.pts.map(site), bottom, base + step.top)
          if (g) stairs.push(g)
        }
      }

      if (showFurniture) {
        for (const f of plan.furniture.filter(x => x.level === level.id)) {
          for (const s of furnitureSolids(f)) {
            const g = prism(s.pts.map(site), floorY + s.z0, floorY + s.z1)
            if (g) furniture.push(g)
          }
        }
      }

      if (showRoof) {
        for (const r of plan.roofs.filter(x => x.level === level.id)) {
          const rg = roofGeometry(r)
          if (rg.error || !rg.mesh.tris.length) continue
          // Its eaves RL, which can line up with another level's roofline (src/plan/roofline.ts).
          const base = floorY + roofEavesRL(plan, r) - floorRL(plan, level.id)
          const pos = new Float32Array(rg.mesh.pos.length)
          for (let i = 0; i < rg.mesh.pos.length; i += 3) {
            const s = site([rg.mesh.pos[i], rg.mesh.pos[i + 1]])
            pos[i] = s[0]
            pos[i + 1] = base + rg.mesh.pos[i + 2]
            pos[i + 2] = -s[1]
          }
          const g = new THREE.BufferGeometry()
          g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
          g.setIndex(rg.mesh.tris)
          roofs.push(g.toNonIndexed())
          g.dispose()
        }
      }
    }

    // Retaining walls stand from below the lower ground to just above the higher ground.
    const rWalls = plan.walls.filter(w => isRetaining(w) && shown(w.level))
    const rPolys = wallPolygons(rWalls)
    for (const w of rWalls) {
      const poly = rPolys.get(w.id)
      if (!poly) continue
      const prof = retainingProfile(w, plan, origin, ground)
      const solid = retainingSolid(poly, prof, Math.min(...prof.samples.map(x => Math.min(x.left, x.right))) - 0.3)
      const pos = new Float32Array(solid.tris.length * 3)
      solid.tris.forEach((v, i) => {
        const s = site(solid.pts[v])
        pos.set([s[0], solid.z[v] - refZ, -s[1]], i * 3)
      })
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      retaining.push(g)
    }

    const drapedGeom = (xyz: number[]) => {
      if (!xyz.length) return null
      const pos = new Float32Array(xyz.length)
      for (let i = 0; i < xyz.length; i += 3) {
        pos[i] = xyz[i]
        pos[i + 1] = xyz[i + 2] - refZ
        pos[i + 2] = -xyz[i + 1]
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.computeVertexNormals()
      return g
    }
    const merge = (list: THREE.BufferGeometry[]) => {
      if (!list.length) return null
      const m = mergeGeometries(list, false)
      list.forEach(g => g.dispose())
      m?.computeVertexNormals()
      return m
    }
    return {
      ext: merge(ext),
      int: merge(int),
      slabs: merge(slabs),
      glass: merge(glass),
      garageDoors: merge(garageDoors),
      concrete: merge(concrete),
      timber: merge(timber),
      posts: merge(posts),
      roofs: merge(roofs),
      stairs: merge(stairs),
      retaining: merge(retaining),
      furniture: merge(furniture),
      driveway: drapedGeom(draped.concrete),
      garden: drapedGeom(draped.garden),
    }
  }, [plan, origin, refZ, showLevels, showRoof, showFurniture, ground])

  useEffect(
    () => () => {
      for (const g of Object.values(geoms)) g?.dispose()
    },
    [geoms],
  )

  return (
    <group>
      {geoms.slabs && (
        <mesh geometry={geoms.slabs} castShadow receiveShadow>
          <meshStandardMaterial color="#bdb6aa" roughness={0.9} />
        </mesh>
      )}
      {geoms.concrete && (
        <mesh geometry={geoms.concrete} castShadow receiveShadow>
          <meshStandardMaterial color="#c4c2bc" roughness={0.95} />
        </mesh>
      )}
      {geoms.driveway && (
        <mesh geometry={geoms.driveway} receiveShadow>
          <meshStandardMaterial color="#b3b1ab" roughness={0.95} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      )}
      {geoms.garden && (
        <mesh geometry={geoms.garden} receiveShadow>
          <meshStandardMaterial color="#7fa36a" roughness={1} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      )}
      {geoms.timber && (
        <mesh geometry={geoms.timber} castShadow receiveShadow>
          <meshStandardMaterial color="#a77b52" roughness={0.85} />
        </mesh>
      )}
      {geoms.posts && (
        <mesh geometry={geoms.posts} castShadow receiveShadow>
          <meshStandardMaterial color="#8f8a82" roughness={0.9} />
        </mesh>
      )}
      {geoms.retaining && (
        <mesh geometry={geoms.retaining} castShadow receiveShadow>
          <meshStandardMaterial color="#a89f90" roughness={0.95} />
        </mesh>
      )}
      {geoms.stairs && (
        <mesh geometry={geoms.stairs} castShadow receiveShadow>
          <meshStandardMaterial color="#c9b79c" roughness={0.85} />
        </mesh>
      )}
      {geoms.ext && (
        <mesh geometry={geoms.ext} castShadow receiveShadow>
          <meshStandardMaterial color="#f1ede6" roughness={0.85} />
        </mesh>
      )}
      {geoms.int && (
        <mesh geometry={geoms.int} castShadow receiveShadow>
          <meshStandardMaterial color="#ddd5c8" roughness={0.9} />
        </mesh>
      )}
      {geoms.furniture && (
        <mesh geometry={geoms.furniture} castShadow receiveShadow>
          <meshStandardMaterial color="#9aa5b1" roughness={0.9} />
        </mesh>
      )}
      {geoms.garageDoors && (
        <mesh geometry={geoms.garageDoors} castShadow receiveShadow>
          <meshStandardMaterial color="#a7adb4" roughness={0.6} metalness={0.2} />
        </mesh>
      )}
      {geoms.glass && (
        <mesh geometry={geoms.glass}>
          <meshStandardMaterial color="#8fb7d6" roughness={0.1} metalness={0.1} transparent opacity={0.55} />
        </mesh>
      )}
      {geoms.roofs && (
        <mesh geometry={geoms.roofs} castShadow receiveShadow>
          <meshStandardMaterial color="#5d646d" roughness={0.7} metalness={0.15} />
        </mesh>
      )}
    </group>
  )
}
