// The Roof tool's two ways of working, side by side: roof a building with one click inside its
// walls, or draw a roof outline corner by corner. Kept apart so a corner click never roofs the
// whole building (page forensics C8).

import { usePlan, type RoofMode } from '../plan/store'
import './finishing.css'

const ROOF_MODES: { id: RoofMode; label: string; help: string }[] = [
  { id: 'building', label: 'Roof this building', help: 'Click inside the walls: the roof follows their outside, with its overhang, and covers every level whose ceiling lines up.' },
  { id: 'outline', label: 'Draw roof outline', help: 'Click each corner of the roof, then the first corner again (or press Enter) to close it.' },
]

export function RoofModeSwitch() {
  const mode = usePlan(s => s.roofMode)
  const st = usePlan.getState()
  return (
    <div className="tool-modes">
      <div className="segmented mode-switch" role="radiogroup" aria-label="How the Roof tool draws">
        {ROOF_MODES.map(m => (
          <button key={m.id} role="radio" aria-checked={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => st.setRoofMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="muted small">{ROOF_MODES.find(m => m.id === mode)?.help}</p>
    </div>
  )
}
