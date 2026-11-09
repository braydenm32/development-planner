// When the plan offers a retaining wall: on or off, how deep a cut or how high a fill, and the
// rooms told "Don't ask for this room". Kept in this browser (Earthworks › More; the old
// layout's Cut and fill).

import { Num } from '../components/fields'
import { setFlowSettings, useFlow } from './store'

export function OfferSettings() {
  const s = useFlow(x => x.settings)
  return (
    <>
      <label className="check">
        <input type="checkbox" checked={s.offers} onChange={e => setFlowSettings({ offers: e.target.checked })} />
        Suggest a retaining wall where a slab floor cuts deep or fills high
      </label>
      {s.offers && (
        <Num label="When the floor is more than" unit="mm" value={s.offerAt} min={0.1} max={5} onCommit={offerAt => setFlowSettings({ offerAt })} />
      )}
      <p className="muted small">
        Checked along each outside wall of a new room on a slab, against the natural ground: deeper than this below it is a cut (the wall goes on the uphill side), higher above it a fill (downhill).
        {s.quiet.length > 0 && ' '}
        {s.quiet.length > 0 && (
          <button type="button" className="link" onClick={() => setFlowSettings({ quiet: [] })}>
            Ask again for the rooms you said not to
          </button>
        )}
      </p>
    </>
  )
}
