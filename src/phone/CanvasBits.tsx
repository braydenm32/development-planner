// What floats on the canvas for showing people: the phone's View / Edit switch on the plan,
// and the 3D view's presets with a way to show it full screen.

import { Icon } from '../nav/icons'
import { PRESETS } from './camera'
import { useCamera } from './cameraStore'
import { usePhoneMode } from './device'

/** View pans and reads; Edit brings back the tools. */
export function ViewEditSwitch() {
  const mode = usePhoneMode(s => s.mode)
  const setMode = usePhoneMode(s => s.setMode)
  return (
    <div className="view-edit" role="group" aria-label="View or edit the plan">
      <button className={mode === 'view' ? 'on' : ''} aria-pressed={mode === 'view'} onClick={() => setMode('view')}>
        <Icon name="eye" size={16} /> View
      </button>
      <button className={mode === 'edit' ? 'on' : ''} aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>
        <Icon name="pencil" size={15} /> Edit
      </button>
    </div>
  )
}

interface PresetProps {
  phone: boolean
  /** Full screen, for showing people (phone only). */
  presenting: boolean
  setPresenting: (on: boolean) => void
}

/** Street view, From above and Rear; the camera swings to each. */
export function PresetBar({ phone, presenting, setPresenting }: PresetProps) {
  const active = useCamera(s => s.active)
  const go = useCamera(s => s.go)
  return (
    <div className={`preset-bar${presenting ? ' presenting' : ''}`}>
      {phone &&
        (presenting ? (
          <button className="preset-done" onClick={() => setPresenting(false)}>
            <Icon name="chevL" size={17} /> Done
          </button>
        ) : (
          <button className="preset-done" onClick={() => setPresenting(true)} aria-label="Show people: full screen" title="Full screen">
            <Icon name="people" size={18} />
          </button>
        ))}
      <div className="preset-group" role="group" aria-label="Camera">
        {PRESETS.map(p => (
          <button key={p.id} className={active === p.id ? 'on' : ''} aria-pressed={active === p.id} onClick={() => go(p.id)} title={p.long}>
            {!phone && p.id === 'street' && <Icon name="eye" size={15} />}
            {phone ? p.label : p.long}
          </button>
        ))}
      </div>
    </div>
  )
}
