// The kinds of door and window: how each opens, what it's called in the schedule, its usual
// Australian size, and its plan symbol. A door or window saved before kinds has none: a door is
// then a hinged door and a window is drawn as it always was, so older plans open unchanged.

import type { Vec2 } from '../lib/geom'
import { DOOR_DEFAULT, OPENING_NAMES, WINDOW_DEFAULT, type Opening, type OpeningKind, type Plan } from './model'

export type DoorStyle = 'hinged' | 'sliding' | 'double' | 'bifold'
export type WindowStyle = 'sliding' | 'awning' | 'double-hung' | 'fixed'
export type OpeningStyle = DoorStyle | WindowStyle

export interface StyleInfo<T extends OpeningStyle = OpeningStyle> {
  id: T
  /** In the Kind list. */
  label: string
  /** In the schedule, the card's heading and the drawings: "Sliding door". */
  name: string
  /** Its usual size (m). */
  size: { width: number; height: number; sill: number }
}

export const DOOR_STYLES: StyleInfo<DoorStyle>[] = [
  { id: 'hinged', label: 'Hinged (swings)', name: OPENING_NAMES.door, size: DOOR_DEFAULT },
  { id: 'sliding', label: 'Sliding (glass slider or stacker)', name: 'Sliding door', size: { width: 2.1, height: 2.1, sill: 0 } },
  { id: 'double', label: 'Double (French doors)', name: 'Double door', size: { width: 1.64, height: 2.04, sill: 0 } },
  { id: 'bifold', label: 'Bifold (folds to one side)', name: 'Bifold door', size: { width: 2.4, height: 2.1, sill: 0 } },
]

export const WINDOW_STYLES: StyleInfo<WindowStyle>[] = [
  { id: 'sliding', label: 'Sliding', name: 'Sliding window', size: { width: 1.81, height: 1.2, sill: 0.9 } },
  { id: 'awning', label: 'Awning (hinged at the top)', name: 'Awning window', size: { width: 0.85, height: 1.2, sill: 0.9 } },
  { id: 'double-hung', label: 'Double-hung (slides up)', name: 'Double-hung window', size: { width: 0.85, height: 1.5, sill: 0.6 } },
  { id: 'fixed', label: 'Fixed (doesn’t open)', name: 'Fixed window', size: { width: 1.2, height: 1.2, sill: 0.9 } },
]

/** The kinds a door or a window comes in; none for a plain opening or a garage door. */
export function stylesFor(kind: OpeningKind): StyleInfo[] {
  return kind === 'door' ? DOOR_STYLES : kind === 'window' ? WINDOW_STYLES : []
}

/**
 * An opening's kind of door or window, when it has one that suits what it is. A door with none
 * (every door drawn before kinds) is hinged; a window with none isn't said to be any kind.
 */
export function openingStyle(o: Pick<Opening, 'kind' | 'style'>): OpeningStyle | undefined {
  const found = stylesFor(o.kind).find(s => s.id === o.style)
  return found?.id ?? (o.kind === 'door' ? 'hinged' : undefined)
}

const infoOf = (o: Pick<Opening, 'kind' | 'style'>): StyleInfo | undefined => {
  const id = openingStyle(o)
  return stylesFor(o.kind).find(s => s.id === id)
}

/** What a door or window is called: "Door", "Sliding door", "Awning window", "Garage door". */
export function openingName(o: Pick<Opening, 'kind' | 'style'>): string {
  return infoOf(o)?.name ?? OPENING_NAMES[o.kind]
}

