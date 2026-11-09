// The plan editor's gentle questions, in order: when a room is made (with the Room tool, or by
// walls closing round a space) on a level with no floor type, ask how its floor is built, once;
// then, on a slab, offer a retaining wall where the floor cuts deep into the ground or sits high
// above it. Also the one-click "pick a contour" that sets a floor's level. Nothing here changes the
// plan until it's clicked, and every change is one undoable step.

import { create } from 'zustand'
import { pointInPolygon } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Heightfield } from '../lib/terrain'
import { floorFromContour } from '../plan/contourPick'
import { isLowestLevel, levelFloorType, onPad, setLevelFloorType, shouldAskFloorType, floorTypeInfo, DEFAULT_FLOOR_TYPE, type FloorTypeId } from '../plan/floorTypes'
import { faceAround, planarFaces, type Face } from '../plan/geometry'
import type { Plan } from '../plan/model'
import { faceKey, newEnclosures, OFFER_GAP, OFFER_PLACEMENT, OFFER_THRESHOLD, offeredWall, retainOfferFor, type OfferPlacement, type RetainOffer } from '../plan/retainOffer'
import { placeRetainingWall } from '../plan/retainingSession'
import { usePlan } from '../plan/store'

/** A room, or a space walls have just closed round, that a question is about. */
export interface Space {
  level: string
  /** The room, when there is one. */
  room?: string
  /** What "Don't ask for this room" remembers it by: the room's id, and the walls round it. */
  keys: string[]
}

/** The survey and natural ground the questions are worked out on. */
export interface FlowGround {
  survey: Pick<Survey, 'origin' | 'boundary'>
  natural: Heightfield
}

export interface OfferState {
  space: Space
  offer: RetainOffer
  placement: OfferPlacement
  gap: number
}

interface FlowState {
  /** The floor type card: the level it asks about, and the space that made it ask. */
  ask: { space: Space; more: boolean } | null
  offer: OfferState | null
  /** Picking a contour for this level's floor. */
  picking: { level: string } | null
  /** Levels whose floor type question was put off this visit. */
  dismissed: Set<string>
  ground: FlowGround | null
  settings: FlowSettings
}

export interface FlowSettings {
  /** Offer a retaining wall when a slab room's floor is more than this below or above the ground (m). */
  offerAt: number
  /** Offer them at all. */
  offers: boolean
  /** Rooms (and spaces) not to offer again. */
  quiet: string[]
}

const KEY = 'design-flow-v1'
export const DEFAULT_SETTINGS: FlowSettings = { offerAt: OFFER_THRESHOLD, offers: true, quiet: [] }

function loadSettings(): FlowSettings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<FlowSettings> | null
    if (!s) return DEFAULT_SETTINGS
    return {
      offerAt: typeof s.offerAt === 'number' && s.offerAt > 0 ? s.offerAt : OFFER_THRESHOLD,
      offers: s.offers !== false,
      quiet: Array.isArray(s.quiet) ? s.quiet.filter(k => typeof k === 'string').slice(-500) : [],
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveSettings(s: FlowSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Kept for this visit only.
  }
}

export const useFlow = create<FlowState>(() => ({
  ask: null,
  offer: null,
  picking: null,
  dismissed: new Set(),
  ground: null,
  settings: loadSettings(),
}))

const get = useFlow.getState
const set = useFlow.setState
const plan = () => usePlan.getState().plan

export function setFlowSettings(patch: Partial<FlowSettings>) {
  const settings = { ...get().settings, ...patch }
  set({ settings })
  saveSettings(settings)
}

/** The plan editor says which survey and ground it is drawing on. */
export function setFlowGround(ground: FlowGround | null) {
  if (get().ground?.survey !== ground?.survey || get().ground?.natural !== ground?.natural) set({ ground })
}

/** The enclosed space a space is, on its level now. */
function faceOf(p: Plan, space: Space): Face | null {
  const faces = planarFaces(p.walls.filter(w => w.level === space.level))
  if (space.room) {
    const r = p.rooms.find(x => x.id === space.room)
    return r ? faceAround(r.at, faces) : null
  }
  const key = space.keys.find(k => k.startsWith('face:'))
  return faces.find(f => f.area > 0 && faceKey(f) === key) ?? null
}

/** A room or space was just made: ask its level's floor type if it hasn't one, else see whether it needs a retaining wall. */
export function spaceMade(space: Space) {
  const p = plan()
  if (!p) return
  if (shouldAskFloorType(p, space.level, get().dismissed)) {
    set({ ask: { space, more: false }, offer: null })
    return
  }
  offerFor(space)
}

/** The Room tool named a room. */
export function roomMade(roomId: string) {
  const p = plan()
  const r = p?.rooms.find(x => x.id === roomId)
  if (!p || !r) return
  const face = faceAround(r.at, planarFaces(p.walls.filter(w => w.level === r.level)))
  spaceMade({ level: r.level, room: r.id, keys: [r.id, ...(face ? [faceKey(face)] : [])] })
}

