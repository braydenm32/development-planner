// The same project open in two tabs (see "The same project open in two tabs" in ./session.ts).
// When the other tab saved while this one had changes of its own, this sheet stays until one
// version is chosen: no Esc and no click away, because either way something is dropped.

import { useEffect, useRef, useState } from 'react'
import { showToast } from '../safety/store'
import { otherTab, useProjects } from './session'

// Nothing here was unsaved, so the newer version simply opened: say so, since the screen changed.
otherTab.onTookNewer(name => showToast({ text: `“${name}” was changed in another tab. This tab now shows the newer version.` }))

export function OtherTabSheet() {
  const { conflict } = useProjects()
  const [busy, setBusy] = useState(false)
  const first = useRef<HTMLButtonElement>(null)
  const open = !!conflict
  useEffect(() => {
    if (!open) return
    first.current?.focus()
    // The plan's keys stay out of it while the choice is open.
    const keys = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== ' ') e.stopPropagation()
    }
    window.addEventListener('keydown', keys, true)
    return () => window.removeEventListener('keydown', keys, true)
  }, [open])
  if (!conflict) return null
  const choose = (fn: () => Promise<void>) => {
    setBusy(true)
    void fn()
      .catch(e => showToast({ text: `That didn’t work: ${(e as Error)?.message || 'storage error'}.`, error: true }))
      .finally(() => setBusy(false))
  }
  return (
    <div className="sf-scrim">
      <div className="sf-sheet sf-other-tab" role="alertdialog" aria-modal="true" aria-labelledby="sf-other-title" aria-describedby="sf-other-body">
        <div className="sf-grab" aria-hidden="true" />
        <header className="sf-head">
          <span className="sf-step">Choose which to keep</span>
          <h2 id="sf-other-title">This project changed in another tab</h2>
        </header>
        <div className="sf-body" id="sf-other-body">
          <p>
            “{conflict.name}” was saved from another tab or window while this one had changes that weren’t saved yet. Only one version can be kept, and nothing more is saved from this tab
            until you choose.
          </p>
          <div className="sf-lists">
            <section>
              <h3>Use the newer version</h3>
              <ul>
                <li>Opens what the other tab saved.</li>
                <li>The changes made in this tab since are dropped.</li>
              </ul>
            </section>
            <section>
              <h3>Keep mine</h3>
              <ul>
                <li>Saves what you changed in this tab over the other tab’s version.</li>
                <li>The other tab then shows this version too.</li>
              </ul>
            </section>
          </div>
        </div>
        <footer className="sf-actions">
          <button ref={first} className="sf-btn" disabled={busy} onClick={() => choose(otherTab.useNewer)}>
            Use the newer version
          </button>
          <button className="sf-btn" disabled={busy} onClick={() => choose(otherTab.keepMine)}>
            Keep mine
          </button>
        </footer>
      </div>
    </div>
  )
}
