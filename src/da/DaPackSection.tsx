// Share › Plans › DA pack (PDF): the revision letter and the download. The pack goes to this
// device only, since it can carry the site's address from Site › Map: no share sheet, no upload.

import { useState } from 'react'
import { TextField } from '../components/fields'
import { saveDaPack, type PdfInput } from '../components/printFiles'
import { useMap } from '../map/store'
import { tabRoute } from '../nav/route'
import { navigate, useRouter } from '../nav/router'
import { daOf, setDaRevision } from './model'

export function DaPackSection(p: PdfInput) {
  const [error, setError] = useState<string | null>(null)
  const lot = useMap(s => s.place?.lot ?? null)
  const download = () => {
    setError(null)
    try {
      saveDaPack(p)
    } catch (err) {
      setError((err as Error).message || 'The DA pack could not be drawn.')
    }
  }
  const site = lot ? [lot.address, lot.label].filter(Boolean).join(', ') : null
  const toMap = () => {
    const r = useRouter.getState().route
    if (r.kind === 'app') navigate(tabRoute(r, 'site', 'map'))
  }
  return (
    <>
      <h3>DA pack (PDF)</h3>
      <p className="sh-lede">
        <b>Not ready to lodge.</b> A concept pack to start a development application with a town planner or designer.
      </p>
      <details className="sh-whats">
        <summary>What’s in it</summary>
        <p className="muted small">
          A cover checklist of what a DA for a new house usually needs, the plans, elevations and sections, shadow diagrams, a cut and fill plan, the
          stormwater concept and a summary of the checks, each sheet with a title block. Every page is in it, whatever is ticked above.
        </p>
      </details>
      {!lot?.address && (
        <div className="sh-callout" role="note">
          <p>
            <b>{lot ? 'No street address yet.' : 'No site address yet.'}</b>{' '}
            {lot
              ? `The title blocks show ${site}. Find the block by its street address to add that too.`
              : 'Put the block on the map to show its address and Lot/DP on the title blocks.'}
          </p>
          <button className="secondary" onClick={toMap}>
            Go to Site › Map
          </button>
        </div>
      )}
      <div className="tool-options">
        <TextField label="Revision" value={daOf(p.plan).revision} onCommit={setDaRevision} />
      </div>
      <div className="row">
        <button className="secondary" onClick={download}>
          Download DA pack
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="muted small">
        {site && lot?.address ? `The title blocks show ${site}. ` : ''}
        The pack is saved to this device only.
      </p>
    </>
  )
}
