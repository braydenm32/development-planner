// Dragging from a list onto the plan by touch. A finger on a list scrolls it, so a drag starts
// with a press and hold (HOLD_MS, without moving); after that the finger carries the piece and the
// list stays still. Over the plan, the finger's moves and its lift are handed to the plan as a
// mouse's would be, so the plan draws the piece under the finger and places it where the finger
// lifts, exactly as a mouse's drag does (src/components/FurniturePanel.tsx). A plain tap is left
// alone: it still picks.

/** How long a finger stays still on an item before it can be dragged (ms). */
export const HOLD_MS = 350
/** How far it may wander in that time and still be holding rather than scrolling (px). */
export const HOLD_SLOP = 8

/** Whether a press that has travelled `dist` px after `ms` is still a hold, became a scroll, or is held long enough. */
export function holdState(dist: number, ms: number): 'waiting' | 'scroll' | 'held' {
  if (dist > HOLD_SLOP) return 'scroll'
  return ms >= HOLD_MS ? 'held' : 'waiting'
}

/** The plan under a point on the screen, if any. */
export const planAt = (x: number, y: number): Element | null => document.elementFromPoint(x, y)?.closest('.plan-svg') ?? null

/** Hand the plan what a mouse would send there: a move (it draws the piece) or the button let go (it places it). */
function toPlan(plan: Element, type: 'pointermove' | 'pointerup', x: number, y: number) {
  plan.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }))
}

export interface HoldDrag {
  /** The hold has lasted: the drag begins (pick the piece and its tool). */
  begin: () => void
  /** The finger moved while dragging; `overPlan` when it is over the plan. */
  move: (x: number, y: number, overPlan: boolean) => void
  /** The drag is over, placed or not. */
  end: () => void
}

/** Follow one finger from a press at (x, y). Returns a function that stops following it. */
export function followHold(x0: number, y0: number, h: HoldDrag): () => void {
  let at = { x: x0, y: y0 }
  let dragging = false
  const timer = setTimeout(() => {
    dragging = true
    navigator.vibrate?.(10)
    h.begin()
    h.move(at.x, at.y, !!planAt(at.x, at.y))
  }, HOLD_MS)
  const touchOf = (e: TouchEvent) => e.changedTouches[0]
  const move = (e: TouchEvent) => {
    const t = touchOf(e)
    if (!t) return
    at = { x: t.clientX, y: t.clientY }
    if (!dragging) {
      if (holdState(Math.hypot(at.x - x0, at.y - y0), 0) === 'scroll') stop()
      return
    }
    // The finger carries the piece: the list under it mustn't scroll.
    e.preventDefault()
    const plan = planAt(at.x, at.y)
    if (plan) toPlan(plan, 'pointermove', at.x, at.y)
    h.move(at.x, at.y, !!plan)
  }
  const up = (e: TouchEvent) => {
    const t = touchOf(e)
    const was = dragging
    stop()
    if (!was) return
    e.preventDefault()
    const plan = t && planAt(t.clientX, t.clientY)
    if (plan && e.type === 'touchend') toPlan(plan, 'pointerup', t.clientX, t.clientY)
  }
  // A long press would otherwise open the browser's own menu for the button.
  const menu = (e: Event) => e.preventDefault()
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    window.removeEventListener('touchmove', move)
    window.removeEventListener('touchend', up)
    window.removeEventListener('touchcancel', up)
    window.removeEventListener('contextmenu', menu)
    if (dragging) h.end()
  }
  window.addEventListener('touchmove', move, { passive: false })
  window.addEventListener('touchend', up)
  window.addEventListener('touchcancel', up)
  window.addEventListener('contextmenu', menu)
  return stop
}
