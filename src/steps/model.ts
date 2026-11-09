// "Check everything": the whole project as six steps (Block, Levels & rooms, Ground & walls, Roof,
// Checks, Costs & share), each with its headline number, whether it's done, and what's left in it.
// Everything here is worked out from what the app already knows (the plan, the key numbers, the
// checks, the estimate and the plan's question list in src/flow/questions.ts), as plain data, so
// the list updates as things are fixed and the tests read it without drawing. Each item says where
// it's fixed (`go`); ./go.ts takes you there.

import { fixOf, type FixLink } from '../checks/targets'
import { WORD_OF, type Word } from '../checks/topics'
import { NEED_FRONT } from '../checks/rules'
import type { CheckResult } from '../checks/types'
import { ENGINEER_TEXT, needsEngineer } from '../checks/engineer'
import type { ImpliedTotals } from '../grading/implied'
import { pointInPolygon, signedArea, type Vec2 } from '../lib/geom'
import type { AreaId, CanvasView } from '../nav/menu'
import type { Question } from '../flow/questions'
import { planarFaces } from '../plan/geometry'
import { floorRL, houseWalls, levelById, sortedLevels, type Plan, type Wall } from '../plan/model'
import { levelFloorAnswer } from '../plan/floorTypes'
import { growRing, levelOutlines } from '../plan/roof'
import { ceilingRL, levelsSharingCeiling, roofEavesRL, roofLineKey } from '../plan/roofline'
import { stairMeetsNoFloor } from '../plan/stairs'
import type { Selection, Tool } from '../plan/store'
import { shortMoney } from '../costs/format'
import { andList, m2, netText } from '../shell/format'
import { balanceWords, type CostHeadline } from '../shell/headline'

export type StepId = 'block' | 'levels' | 'ground' | 'roof' | 'checks' | 'costs'

/** What an item asks of you: the checks' own words for theirs, "todo" for the rest, "ask" for a question waiting. */
export type ItemTone = 'todo' | 'ask' | 'fix' | 'confirm' | 'fact'

/** Where an item is fixed. */
export type Go =
  /** A place in the app: a tab, perhaps on a level, with something picked and framed on the plan, or a tool out. */
  | {
      to: 'place'
      area: AreaId
      tab: string
      view?: CanvasView
      /** A More item or a field the tab scrolls to (the router's focus). */
      focus?: string
      /** A field to put the cursor in, by its element id. */
      field?: string
      level?: string
      sel?: Selection
      /** Points (house frame) for the plan to frame. */
      frame?: Vec2[]
      tool?: Tool
    }
  /** A check: where it's fixed (one to fix), else its row in Approvals › Checks, which says why. */
  | { to: 'check'; id: string; fix: FixLink | null }
  /** A question in the plan's list (src/flow/questions.ts), opened to answer. */
  | { to: 'question'; id: string }

export interface StepItem {
  /** Unique in the list, and the same from one moment to the next. */
  id: string
  text: string
  detail?: string
  tone: ItemTone
  go: Go
}

export type StepStatus = 'done' | 'todo' | 'empty'

export interface Step {
  id: StepId
  /** 1 to 6. */
  n: number
  title: string
  /** Its number: "810 m² · 12% slope", "3 levels · 188.64 m²", "36.7 m³ to take away". */
  headline: string
  /** Done, something left, or nothing there yet (no walls, no roof). */
  status: StepStatus
  items: StepItem[]
  /** The checks step's worst word, for its colour. */
  word?: Word
}

export interface StepsInput {
  plan: Plan
  site: {
    area: number
    slopePct: number
    /** A sketch block: 'rough' before its size is set. */
    sketch: 'rough' | 'sized' | null
    /** The street side has been set (on the plan's checks), not left to the low side. */
    streetSet: boolean
    /** Survey layers read by guessing, not looked at since. */
    layerGuesses: number
    /** Placed on the map (Site › Map). */
    mapPlaced: boolean
  }
  numbers: {
    floorArea: number | null
    /** The lowest floor's RL. */
    ffl: number
    earth: { net: number; outOfBalance: boolean; balancedRL: number | null } | null
    /** The tallest roof's height above the ground. */
    roofHeight: number | null
    implied: ImpliedTotals | null
  }
  /** The levels whose floor sits on the ground (src/plan/floorTypes.ts), each asked how its floor is built. */
  onGround: string[]
  /** The drawn retaining walls, with the most each holds back (m) and its name ("North wall"). */
  retaining: { wall: Wall; height: number; name?: string }[]
  /** The checks, once a floor is drawn. */
  checks: { name: 'DA' | 'CDC'; head: string; word: Word; results: CheckResult[] } | null
  cost: CostHeadline | null
  /** Which of the DA pack's title block details there are (typed, or from the map). */
  da: { address: boolean; lot: boolean; preparedBy: boolean }
  questions: Question[]
}

