// A sideways-scrolling row with arrows at the ends that have more (src/shell/overflow.ts):
// the area's tabs and the summary strip's chips. The row's own children are its items.

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Icon } from '../nav/icons'
import { overflowOf, pageTo, type Span } from './overflow'

/** How wide an arrow is: an item under it hides. */
export const ARROW_W = 28

function spans(row: HTMLElement): { kids: HTMLElement[]; items: Span[] } {
  const kids = [...row.children].filter((k): k is HTMLElement => k instanceof HTMLElement && k.offsetWidth > 0)
  return { kids, items: kids.map(k => ({ left: k.offsetLeft, right: k.offsetLeft + k.offsetWidth })) }
}

/** Hides the row's items that don't show whole, and says how many are hidden at each end. */
function useOverflow(row: RefObject<HTMLElement | null>, arrow: number) {
  const [state, setState] = useState({ before: 0, after: 0 })
  useLayoutEffect(() => {
    const el = row.current
    if (!el) return
    const update = () => {
      const { kids, items } = spans(el)
      const o = overflowOf(items, el.scrollLeft, el.clientWidth, el.scrollWidth, arrow)
      kids.forEach((k, i) => k.classList.toggle('cut', o.cut[i]))
      setState(s => (s.before === o.before && s.after === o.after ? s : { before: o.before, after: o.after }))
    }
    update()
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
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
      mo.disconnect()
    }
  }, [row, arrow])
  const page = useCallback(
    (dir: 1 | -1) => {
      const el = row.current
      if (!el) return
      const left = pageTo(spans(el).items, el.scrollLeft, el.clientWidth, el.scrollWidth, arrow, dir)
      el.scrollTo({ left, behavior: 'smooth' })
    },
    [row, arrow],
  )
  return { ...state, page }
}

/**
 * The row (`render` gets the ref to put on the scrolling element) with its arrows. With `count`,
 * the end arrow says how many are hidden (the strip's "+2"); `label` says what the items are.
 */
export function ScrollCue({ className, label, count = false, render }: { className?: string; label: string; count?: boolean; render: (ref: RefObject<HTMLElement | null>) => ReactNode }) {
  const row = useRef<HTMLElement | null>(null)
  const { before, after, page } = useOverflow(row, count ? ARROW_W + 14 : ARROW_W)
  return (
    <div className={`scroll-cue${className ? ` ${className}` : ''}${before ? ' more-before' : ''}${after ? ' more-after' : ''}`}>
      {render(row)}
      {before > 0 && (
        // Mouse help only: the keyboard's Tab and a finger's swipe reach the hidden items themselves.
        <button className="scroll-arrow before" tabIndex={-1} onClick={() => page(-1)} aria-label={`Show ${before} more ${label}`} title={`${before} more ${label}`}>
          <Icon name="chevL" size={15} />
        </button>
      )}
      {after > 0 && (
        <button className={`scroll-arrow after${count ? ' count' : ''}`} tabIndex={-1} onClick={() => page(1)} aria-label={`Show ${after} more ${label}`} title={`${after} more ${label}`}>
          {count && <span>+{after}</span>}
          <Icon name="chevR" size={15} />
        </button>
      )}
    </div>
  )
}
