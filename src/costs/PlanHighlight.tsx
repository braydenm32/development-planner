// What a line of the estimate measures, pointed out on the plan while the line is hovered (or
// opened for a quote): the floor, the outside walls, the windows, the roof, where the ground is
// cut or filled, the retaining walls, the driveway. Drawn over the plan on the floor showing.

import { useMemo } from 'react'
import { CUT_RGB, FILL_RGB, rgbCss } from '../lib/colors'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Heightfield, Terrain } from '../lib/terrain'
import { buildingOutline, planarFaces, roomShape, wallPolygons } from '../plan/geometry'
import { fromSite, pointOnWall, sortedLevels, wallDir, type Plan } from '../plan/model'
import { roofGeometry } from '../plan/roof'
import { stairLayout } from '../plan/stairs'
import type { Earth } from '../plan/useEarthworks'
import type { Target } from './estimate'
import { cutFillPaths } from './cutFill'
import { pointedNow, useCosts } from './store'

const path = (pts: Vec2[], S: (p: Vec2) => Vec2) => (pts.length ? `M${pts.map(p => S(p).map(n => n.toFixed(1)).join(' ')).join('L')}Z` : '')

interface Props {
  plan: Plan
  /** The floor showing. */
  level: string
  survey: Survey
  terrain: Terrain
  earth: Earth | null
  /** Plan frame to screen pixels. */
  S: (p: Vec2) => Vec2
  /** Pixels per metre. */
  k: number
}

export function CostsPlanLayer(props: Props) {
  const pointed = useCosts(pointedNow)
  if (!pointed?.target) return null
  return <Highlight {...props} target={pointed.target} />
}

export function Highlight({ plan, level, survey, terrain, earth, S, k, target }: Props & { target: Target }) {
  const ids = useMemo(() => new Set(target.ids ?? []), [target])
  const walls = plan.walls.filter(w => w.level === level)
  const site = (p: Vec2) => S(fromSite(p, plan.placement, survey.origin))

  const shapes: { d: string; cls: string }[] = []
  switch (target.kind) {
    case 'floor':
    case 'ground': {
      const on = target.kind === 'ground' ? (sortedLevels(plan)[0]?.id ?? level) : level
      for (const ring of buildingOutline(planarFaces(plan.walls.filter(w => w.level === on))).outlines) shapes.push({ d: path(ring, S), cls: on === level ? 'fill' : 'line' })
      break
    }
    case 'walls':
    case 'retaining': {
      // A cost line counts walls on every level: those on other floors show as outlines, so the
      // line's whole count is on the plan, and this floor's stand out.
      for (const l of plan.levels) {
        const polys = l.id === level ? wallPolygons(walls) : wallPolygons(plan.walls.filter(w => w.level === l.id && ids.has(w.id)))
        for (const [id, poly] of polys) if (ids.has(id)) shapes.push({ d: path(poly, S), cls: l.id === level ? 'solid' : 'line' })
      }
      break
    }
    case 'openings': {
      for (const o of plan.openings) {
        if (!ids.has(o.id)) continue
        const w = walls.find(x => x.id === o.wall)
        if (!w) continue
        const d = wallDir(w)
        const n: Vec2 = [-d[1], d[0]]
        const h = w.thickness / 2 + 3 / k
        const a = pointOnWall(w, o.offset - o.width / 2)
        const b = pointOnWall(w, o.offset + o.width / 2)
        const at = (p: Vec2, s: number): Vec2 => [p[0] + n[0] * s, p[1] + n[1] * s]
        shapes.push({ d: path([at(a, -h), at(b, -h), at(b, h), at(a, h)], S), cls: 'solid' })
      }
      break
    }
    case 'rooms': {
      const faces = planarFaces(walls)
      for (const r of plan.rooms) {
        if (r.level !== level || !ids.has(r.id)) continue
        const shape = roomShape(r, faces)
        if (shape) shapes.push({ d: path(shape.inner, S), cls: 'fill' })
      }
      break
    }
    case 'areas':
      // As for walls: areas drawn on other floors (a split level's slab under its rooms) as outlines.
      for (const a of plan.areas) if (ids.has(a.id)) shapes.push({ d: path(a.pts, S), cls: a.level === level ? 'fill' : 'line' })
      break
    case 'roofs':
      // Every roof, whatever floor it sits on: a roof plan over the floor plan.
      for (const r of plan.roofs) if (ids.has(r.id)) shapes.push({ d: path(roofGeometry(r).outline, S), cls: 'roof' })
      break
    case 'stairs':
      for (const s of plan.stairs) if (s.level === level && ids.has(s.id)) shapes.push({ d: path(stairLayout(s).outline, S), cls: 'fill' })
      break
    case 'cut':
    case 'fill':
      break
  }

  return (
    <g className="costs-highlight" aria-hidden="true">
      {(target.kind === 'cut' || target.kind === 'fill') && earth && <Dug kind={target.kind} natural={terrain.grid} finished={earth.result.grid} toScreen={site} />}
      {shapes.map((s, i) => (
        <path key={i} className={`ch-${s.cls}`} d={s.d} />
      ))}
    </g>
  )
}

/** The ground dug (or filled), tinted, in the grid's own units with one transform to the screen. */
function Dug({ kind, natural, finished, toScreen }: { kind: 'cut' | 'fill'; natural: Heightfield; finished: Heightfield; toScreen: (p: Vec2) => Vec2 }) {
  const paths = cutFillPaths(natural, finished)
  const o = toScreen([finished.x0, finished.y0])
  const ex = toScreen([finished.x0 + finished.cell, finished.y0])
  const ey = toScreen([finished.x0, finished.y0 + finished.cell])
  const matrix = [ex[0] - o[0], ex[1] - o[1], ey[0] - o[0], ey[1] - o[1], o[0], o[1]].map(n => n.toFixed(4)).join(' ')
  return <path className="ch-dug" transform={`matrix(${matrix})`} d={paths[kind]} fill={rgbCss(kind === 'cut' ? CUT_RGB : FILL_RGB)} />
}
