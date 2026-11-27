// The keyboard shortcuts, as an overlay ("?" anywhere) and as a list in More › Keyboard shortcuts.

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { onSingleKeys, setSingleKeys, shortcutText, singleKeysOn } from '../nav/keys'
import { useModal } from '../nav/useModal'
import { closeKeyboardHelp, useKeyboardHelp } from './keyboardHelpStore'
import { SHORTCUTS } from './shortcuts'
import '../components/editing.css'


/** A key as it reads on a keyboard: ⌘ or Ctrl, ⇧ or Shift; mouse gestures and arrows spelled out. */
function keyLabel(k: string): string {
  if (!/click|drag|arrows/.test(k)) return shortcutText(k)
  return k
    .split('+')
    .map(p => (p === 'arrows' ? '← ↑ ↓ →' : p === 'mod' || p === 'shift' ? shortcutText(p) : p))
    .join(' + ')
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <>
      {keys.map(k => (
        <kbd key={k}>{keyLabel(k)}</kbd>
      ))}
    </>
  )
}

/**
 * Single-key shortcuts on or off, remembered on this device. Off, a letter or symbol on its own
 * does nothing (for speech input, or keys pressed by accident); Ctrl/⌘ keys, arrows, Delete, Esc
 * and lengths typed while drawing still work.
 */
export function SingleKeysSwitch() {
  const on = useSyncExternalStore(onSingleKeys, singleKeysOn, () => true)
  return (
    <label className="kbd-single">
      <input type="checkbox" checked={on} onChange={e => setSingleKeys(e.target.checked)} />
      <span>
        <b>Single-key shortcuts</b>
        <span className="muted small">
          {on
            ? 'A letter on its own picks a tool (W for Wall). Turn this off if keys get pressed by accident, or you use speech input.'
            : `Off: letters and symbols on their own do nothing. ${shortcutText('mod')} keys, arrows, Delete and Esc still work. To turn them back on, find this list in Design › More, or search for Keyboard shortcuts.`}
        </span>
      </span>
    </label>
  )
}

/** Every shortcut, in groups. */
export function ShortcutList() {
  return (
    <div className="kbd-groups">
      {SHORTCUTS.map(g => (
        <section key={g.title}>
          <h3>{g.title}</h3>
          <dl>
            {g.rows.map(r => (
              <div key={r.keys.join() + r.what}>
                <dt>
                  <Keys keys={r.keys} />
                </dt>
                <dd>{r.what}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

export function KeyboardHelp() {
  const open = useKeyboardHelp(s => s.open)
  const sheet = useRef<HTMLDivElement>(null)
  // Tab stays in the sheet, Esc closes it and focus goes back where it was (src/nav/useModal.ts).
  useModal(sheet, open, closeKeyboardHelp)
  useEffect(() => {
    if (!open) return
    // ? closes it too, as it opened it.
    const again = (e: KeyboardEvent) => {
      if (e.key !== '?') return
      e.preventDefault()
      e.stopPropagation()
      closeKeyboardHelp()
    }
    window.addEventListener('keydown', again, true)
    return () => window.removeEventListener('keydown', again, true)
  }, [open])
  if (!open) return null
  return (
    <div className="kbd-scrim" onPointerDown={e => e.target === e.currentTarget && closeKeyboardHelp()}>
      <div ref={sheet} className="kbd-sheet" role="dialog" aria-modal="true" aria-labelledby="kbd-title">
        <header>
          <h2 id="kbd-title">Keyboard shortcuts</h2>
          <button className="secondary" onClick={closeKeyboardHelp} data-autofocus>
            Close
          </button>
        </header>
        <SingleKeysSwitch />
        <ShortcutList />
      </div>
    </div>
  )
}
