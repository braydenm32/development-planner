// The Wall tool's two ways of working, side by side (as the Roof tool's are): draw wall by wall,
// or drag out a rectangle room, four walls and the room in one go.

import { usePhone } from '../phone/device'
import { setWallMode, useWallMode, type WallMode } from '../plan/wallMode'
import './finishing.css'

const WALL_MODES: { id: WallMode; label: string; help: string; phone: string }[] = [
  { id: 'line', label: 'Wall by wall', help: 'Click each corner. Walls that close round a space make a room of it.', phone: 'Tap each corner. Walls that close round a space make a room of it.' },
  {
    id: 'rect',
    label: 'Rectangle room',
    help: 'Drag from one corner to the opposite one (or click each): four walls and their room in one go. Or click a corner, type width x depth in mm (4000x3000) and press Enter. Shift+W picks this.',
    phone: 'Tap one corner of the room, then the opposite one: four walls and their room in one go.',
  },
]

export function WallModeSwitch() {
  const mode = useWallMode(s => s.mode)
  const phone = usePhone()
  const now = WALL_MODES.find(m => m.id === mode)
  return (
    <div className="tool-modes">
      <div className="segmented mode-switch" role="radiogroup" aria-label="How the Wall tool draws">
        {WALL_MODES.map(m => (
          <button key={m.id} role="radio" aria-checked={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => setWallMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="muted small">{phone ? now?.phone : now?.help}</p>
    </div>
  )
}
