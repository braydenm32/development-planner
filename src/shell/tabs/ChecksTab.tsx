// Design › Checks: the design against the Housing Code (CDC), or a council's LEP and DCP (DA) when
// that council's rules are switched on, live. Problems first; every row names its clause and how
// sure the research is of it.

import { DemFlag } from '../../map/DemNotes'
import { useState } from 'react'
import { Num, Select } from '../../components/fields'
import type { Measures } from '../../checks/measure'
import { CDC_LAND, CDC_LAND_MAPPED, controlCount, notChecked } from '../../checks/rules'
import { setTreeRemoval, useUnsizedTrees } from '../../checks/siteTrees'
import { activeCouncil, COUNCILS, type Council } from '../../checks/councils'
import { PATHWAYS, pathwayLong, setCheckSettings, setCouncil } from '../../checks/settings'
import type { CheckResult, CheckSettings, CheckStatus } from '../../checks/types'
import { useChecks } from '../../checks/useChecks'
import { Caveat } from '../../legal/Caveat'
import { useLoaded, type Loaded } from '../useSite'
import { Waiting } from './Waiting'
import '../../checks/checks.css'

const ORDER: CheckStatus[] = ['fail', 'warn', 'unknown', 'incomplete', 'pending', 'pass', 'info']
const STATUS_TEXT: Record<CheckStatus, string> = { fail: 'Fails', warn: 'Check', unknown: 'Needs a fact', incomplete: 'Not drawn yet', pending: 'Pending', pass: 'Passes', info: 'For info' }
const CONFIDENCE_TEXT = { read: 'Read', secondary: 'Summary', unverified: 'Unverified' }
const CONFIDENCE_TIP = {
  read: 'Read from the official text',
  secondary: 'From an official summary or explainer, not the legal text',
  unverified: 'Not confirmed yet: check before relying on it',
}

export function ChecksTab() {
  const d = useLoaded()
  return d ? <Checks d={d} /> : <Waiting />
}

