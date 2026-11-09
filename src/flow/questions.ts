// The questions the plan has for you, as one list of data (C19): which side faces the street, how
// a floor is built, a retaining wall where a slab room cuts deep, the next step (name the rooms…),
// and facts the checks need. They used to pop up over the plan while you drew and take the clicks
// meant for it; now they wait in a list beside it, one answered at a time, and nothing opens by
// itself. Any panel can show the same list (the inspector's foot, a later to-do list): it's
// worked out here from the plan and the flow's state, with nothing drawn.

import { create } from 'zustand'
import { nextHint, TIPS, type HintId, type HintPrefs } from '../guide/hints'
import { isLowestLevel, levelFloorType } from '../plan/floorTypes'
import { planarFaces } from '../plan/geometry'
import { sortedLevels, type Plan } from '../plan/model'
import type { OfferState } from './store'

export type QuestionKind = 'street' | 'floor-type' | 'retain-offer' | 'next-step' | 'facts'

export interface Question {
  /** Unique in the list, and the same from one moment to the next. */
  id: string
  kind: QuestionKind
  /** What's asked, short: "Which side faces the street?". */
  title: string
  /** A line under it. */
  detail?: string
  /** The level it's about, for a floor type. */
  level?: string
  /** The next-step tip it is. */
  hint?: HintId
  /** Just asked, by something you did: the list says so, without opening. */
  fresh?: boolean
}

export interface QuestionInput {
  plan: Plan
  /** The level being drawn on. */
  level: string
  /** The street side is still to answer for this project. */
  street: boolean
  /** The flow's floor type question (just asked), and levels whose question was put off. */
  ask: { level: string } | null
  dismissed: ReadonlySet<string>
  offer: OfferState | null
  hints: HintPrefs
  /** Facts the checks can't work out from the plan (Approvals › Checks' "Add a fact"). */
  facts: number
}

/** Every open question, most pressing first. */
export function questionsFor(q: QuestionInput): Question[] {
  const out: Question[] = []
  const { plan } = q
  if (q.street) out.push({ id: 'street', kind: 'street', title: 'Which side faces the street?', detail: 'The checks measure the front setback from it.' })
  // Floor types: every ground level with walls round a space and no type yet, whether or not
  // it was put off: "Floor type not chosen" stays until it is, through a reload too.
  for (const l of sortedLevels(plan)) {
    if (!isLowestLevel(plan, l.id) || levelFloorType(plan, l.id) !== undefined) continue
    const walls = plan.walls.filter(w => w.level === l.id && w.kind !== 'retaining')
    const enclosed = planarFaces(walls).some(f => f.area > 0) || plan.rooms.some(r => r.level === l.id)
    if (!enclosed) continue
    const later = q.dismissed.has(l.id)
    out.push({
      id: `floor-type:${l.id}`,
      kind: 'floor-type',
      level: l.id,
      title: `Floor type not chosen: ${l.name}`,
      detail: later ? 'Put off for now. It builds as a slab on ground until it’s set.' : 'Slab, piers or something else: it changes the earthworks.',
      fresh: q.ask?.level === l.id,
    })
  }
  if (q.offer) {
    const room = q.offer.space.room ? plan.rooms.find(r => r.id === q.offer!.space.room) : undefined
    const o = q.offer.offer
    out.push({
      id: `retain-offer:${q.offer.space.keys.join(',')}`,
      kind: 'retain-offer',
      title: `A retaining wall on the ${o.facing} side?`,
      detail: `${room ? `${room.name}’s floor` : 'The floor'} is ${o.depth.toFixed(2)} m ${o.kind === 'cut' ? 'below' : 'above'} the ground there.`,
      fresh: true,
    })
  }
  // The next step's tip, once there are walls: an empty floor keeps its own tip on the plan.
  const hint = nextHint(plan, q.level, q.hints)
  if (hint && hint !== 'walls') out.push({ id: `next:${hint}`, kind: 'next-step', hint, title: TIPS[hint].title, detail: TIPS[hint].desk })
  if (q.facts > 0) out.push({ id: 'facts', kind: 'facts', title: `${q.facts} fact${q.facts > 1 ? 's' : ''} the checks need`, detail: 'Things the plan can’t say, such as the zone or the street’s kerb level.' })
  return out
}

/** How many of them want an answer (a tip is only a suggestion). */
export const waiting = (qs: Question[]) => qs.filter(x => x.kind !== 'next-step').length

// ---------------------------------------------------------------------------
// What the list knows from outside the plan: the checks' facts, which the shell works out.

interface QuestionContext {
  facts: number
}

export const useQuestionContext = create<QuestionContext>(() => ({ facts: 0 }))

export function setQuestionFacts(facts: number) {
  if (useQuestionContext.getState().facts !== facts) useQuestionContext.setState({ facts })
}
