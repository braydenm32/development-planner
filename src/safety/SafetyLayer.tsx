// The review sheet, the layer review, the Undo toast and the one file picker, mounted once by the
// app in both layouts (and over the start screen and the Projects home).

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ProjectThumbnail } from '../projects/types'
import { importPlanFrom, openFile } from './flows'
import { LayersSheet } from './LayersSheet'
import { chooseInReview, dismissToast, pickedFor, registerPicker, undoToast, useSafety, type Toast } from './store'
import { sayFileError } from './surveyor'
import './safety.css'

/** A north-up drawing of the block with the house on it. */
export function BlockThumb({ t, label }: { t: ProjectThumbnail | null | undefined; label?: string }) {
  if (!t) return null
  return (
    <svg className="sf-thumb" viewBox={t.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label ?? 'The block with the house on it'}>
      <path className="sf-block" d={t.block} />
      {t.house && <path className="sf-house" d={t.house} />}
    </svg>
  )
}

function ReviewSheet() {
  const review = useSafety(s => s.review)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const answer = useRef(review?.answer)
  useLayoutEffect(() => {
    answer.current = review?.answer
  })
  const open = !!review
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      answer.current?.(null)
    }
    // Before the plan's own keys, so Esc here never clears a selection underneath.
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('keydown', esc, true)
      opener?.focus?.()
    }
  }, [open])
  if (!review) return null
  const choice = review.choices?.find(c => c.id === review.choice)
  return (
    <div className="sf-scrim" onPointerDown={e => e.target === e.currentTarget && review.answer(null)}>
      <div className={`sf-sheet sf-${review.kind}`} role="dialog" aria-modal="true" aria-labelledby="sf-title">
        <div className="sf-grab" aria-hidden="true" />
        <header className="sf-head">
          <span className="sf-step">{review.replaces ? 'Review before it changes' : 'Check before it opens'}</span>
          <h2 id="sf-title">{review.title}</h2>
        </header>
        <div className="sf-body">
          {review.facts.length > 0 && (
            <dl className="sf-facts">
              {review.facts.map(f => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {review.warning && (
            <p className="sf-warn" role="note">
              {review.warning}
            </p>
          )}
          {review.choices && review.choices.length > 0 && (
            <fieldset className="sf-choices">
              <legend>How the block and house line up</legend>
              <div className="sf-choice-row">
                <div className="sf-pic">
                  <BlockThumb t={choice?.thumb} label={choice?.label} />
                </div>
                <div className="sf-options">
                  {review.choices.map((c, i) => (
                    <label key={c.id} className={`sf-option${review.choice === c.id ? ' on' : ''}`}>
                      <input type="radio" name="sf-choice" checked={review.choice === c.id} onChange={() => chooseInReview(c.id)} />
                      <span>
                        <b>
                          {c.label}
                          {i === 0 && review.choices!.length > 1 && <em className="sf-tag">Suggested</em>}
                        </b>
                        {c.detail && <span className="sf-detail">{c.detail}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </fieldset>
          )}
          {!review.choices?.length && review.thumb && (
            <div className="sf-pic solo">
              <BlockThumb t={review.thumb} />
            </div>
          )}
          <div className="sf-lists">
            <section>
              <h3>What changes</h3>
              <ul>
                {review.changes.map(c => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3>What’s kept</h3>
              <ul className="kept">
                {review.kept.map(c => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>
        <footer className="sf-actions">
          <button ref={cancelRef} className="sf-btn" onClick={() => review.answer(null)}>
            Cancel
          </button>
          <button className="sf-btn primary" onClick={() => review.answer(review.choice ?? 'ok')}>
            {review.confirm}
          </button>
        </footer>
      </div>
    </div>
  )
}

function UndoToast() {
  const toast = useSafety(s => s.toast)
  // Keyed, so each toast starts with its own full time.
  return toast ? <ToastNote key={toast.id} toast={toast} /> : null
}

function ToastNote({ toast }: { toast: Toast }) {
  const [held, setHeld] = useState(false)
  // Time runs only while the toast isn't being pointed at or focused, and starts again in full after.
  useEffect(() => {
    if (held) return
    const t = setTimeout(() => dismissToast(toast.id), toast.ms)
    return () => clearTimeout(t)
  }, [toast, held])
  return (
    <div
      className="sf-toast"
      role="status"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <span>{toast.text}</span>
      {toast.link && (
        <button className="sf-link" onClick={toast.link.go}>
          {toast.link.label}
        </button>
      )}
      {toast.undo && (
        <button className="sf-undo" onClick={() => void undoToast(toast.id)}>
          Undo
        </button>
      )}
      <button className="sf-close" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

/** The one hidden file input every Open, Replace survey and Import plan shows. */
function Picker() {
  return (
    <input
      ref={registerPicker}
      type="file"
      hidden
      aria-hidden="true"
      tabIndex={-1}
      onChange={e => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (!f) return
        const run = pickedFor() === 'plan' ? importPlanFrom(f) : openFile(f)
        run.catch(sayFileError)
      }}
    />
  )
}

export function SafetyLayer() {
  return (
    <>
      <Picker />
      <ReviewSheet />
      <LayersSheet />
      <UndoToast />
    </>
  )
}
