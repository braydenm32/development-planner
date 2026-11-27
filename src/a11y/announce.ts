// What changed, said out loud: one polite live region for the whole app (./Announcer.tsx), fed
// from here. A screen reader hears the new place, the tool picked up, what was just selected and
// where its details are, and the results that changed after an edit, without focus moving
// (WCAG 4.1.3). Toasts and the save chip's own problems already speak for themselves
// (role=status); this is for the things that only changed on screen.
//
// The words are worked out by pure functions, so the tests read them without a page.

import { create } from 'zustand'
import { furnitureName } from '../plan/furniture'
import { isRetaining, OPENING_NAMES, type Plan } from '../plan/model'
import type { Selection, Tool } from '../plan/store'
import { TOOLS } from '../components/tools'

interface Said {
  text: string
  /** Counts what is said, so the same words twice are still spoken twice. */
  n: number
}

export const useAnnounce = create<Said>(() => ({ text: '', n: 0 }))

/** Say something to screen readers, politely: it waits for what is being read to finish. */
export function announce(text: string) {
  const t = text.trim()
  if (t) useAnnounce.setState(s => ({ text: t, n: s.n + 1 }))
}

/** "Wall tool. W." as the rail's button is named. */
export function toolWords(tool: Tool): string {
  const def = TOOLS.find(t => t.id === tool)
  return def ? `${def.label} tool` : ''
}

const ROOFS = { hip: 'Hip roof', gable: 'Gable roof', skillion: 'Skillion roof', flat: 'Flat roof' }
const WALLS = { external: 'External wall', internal: 'Internal wall', retaining: 'Retaining wall' }

/** What a selected thing is called: a room's or area's own name, otherwise what it is. */
export function selectionName(plan: Plan, sel: Selection): string {
  const id = sel.id
  if (sel.type === 'room') return plan.rooms.find(r => r.id === id)?.name || 'Room'
  if (sel.type === 'area') return plan.areas.find(a => a.id === id)?.name || 'Outdoor area'
  if (sel.type === 'wall') {
    const w = plan.walls.find(x => x.id === id)
    return w ? (isRetaining(w) ? WALLS.retaining : WALLS[w.kind]) : 'Wall'
  }
  if (sel.type === 'opening') {
    const o = plan.openings.find(x => x.id === id)
    return o ? OPENING_NAMES[o.kind] : 'Opening'
  }
  if (sel.type === 'roof') {
    const r = plan.roofs.find(x => x.id === id)
    return r ? ROOFS[r.type] : 'Roof'
  }
  if (sel.type === 'stair') return 'Stair'
  if (sel.type === 'furniture') {
    const f = plan.furniture.find(x => x.id === id)
    return f ? furnitureName(f) : 'Furniture'
  }
  return 'Sketch line'
}

/**
 * A new selection, in words: what it is and where its details are. Nothing for the same
 * selection again; "Nothing selected" when one is put down.
 */
export function selectionWords(plan: Plan | null, sel: Selection | null, extra: number, had: boolean): string {
  if (!sel || !plan) return had ? 'Nothing selected.' : ''
  if (extra > 0) return `${extra + 1} things selected. They move and delete together.`
  return `${selectionName(plan, sel)} selected. Its details are in the Selection panel.`
}

/** The results the summary strip shows that can change after an edit, as the strip words them. */
export interface ResultFacts {
  /** "CDC checks: 6 to fix · 2 to confirm". */
  checks: string | null
  /** "Out of balance, 160.7 m³ to bring in", while the earthworks are. */
  balance: string | null
  /** "the east boundary", while the earth slopes cross one. */
  batters: string | null
  /** Easements and tree zones reached into. */
  site: number
}

/**
 * What to say when the results change: only the ones that did, each with what it was where that
 * helps ("was nothing to fix"), and a warning that has gone is said to have gone.
 */
export function resultsWords(was: ResultFacts, now: ResultFacts): string {
  const out: string[] = []
  if (now.checks !== was.checks && now.checks) out.push(was.checks ? `${now.checks}. It was ${was.checks.replace(/^.*?: /, '')}.` : `${now.checks}.`)
  if (now.balance !== was.balance) out.push(now.balance ? `${now.balance}.` : 'The cut and fill are back in balance.')
  if (now.batters !== was.batters) out.push(now.batters ? `Earth slopes (batters) cross ${now.batters}.` : 'The earth slopes no longer cross a boundary.')
  if (now.site !== was.site) out.push(now.site ? `Site: ${now.site} to check.` : 'Site: nothing left to check.')
  return out.join(' ')
}

/** The save chip's words that mean the work isn't safe yet. */
const SAVE_TROUBLE = new Set(['Not saving', 'Not saved yet', 'Not saved', 'Offline', 'Sign in again'])

/**
 * What to say when the save chip changes: a problem as it starts, with what to do, and that
 * saving works again when it ends. Routine saves ("Saving…", "Saved · 2:14 pm") stay quiet.
 */
export function saveWords(was: { label: string } | null, now: { label: string; detail: string } | null): string {
  if (!now || was?.label === now.label) return ''
  if (SAVE_TROUBLE.has(now.label)) return now.detail
  return was && SAVE_TROUBLE.has(was.label) ? `Saving works again: ${now.label.toLowerCase()}.` : ''
}

/** How many search results, for the palette: "No results", "1 result", "12 results". */
export const resultCountWords = (n: number) => (n === 0 ? 'No results' : n === 1 ? '1 result' : `${n} results`)
