// Undo and Redo on another floor: a step that changed only another level would otherwise change
// what you can't see, without a word. The plan goes to that level and a toast says so.

import { showToast } from '../safety/store'
import type { Plan } from './model'
import { usePlan } from './store'

/**
 * The levels whose things differ between two plans: walls, doors and windows, rooms, areas, roofs,
 * stairs, furniture and notes, and the levels' own settings. A step keeps the objects it didn't
 * change, so comparing them by reference finds exactly what it changed.
 */
export function levelsChanged(a: Plan, b: Plan): string[] {
  const out = new Set<string>()
  const diff = <T extends { id: string }>(xs: T[], ys: T[], levelOf: (x: T, p: 'a' | 'b') => string | undefined) => {
    const before = new Map(xs.map(x => [x.id, x]))
    const after = new Map(ys.map(y => [y.id, y]))
    for (const x of xs) if (after.get(x.id) !== x) out.add(levelOf(x, 'a') ?? '')
    for (const y of ys) if (before.get(y.id) !== y) out.add(levelOf(y, 'b') ?? '')
  }
  const own = (x: { level: string }) => x.level
  diff(a.walls, b.walls, own)
  diff(a.rooms, b.rooms, own)
  diff(a.areas, b.areas, own)
  diff(a.roofs, b.roofs, own)
  diff(a.stairs, b.stairs, own)
  diff(a.furniture, b.furniture, own)
  diff(a.notes ?? [], b.notes ?? [], own)
  const wallsA = new Map(a.walls.map(w => [w.id, w.level]))
  const wallsB = new Map(b.walls.map(w => [w.id, w.level]))
  diff(a.openings, b.openings, (o, p) => (p === 'a' ? wallsA : wallsB).get(o.wall))
  diff(a.levels, b.levels, l => l.id)
  out.delete('')
  return [...out]
}

/**
 * After an Undo or Redo that changed only levels other than the one shown, show the one it
 * changed (the lowest, if several) and say so. Returns the level it went to, or null.
 */
export function showUndoneLevel(before: Plan, after: Plan, what: 'Undone' | 'Redone'): string | null {
  const st = usePlan.getState()
  const changed = levelsChanged(before, after).filter(id => after.levels.some(l => l.id === id))
  if (!changed.length || changed.includes(st.activeLevel)) return null
  const level = [...after.levels].sort((p, q) => p.elevation - q.elevation).find(l => changed.includes(l.id))!
  st.setActiveLevel(level.id)
  showToast({ text: `${what} on ${level.name}, so it’s showing now.` })
  return level.id
}

// Every Undo and Redo of the plan, however it was asked for (the keys, the top bar's buttons).
usePlan.subscribe((s, prev) => {
  if (!s.plan || !prev.plan || s.plan === prev.plan) return
  const undone = s.plan === prev.past[prev.past.length - 1] && s.future[0] === prev.plan
  const redone = s.plan === prev.future[0] && s.past[s.past.length - 1] === prev.plan
  if (undone || redone) showUndoneLevel(prev.plan, s.plan, undone ? 'Undone' : 'Redone')
})
