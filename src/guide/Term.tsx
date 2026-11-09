// What a planning word means, where it's used. A word in a label (or a whole key-number chip)
// carries data-term; one tip, mounted once, shows its meaning on hover, on keyboard focus or on a
// tap. Done with one listener rather than a tip per word so labels and chips stay plain markup,
// and a chip that is a button keeps doing what it did on a click.

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { findTerm, LABEL_TERMS, termById, termTitle } from './glossary'
import { openGuide } from './store'
import './guide.css'

/** A word with its meaning a hover or tap away. Inside a label, a tap shows it without focusing the field. */
export function TermWord({ id, children }: { id: string; children: ReactNode }) {
  const pin = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    showTerm(e.currentTarget as HTMLElement, true)
  }
  return (
    <span className="term" data-term={id} tabIndex={0} role="button" onClick={pin} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && pin(e)}>
      {children}
    </span>
  )
}

/** A label's text, with the first planning word in it explained. */
export function Termed({ text, only = LABEL_TERMS }: { text: string; only?: string[] }) {
  const hit = findTerm(text, only)
  if (!hit) return <>{text}</>
  return (
    <>
      {text.slice(0, hit.start)}
      <TermWord id={hit.term.id}>{text.slice(hit.start, hit.end)}</TermWord>
      {text.slice(hit.end)}
    </>
  )
}

// ---------------------------------------------------------------------------
// The one tip.

interface Tip {
  id: string
  note: string | null
  /** Where the word is on screen. */
  rect: { left: number; top: number; bottom: number; width: number }
  /** Shown by a tap or a click, rather than by pointing at it. */
  pinned: boolean
}

let show: ((el: HTMLElement, pinned: boolean) => void) | null = null

function showTerm(el: HTMLElement, pinned: boolean) {
  show?.(el, pinned)
}

/** The element a planning word hangs on, if the event happened on one. */
const termEl = (t: EventTarget | null): HTMLElement | null => (t instanceof Element ? (t.closest('[data-term]') as HTMLElement | null) : null)

export function TermTip() {
  const [tip, setTip] = useState<Tip | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const owner = useRef<HTMLElement | null>(null)
  const timer = useRef(0)

  useEffect(() => {
    const clear = () => window.clearTimeout(timer.current)
    const describe = (el: HTMLElement | null) => {
      owner.current?.removeAttribute('aria-describedby')
      owner.current = el
      el?.setAttribute('aria-describedby', 'term-tip')
    }
    const open = (el: HTMLElement, pinned: boolean) => {
      const id = el.dataset.term
      if (!id || !termById(id)) return
      clear()
      const r = el.getBoundingClientRect()
      describe(el)
      setTip({ id, note: el.dataset.termNote || null, rect: { left: r.left, top: r.top, bottom: r.bottom, width: r.width }, pinned })
    }
    const close = () => {
      clear()
      describe(null)
      setTip(null)
    }
    const later = (fn: () => void, ms: number) => {
      clear()
      timer.current = window.setTimeout(fn, ms)
    }
    show = open

    const over = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const el = termEl(e.target)
      if (el) {
        if (el !== owner.current) later(() => open(el, false), 300)
        else clear()
      } else if (ref.current?.contains(e.target as Node)) clear()
      else if (owner.current) later(close, 150)
    }
    // A tap on a chip both goes where the chip goes and says what its word means, for a while.
    const down = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      const el = termEl(e.target)
      if (el && e.pointerType !== 'mouse') {
        open(el, true)
        later(close, 6000)
      } else if (owner.current) close()
    }
    const focus = (e: FocusEvent) => {
      const el = termEl(e.target)
      if (el && el.matches(':focus-visible')) open(el, false)
    }
    const blur = (e: FocusEvent) => {
      if (termEl(e.target) === owner.current && !ref.current?.contains(e.relatedTarget as Node)) later(close, 100)
    }
    const key = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && owner.current && close()
    const gone = () => owner.current && close()
    document.addEventListener('pointerover', over)
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('focusin', focus)
    document.addEventListener('focusout', blur)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', gone, true)
    window.addEventListener('resize', gone)
    return () => {
      show = null
      clear()
      document.removeEventListener('pointerover', over)
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('focusin', focus)
      document.removeEventListener('focusout', blur)
      document.removeEventListener('keydown', key)
      window.removeEventListener('scroll', gone, true)
      window.removeEventListener('resize', gone)
    }
  }, [])

  const term = tip ? termById(tip.id) : null
  if (!tip || !term) return null
  // Under the word when there's room, else over it; never off the side of the screen.
  const w = Math.min(290, window.innerWidth - 16)
  const left = Math.max(8, Math.min(tip.rect.left + tip.rect.width / 2 - w / 2, window.innerWidth - w - 8))
  const below = tip.rect.bottom + 180 < window.innerHeight
  const style = below ? { left, top: tip.rect.bottom + 6 } : { left, bottom: window.innerHeight - tip.rect.top + 6 }
  return (
    <div ref={ref} id="term-tip" className="term-tip" role="tooltip" style={style}>
      <b>{termTitle(term)}</b>
      <p>{term.says}</p>
      {tip.note && <p className="term-note">{tip.note}</p>}
      <button
        type="button"
        onClick={() => {
          setTip(null)
          openGuide(`term-${term.id}`)
        }}
      >
        All the words
      </button>
    </div>
  )
}
