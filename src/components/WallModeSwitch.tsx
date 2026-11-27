// The Wall tool's two ways of working, side by side (as the Roof tool's are): draw wall by wall,
// or drag out a rectangle room, four walls and the room in one go.

import { usePhone } from '../phone/device'
import { flipWallSide, FLIP_KEY, setWallFace, useWallFace, WALL_FACES } from '../plan/wallFace'
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
      <WallFaceSwitch rect={mode === 'rect'} phone={phone} />
    </div>
  )
}

/** What the face picked means, for each way of drawing (DB-10). */
const FACE_HELP = {
  line: {
    centre: 'Clicks and typed lengths are the middle of the wall.',
    outside: 'Clicks and typed lengths are the outside of the wall; it goes in from there.',
    inside: 'Clicks and typed lengths are the inside of the wall, the room side; it goes out from there.',
  },
  rect: {
    centre: 'The size is to the middle of the walls.',
    outside: 'The size is the overall size, outside to outside.',
    inside: 'The size is the clear room size, inside to inside.',
  },
}

/** Draw by: the wall's centre (as always), its outside face or its inside face; kept for next time. */
function WallFaceSwitch({ rect, phone }: { rect: boolean; phone: boolean }) {
  const face = useWallFace(s => s.face)
  return (
    <div className="wall-face">
      <span className="muted small" id="wall-face-label">
        Draw by
      </span>
      <div className="segmented mode-switch" role="radiogroup" aria-labelledby="wall-face-label">
        {WALL_FACES.map(f => (
          <button key={f.id} role="radio" aria-checked={face === f.id} className={face === f.id ? 'on' : ''} onClick={() => setWallFace(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <p className="muted small">
        {FACE_HELP[rect ? 'rect' : 'line'][face]}
        {!rect && face !== 'centre' && (
          <>
            {' '}
            The arrow shows the side it goes until the walls turn.{' '}
            <button className="link" onClick={flipWallSide} title={`Flip the side the wall goes (${FLIP_KEY})`}>
              Flip side{phone ? '' : ` (${FLIP_KEY})`}
            </button>
          </>
        )}
      </p>
    </div>
  )
}