export const STEP_TITLES: Record<StepId, string> = {
  block: 'Block',
  levels: 'Levels & rooms',
  ground: 'Ground & walls',
  roof: 'Roof',
  checks: 'Checks',
  costs: 'Costs & share',
}

/** Where each kind of question is answered, among the steps. */
const QUESTION_STEP: Record<Question['kind'], StepId | null> = {
  street: 'block',
  'floor-type': 'levels',
  'retain-offer': 'ground',
  // The facts are listed one by one under Checks; the next-step tips are covered by the steps' own items.
  facts: null,
  'next-step': null,
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** A room still called what the Room tool first named it, or nothing. */
export const unnamedRoom = (name: string) => !name.trim() || /^Room \d+$/.test(name.trim())

const place = (area: AreaId, tab: string, more: Omit<Extract<Go, { to: 'place' }>, 'to' | 'area' | 'tab'> = {}): Go => ({ to: 'place', area, tab, ...more })

/** The middle of a wall, and its ends, for the plan to frame. */
const wallPts = (w: Pick<Wall, 'a' | 'b'>): Vec2[] => [w.a, w.b]

function questionItems(qs: Question[], step: StepId): StepItem[] {
  return qs
    .filter(q => QUESTION_STEP[q.kind] === step)
    .map(q => ({ id: `q:${q.id}`, text: q.title, detail: q.detail, tone: 'ask', go: { to: 'question', id: q.id } }))
}

/**
 * The outside walls on each level with no roof over them: nothing covers their middle, neither a
 * roof at or above the level's ceiling (on any level, so a split level's shared roofline counts,
 * and a lower wing's roof doesn't cover the higher wing's wall beside it) nor another level built
 * over them.
 */
export function wallsWithoutRoof(plan: Plan): Map<string, Wall[]> {
  const roofs = plan.roofs
    .filter(r => r.pts.length >= 3)
    .map(r => ({ ring: growRing(signedArea(r.pts) < 0 ? [...r.pts].reverse() : r.pts, 0.05), eaves: roofEavesRL(plan, r) }))
  const outlines = new Map(plan.levels.map(l => [l.id, levelOutlines(houseWalls(plan.walls.filter(w => w.level === l.id)))]))
  const out = new Map<string, Wall[]>()
  for (const l of sortedLevels(plan)) {
    const ceiling = ceilingRL(plan, l.id)
    const above = plan.levels.filter(o => o.id !== l.id && floorRL(plan, o.id) >= ceiling - 0.05)
    const bare = plan.walls.filter(w => {
      if (w.level !== l.id || w.kind !== 'external') return false
      const m: Vec2 = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]
      if (roofs.some(r => r.eaves >= ceiling - 0.05 && pointInPolygon(m[0], m[1], r.ring))) return false
      return !above.some(o => (outlines.get(o.id) ?? []).some(ring => pointInPolygon(m[0], m[1], growRing(signedArea(ring) < 0 ? [...ring].reverse() : ring, 0.05))))
    })
    if (bare.length) out.set(l.id, bare)
  }
  return out
}

/** Pairs of roofs over levels whose ceilings line up, that could share one roofline but don't. */
export function unmatchedRooflines(plan: Plan): [string, string][] {
  const out: [string, string][] = []
  const seen = new Set<string>()
  for (const r of plan.roofs) {
    for (const l of levelsSharingCeiling(plan, r.level)) {
      if (l.id === r.level) continue
      for (const o of plan.roofs.filter(x => x.level === l.id)) {
        const key = [r.id, o.id].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)
        // Matched one way or the other, or both on one roofline already.
        if (roofLineKey(r) === `roof:${o.id}` || roofLineKey(o) === `roof:${r.id}`) continue
        out.push([r.id, o.id])
      }
    }
  }
  return out
}

