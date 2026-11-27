// What every number box does with Enter and Undo, for the ones that aren't a Num (src/components/fields.tsx).

/**
 * For a box that keeps its value when it loses focus: Enter keeps the value and comes straight
 * back to the box with its text selected, so the next key typed goes in the box and never picks
 * a tool. (Back after the redraw, so the box shows the value as it was kept.)
 */
export function keepAndStay(el: HTMLInputElement) {
  el.blur()
  requestAnimationFrame(() => {
    const at = document.activeElement
    if (!el.isConnected || (at && at !== document.body)) return
    el.focus()
    el.select()
  })
}

/**
 * `data-settled` for a text or number box: set while nothing has been typed since its value was
 * kept, when the box has nothing of its own to undo and Ctrl+Z is the app's (src/nav/keys.ts).
 */
export const settled = (editing: string | null, shown: string): '' | undefined => (editing === null || editing === shown ? '' : undefined)
