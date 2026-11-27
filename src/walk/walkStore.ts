// Walk-through's state outside the 3D view: whether it's on, where (for the panel and the
// announcements), and the asks from buttons, the menu and search. The moves themselves live in
// the render loop (./WalkRig.tsx); what's held down goes in `held`, never through React.

import { create } from 'zustand'
import { takeKeys } from '../nav/keys'

/** A way to move: from the keys, or the on-screen pad. */
export type WalkMove = 'forward' | 'back' | 'left' | 'right' | 'turnLeft' | 'turnRight'

interface WalkState {
  /** Walking now. */
  active: boolean
  /** An ask to start, from a room (its id) or anywhere (null room); `n` counts them. Kept until the 3D view takes it. */
  ask: { room: string | null; n: number } | null
  /** "Ground floor · Kitchen". */
  place: string
  /** The level walked on, by its place in the walk's levels (lowest first). */
  level: number
  /** Whether there is a level to go up or down to from here. */
  up: boolean
  down: boolean
  /** Index into SPEEDS. */
  speed: number
  /** Go up (+1) or down (−1); `n` counts them. */
  climb: { dir: 1 | -1; n: number } | null
  /** Asked to stop; the 3D view puts the camera back. */
  leaveN: number
  start: (room?: string | null) => void
  leave: () => void
  goLevel: (dir: 1 | -1) => void
  /** The 3D view's report of where it is now. */
  set: (s: Partial<Pick<WalkState, 'active' | 'place' | 'level' | 'up' | 'down' | 'speed'>>) => void
}

export const useWalk = create<WalkState>((set, get) => ({
  active: false,
  ask: null,
  place: '',
  level: 0,
  up: false,
  down: false,
  speed: 1,
  climb: null,
  leaveN: 0,
  start: (room = null) => set({ ask: { room, n: (get().ask?.n ?? 0) + 1 } }),
  leave: () => set({ ask: null, leaveN: get().leaveN + 1 }),
  goLevel: dir => set({ climb: { dir, n: (get().climb?.n ?? 0) + 1 } }),
  set: s => set(s),
}))

// While walking, the plain keys are the walk's: no other single-key shortcut fires (src/nav/keys.ts).
useWalk.subscribe((s, prev) => s.active !== prev.active && takeKeys(s.active))

/** What's held down right now, from the keys and the on-screen pad; read each frame. */
export const held = new Set<WalkMove>()

/** One press of a pad button from the keyboard (Enter or Space): a single stride or turn, taken by the next frame. */
export const taps: WalkMove[] = []

const KEYS: Record<string, WalkMove> = {
  ArrowUp: 'forward',
  w: 'forward',
  ArrowDown: 'back',
  s: 'back',
  ArrowLeft: 'left',
  a: 'left',
  ArrowRight: 'right',
  d: 'right',
  q: 'turnLeft',
  e: 'turnRight',
}

/** The move a key makes while walking: arrows and W A S D walk and step sideways, Q and E turn. */
export const walkMove = (key: string): WalkMove | null => KEYS[key.length === 1 ? key.toLowerCase() : key] ?? null
