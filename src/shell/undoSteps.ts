// What an undo step was, in a few plain words, and the screen it was made on: for the Undo
// button's tip ("Undo: move wall") and for the note when the step undone is on another screen.
// Nothing records a name when a change is made; a step keeps the objects it didn't change, so
// comparing the plan (or the site features, or the costs) before and after finds what it did.

import type { CostsData } from '../costs/model'
import { areaById, tabOf, type AreaId } from '../nav/menu'
import type { Plan } from '../plan/model'
import type { SiteData } from '../site/store'
import { typeInfo } from '../site/model'

export interface StepName {
  /** "add room", "move wall", "change floor level". */
  what: string
  /** The tab it shows on. */
  area: AreaId
  tab: string
  /** Other areas that show the change just as well (the plan is drawn in Design and Earthworks alike). */
  also?: AreaId[]
}

/** "Design › Plan": a tab's place as the menu names it. */
export function placeLabel(s: Pick<StepName, 'area' | 'tab'>): string {
  const area = areaById(s.area)
  const tab = area && tabOf(area, s.tab)
  return area ? (tab ? `${area.label} › ${tab.label}` : area.label) : ''
}

/** Whether a step's change shows on the screen open now. */
export function stepOnScreen(s: StepName, area: AreaId | null): boolean {
  return area === s.area || (!!area && !!s.also?.includes(area))
}

interface Diff<T> {
  added: T[]
  removed: T[]
  /** Kept, but not the same object: [before, after]. */
  changed: [T, T][]
}

function diff<T extends { id: string }>(a: T[] | undefined, b: T[] | undefined): Diff<T> {
  const xs = a ?? []
  const ys = b ?? []
  const before = new Map(xs.map(x => [x.id, x]))
  const after = new Map(ys.map(y => [y.id, y]))
  const changed: [T, T][] = []
  for (const x of xs) {
    const y = after.get(x.id)
    if (y && y !== x) changed.push([x, y])
  }
  return { added: ys.filter(y => !before.has(y.id)), removed: xs.filter(x => !after.has(x.id)), changed }
}