/** The usual size of a kind of door or window: what the tool starts at when the kind is picked. */
export function styleSize(kind: OpeningKind, style: OpeningStyle | undefined): { width: number; height: number; sill: number } | undefined {
  if (style === undefined) return kind === 'window' ? WINDOW_DEFAULT : kind === 'door' ? DOOR_DEFAULT : undefined
  return stylesFor(kind).find(s => s.id === style)?.size
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6

/**
 * Change what kind of door or window an opening is. Its size follows to the new kind's usual one
 * while it's still at the old kind's usual size; a size that was typed is the person's own and
 * stays. `undefined` takes a window back to no kind.
 */
export function setOpeningStyle(plan: Plan, id: string, style: OpeningStyle | undefined): Plan {
  const o = plan.openings.find(x => x.id === id)
  if (!o) return plan
  const next = stylesFor(o.kind).find(s => s.id === style)
  if ((style !== undefined && !next) || openingStyle(o) === (next?.id ?? (o.kind === 'door' ? 'hinged' : undefined))) return plan
  const was = styleSize(o.kind, openingStyle(o))
  const usual = !!was && near(o.width, was.width) && near(o.height, was.height) && near(o.sill, was.sill)
  const size = usual ? styleSize(o.kind, next?.id) : undefined
  const { style: _, ...rest } = o
  const changed: Opening = { ...rest, ...(next ? { style: next.id } : {}), ...(size ? { width: size.width, height: size.height, sill: o.kind === 'window' ? size.sill : 0 } : {}) }
  return { ...plan, openings: plan.openings.map(x => (x.id === id ? changed : x)) }
}

/** A kind's plan symbol: solid lines, and lighter ones (a swing's arc, a sash shown open). */
export interface StyleSymbol {
  lines: Vec2[][]
  light: Vec2[][]
}

/**
 * The plan symbol of a kind of door or window, between its two jambs on the wall's centreline
 * (`p0` nearer the wall's start, `p1` the far one), with `n` the wall's left-hand normal and `ht`
 * half its thickness. Null for a hinged door, a window with no kind, a plain opening and a garage
 * door, which are drawn as they always were.
 */
export function styleSymbol(o: Pick<Opening, 'kind' | 'style' | 'width' | 'flipHinge' | 'flipSwing'>, p0: Vec2, p1: Vec2, n: Vec2, ht: number): StyleSymbol | null {
  const style = openingStyle(o)
  if (!style || (o.kind === 'door' && style === 'hinged')) return null
  const w = o.width
  const d: Vec2 = [(p1[0] - p0[0]) / (w || 1), (p1[1] - p0[1]) / (w || 1)]
  /** A point `along` the opening from its near jamb and `out` to the wall's left. */
  const at = (along: number, out: number): Vec2 => [p0[0] + d[0] * along + n[0] * out, p0[1] + d[1] * along + n[1] * out]
  const jambs: Vec2[][] = [
    [at(0, -ht), at(0, ht)],
    [at(w, -ht), at(w, ht)],
  ]
  if (o.kind === 'window') {
    if (style === 'fixed') return { lines: [...jambs, [at(0, 0), at(w, 0)]], light: [] }
    // Two sashes that pass one another: each a little over half the width, either side of the middle.
    if (style === 'sliding') return { lines: [...jambs, [at(0, ht / 3), at(w * 0.55, ht / 3)], [at(w * 0.45, -ht / 3), at(w, -ht / 3)]], light: [] }
    // The sash pushed out from the frame.
    if (style === 'awning') return { lines: [...jambs, [at(0, 0), at(w, 0)]], light: [[at(0, 0), at(w / 2, ht * 0.9), at(w, 0)]] }
    // Two sashes one over the other, and the stiles where they meet.
    return { lines: [...jambs, [at(0, ht / 3), at(w, ht / 3)], [at(0, -ht / 3), at(w, -ht / 3)], [at(w / 2, -ht / 3), at(w / 2, ht / 3)]], light: [] }
  }
  const side = o.flipSwing ? -1 : 1
  if (style === 'sliding') {
    // A fixed panel and the one that slides past it, drawn thick in the wall.
    const t = Math.min(ht / 2, 0.04)
    return { lines: [...jambs, [at(0, t), at(w * 0.55, t)], [at(w * 0.45, -t), at(w, -t)]], light: [] }
  }
  if (style === 'double') {
    // Two leaves, hinged at each jamb, meeting in the middle.
    const leaf = w / 2
    const arc = (from: number, dir: 1 | -1): Vec2[] => {
      const pts: Vec2[] = []
      for (let i = 0; i <= 12; i++) {
        const a = (Math.PI / 2) * (i / 12)
        pts.push(at(from + dir * Math.sin(a) * leaf, side * (ht + Math.cos(a) * leaf)))
      }
      return pts
    }
    return {
      lines: [
        [at(0, side * ht), at(0, side * (ht + leaf))],
        [at(w, side * ht), at(w, side * (ht + leaf))],
      ],
      light: [arc(0, 1), arc(w, -1)],
    }
  }
  // Bifold: the panels half folded back to the hinge side, as a zigzag, leaving the rest open.
  // Pairs of panels, each no wider than 800 mm.
  const panels = Math.max(2, 2 * Math.ceil(w / 1.6 - 1e-6))
  const len = w / panels
  const zig: Vec2[] = []
  for (let i = 0; i <= panels; i++) {
    const along = (i * len) / 2
    zig.push(at(o.flipHinge ? w - along : along, side * (ht + (i % 2 ? len * 0.866 : 0))))
  }
  return { lines: [...jambs, zig], light: [] }
}
