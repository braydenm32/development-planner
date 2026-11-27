// Hold Space and drag to move the plan, whatever is under the pointer and whichever tool is
// picked: the habit from every drawing program. PlanEditor asks `held()` when a press starts.

import { useEffect, useRef, type RefObject } from 'react'
import { shortcutAllowed, tabbingNow } from '../nav/keys'

/** Things Space presses for itself when the keyboard is driving. */
const PRESSABLE = 'button, a[href], summary, [role="button"], [role="tab"], [role="option"], [role="menuitem"]'

interface SpaceKey {
  code: string
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  target: EventTarget | null
}

/**
 * May this Space press be the pan key? Never in a text box, a dropdown or behind a dialog
 * (shortcutAllowed). On a button it's the button's own key when Tab put the focus there; a button
 * that was only clicked (a tool just picked) gives it up while the pointer is over the plan.
 */
export function spaceIsPan(e: SpaceKey, overPlan: boolean, tabbing = tabbingNow(), allowed: (e: SpaceKey) => boolean = shortcutAllowed): boolean {
  if (e.code !== 'Space' || e.ctrlKey || e.metaKey || e.altKey) return false
  if (!allowed(e)) return false
  const el = e.target as { closest?: (s: string) => unknown } | null
  if (el?.closest?.(PRESSABLE)) return overPlan && !tabbing
  return true
}

/** Space held as the pan key over this plan. The plan's element carries `data-pan` while it is, for its cursor. */
export function useSpacePan(plan: RefObject<Element | null>) {
  const held = useRef(false)
  /** A press that began with Space held: it only ever pans, even if Space lifts first. */
  const panning = useRef(false)
  useEffect(() => {
    const set = (on: boolean) => {
      held.current = on
      const el = plan.current
      if (!el) return
      if (on) el.setAttribute('data-pan', '')
      else el.removeAttribute('data-pan')
    }
    // Alt turns snapping off while it's held (src/pointer/snapping.ts). On Windows and Linux a tap of
    // Alt also opens the browser's own menu; not while the pointer is working on the plan.
    const alt = (e: KeyboardEvent) => {
      if (e.key === 'Alt' && plan.current?.matches(':hover')) e.preventDefault()
    }
    const down = (e: KeyboardEvent) => {
      alt(e)
      if (e.code !== 'Space') return
      if (held.current) {
        // The key repeating while it's held.
        e.preventDefault()
        return
      }
      if (!spaceIsPan(e, !!plan.current?.matches(':hover'))) return
      // Space is ours for now: the page doesn't scroll, and the button the focus was left on isn't pressed.
      e.preventDefault()
      set(true)
    }
    const up = (e: KeyboardEvent) => {
      alt(e)
      if (e.code !== 'Space' || !held.current) return
      e.preventDefault()
      set(false)
    }
    const drop = () => set(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', drop)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', drop)
      drop()
    }
  }, [plan])
  return {
    /** A press starting now pans. */
    grab: (): boolean => (panning.current = held.current),
    /** The press that has just ended was a Space pan: nothing is clicked. */
    release: (): boolean => {
      const was = panning.current
      panning.current = false
      return was
    },
  }
}