function blockStep(i: StepsInput): Omit<Step, 'n' | 'status'> & { started: boolean } {
  const s = i.site
  const items: StepItem[] = []
  if (s.sketch) items.push({ id: 'sketch', text: 'Add the survey', detail: 'This block is a sketch: its levels are guesses until the survey comes.', tone: 'todo', go: place('site', 'block', { view: '3d' }) })
  if (s.sketch === 'rough') items.push({ id: 'sketch-size', text: 'Set the block’s size', detail: 'The sketch’s size isn’t set yet.', tone: 'todo', go: place('site', 'block', { view: '3d', focus: 'sketch-size' }) })
  const street = questionItems(i.questions, 'block')
  items.push(...street)
  if (!s.streetSet && !street.length)
    items.push({ id: 'street', text: 'Say which side faces the street', detail: 'Until it’s set, the low side is taken as the street.', tone: 'todo', go: place('site', 'block', { view: '3d', focus: 'street-side' }) })
  if (s.layerGuesses > 0)
    items.push({ id: 'layers', text: `Check what the survey’s ${plural(s.layerGuesses, 'layer')} were read as`, detail: 'The import guessed from their names.', tone: 'todo', go: place('site', 'more', { focus: 'survey-layers' }) })
  if (!s.mapPlaced) items.push({ id: 'map', text: 'Place the block on the map', detail: 'For its zone, the planning maps and the address.', tone: 'todo', go: place('site', 'map') })
  return { id: 'block', title: STEP_TITLES.block, headline: `${Math.round(s.area)} m² · ${Math.round(s.slopePct)}% slope`, items, started: true }
}

function levelsStep(i: StepsInput): Omit<Step, 'n' | 'status'> & { started: boolean } {
  const { plan } = i
  const items: StepItem[] = []
  const levels = sortedLevels(plan)
  const house = houseWalls(plan.walls)
  const started = house.length > 0
  if (!started) items.push({ id: 'walls', text: 'Draw the outside walls', detail: 'Everything else (earthworks, roof, checks, costs) follows from them.', tone: 'todo', go: place('design', 'plan', { view: 'plan', tool: 'wall' }) })
  for (const l of levels) {
    const walls = house.filter(w => w.level === l.id)
    if (started && !walls.length) {
      items.push({ id: `walls:${l.id}`, text: `Draw the walls on ${l.name}`, detail: 'This level has no walls yet.', tone: 'todo', go: place('design', 'plan', { view: 'plan', level: l.id, tool: 'wall' }) })
      continue
    }
    if (!walls.length) continue
    const faces = planarFaces(walls).filter(f => f.area > 0)
    if (!faces.length) {
      items.push({ id: `close:${l.id}`, text: `Close the outside walls on ${l.name}`, detail: 'They don’t go all the way round yet, so it has no floor.', tone: 'todo', go: place('design', 'plan', { view: 'plan', level: l.id, frame: walls.flatMap(wallPts) }) })
      continue
    }
    // Spaces the walls close round with no room in them, and rooms still called "Room 2".
    const rooms = plan.rooms.filter(r => r.level === l.id)
    const empty = faces.filter(f => f.area >= 1 && !rooms.some(r => pointInPolygon(r.at[0], r.at[1], f.pts)))
    const unnamed = rooms.filter(r => unnamedRoom(r.name))
    const n = empty.length + unnamed.length
    if (n) {
      const first = unnamed[0]
      const go: Go = first
        ? place('design', 'rooms', { view: 'plan', level: l.id, sel: { type: 'room', id: first.id }, frame: [first.at] })
        : place('design', 'plan', { view: 'plan', level: l.id, frame: empty[0].pts, tool: 'room' })
      const what = n === 1 ? (first ? `“${first.name.trim() || 'Room'}”` : `the room of ${m2(empty[0].area)}`) : plural(n, 'room')
      items.push({ id: `names:${l.id}`, text: `Name ${what} on ${l.name}`, detail: first ? 'Pick it and type its name.' : 'Click inside it with the Room tool.', tone: 'todo', go })
    }
    // Doors and windows: a level with none at all.
    const ids = new Set(walls.map(w => w.id))
    if (!plan.openings.some(o => ids.has(o.wall)))
      items.push({ id: `openings:${l.id}`, text: `Add doors and windows on ${l.name}`, detail: 'It has none yet: the estimate and the sun need them.', tone: 'todo', go: place('design', 'plan', { view: 'plan', level: l.id, tool: 'door' }) })
  }
  // How each floor on the ground is built: the question list's, else (a split level it hasn't asked yet) Design › Floors.
  const asked = questionItems(i.questions, 'levels')
  items.push(...asked)
  for (const id of i.onGround) {
    const l = levelById(plan, id)
    if (!l || levelFloorAnswer(plan, id) !== undefined || asked.some(q => q.id === `q:floor-type:${id}`)) continue
    if (!planarFaces(house.filter(w => w.level === id)).some(f => f.area > 0)) continue
    items.push({ id: `floor:${id}`, text: `How is the floor on ${l.name} built?`, detail: 'It sits on the ground: slab, piers or something else changes the earthworks.', tone: 'todo', go: place('design', 'floors', { view: 'plan', level: id }) })
  }
  for (const s of plan.stairs) {
    if (!stairMeetsNoFloor(plan, s)) continue
    const l = levelById(plan, s.level)
    items.push({
      id: `stair:${s.id}`,
      text: `A stair on ${l?.name ?? 'a level'} meets no floor`,
      detail: 'Its top is in the air or a ceiling: join it to a level, or change its rise.',
      tone: 'todo',
      go: place('design', 'plan', { view: 'plan', level: s.level, sel: { type: 'stair', id: s.id }, frame: [s.at] }),
    })
  }
  const area = i.numbers.floorArea
  const headline = started && area ? `${plural(levels.length, 'level')} · ${m2(area)}` : levels.length > 1 ? `${plural(levels.length, 'level')} · nothing drawn` : 'Nothing drawn yet'
  return { id: 'levels', title: STEP_TITLES.levels, headline, items, started }
}

