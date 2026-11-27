// A panel for reading in a phone's View (Approvals, PH-07): what only opens, lists or goes
// somewhere stays live, and only what writes an answer is locked. src/phone/ViewLock.tsx uses it.

/**
 * What stays live in a reading panel: a row or group that unfolds, a link to somewhere, and what a
 * panel marks as only changing what is shown (the CDC / DA route, a download).
 */
export const READS = 'button[aria-expanded], button.link, [data-view-reads], [data-view-reads] *'

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement

/** Lock the fields and buttons in `el` that write, now and as rows unfold; returns what undoes it. */
export function lockWrites(el: HTMLElement): () => void {
  const lock = () => {
    for (const c of el.querySelectorAll<Field>('input, select, textarea, button')) {
      if (c.disabled || c.matches(READS)) continue
      c.disabled = true
      c.dataset.viewLocked = ''
    }
  }
  lock()
  const seen = new MutationObserver(lock)
  seen.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] })
  return () => {
    seen.disconnect()
    for (const c of el.querySelectorAll<Field>('[data-view-locked]')) {
      c.disabled = false
      delete c.dataset.viewLocked
    }
  }
}
