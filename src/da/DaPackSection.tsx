// Share › Plans › DA pack (PDF): the site details and revision for the title blocks, and the
// download. The pack goes to this device only, since it carries the site's address: no share
// sheet, no upload. The details are the project's own (./details.ts), never on a share link.

import { useState } from 'react'
import { TextField } from '../components/fields'
import { saveDaPack, type PdfInput } from '../components/printFiles'
import { useMap } from '../map/store'
import { setDaDetail, useDaDetails, type DaDetails } from './details'
import { daOf, setDaRevision } from './model'

/** A detail typed as it should read on the title block; it can be cleared to fall back to the map's. */
function DetailField({ id, label, hint, field }: { id: string; label: string; hint: string; field: keyof DaDetails }) {
  const value = useDaDetails(s => s.details[field])
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <label className="num da-detail" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        className="text"
        value={editing ?? value}
        placeholder={hint}
        maxLength={120}
        onFocus={() => setEditing(value)}
        onChange={e => setEditing(e.target.value)}
        onBlur={() => {
          if (editing !== null && editing.trim() !== value) setDaDetail(field, editing)
          setEditing(null)
        }}
        onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  )
}

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
  return (
    <>
      <h3>DA pack (PDF)</h3>
      <p className="muted small">
        A concept pack to take to a town planner or designer as the start of a development application: a cover checklist of what a DA
        for a new house usually needs, the plans, elevations and sections, shadow diagrams, a cut and fill plan, the stormwater concept and
        a table of the planning controls, each sheet with a title block. It isn’t ready to lodge.
      </p>
      <div className="tool-options">
        <DetailField id="da-address" field="address" label="Site address" hint={lot?.address ?? 'Street, suburb, postcode'} />
        <DetailField id="da-lot" field="lot" label="Lot and DP" hint={lot?.label ?? 'Lot 1 DP 123456'} />
        <DetailField id="da-by" field="preparedBy" label="Prepared by" hint="Your name or business" />
        <TextField label="Revision" value={daOf(p.plan).revision} onCommit={setDaRevision} />
      </div>
      <p className="muted small">
        {lot ? 'Left blank, the address and Lot/DP come from Site › Map. ' : ''}These go on the PDF’s title blocks only: they’re kept with this project, not sent with share links.
      </p>
      <div className="row">
        <button className="secondary" onClick={download}>
          Download DA pack
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="muted small">The pack is saved to this device only.</p>
    </>
  )
}
