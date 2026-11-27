// The 3D view from the keyboard and with single presses: arrows turn and tilt it, + and − zoom,
// and the view bar has Zoom and Turn buttons that do the same, so looking at one corner of the
// house no longer needs a drag, a wheel or a pinch (WCAG 2.1.1, 2.5.1). The view is a picture to a
// screen reader, named with what it shows (./summary.ts).

import { useEffect } from 'react'
import { shortcutAllowed } from '../nav/keys'
import { useCamera } from '../phone/cameraStore'
import { SCENE_HELP_ID, sceneKeyStep } from './scene'
import { SCENE_HELP } from './summary'
import '../components/zoom.css'
import './a11y.css'

/** While the 3D view shows: its keys, under the one rule for shortcuts (never while typing, never behind a dialog). */
export function SceneKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !shortcutAllowed(e)) return
      const by = sceneKeyStep(e.key)
      if (!by) return
      e.preventDefault()
      useCamera.getState().nudge(by)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <p id={SCENE_HELP_ID} hidden>
      {SCENE_HELP}
    </p>
  )
}

/** Turn left and Turn right, beside Zoom in the 3D view's bar. */
export function TurnButtons({ className }: { className?: string }) {
  const turn = (dir: 1 | -1) => useCamera.getState().nudge({ turn: dir })
  return (
    <div className={className ? `zoom-buttons ${className}` : 'zoom-buttons'} role="group" aria-label="Turn">
      <button type="button" onClick={() => turn(-1)} aria-label="Turn left (←)" title="Turn the view left 15° (←)">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M12.5 11a5 5 0 0 0-8.6-4.6M3.5 3v3.6h3.6" />
        </svg>
      </button>
      <button type="button" onClick={() => turn(1)} aria-label="Turn right (→)" title="Turn the view right 15° (→)">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 11a5 5 0 0 1 8.6-4.6M12.5 3v3.6H8.9" />
        </svg>
      </button>
    </div>
  )
}
