// The keyboard shortcuts, as an overlay ("?" anywhere) and as a list in More › Keyboard shortcuts.

import { useEffect, useRef } from 'react'
import { shortcutText } from '../nav/keys'
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
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    close.current?.focus()
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== '?') return
      e.preventDefault()
      e.stopPropagation()
      closeKeyboardHelp()
    }
    // Before the plan's own keys, so Esc here never clears a selection underneath.
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('keydown', esc, true)
      opener?.focus?.()
    }
  }, [open])
  if (!open) return null
  return (
    <div className="kbd-scrim" onPointerDown={e => e.target === e.currentTarget && closeKeyboardHelp()}>
      <div className="kbd-sheet" role="dialog" aria-modal="true" aria-labelledby="kbd-title">
        <header>
          <h2 id="kbd-title">Keyboard shortcuts</h2>
          <button ref={close} className="secondary" onClick={closeKeyboardHelp}>
            Close
          </button>
        </header>
        <ShortcutList />
      </div>
    </div>
  )
}