function groundStep(i: StepsInput): Omit<Step, 'n' | 'status'> & { started: boolean } {
  const items: StepItem[] = []
  const e = i.numbers.earth
  if (e?.outOfBalance)
    items.push({
      id: 'balance',
      text: `Out of balance: ${netText(e.net)}`,
      detail: e.balancedRL !== null ? balanceWords(i.numbers.ffl, e.balancedRL).replace(/^Balance: /, 'Balance would ') : 'Moving the floor up or down can’t balance it.',
      tone: 'todo',
      go: place('earthworks', 'cut-fill', { view: 'plan' }),
    })
  items.push(...questionItems(i.questions, 'ground'))
  const implied = i.numbers.implied
  if (implied)
    items.push({
      id: 'implied',
      text: `${implied.count === 1 ? 'A wall' : `${implied.count} walls`} the earthworks need, not drawn yet`,
      detail: `Up to ${implied.maxHeight.toFixed(2)} m high, dashed on the plan.`,
      tone: 'todo',
      go: place('earthworks', 'cut-fill', { view: 'plan' }),
    })
  for (const r of i.retaining) {
    const name = r.name ?? 'A retaining wall'
    const go = place('earthworks', 'retaining-walls', { view: 'plan', level: r.wall.level, sel: { type: 'wall', id: r.wall.id }, frame: wallPts(r.wall) })
    if (r.height < 0.05) items.push({ id: `flat:${r.wall.id}`, text: `${name} holds back nothing yet`, detail: 'Set its height, or which side the earth is on.', tone: 'todo', go })
    else if (needsEngineer(r.height))
      items.push({ id: `eng:${r.wall.id}`, text: `${name}, ${r.height.toFixed(2)} m, needs an engineer`, detail: `Over ${ENGINEER_TEXT}: it needs a professional engineer’s certificate.`, tone: 'confirm', go })
  }
  const started = !!e
  return { id: 'ground', title: STEP_TITLES.ground, headline: e ? (e.outOfBalance ? netText(e.net) : 'Cut and fill balance') : 'Nothing to dig yet', items, started }
}

function roofStep(i: StepsInput): Omit<Step, 'n' | 'status'> & { started: boolean } {
  const { plan } = i
  const items: StepItem[] = []
  const walls = houseWalls(plan.walls).some(w => w.kind === 'external')
  if (walls && !plan.roofs.length) items.push({ id: 'roof', text: 'Draw a roof', detail: 'The building’s height and the estimate wait for one.', tone: 'todo', go: place('design', 'roofs', { view: 'plan', tool: 'roof' }) })
  else
    for (const [level, bare] of wallsWithoutRoof(plan)) {
      const l = levelById(plan, level)
      items.push({
        id: `bare:${level}`,
        text: `${plural(bare.length, 'wall')} on ${l?.name ?? 'a level'} with no roof over ${bare.length === 1 ? 'it' : 'them'}`,
        detail: 'Roof this level, or match a roof’s roofline across it.',
        tone: 'todo',
        go: place('design', 'roofs', { view: 'plan', level, frame: bare.flatMap(wallPts), tool: 'roof' }),
      })
    }
  for (const [a, b] of unmatchedRooflines(plan)) {
    const ra = plan.roofs.find(r => r.id === a)!
    const rb = plan.roofs.find(r => r.id === b)!
    const na = levelById(plan, ra.level)?.name
    const nb = levelById(plan, rb.level)?.name
    items.push({
      id: `match:${a}|${b}`,
      text: `Match the roofs over ${na} and ${nb}`,
      detail: 'Their ceilings line up, so they can share one roofline.',
      tone: 'todo',
      go: place('design', 'roofs', { view: 'plan', level: ra.level, sel: { type: 'roof', id: ra.id }, frame: ra.pts }),
    })
  }
  const h = i.numbers.roofHeight
  return { id: 'roof', title: STEP_TITLES.roof, headline: plan.roofs.length && h !== null ? `${h.toFixed(2)} m above ground` : 'No roof yet', items, started: plan.roofs.length > 0 }
}

