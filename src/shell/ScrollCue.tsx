// A sideways-scrolling row with arrows at the ends that have more (src/shell/overflow.ts):
// the area's tabs and the summary strip's chips. The row's own children are its items.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Icon } from '../nav/icons'
import { moreText, overflowOf, pageTo, type Span } from './overflow'

/** How wide an arrow is: an item under it hides. */
export const ARROW_W = 28
/** The "+2" at the end of a row that counts what's hidden, and the tabs' "+3" that lists them. */
const COUNT_W = ARROW_W + 14
const MENU_W = 50

type Mode = 'arrows' | 'count' | 'menu' | 'free'

/** The items' edges in the row's scrolled content, to a fraction of a pixel (whole ones hid a tab that fitted). */
function spans(row: HTMLElement): { kids: HTMLElement[]; items: Span[] } {
  const kids = [...row.children].filter((k): k is HTMLElement => k instanceof HTMLElement && k.offsetWidth > 0)
  const box = row.getBoundingClientRect()
  const x0 = box.left + row.clientLeft - row.scrollLeft
  return {
    kids,
    items: kids.map(k => {
      const r = k.getBoundingClientRect()
      return { left: r.left - x0, right: r.right - x0 }
    }),
  }
}

const arrowsOf = (mode: Mode) => (mode === 'menu' ? { before: 0, after: MENU_W } : mode === 'count' ? COUNT_W : ARROW_W)

/** Hides the row's items that don't show whole, and says how many are hidden at each end. */
function useOverflow(row: RefObject<HTMLElement | null>, mode: Mode, keep: string | undefined) {
  const [state, setState] = useState<{ before: number; after: number; cut: boolean[] }>({ before: 0, after: 0, cut: [] })
  const refresh = useRef(() => {})
  useLayoutEffect(() => {
    const el = row.current
    if (!el) return
    const update = () => {
      const { kids, items } = spans(el)
      let o
      if (mode === 'free') {
        // A phone's bar scrolls under the finger and hides nothing: only which ends have more, for the fades.
        const before = el.scrollLeft > 1 ? 1 : 0
        const after = el.scrollLeft + el.clientWidth < el.scrollWidth - 1.5 ? 1 : 0
        o = { cut: kids.map(() => false), before, after }
      } else {
        // The items' own extent, not the row's scroll width: the room the tabs leave for their "+3"
        // (shell.css) mustn't itself count as more to show.
        const extent = items.reduce((w, s) => Math.max(w, s.right), 0)
        o = overflowOf(items, el.scrollLeft, el.clientWidth, extent, arrowsOf(mode), keep ? kids.findIndex(k => k.matches(keep)) : -1)
      }
      kids.forEach((k, i) => {
        k.classList.toggle('cut', o.cut[i])
        // Out of sight is out of the Tab order too, and unread by a screen reader, until it's shown (AX-10).
        k.toggleAttribute('inert', o.cut[i])
      })
      setState(s => (s.before === o.before && s.after === o.after && s.cut.length === o.cut.length && s.cut.every((c, i) => c === o.cut[i]) ? s : o))
    }
    update()
    refresh.current = update
    el.addEventListener('scroll', update, { passive: true })
    // The row's width, an item's (a name, a count), or its items changing.
    const ro = new ResizeObserver(update)
    const watch = () => {
      ro.disconnect()
      ro.observe(el)
      for (const k of el.children) ro.observe(k)
    }
    watch()
    const mo = new MutationObserver(() => {
      watch()
      update()
    })
    // The open tab's class too: the open tab never hides.
    mo.observe(el, { childList: true, subtree: true, characterData: true, attributes: !!keep, attributeFilter: keep ? ['class'] : undefined })
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
      mo.disconnect()
    }
  }, [row, mode, keep])
  /** Pages one way. From the keyboard, the first item it brings into sight takes the focus, so Tab carries on from there. */
  const page = useCallback(
    (dir: 1 | -1, keyboard: boolean) => {
      const el = row.current
      if (!el) return
      const { kids, items } = spans(el)
      const arrow = mode === 'count' ? COUNT_W : ARROW_W
      const left = pageTo(items, el.scrollLeft, el.clientWidth, el.scrollWidth, arrow, dir)
      if (!keyboard) {
        el.scrollTo({ left, behavior: 'smooth' })
        return
      }
      const hidden = kids.map(k => k.classList.contains('cut'))
      el.scrollTo({ left })
      refresh.current()
      const order = kids.map((_, i) => i)
      if (dir < 0) order.reverse()
      // Some chips are plain words (a number already on the plan): the first that can be pressed.
      const can = 'a[href], button:not(:disabled)'
      for (const i of order) {
        if (!hidden[i] || kids[i].classList.contains('cut')) continue
        const target = kids[i].matches(can) ? kids[i] : kids[i].querySelector<HTMLElement>(can)
        if (!target) continue
        target.focus({ preventScroll: true })
        break
      }
    },
    [row, mode],
  )
  return { ...state, page }
}

