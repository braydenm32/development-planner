// Share › Plans › DA pack (PDF): the revision letter and the download. The pack goes to this
// device only, since it can carry the site's address from Site › Map: no share sheet, no upload.

import { useState } from 'react'
import { TextField } from '../components/fields'
import { saveDaPack, type PdfInput } from '../components/printFiles'
import { useMap } from '../map/store'
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
  return (
    <>
      <h3>DA pack (PDF)</h3>
      <p className="muted small">
        A concept pack to take to a town planner or designer as the start of a development application: a cover checklist of what a DA
        for a new house usually needs, the plans, elevations and sections, shadow diagrams, a cut and fill plan, the stormwater concept and
        a summary of the checks, each sheet with a title block. It isn’t ready to lodge.
      </p>
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
        {site && lot?.address
          ? `The title blocks show ${site}.`
          : site
            ? `The title blocks show ${site}. Find the block by its street address under Site › Map to add the address too.`
            : 'Site address not set: put the block on the map under Site › Map to show its address and Lot/DP on the title blocks.'}{' '}
        The pack is saved to this device only.
      </p>
    </>
  )
}