const touched = (d: Diff<unknown>) => d.added.length + d.removed.length + d.changed.length > 0
const differ = (a: unknown, b: unknown) => a !== b && JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)
const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`)

const OPENING: Record<string, [string, string]> = { door: ['door', 'doors'], window: ['window', 'windows'], opening: ['opening', 'openings'], garage: ['garage door', 'garage doors'] }

const DESIGN: Pick<StepName, 'area' | 'tab' | 'also'> = { area: 'design', tab: 'plan', also: ['earthworks'] }
const PLACE: Pick<StepName, 'area' | 'tab' | 'also'> = { area: 'earthworks', tab: 'place', also: ['design'] }

/** A plan step, from the plan before it and after. */
export function namePlanStep(a: Plan, b: Plan): StepName {
  const levels = diff(a.levels, b.levels)
  const walls = diff(a.walls, b.walls)
  const openings = diff(a.openings, b.openings)
  const rooms = diff(a.rooms, b.rooms)
  const areas = diff(a.areas, b.areas)
  const roofs = diff(a.roofs, b.roofs)
  const stairs = diff(a.stairs, b.stairs)
  const furniture = diff(a.furniture, b.furniture)
  const notes = diff(a.notes, b.notes)
  const sketch = diff(a.sketch, b.sketch)
  const sections = diff(a.sections, b.sections)

  const retaining = (w: { kind: string }) => w.kind === 'retaining'
  const wallNoun = (ws: { kind: string }[]): [string, string] => (ws.length && ws.every(retaining) ? ['retaining wall', 'retaining walls'] : ['wall', 'walls'])
  const wallPlace = (ws: { kind: string }[]) => (ws.length && ws.every(retaining) ? { area: 'earthworks' as const, tab: 'retaining-walls', also: ['design' as const] } : DESIGN)
  const openingNoun = (os: { kind: string }[]): [string, string] => (os.every(o => o.kind === os[0]?.kind) ? (OPENING[os[0]?.kind] ?? OPENING.opening) : ['opening', 'openings'])

  // What each kind of thing is called, most telling first: a room drawn as a box adds walls too,
  // and it is the room that was added.
  const things: { d: Diff<{ id: string }>; noun: [string, string]; place: Pick<StepName, 'area' | 'tab' | 'also'> }[] = [
    { d: levels, noun: ['floor', 'floors'], place: { area: 'design', tab: 'floors', also: ['earthworks'] } },
    { d: roofs, noun: ['roof', 'roofs'], place: DESIGN },
    { d: stairs, noun: ['stairs', 'stairs'], place: DESIGN },
    { d: rooms, noun: ['room', 'rooms'], place: DESIGN },
    { d: areas, noun: ['outdoor area', 'outdoor areas'], place: DESIGN },
    { d: furniture, noun: ['furniture', 'pieces of furniture'], place: DESIGN },
    { d: notes, noun: ['note', 'notes'], place: DESIGN },
    { d: openings, noun: openingNoun([...openings.added, ...openings.removed, ...openings.changed.map(c => c[1])] as { kind: string }[]), place: DESIGN },
    {
      d: walls,
      noun: wallNoun([...walls.added, ...walls.removed, ...(walls.added.length || walls.removed.length ? [] : walls.changed.map(c => c[1]))]),
      place: wallPlace([...walls.added, ...walls.removed, ...(walls.added.length || walls.removed.length ? [] : walls.changed.map(c => c[1]))]),
    },
    { d: sketch, noun: ['sketch line', 'sketch lines'], place: DESIGN },
    { d: sections, noun: ['section line', 'section lines'], place: { area: 'design', tab: 'sections' } },
  ]
  const added = things.filter(t => t.d.added.length)
  const removed = things.filter(t => t.d.removed.length)

  if (added.length && !removed.length) {
    const t = added[0]
    const verb = t.d === walls || t.d === sketch || t.d === sections ? 'draw' : 'add'
    return { what: `${verb} ${count(t.d.added.length, t.noun[0], t.noun[1])}`, ...t.place }
  }
  if (removed.length && !added.length) {
    // Doors and windows go with the wall they were in.
    const own = removed.filter(t => !(t.d === openings && walls.removed.length))
    if (own.length === 1) return { what: `delete ${count(own[0].d.removed.length, own[0].noun[0], own[0].noun[1])}`, ...own[0].place }
    return { what: `delete ${own.reduce((n, t) => n + t.d.removed.length, 0)} things`, ...DESIGN }
  }
  if (added.length && removed.length) {
    const t = added[0]
    return { what: `change ${t.noun[1]}`, ...t.place }
  }

  // Nothing added or taken away: something moved or changed.
  if (levels.changed.length) {
    const [x, y] = levels.changed[0]
    const what = x.name !== y.name ? 'rename level' : x.elevation !== y.elevation ? 'change floor level' : x.height !== y.height ? 'change ceiling height' : 'change level'
    return { what, area: 'design', tab: 'floors', also: ['earthworks'] }
  }
  if (furniture.changed.length) return { what: furniture.changed.some(([x, y]) => differ(x.at, y.at) || x.rotation !== y.rotation) ? 'move furniture' : 'change furniture', ...DESIGN }
  if (openings.changed.length && !walls.changed.length) {
    const noun = openingNoun(openings.changed.map(c => c[1]))
    const moved = openings.changed.every(([x, y]) => x.offset !== y.offset && x.width === y.width && x.height === y.height)
    return { what: `${moved ? 'move' : 'change'} ${count(openings.changed.length, noun[0], noun[1])}`, ...DESIGN }
  }
  if (walls.changed.length) {
    const moved = walls.changed.some(([x, y]) => differ(x.a, y.a) || differ(x.b, y.b))
    const ws = walls.changed.map(c => c[1])
    return { what: `${moved ? 'move' : 'change'} ${wallNoun(ws)[0]}`, ...wallPlace(ws) }
  }
  if (roofs.changed.length) return { what: 'change roof', area: 'design', tab: 'roofs', also: ['earthworks'] }
  if (stairs.changed.length) return { what: 'change stairs', ...DESIGN }
  if (rooms.changed.length) {
    const [x, y] = rooms.changed[0]
    return { what: x.name !== y.name ? 'rename room' : differ(x.at, y.at) ? 'move room label' : 'change room', area: 'design', tab: 'rooms', also: ['earthworks'] }
  }
  if (areas.changed.length) return { what: 'change outdoor area', ...DESIGN }
  if (notes.changed.length) return { what: 'change note', ...DESIGN }
  if (sketch.changed.length) return { what: 'change sketch line', ...DESIGN }
  if (sections.changed.length) return { what: 'change section line', area: 'design', tab: 'sections' }

  // The plan's own settings.
  const p = a.placement
  const q = b.placement
  if (p.ffl !== q.ffl && p.e === q.e && p.n === q.n && p.rotation === q.rotation) return { what: 'change floor level', ...PLACE }
  if (differ(p, q)) return { what: p.rotation !== q.rotation && p.e === q.e && p.n === q.n ? 'turn the house' : 'move the house', ...PLACE }
  if (differ(a.grading, b.grading)) return { what: 'shape the ground', area: 'earthworks', tab: 'cut-fill', also: ['design'] }
  if (differ(a.earthworks, b.earthworks)) return { what: 'change earthworks setting', area: 'earthworks', tab: 'cut-fill' }
  if (differ(a.checks, b.checks)) return { what: 'change planning check setting', area: 'approvals', tab: 'checks' }
  if (differ(a.stormwater, b.stormwater)) return { what: 'change stormwater setting', area: 'approvals', tab: 'stormwater' }
  if (differ(a.basix, b.basix)) return { what: 'change BASIX answer', area: 'approvals', tab: 'basix' }
  if (differ(a.da, b.da)) return { what: 'change DA pack revision', area: 'approvals', tab: 'da-pack' }
  if (differ(a.location, b.location)) return { what: 'change where the block is', area: 'site', tab: 'sun' }
  if (differ(a.sketchNames, b.sketchNames)) return { what: 'name sketch colour', ...DESIGN }
  if (differ(a.finishes, b.finishes)) return { what: 'change finishes', area: 'design', tab: 'finishes' }
  if (differ(a.name, b.name)) return { what: 'rename project', ...DESIGN }
  return { what: 'change to the plan', ...DESIGN }
}

const FEATURES: Pick<StepName, 'area' | 'tab'> = { area: 'site', tab: 'features' }

/** A site features step. */
export function nameSiteStep(a: SiteData, b: SiteData): StepName {
  const f = diff(a.features, b.features)
  const o = diff(a.overlays, b.overlays)
  const noun = (xs: { type: string }[]) => (xs.every(x => x.type === xs[0].type) && xs[0].type !== 'other' ? typeInfo(xs[0].type as never).label.toLowerCase() : 'site feature')
  if (f.added.length && !f.removed.length) return { what: f.added.length === 1 ? `add ${noun(f.added)}` : `add ${f.added.length} site features`, ...FEATURES }
  if (f.removed.length && !f.added.length) return { what: f.removed.length === 1 ? `delete ${noun(f.removed)}` : `delete ${f.removed.length} site features`, ...FEATURES }
  if (o.added.length) return { what: 'add drawing', ...FEATURES }
  if (o.removed.length) return { what: 'remove drawing', ...FEATURES }
  // Views from photos live in Site › 3D (src/photoview).
  const ph = diff(a.photos, b.photos)
  if (ph.added.length || ph.removed.length || ph.changed.length)
    return { what: ph.added.length ? 'add photo' : ph.removed.length ? 'remove photo' : 'change view from a photo', area: 'site', tab: '3d' }
  if (f.changed.length) {
    const [x, y] = f.changed[0]
    const what = !!x.remove !== !!y.remove ? (y.remove ? `mark ${noun([y])} for removal` : `keep ${noun([y])}`) : differ(x.geom, y.geom) ? `move ${noun([y])}` : `change ${noun([y])}`
    return { what, ...FEATURES }
  }
  if (touched(f)) return { what: 'change site features', ...FEATURES }
  if (o.changed.length) return { what: 'change drawing', ...FEATURES }
  if (differ(a.edits, b.edits)) return { what: 'change survey feature', ...FEATURES }
  if (differ(a.hidden, b.hidden)) return { what: 'show or hide site features', ...FEATURES }
  if (differ(a.extraDxf, b.extraDxf)) return { what: 'change features file', ...FEATURES }
  return { what: 'change to the site features', ...FEATURES }
}

/** A costs step. */
export function nameCostsStep(a: CostsData, b: CostsData): StepName {
  const at = (tab: string, what: string): StepName => ({ what, area: 'costs', tab })
  if (differ(a.quotes, b.quotes)) {
    const n = Object.keys(b.quotes).length - Object.keys(a.quotes).length
    return at('estimate', n > 0 ? 'add quote' : n < 0 ? 'remove quote' : 'change quote')
  }
  if (differ(a.rates, b.rates)) return at('estimate', 'change rate')
  if (differ(a.choices, b.choices)) return at('estimate', 'change cost choice')
  if (a.contingency !== b.contingency) return at('estimate', 'change contingency')
  if (a.margin !== b.margin) return at('estimate', 'change builder’s margin')
  if (a.who !== b.who) return at('estimate', 'change who builds')
  return at('estimate', 'change to the costs')
}
