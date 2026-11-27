// Arrow keys inside the groups that announce they have them (WCAG 4.1.2): a radio group, a tab
// list, a toolbar, a list box and a menu all tell a screen reader "use the arrows", so the arrows
// move between their items here, once, for every such group in the app. Home and End go to the
// ends. In a radio group the choice follows the focus, as it does for the browser's own radios.
//
// Only for an item the keyboard came to (Tab since the last click; not :focus-visible, which the
// arrow key itself switches on). A tool or a swatch that was clicked keeps the plan's own arrow
// keys (they nudge what is selected), as src/nav/keys.ts sets out. Tab still stops on each item
// too: nothing that worked before stops working.

import { tabbingNow } from './keys'

/** The groups, the items the arrows move between, and whether moving also chooses (a radio). */
export const ARROW_GROUPS: { group: string; item: string; choose: boolean }[] = [
  { group: '[role="radiogroup"]', item: '[role="radio"]', choose: true },
  { group: '[role="tablist"]', item: '[role="tab"]', choose: true },
  { group: '[role="toolbar"]', item: 'button', choose: false },
  { group: '[role="listbox"]', item: '[role="option"]', choose: false },
  { group: '[role="menu"]', item: '[role^="menuitem"]', choose: false },
]

/** Where a key takes the focus among `count` items, from item `at`; null for a key that isn't one of these. Wraps at the ends. */
export function arrowStep(key: string, at: number, count: number): number | null {
  if (count < 1) return null
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (at + 1) % count
    case 'ArrowLeft':
    case 'ArrowUp':
      return (at - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

function onKey(e: KeyboardEvent) {
  // A group with keys of its own (the search list, the project menu) has dealt with it already.
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
  const el = e.target instanceof HTMLElement ? e.target : null
  if (!el || arrowStep(e.key, 0, 1) === null || !tabbingNow()) return
  for (const g of ARROW_GROUPS) {
    const group = el.closest(g.group)
    if (!group || !el.matches(g.item)) continue
    // The items of this group itself that can be used now: not switched off, not folded away.
    const items = [...group.querySelectorAll<HTMLElement>(g.item)].filter(i => i.closest(g.group) === group && !i.matches(':disabled, [aria-disabled="true"]') && i.getClientRects().length > 0)
    const to = arrowStep(e.key, items.indexOf(el), items.length)
    if (to === null || items[to] === el) return
    e.preventDefault()
    // The plan's own arrow keys don't also nudge the drawing.
    e.stopPropagation()
    items[to].focus()
    if (g.choose) items[to].click()
    return
  }
}

// After React's own handlers (so a component's keys win), before the window's shortcuts.
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('keydown', onKey)
