// What the one-line peek says about the thing tapped on a phone's plan: its name and its one key
// size, the figure the full card leads with. Pure, so the tests read it without drawing.

import { areaSizeText } from '../components/planNumbers'
import { furnitureName } from '../plan/furniture'
import { roomArea } from '../plan/keyNumbers'
import { isRetaining, wallLength, type Plan } from '../plan/model'
import { openingName } from '../plan/openingStyles'
import { selectionCounts } from '../plan/editing'
import { selectionPoints } from '../plan/reveal'
import type { Selection } from '../plan/store'
import { worldToScreen, type PlanView, type Size } from './gestures'

export interface PeekLine {
  name: string
  /** Its key size, or null where it has none worth a line ("Stair"). */
  size: string | null
}

const mm = (m: number) => `${Math.round(m * 1000)} mm`

/** The selection's name and key size; null when it is no longer on the plan. */
export function selectionPeek(plan: Plan, sel: Selection, extra: Selection[] = []): PeekLine | null {
  if (extra.length) return { name: `${extra.length + 1} items selected`, size: selectionCounts([sel, ...extra]) }
  switch (sel.type) {
    case 'wall': {
      const w = plan.walls.find(x => x.id === sel.id)
      if (!w) return null
      return { name: isRetaining(w) ? 'Retaining wall' : w.kind === 'internal' ? 'Internal wall' : 'External wall', size: `${mm(wallLength(w))} long` }
    }
    case 'opening': {
      const o = plan.openings.find(x => x.id === sel.id)
      return o ? { name: openingName(o), size: `${mm(o.width)} wide` } : null
    }
    case 'room': {
      const r = plan.rooms.find(x => x.id === sel.id)
      if (!r) return null
      const area = roomArea(plan, r)
      return { name: r.name.trim() || 'Room', size: area === null ? 'not enclosed' : `${area.toFixed(2)} m²` }
    }
    case 'area': {
      const a = plan.areas.find(x => x.id === sel.id)
      return a ? { name: a.name.trim() || 'Outdoor area', size: areaSizeText(a.pts).split(' · ')[0] } : null
    }
    case 'furniture': {
      const f = plan.furniture.find(x => x.id === sel.id)
      return f ? { name: furnitureName(f), size: `${Math.round(f.width * 1000)} × ${mm(f.depth)}` } : null
    }
    case 'roof': {
      const r = plan.roofs.find(x => x.id === sel.id)
      return r ? { name: 'Roof', size: `${r.pitch}° pitch` } : null
    }
    case 'stair': {
      const s = plan.stairs.find(x => x.id === sel.id)
      return s ? { name: 'Stair', size: `${mm(s.width)} wide` } : null
    }
    case 'sketch': {
      const k = (plan.sketch ?? []).find(x => x.id === sel.id)
      if (!k) return null
      const len = k.pts.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - k.pts[i][0], p[1] - k.pts[i][1]), 0)
      return { name: k.kind === 'measure' ? 'Measurement' : 'Sketch line', size: k.kind === 'circle' ? null : mm(len) }
    }
  }
}

/**
 * How far down the plan the selection sits (px): the middle of its span. Opening the full card
 * from the peek covers the plan's lower part, so the plan slides this clear of it as it does after a tap.
 */
export function selectionScreenY(plan: Plan, sel: Selection, v: PlanView, rho: number, size: Size): number | null {
  const ys = selectionPoints(plan, sel).map(p => worldToScreen(v, rho, size, p)[1])
  return ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : null
}
