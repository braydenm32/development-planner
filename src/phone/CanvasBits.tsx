// What floats on the canvas for showing people: the phone's View / Edit switch on the plan,
// and the 3D view's presets with a way to show it full screen, and its Show menu (C18): the
// roof, each level, trees and furniture, to see inside or past them.

import { useCallback, useState } from 'react'
import type { ViewSettings } from '../lib/storage'
import { Icon } from '../nav/icons'
import { PRESETS } from './camera'
import { useCamera } from './cameraStore'
import { usePhoneMode } from './device'
import { hiddenCount } from './showMenu'
import { useDismiss } from './useDismiss'

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
  /** What the Show menu turns on and off; left out, there is no menu. */
  show?: ShowProps
}

export interface ShowProps {
  view: ViewSettings
  set: (patch: Partial<ViewSettings>) => void
  /** The house's levels, lowest first; one level has no switch of its own. */
  levels: { id: string; name: string }[]
}

/** Roof, each level, trees and furniture: a small list of switches that drops from the bar. */
export function ShowMenu({ view, set, levels, phone }: ShowProps & { phone: boolean }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismiss(open, close)
  const hidden = new Set(view.hiddenLevels)
  const off = hiddenCount(view, levels)
  const toggleLevel = (id: string, on: boolean) => set({ hiddenLevels: on ? view.hiddenLevels.filter(x => x !== id) : [...view.hiddenLevels.filter(x => x !== id), id] })
  return (
    <div className="show-menu" ref={ref}>
      <button
        className={`preset-done show-button${open ? ' on' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={phone ? `Show${off ? `, ${off} off` : ''}` : undefined}
        onClick={() => setOpen(!open)}
        title="Show or hide the roof, levels, trees and furniture"
      >
        <Icon name="layers" size={17} />
        {!phone && <span>Show</span>}
        {off > 0 && <span className="show-off">{off} off</span>}
      </button>
      {open && (
        <div className="show-pop" role="group" aria-label="Show in 3D">
          <label className="check">
            <input type="checkbox" checked={view.showRoof} disabled={!view.showHouse} onChange={e => set({ showRoof: e.target.checked })} />
            Roof
          </label>
          {levels.length > 1 &&
            [...levels].reverse().map(l => (
              <label className="check" key={l.id}>
                <input type="checkbox" checked={!hidden.has(l.id)} disabled={!view.showHouse} onChange={e => toggleLevel(l.id, e.target.checked)} />
                {l.name}
              </label>
            ))}
          <label className="check">
            <input type="checkbox" checked={view.showTrees} onChange={e => set({ showTrees: e.target.checked })} />
            Trees
          </label>
          <label className="check">
            <input type="checkbox" checked={view.showFurniture} disabled={!view.showHouse} onChange={e => set({ showFurniture: e.target.checked })} />
            Furniture
          </label>
        </div>
      )}
    </div>
  )
}

/** Street view, From above and Rear; the camera swings to each. */
export function PresetBar({ phone, presenting, setPresenting, show }: PresetProps) {
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
      {show && !presenting && <ShowMenu {...show} phone={phone} />}
    </div>
  )
}