/** Walls were just drawn on a level: if they closed round a new space, it's a room made. */
export function wallsPlaced(before: Plan, level: string) {
  const p = plan()
  if (!p || !isLowestLevel(p, level)) return
  const made = newEnclosures(before, p, level)
  if (!made.length) return
  // The biggest new space speaks for the rest.
  const face = made.reduce((a, b) => (b.area > a.area ? b : a))
  const room = p.rooms.find(r => r.level === level && pointInPolygon(r.at[0], r.at[1], face.pts))
  spaceMade({ level, room: room?.id, keys: [...(room ? [room.id] : []), faceKey(face)] })
}

/** The floor type card's answer, for the level (one undoable step). Then the retaining wall question, on a slab. */
export function answerFloorType(type: FloorTypeId) {
  const a = get().ask
  if (!a) return
  set({ ask: null })
  usePlan.getState().commit(p => setLevelFloorType(p, a.space.level, type))
  if (floorTypeInfo(type).ground === 'pad') offerFor(a.space)
}

/** "Decide later": not asked again this visit; the floor builds as a slab until it's set. */
export function putOffFloorType() {
  const a = get().ask
  if (!a) return
  set({ ask: null, dismissed: new Set([...get().dismissed, a.space.level]) })
}

export const showMoreFloorTypes = () => set(s => ({ ask: s.ask && { ...s.ask, more: true } }))

/** Is this space on a levelled pad (its room's own floor type, else its level's)? */
function spaceOnPad(p: Plan, space: Space): boolean {
  if (!isLowestLevel(p, space.level)) return false
  const r = space.room ? p.rooms.find(x => x.id === space.room) : undefined
  if (r) return onPad(p, r)
  const t = levelFloorType(p, space.level)
  return t !== 'framed' && floorTypeInfo(t ?? DEFAULT_FLOOR_TYPE).ground === 'pad'
}

/** Offer a retaining wall for a space on a slab, when one of its outside edges cuts or fills past the setting. */
export function offerFor(space: Space) {
  const p = plan()
  const { ground, settings } = get()
  if (!p || !ground || !settings.offers) return
  if (space.keys.some(k => settings.quiet.includes(k))) return
  if (!spaceOnPad(p, space)) return
  const face = faceOf(p, space)
  if (!face) return
  const offer = retainOfferFor(p, face, space.level, ground.survey, ground.natural, settings.offerAt)
  if (!offer) return
  set({ offer: { space, offer, placement: OFFER_PLACEMENT === 'house' ? 'house' : 'gap', gap: OFFER_GAP } })
}

export const setOfferPlacement = (placement: OfferPlacement) => set(s => ({ offer: s.offer && { ...s.offer, placement } }))
export const setOfferGap = (gap: number) => set(s => ({ offer: s.offer && { ...s.offer, gap } }))

/** Place the suggested wall (one undoable step) and open its card, filled in, to check and keep. */
export function acceptOffer() {
  const o = get().offer
  if (!o) return
  set({ offer: null })
  placeRetainingWall(offeredWall(o.offer, o.placement, o.gap))
}

/** "Not now". */
export const dismissOffer = () => set({ offer: null })

/** "Don't ask for this room". */
export function quietOffer() {
  const o = get().offer
  if (!o) return
  set({ offer: null })
  setFlowSettings({ quiet: [...get().settings.quiet, ...o.space.keys] })
}

// ---------------------------------------------------------------------------
// Pick a contour

/** Start picking a contour for a level's floor (the active level when none is given). */
export function startContourPick(level = usePlan.getState().activeLevel) {
  set({ picking: { level } })
}

export const cancelContourPick = () => set({ picking: null })

/** Set the picked level's floor to a contour's RL (one undoable step), and stop picking. */
export function pickContour(rl: number) {
  const pk = get().picking
  if (!pk) return
  set({ picking: null })
  usePlan.getState().commit(p => floorFromContour(p, pk.level, rl))
}

// A plan opened afresh (another project, an import) starts with no questions pending.
usePlan.subscribe((s, prev) => {
  if (s.fitToken !== prev.fitToken && s.plan !== prev.plan) set({ ask: null, offer: null, picking: null, dismissed: new Set() })
  // Undo can take away the space a question was about.
  const { ask, offer } = get()
  if (s.plan && s.plan !== prev.plan) {
    const gone = (sp: Space) => (sp.room ? !s.plan!.rooms.some(r => r.id === sp.room) : !faceOf(s.plan!, sp))
    if (ask && (gone(ask.space) || levelFloorType(s.plan, ask.space.level) !== undefined)) set({ ask: null })
    if (offer && gone(offer.space)) set({ offer: null })
  }
})
