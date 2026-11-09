// What the hover tooltip on the plan says about the thing under the pointer: what it is, and one or
// two of its key numbers, written the way the rest of the app writes them (same helpers, same rounding).

import { signedArea } from '../lib/geom'
import type { SiteFeature } from '../site/model'
import { featureName } from '../site/model'
import { roomFloorText } from '../plan/floorTypes'
import { furnitureName } from '../plan/furniture'
import { roomArea } from '../plan/keyNumbers'
import { areaKind, AREA_KINDS, OPENING_NAMES, wallLength, WALL_KINDS, type Area, type Furniture, type Opening, type Plan, type Roof, type Room, type Stair, type Wall } from '../plan/model'
import { stairLayout } from '../plan/stairs'

export type TipSubject =
  | { type: 'wall'; item: Wall }
  | { type: 'opening'; item: Opening }
  | { type: 'room'; item: Room }
  | { type: 'area'; item: Area }
  | { type: 'roof'; item: Roof }
  | { type: 'stair'; item: Stair }
  | { type: 'furniture'; item: Furniture }
  | { type: 'site'; item: SiteFeature }
  | { type: 'contour'; z: number; finished: boolean }

export interface TipContext {
  plan: Plan
  /** How much a retaining wall holds back, as its panel measures it (m), when known. */
  retained?: (w: Wall) => number | null
}

const mm = (m: number) => Math.round(m * 1000).toString()
const ROOF_NAMES = { hip: 'hip', gable: 'gable', skillion: 'skillion', flat: 'flat' } as const

/** One line: "External wall · 4.30 m", "Door · 820 wide", "Garage · 41.20 m² · slab on ground". */
export function tooltipText(s: TipSubject, ctx: TipContext): string {
  switch (s.type) {
    case 'wall': {
      const w = s.item
      const kind = WALL_KINDS.find(k => k.id === w.kind)?.label ?? 'Wall'
      if (w.kind === 'retaining') {
        const h = ctx.retained?.(w)
        return h === null || h === undefined ? 'Retaining wall' : `Retaining wall · holds back ${h.toFixed(2)} m`
      }
      return `${kind} wall · ${wallLength(w).toFixed(2)} m`
    }
    case 'opening': {
      const o = s.item
      return `${OPENING_NAMES[o.kind]} · ${mm(o.width)} wide`
    }
    case 'room': {
      const r = s.item
      const area = roomArea(ctx.plan, r)
      return area === null ? `${r.name} · not enclosed` : `${r.name} · ${area.toFixed(2)} m² · ${roomFloorText(ctx.plan, r)}`
    }
    case 'area': {
      const a = s.item
      const kind = AREA_KINDS.find(k => k.id === areaKind(a))?.label
      const name = a.name || kind || 'Area'
      return `${name} · ${Math.abs(signedArea(a.pts)).toFixed(2)} m²`
    }
    case 'roof': {
      const r = s.item
      return r.type === 'flat' ? 'Roof · flat' : `Roof · ${ROOF_NAMES[r.type]} ${r.pitch.toFixed(1)}°`
    }
    case 'stair':
      return `Stair · ${stairLayout(s.item).risers} risers`
    case 'furniture':
      return furnitureName(s.item)
    case 'site': {
      const f = s.item
      if (f.type === 'tree' && f.trunk) return `${featureName(f)} · trunk Ø ${Number(f.trunk.toFixed(2))} m`
      return featureName(f)
    }
    case 'contour':
      return `${s.finished ? 'Finished contour' : 'Contour'} RL ${s.z.toFixed(2)}`
  }
}
