// Android's Back (and a browser's, on a touch screen) closes what is open over the screen, a sheet,
// the Overview or a dialog, instead of leaving the place (PH-20). Each one that opens pushes one
// history entry of its own: the same address, marked with its id. Back pops it, and the router
// tells this module first, which closes it. Closed from the page instead (its ×, Esc, a tap
// beside it) while its mark is on top, the mark is taken off with history.back(), so a later Back
// doesn't land on an entry that does nothing.
//
// Three rules keep Back, Forward and reload restoring the place exactly as before:
//  - Going somewhere new while a mark is on top replaces the mark rather than stacking on it (the
//    router asks `leaveMark`), so the new place's entry never carries a sheet's mark, and Back from
//    it goes to where the sheet was opened from.
//  - The level or selection written while a sheet is open (the router's replaceState) goes on the
//    mark's entry; when the mark is popped, the entry under it is brought up to date with it, so
//    closing a sheet never takes back a change made under it.
//  - While a history.back() of ours is on its way (the browser does it later), the router's own
//    history writes wait for it (`afterBacks`), or they would land on the entry being left.

import { useEffect, useLayoutEffect, useRef } from 'react'

const KEY = 'sheet'

interface Open {
  id: string
  close: () => void
  /** False once its entry has gone (replaced by a new place): closing it then has no Back to take. */
  marked: boolean
  /** The address last written while its mark was on top. */
  href?: string
}

/** The open ones that Back closes, the newest last. */
const open: Open[] = []
/** The addresses to put on the entry each history.back() of ours lands on, oldest first. */
const pending: (string | undefined)[] = []
let waiting: (() => void)[] = []
let seq = 0

/** The id of the sheet whose mark is on the current history entry, if any. */
export const sheetMark = (state: unknown = history.state): string | undefined => (state && typeof state === 'object' ? ((state as Record<string, unknown>)[KEY] as string | undefined) : undefined)

/** A history state without a sheet's mark: what a new place's entry starts from. */
export function withoutMark<T>(state: T): T {
  if (!state || typeof state !== 'object' || !(KEY in state)) return state
  const rest = { ...(state as Record<string, unknown>) }
  delete rest[KEY]
  return rest as T
}

/** Run `fn` now, or once a history.back() of ours has landed (history writes in between would go on the entry being left). */
export function afterBacks(fn: () => void) {
  if (pending.length) waiting.push(fn)
  else fn()
}

function goBack(href: string | undefined) {
  pending.push(href)
  history.back()
}

/**
 * Something opened over the screen that Back should close: pushes its mark. Returns what to call
 * as it closes from the page; `close` is what Back calls.
 */
export function openSheet(close: () => void): () => void {
  const me: Open = { id: `${Date.now().toString(36)}-${++seq}`, close, marked: true }
  open.push(me)
  afterBacks(() => {
    if (!open.includes(me) || !me.marked) return
    history.pushState({ ...((withoutMark(history.state) as object | null) ?? {}), [KEY]: me.id }, '', location.href)
  })
  return () => {
    const i = open.indexOf(me)
    if (i < 0) return
    open.splice(i, 1)
    if (!me.marked) return
    afterBacks(() => {
      if (sheetMark() === me.id) goBack(me.href)
    })
  }
}

/** The router is writing the address with replaceState: remember it for the open sheet whose mark is on top. */
export function markMoved(href: string) {
  const m = sheetMark()
  const top = m && open.find(o => o.marked && o.id === m)
  if (top) top.href = href
}

/**
 * The router is going somewhere new. True when a mark is on top: the router then replaces that
 * entry with the new place instead of pushing one after it. What was open stays open, but no
 * longer has an entry of its own to pop.
 */
export function leaveMark(): boolean {
  if (sheetMark() === undefined) return false
  for (const o of open) o.marked = false
  return true
}

/**
 * Back or Forward moved through history: close what was opened after the entry now showing. True
 * when it was a history.back() of ours (the address is already right, so the router has nothing to do).
 */
export function sheetPopped(): boolean {
  const m = sheetMark()
  if (pending.length) {
    const href = pending.shift()
    // Landed on the mark of something already closed (closed under another one): one more step.
    if (m !== undefined && !open.some(o => o.marked && o.id === m)) {
      goBack(href)
      return true
    }
    if (href && href !== location.hash) history.replaceState(history.state, '', href)
    if (!pending.length) {
      const run = waiting
      waiting = []
      run.forEach(fn => fn())
    }
    return true
  }
  const at = open.findIndex(o => o.marked && o.id === m)
  const closing = open.slice(at + 1).filter(o => o.marked)
  if (!closing.length) return false
  // The address the newest of them had written: the place stays as it was left (before closing, which may write again).
  const href = [...closing].reverse().find(o => o.href)?.href
  if (href && href !== location.hash) history.replaceState(history.state, '', href)
  for (const o of closing.reverse()) {
    open.splice(open.indexOf(o), 1)
    o.close()
  }
  return false
}

/** A reload: nothing is open any more, so a mark left on the entry is dropped. */
export function forgetMarks() {
  open.length = 0
  pending.length = 0
  waiting = []
  if (sheetMark() !== undefined) history.replaceState(withoutMark(history.state), '')
}

/** Whether the main pointer is a finger: Back closes sheets on a touch screen, where it is the way out. */
const touchScreen = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

/**
 * While `isOpen`, Back closes it with `close` (on a touch screen, unless `on` is false). Closing it
 * any other way takes its history entry off again.
 */
export function useBackCloses(isOpen: boolean, close: () => void, on = true) {
  const fn = useRef(close)
  useLayoutEffect(() => {
    fn.current = close
  })
  useEffect(() => {
    if (!isOpen || !on || !touchScreen()) return
    return openSheet(() => fn.current())
  }, [isOpen, on])
}
