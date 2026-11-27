// One way for every dialog, sheet and pop-up menu to own the keyboard while it is open: Tab stays
// inside it, Esc closes it wherever focus has got to, and focus goes back to the control that
// opened it (or somewhere sensible if that control has gone).

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

const STOPS = 'a[href], button, input, select, textarea, summary, [tabindex]'

/** Where Tab goes among `n` stops from stop `at` (-1: focus is somewhere else): round the ends, never out. */
export function trapStep(n: number, at: number, back: boolean): number {
  if (n <= 0) return -1
  if (at < 0) return back ? n - 1 : 0
  return (at + (back ? n - 1 : 1)) % n
}

/** Everything Tab stops on inside `box`, in order. */
function stopsIn(box: HTMLElement): HTMLElement[] {
  return [...box.querySelectorAll<HTMLElement>(STOPS)].filter(
    el => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && (el as HTMLInputElement).type !== 'hidden' && el.getClientRects().length > 0,
  )
}

/** Whether `el` is still on the page and showing, so focus can go to it. */
const reachable = (el: HTMLElement | null): el is HTMLElement => !!el && el.isConnected && el !== document.body && el.getClientRects().length > 0

/**
 * Somewhere sensible for focus when the control that had it has gone: the open tab's panel, else
 * the main part of the page. Never the page body, where the next Tab starts from the very top.
 */
export function focusHome() {
  const home = document.querySelector<HTMLElement>('[data-focus-home]') ?? document.querySelector<HTMLElement>('main')
  if (!home) return
  if (!home.hasAttribute('tabindex')) {
    home.setAttribute('tabindex', '-1')
    // A place to Tab on from, not a control: no ring round the whole page.
    home.style.outline = 'none'
  }
  home.focus({ preventScroll: true })
}

/** Give focus back to `to`; if it has gone, to somewhere sensible. Nothing had focus before: nothing to give back. */
export function returnFocus(to: HTMLElement | null) {
  if (!to || to === document.body) return
  if (reachable(to)) to.focus({ preventScroll: true })
  if (document.activeElement !== to) focusHome()
}

/** After the page has redrawn, focus the first of these that is showing (a button that replaces the one just pressed). */
export function focusSoon(...selectors: string[]) {
  requestAnimationFrame(() => {
    for (const s of selectors) {
      const el = document.querySelector<HTMLElement>(s)
      if (reachable(el)) {
        el.focus({ preventScroll: true })
        return
      }
    }
    focusHome()
  })
}

// The open ones, the topmost last: only it hears Tab and Esc.
const stack: symbol[] = []

export interface ModalOptions {
  /**
   * What takes focus as it opens: 'auto' is the `[data-autofocus]` control, else the first one,
   * else the box itself; 'none' when the caller places focus.
   */
  focus?: 'auto' | 'none'
  /** Where focus goes as it closes, when that isn't whatever had focus before (a menu's own button). */
  returnTo?: RefObject<HTMLElement | null>
}

/**
 * While `open`, `box` owns the keyboard. `onClose` runs on Esc; it may do nothing (a sheet that
 * is busy saving), and the key still goes no further.
 */
export function useModal(box: RefObject<HTMLElement | null>, open: boolean, onClose: () => void, { focus = 'auto', returnTo }: ModalOptions = {}) {
  const close = useRef(onClose)
  useLayoutEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const startBox = box.current
    const had = document.activeElement as HTMLElement | null
    // (Opened twice over, as React's strict mode does while developing, focus is already inside.)
    const opener = returnTo?.current ?? (had && startBox?.contains(had) ? null : had)
    const me = Symbol('modal')
    stack.push(me)
    const top = () => stack[stack.length - 1] === me
    if (focus === 'auto') {
      const el = startBox
      const first = el && (el.querySelector<HTMLElement>('[data-autofocus]:not([disabled])') ?? stopsIn(el)[0])
      if (first) first.focus()
      else if (el) {
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
        el.focus()
      }
    }
    let back = false
    // A click on the page beside a menu closes it and takes focus where it landed; only the keyboard is kept in.
    let pointer = false
    const onPointer = () => (pointer = true)
    const onKey = (e: KeyboardEvent) => {
      pointer = false
      if (!top()) return
      if (e.key === 'Escape') {
        // Before anything under it hears the key, so Esc here never clears a selection underneath.
        e.preventDefault()
        e.stopPropagation()
        close.current()
        return
      }
      const el = box.current
      if (e.key !== 'Tab' || !el) return
      back = e.shiftKey
      const stops = stopsIn(el)
      const at = stops.indexOf(document.activeElement as HTMLElement)
      // In the middle, Tab is the browser's own; at either end, or from outside, it comes round.
      if (at > 0 && at < stops.length - 1) return
      if (at === 0 && !back && stops.length > 1) return
      if (at === stops.length - 1 && back && stops.length > 1) return
      // A radio that isn't the group's picked one is skipped by the browser: leave those to it and to focusin below.
      if (at < 0 && el.contains(document.activeElement) && document.activeElement !== el) return
      e.preventDefault()
      const next = stops[trapStep(stops.length, at, back)]
      ;(next ?? el).focus()
    }
    // Focus that still got out by keyboard (past a skipped radio at the end, say) comes back in.
    const onFocus = (e: FocusEvent) => {
      const el = box.current
      const to = e.target as Node | null
      if (pointer || !top() || !el || !to || el.contains(to)) return
      const stops = stopsIn(el)
      ;(stops[trapStep(stops.length, -1, back)] ?? el).focus()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus, true)
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocus, true)
      document.removeEventListener('pointerdown', onPointer, true)
      const i = stack.indexOf(me)
      if (i >= 0) stack.splice(i, 1)
      // Focus is given back unless whatever closed this has already put it somewhere.
      const now = document.activeElement
      if (!now || now === document.body || startBox?.contains(now)) returnFocus(opener)
    }
    // `box` and `returnTo` are refs and `focus` a constant of the caller's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}
