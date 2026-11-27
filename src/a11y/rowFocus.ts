// Where keyboard focus goes when a list of things on the plan changes under it (Design › Walls &
// doors, the furniture on a level). A row deleted, or a "Change or delete" link put away, takes
// focus with it to <body>, and a keyboard user starts again from the top of the page. Instead it
// lands on the next row (or the one before), on the new row after an add, and on the list's own
// heading or add button when the list empties. Worked out here, without a page, for the tests.

export type RowFocus = { row: string } | { fallback: true } | null

/**
 * After the rows or the selection changed: the row to focus, the list's fallback, or nothing
 * (the change wasn't this list's). Only used once focus has been lost to the page.
 */
export function rowFocusAfter(prevIds: string[], prevSel: string | null, ids: string[], sel: string | null): RowFocus {
  const had = prevSel !== null && prevIds.includes(prevSel)
  // Something of this list's is picked now (a new row just added, say): it takes focus.
  if (sel !== null && ids.includes(sel) && (sel !== prevSel || !prevIds.includes(sel))) return { row: sel }
  // Not this list's change, or the selection moved to something of another list's.
  if (!had || (sel !== null && sel !== prevSel)) return null
  // The picked row is still there (the selection was put down): back to it.
  if (ids.includes(prevSel)) return { row: prevSel }
  if (!ids.length) return { fallback: true }
  // It went: the row that took its place, or the last one.
  const at = prevIds.indexOf(prevSel)
  const kept = prevIds.filter(id => ids.includes(id))
  const next = prevIds.slice(at + 1).find(id => ids.includes(id))
  return { row: next ?? kept.at(-1) ?? ids[Math.min(at, ids.length - 1)] }
}

/** Whether focus has been lost to the page (the focused thing was taken away). */
export const focusLost = (): boolean => typeof document !== 'undefined' && (!document.activeElement || document.activeElement === document.body)