function Checks({ d }: { d: Loaded }) {
  const c = useChecks(d.plan, d.survey, d.terrain, d.earth)
  const unsized = useUnsizedTrees()
  const rows = [...c.results].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
  const s = c.measures.settings
  const summary = [
    c.counts.fail && `${c.counts.fail} fail${c.counts.fail > 1 ? 's' : ''}`,
    c.counts.warn && `${c.counts.warn} to check`,
    c.counts.unknown && `${c.counts.unknown} need${c.counts.unknown > 1 ? '' : 's'} a fact`,
    c.counts.incomplete && `${c.counts.incomplete} not drawn yet`,
    `${c.counts.pass} pass`,
    c.counts.info && `${c.counts.info} for info`,
  ].filter(Boolean)
  return (
    <div className="checks">
      <DemFlag what="the checks that use ground levels (height, cut and fill, retaining walls)" />
      <div className="segmented-choice" role="radiogroup" aria-label="Approval pathway">
        {PATHWAYS.map(p => {
          const off = p.id === 'da' && !c.council
          return (
            <button
              key={p.id}
              role="radio"
              aria-checked={c.pathway === p.id}
              className={c.pathway === p.id ? 'on' : ''}
              disabled={off}
              onClick={() => setCheckSettings({ pathway: p.id })}
              title={off ? 'Switch on your council’s rules below to check a DA' : pathwayLong(p.id, c.council)}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      <p className="muted small">{pathwayLong(c.pathway, c.council)}</p>
      {c.pathway === 'cdc' && (
        <p className="checks-land" role="note">
          {c.planning ? CDC_LAND_MAPPED : CDC_LAND}
        </p>
      )}
      <CouncilSwitches council={c.council} />
      <p className="checks-summary" aria-live="polite">
        {summary.join(' · ')}
      </p>
      {s.frontEdge === undefined && <LotFacts m={c.measures} s={s} />}
      <ul className="check-list">
        {rows.map(r => (
          <CheckRow key={r.id} r={r} />
        ))}
      </ul>
      {s.frontEdge !== undefined && <LotFacts m={c.measures} s={s} />}
      <details className="checks-more">
        <summary>Not checked yet</summary>
        <ul>
          {notChecked(c.pathway, c.council).map(t => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {c.measures.trees.length === 0 && <p className="muted small">Trees and their protection zones join the checks once they’re added under Site › Features, with a trunk size.</p>}
        {unsized > 0 && (
          <p className="muted small">
            {unsized} tree{unsized > 1 ? 's have' : ' has'} no trunk size, so no protection zone to check. Add it under Site › Features.
          </p>
        )}
      </details>
      <p className="muted small">A guide to the rules as we read them, not legal advice. A pass is not an approval.</p>
      <Caveat />
    </div>
  )
}

function CheckRow({ r }: { r: CheckResult }) {
  const [open, setOpen] = useState(r.status === 'unknown')
  return (
    <li className={`check-row ${r.status}`}>
      <button className="check-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`check-dot ${r.status}`} aria-hidden />
        <span className="check-title">{r.title}</span>
        <span className={`check-status ${r.status}`}>{STATUS_TEXT[r.status]}</span>
      </button>
      {r.value && <div className="check-value">{r.value}</div>}
      {open && (
        <div className="check-detail">
          {r.limit && (
            <div>
              <span className="muted">Allowed </span>
              {r.limit}
            </div>
          )}
          {r.note && <p>{r.note}</p>}
          <div className="check-source">
            <span className={`conf ${r.source.confidence}`} title={CONFIDENCE_TIP[r.source.confidence]}>
              {CONFIDENCE_TEXT[r.source.confidence]}
            </span>
            <span className="muted">
              {r.source.clause} · {r.source.asAt}
            </span>
          </div>
          {r.tree && r.removable && (
            <div className="row">
              <button className="secondary" onClick={() => setTreeRemoval(r.tree!, r.status !== 'pending')}>
                {r.status === 'pending' ? 'Keep this tree' : 'Mark for removal (pending DA or CDC)'}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

/** How many of its controls the app checks for a council, when it doesn't have them all: "; 9 of 11 controls". */
function coverage(k: Council): string {
  const { have, of } = controlCount(k)
  return have < of ? `; ${have} of ${of} controls` : ''
}

/** Each council's own rules, switched on or off for this project. A block is in one council, so one at most. */
function CouncilSwitches({ council }: { council: Council | null }) {
  return (
    <details className="checks-more council-switches">
      <summary>Council rules · {council ? council.name : 'none on'}</summary>
      <p className="muted small">The app covers NSW only. Switch on the council your block is in to check a DA against its own LEP and DCP. Only one can be on.</p>
      {COUNCILS.map(k => (
        <label key={k.id} className="check">
          <input type="checkbox" checked={council?.id === k.id} onChange={e => setCouncil(k.id, e.target.checked)} />
          {k.name}{' '}
          <span className="muted small">
            ({k.rules}
            {coverage(k)})
          </span>
        </label>
      ))}
      <p className="muted small">Not listed? Your council isn’t covered yet: only the state-wide Housing Code checks run.</p>
    </details>
  )
}

function LotFacts({ m, s }: { m: Measures; s: CheckSettings }) {
  const needsFront = s.frontEdge === undefined
  // Until the map value is entered, the council's own figure if its DCP has one; blank (0) for a council whose DCP has none.
  const council = activeCouncil(s)
  const height = s.lepHeight ?? (council ? (council.height?.fallback?.max ?? 0) : 9)
  const edgeOptions = [{ id: -1, label: 'Not set' }, ...m.edges.map(e => ({ id: e.index, label: `${e.label} · ${e.length.toFixed(2)} m` }))]
  return (
    <details className="checks-more lot-facts" open={needsFront}>
      <summary>Lot facts{needsFront ? ' · pick the front' : ''}</summary>
      <p className="muted small">What the survey doesn’t say. Kept with the plan.</p>
      <label className="check">
        <input type="checkbox" checked={s.battleAxe} onChange={e => setCheckSettings({ battleAxe: e.target.checked })} />
        Battle-axe lot (the survey boundary leaves out the access handle)
      </label>
      <Select
        label={s.battleAxe ? 'Faces the lot in front' : 'Faces the street'}
        value={s.frontEdge ?? -1}
        options={edgeOptions}
        onChange={v => setCheckSettings({ frontEdge: v < 0 ? undefined : v, rearEdge: undefined })}
      />
      <Select
        label="Rear"
        value={m.edges.find(e => e.role === 'rear')?.index ?? -1}
        options={edgeOptions}
        onChange={v => setCheckSettings({ rearEdge: v < 0 ? undefined : v })}
      />
      <Num label="Lot width at the building line" value={s.lotWidth ?? 0} unit="m" decimals={2} min={0} onCommit={v => setCheckSettings({ lotWidth: v > 0 ? v : undefined })} />
      {s.lotWidth === undefined && <div className="muted small">Not set: side setbacks show the result for both ways of reading it.</div>}
      <div className="muted small">Survey boundary {m.lotArea.toFixed(1)} m²</div>
      <Num label="Title area" value={s.titleArea ?? m.lotArea} unit="m²" decimals={1} min={1} onCommit={v => setCheckSettings({ titleArea: v })} />
      <Num label="LEP height limit" value={height} unit="m" decimals={1} min={0} onCommit={v => setCheckSettings({ lepHeight: v > 0 ? v : undefined })} />
      <Num label="LEP floor space ratio" value={s.lepFsr ?? 0} unit=":1" decimals={2} min={0} onCommit={v => setCheckSettings({ lepFsr: v > 0 ? v : undefined })} />
    </details>
  )
}