const CHECK_TONE: Partial<Record<Word, ItemTone>> = { fix: 'fix', confirm: 'confirm', fact: 'fact' }

function checksStep(i: StepsInput): Omit<Step, 'n' | 'status'> & { started: boolean } {
  const c = i.checks
  if (!c) return { id: 'checks', title: STEP_TITLES.checks, headline: 'Once a floor is drawn', items: [], started: false }
  const items: StepItem[] = []
  // Fix first, then Confirm, then the facts to add, each in the rules' own order.
  for (const word of ['fix', 'confirm', 'fact'] as const)
    for (const r of c.results) {
      if (WORD_OF[r.status] !== word) continue
      // The street side is asked once, under Block.
      if (!i.site.streetSet && r.note === NEED_FRONT) continue
      const detail = [r.value, r.limit && `allowed ${r.limit}`].filter(Boolean).join(' · ') || r.note
      items.push({ id: `check:${r.id}`, text: r.title, detail, tone: CHECK_TONE[word]!, go: { to: 'check', id: r.id, fix: word === 'fix' ? fixOf(r) : null } })
    }
  return { id: 'checks', title: STEP_TITLES.checks, headline: `${c.name} · ${c.head}`, items, started: true, word: c.word }
}

function costsStep(i: StepsInput): Omit<Step, 'n' | 'status'> & { started: boolean } {
  const items: StepItem[] = []
  const c = i.cost
  const ready = !!c?.ready
  if (c?.ready && c.missing.length)
    items.push({ id: 'estimate', text: `The estimate has nothing for the ${andList(c.missing)} yet`, detail: 'Draw them and their lines fill in.', tone: 'todo', go: place('costs', 'estimate') })
  if (!i.da.address) items.push({ id: 'address', text: 'Add the site’s address', detail: 'For the DA pack’s title blocks. It stays on this device.', tone: 'todo', go: place('approvals', 'da-pack', { field: 'da-address' }) })
  if (!i.da.lot) items.push({ id: 'lot', text: 'Add the Lot and DP', detail: 'For the DA pack’s title blocks.', tone: 'todo', go: place('approvals', 'da-pack', { field: 'da-lot' }) })
  if (!i.da.preparedBy) items.push({ id: 'by', text: 'Say who prepared the plans', detail: 'Your name or business, on the DA pack.', tone: 'todo', go: place('approvals', 'da-pack', { field: 'da-by' }) })
  return { id: 'costs', title: STEP_TITLES.costs, headline: ready ? `About ${shortMoney(c!.total)}` : 'No estimate yet', items, started: ready }
}

/** The six steps, in order, each with what's left. */
export function stepsOf(i: StepsInput): Step[] {
  return [blockStep(i), levelsStep(i), groundStep(i), roofStep(i), checksStep(i), costsStep(i)].map(({ started, ...s }, k) => ({
    ...s,
    n: k + 1,
    status: s.items.length ? 'todo' : started ? 'done' : 'empty',
  }))
}

/** "3 to do", "4 to fix", "Done", "Not started": a step's status in a few words. */
export function statusText(s: Step): string {
  if (s.status === 'done') return 'Done'
  if (s.status === 'empty' && !s.items.length) return 'Not started'
  const fix = s.items.filter(x => x.tone === 'fix').length
  if (fix) return `${fix} to fix`
  const ask = s.items.filter(x => x.tone === 'ask').length
  if (ask === s.items.length) return plural(ask, 'question')
  return `${s.items.length} to do`
}

/** The foot of the list: "1 of 6 done · 10 to do". */
export function progressText(steps: Step[]): string {
  const done = steps.filter(s => s.status === 'done').length
  const left = steps.reduce((t, s) => t + s.items.length, 0)
  return `${done} of ${steps.length} done${left ? ` · ${left} to do` : ''}`
}

/** The first step with something left, for where the list opens. */
export const firstOpen = (steps: Step[]): StepId => (steps.find(s => s.status !== 'done') ?? steps[0]).id