interface Props {
  className?: string
  /** What the items are ("tabs", "numbers"), for the arrows' names. */
  label: string
  /** The end arrow says how many are hidden (the strip's "+2"). */
  count?: boolean
  /** A phone's tab bar: it scrolls under the finger with a fade at an end that has more, and hides nothing. */
  free?: boolean
  /** The item that never hides (a selector: the open tab). */
  keep?: string
  /**
   * The end's "+3" opens a list of what's hidden instead of paging to it (the tabs, by name):
   * given which of the row's items are hidden, and what closes the list.
   */
  menu?: (hidden: boolean[], close: () => void) => ReactNode
  render: (ref: RefObject<HTMLElement | null>) => ReactNode
}

/** The row (`render` gets the ref to put on the scrolling element) with its arrows. */
export function ScrollCue({ className, label, count = false, free = false, keep, menu, render }: Props) {
  const row = useRef<HTMLElement | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const mode: Mode = free ? 'free' : menu ? 'menu' : count ? 'count' : 'arrows'
  const { before, after, cut, page } = useOverflow(row, mode, keep)
  const [open, setOpen] = useState(false)
  const hiddenCount = before + after
  const listing = mode === 'menu' && open && hiddenCount > 0

  // The list closes on a press elsewhere and on Esc (which gives the focus back to its button).
  useEffect(() => {
    if (!listing) return
    wrap.current?.querySelector<HTMLElement>('.cue-menu a, .cue-menu button')?.focus()
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      wrap.current?.querySelector<HTMLElement>('.scroll-arrow.menu')?.focus()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc, true)
    }
  }, [listing])

  return (
    <div ref={wrap} className={`scroll-cue${free ? ' free' : ''}${className ? ` ${className}` : ''}${before ? ' more-before' : ''}${after ? ' more-after' : ''}`}>
      {render(row)}
      {mode === 'menu'
        ? hiddenCount > 0 && (
            <>
              <button className="scroll-arrow after count menu" onClick={() => setOpen(!open)} aria-expanded={listing} aria-label={moreText(hiddenCount, label)} title={moreText(hiddenCount, label)}>
                <span>+{hiddenCount}</span>
                <Icon name="chevD" size={14} />
              </button>
              {listing && (
                <div
                  className="cue-menu"
                  role="group"
                  aria-label={`More ${label}`}
                  onBlur={e => {
                    if (!wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
                  }}
                >
                  {menu!(cut, () => setOpen(false))}
                </div>
              )}
            </>
          )
        : mode !== 'free' && (
            <>
              {before > 0 && (
                // A click with no pointer (Enter, Space) is the keyboard's.
                <button className="scroll-arrow before" onClick={e => page(-1, e.detail === 0)} aria-label={`Show ${moreText(before, label)}`} title={moreText(before, label)}>
                  <Icon name="chevL" size={15} />
                </button>
              )}
              {after > 0 && (
                <button className={`scroll-arrow after${count ? ' count' : ''}`} onClick={e => page(1, e.detail === 0)} aria-label={`Show ${moreText(after, label)}`} title={moreText(after, label)}>
                  {count && <span>+{after}</span>}
                  <Icon name="chevR" size={15} />
                </button>
              )}
            </>
          )}
    </div>
  )
}
