// Approvals › Checks: the design against the Housing Code (CDC), or a council's LEP and DCP (DA),
// live. A verdict card first ("4 to fix · 5 to confirm"), then the rows grouped by topic, each
// group's worst first, with what was measured beside what's allowed on every row. Rows to fix or
// confirm get a numbered pin on the plan, and pointing at a row draws what it measures there.
// Every row names its clause and how sure the research is of it.

import { DemFlag } from '../../map/DemNotes'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Num, Select } from '../../components/fields'
import type { Measures } from '../../checks/measure'
import { CDC_LAND, CDC_LAND_MAPPED, controlCount, NEED_FRONT, notChecked } from '../../checks/rules'
import { setTreeRemoval, useUnsizedTrees } from '../../checks/siteTrees'
import { activeCouncil, checkSettingsOf, COUNCILS, type Council } from '../../checks/councils'
import { checkedAgainst, mapCouncil, pathwayLong, setCheckSettings, setRoute } from '../../checks/settings'
import type { CheckResult, CheckSettings, Pathway } from '../../checks/types'
import { useChecks, type Checks as ChecksData } from '../../checks/useChecks'
import { foldedText, groupBadges, groupChecks, isLoud, pinNumbers, verdictOf, WORD_OF, WORD_TEXT, type Group } from '../../checks/topics'
import { fixOf, targetOf, type CheckTarget } from '../../checks/targets'
import { routeDifferences } from '../../checks/differ'
import { clearCheckPins, hoverCheck, pickCheck, pointedRow, setCheckPins, useChecksPointing, type Pin } from '../../checks/pointStore'
import { MiniPlan } from '../../checks/MiniPlan'
import { TreeRemoval } from '../../checks/TreeRemoval'
import { useMap } from '../../map/store'
import { navigate } from '../../nav/router'
import { usePlan } from '../../plan/store'
import { Caveat } from '../../legal/Caveat'
import { pickTool, useLoaded, type Loaded } from '../useSite'
import { Waiting } from './Waiting'
import { goToStreetSide } from '../../phone/streetSideWords'
import { DriveFromSlab } from '../../components/DriveFromSlab'
import '../../checks/checks.css'

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

/** Draw a driveway: the Area tool, kind Driveway, on the plan. */
function drawDriveway() {
  usePlan.getState().setAreaDefault('driveway')
  pickTool('area')
}

function Checks({ d }: { d: Loaded }) {
  const c = useChecks(d.plan, d.survey, d.terrain, d.earth)
  const unsized = useUnsizedTrees()
  const groups = useMemo(() => groupChecks(c.results), [c.results])
  const targets = useMemo(() => {
    const out: Record<string, CheckTarget> = {}
    for (const r of c.results) {
      const t = targetOf(r, c.measures)
      if (t) out[r.id] = t
    }
    return out
  }, [c.results, c.measures])
  const numbers = useMemo(() => pinNumbers(groups, r => !!targets[r.id]), [groups, targets])
  const pins = useMemo<Pin[]>(
    () =>
      [...numbers].map(([id, n]) => {
        const r = c.results.find(x => x.id === id)!
        return { id, n, word: r.status === 'fail' ? 'fix' : 'confirm', title: r.title }
      }),
    [numbers, c.results],
  )
  // The plan shows the pins while this panel is open, and none once it closes.
  useEffect(() => setCheckPins(pins, targets), [pins, targets])
  useEffect(() => clearCheckPins, [])
  const differs = useMemo(() => routeDifferences(c.results, c.measures, c.pathway, c.council), [c.results, c.measures, c.pathway, c.council])
  const s = c.measures.settings
  // The street side is asked once, in the first row that waits for it.
  const askStreet = c.results.find(r => r.status === 'unknown' && r.note === NEED_FRONT)?.id ?? null

  // Groups with something to do start open; the rest start folded. Each remembers being opened or closed.
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  const [unfolded, setUnfolded] = useState<Record<string, boolean>>({})
  const list = useRef<HTMLDivElement>(null)
  // A pin clicked on the plan: open its group, unfold it, and bring the row into view.
  const reveal = useChecksPointing(st => st.reveal)
  useEffect(() => {
    if (!reveal) return
    const g = groups.find(x => x.rows.some(r => r.id === reveal.id))
    if (!g) return
    setOpened(o => ({ ...o, [g.id]: true }))
    setUnfolded(u => ({ ...u, [g.id]: true }))
    const t = setTimeout(() => list.current?.querySelector(`[data-check="${CSS.escape(reveal.id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30)
    return () => clearTimeout(t)
    // Only a new click reveals; the groups changing under it doesn't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal])

  const verdict = verdictOf(c.results)
  const route = c.pathway === 'cdc' ? 'CDC' : 'DA'
  return (
    <div className="checks">
      <DemFlag what="the checks that use ground levels (height, cut and fill, retaining walls)" />
      <RouteControl c={c} />
      <section className="checks-verdict" aria-live="polite" aria-label="What the checks say">
        <h4>
          <span className="cv-route">{route}:</span>{' '}
          {verdict.head.map((h, i) => (
            <span key={h.word} className={`cv-${h.word}`}>
              {i > 0 && ' · '}
              {h.text}
            </span>
          ))}
        </h4>
        <p className="muted">{verdict.rest.join(' · ')}</p>
        <MiniPlan ms={c.measures} />
        {pins.length > 0 && <p className="muted small checks-mini-hint">Tap a pin to see that check in the list.</p>}
      </section>
      {c.pathway === 'cdc' && (
        <p className="checks-land" role="note">
          {c.planning ? CDC_LAND_MAPPED : CDC_LAND}
        </p>
      )}
      <div className="check-groups" ref={list}>
        {groups.map(g => (
          <TopicGroup
            key={g.id}
            g={g}
            open={opened[g.id] ?? isLoudGroup(g)}
            onToggle={() => setOpened(o => ({ ...o, [g.id]: !(o[g.id] ?? isLoudGroup(g)) }))}
            unfolded={!!unfolded[g.id]}
            onUnfold={() => setUnfolded(u => ({ ...u, [g.id]: !u[g.id] }))}
            row={r => (
              <CheckRow key={r.id} r={r} n={numbers.get(r.id)} placed={!!targets[r.id]} differ={differs.get(r.id)}>
                {r.id === askStreet && <StreetPick m={c.measures} s={s} />}
                {r.id === 'da-fsr' && r.status === 'unknown' && <MapFact what="fsr" />}
                {r.id === 'da-height' && r.status !== 'incomplete' && s.lepHeight === undefined && <MapFact what="height" />}
              </CheckRow>
            )}
          />
        ))}
        <LotFacts m={c.measures} s={s} council={c.council} pathway={c.pathway} open={opened.facts} onToggle={open => setOpened(o => ({ ...o, facts: open }))} />
      </div>
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
      <p className="muted small">A guide to the rules as we read them, not legal advice. OK is not an approval.</p>
      <Caveat />
    </div>
  )
}

/** "Make it a driveway", for a concrete slab that looks like one (src/components/DriveFromSlab.tsx). */
function SlabDrive() {
  const d = useLoaded()
  return d ? <DriveFromSlab plan={d.plan} survey={d.survey} /> : null
}

// Open to start with: something to do, or a tree planned for removal (so ticking its box doesn't fold the group away).
const isLoudGroup = (g: Group) => !g.undrawn && g.rows.some(r => isLoud(r) || r.status === 'pending')

function TopicGroup({ g, open, onToggle, unfolded, onUnfold, row }: { g: Group; open: boolean; onToggle: () => void; unfolded: boolean; onUnfold: () => void; row: (r: CheckResult) => ReactNode }) {
  // A tree planned for removal stays in view, so ticking its box doesn't send the row into the fold.
  const shown = (r: CheckResult) => isLoud(r) || r.status === 'pending'
  const loud = g.rows.filter(shown)
  const quiet = g.rows.filter(r => !shown(r))
  const badges = groupBadges(g)
  return (
    <section className={`check-group ${g.worst}${open ? ' open' : ''}`}>
      <div className="cg-head">
        <button className="cg-toggle" aria-expanded={open} onClick={onToggle}>
          <span className="cg-chev" aria-hidden />
          <span className="cg-title">{g.title}</span>
          <span className="cg-badges">
            {/* An undrawn driveway says so with its button instead. */}
            {!g.undrawn && badges.map(b => (
              <span key={b.word} className={`check-badge ${b.word}`}>
                {b.text}
              </span>
            ))}
          </span>
        </button>
        {g.undrawn && (
          <button className="secondary cg-action" onClick={drawDriveway}>
            Draw a driveway
          </button>
        )}
      </div>
      {/* A driveway drawn as a concrete slab isn't one to these checks: offer to make it one. */}
      {g.undrawn && <SlabDrive />}
      {open && (
        <>
          {g.undrawn ? (
            <p className="muted small cg-note">
              {g.rows.length} checks of the drive and its street crossing wait for one: {g.rows.map(r => r.title.charAt(0).toLowerCase() + r.title.slice(1)).join(', ')}.
            </p>
          ) : (
            <ul className="check-list">
              {loud.map(row)}
              {quiet.length > 0 && (unfolded || !loud.length) && quiet.map(row)}
            </ul>
          )}
          {!g.undrawn && quiet.length > 0 && loud.length > 0 && (
            <button className="link cg-fold" aria-expanded={unfolded} onClick={onUnfold}>
              {unfolded ? 'Fold away the rest' : foldedText(quiet)}
            </button>
          )}
        </>
      )}
    </section>
  )
}

/**
 * One check: what it is, what to do (Fix, Confirm, OK), the design's number beside what's allowed,
 * and why CDC and DA differ where they do. Opened, the reasoning, the clause and where it's fixed.
 * With `n`, its pin's number; pointing at it (or tapping) draws it on the plan when it's `placed` there.
 */
export function CheckRow({ r, n, placed = false, differ, children }: { r: CheckResult; n?: number; placed?: boolean; differ?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pointed = useChecksPointing(st => pointedRow(st) === r.id)
  const word = WORD_OF[r.status]
  const fix = fixOf(r)
  const point = placed ? { onMouseEnter: () => hoverCheck(r.id), onMouseLeave: () => hoverCheck(null) } : {}
  return (
    <li className={`check-row ${r.status} w-${word}${pointed ? ' pointed' : ''}`} data-check={r.id} {...point}>
      <button
        className="check-head"
        onClick={() => {
          setOpen(!open)
          if (placed) pickCheck(open ? null : r.id)
        }}
        onFocus={placed ? () => hoverCheck(r.id) : undefined}
        onBlur={placed ? () => hoverCheck(null) : undefined}
        aria-expanded={open}
      >
        {n ? (
          <span className={`check-pin ${word}`} aria-label={`Pin ${n} on the plan`}>
            {n}
          </span>
        ) : (
          <span className={`check-dot ${r.status}`} aria-hidden />
        )}
        <span className="check-title">{r.title}</span>
        <span className={`check-badge ${word}`}>{WORD_TEXT[word]}</span>
      </button>
      {(r.value || r.limit) && (
        <div className="check-value">
          {r.value}
          {r.value && r.limit && <span className="muted"> · </span>}
          {r.limit && (
            <span className="check-limit">
              <span className="muted">Allowed </span>
              {r.limit}
            </span>
          )}
        </div>
      )}
      {differ && <div className="check-differ">{differ}</div>}
      {children}
      {r.tree && r.removable && <TreeRemoval remove={r.status === 'pending'} onChange={v => setTreeRemoval(r.tree!, v)} />}
      {open && (
        <div className="check-detail">
          {r.note && <p>{r.note}</p>}
          <div className="check-source">
            <span className={`conf ${r.source.confidence}`} title={CONFIDENCE_TIP[r.source.confidence]}>
              {CONFIDENCE_TEXT[r.source.confidence]}
            </span>
            <span className="muted">
              {r.source.clause} · {r.source.asAt}
            </span>
          </div>
          {fix && (word === 'fix' || word === 'confirm' || word === 'draw') && (
            <div>
              <button className="link" onClick={() => navigate({ kind: 'app', area: fix.area, tab: fix.tab, view: 'plan' })}>
                Go to fix: {fix.where}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

/** The approval route as one control: "CDC | DA with [council]". */
function RouteControl({ c }: { c: ChecksData }) {
  const fromMap = useMap(st => mapCouncil(st.place?.planning))
  const pick = useRef<HTMLSelectElement>(null)
  const chooseDa = () => {
    const k = c.council ?? fromMap
    if (k) setRoute('da', k.id)
    else pick.current?.focus()
  }
  const coverage = c.council ? controlCount(c.council) : null
  return (
    <div className="checks-route">
      <div className="cr-row">
        <span className="cr-label">Approval route</span>
        <div className="segmented-choice" role="radiogroup" aria-label="Approval route">
          {(['cdc', 'da'] as Pathway[]).map(p => (
            <button
              key={p}
              role="radio"
              aria-checked={c.pathway === p}
              className={c.pathway === p ? 'on' : ''}
              onClick={() => (p === 'cdc' ? setRoute('cdc') : chooseDa())}
              title={pathwayLong(p, p === 'da' ? (c.council ?? fromMap) : null)}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
        <label className="cr-council">
          <span>{c.pathway === 'da' ? 'with' : 'DA with'}</span>
          <select ref={pick} value={c.council?.id ?? ''} onChange={e => setRoute('da', e.target.value ? (e.target.value as Council['id']) : null)} aria-label="Council for a DA">
            <option value="">{c.council ? 'No council (CDC only)' : 'Pick your council'}</option>
            {COUNCILS.map(k => (
              <option key={k.id} value={k.id}>
                {k.name}
                {fromMap?.id === k.id ? ' (from the map)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">
        {checkedAgainst(c.pathway, c.council)}
        {c.pathway === 'da' && coverage && coverage.have < coverage.of ? `: ${coverage.have} of its ${coverage.of} controls so far` : ''}.
        {!c.council && !fromMap && ' NSW only: a council not listed has only the state-wide Housing Code checks so far.'}
      </p>
    </div>
  )
}

/** "Which side is the street?" in the row that waits for it. */
function StreetPick({ m, s }: { m: Measures; s: CheckSettings }) {
  const options = [{ id: -1, label: 'Pick a side' }, ...m.edges.map(e => ({ id: e.index, label: `${e.label} · ${e.length.toFixed(2)} m` }))]
  return (
    <div className="check-fact">
      <Select label={s.battleAxe ? 'Which side faces the lot in front?' : 'Which side is the street?'} value={s.frontEdge ?? -1} options={options} onChange={v => setCheckSettings({ frontEdge: v < 0 ? undefined : v, rearEdge: undefined })} />
    </div>
  )
}

/** The LEP map's floor space ratio or height, typed in the row, or taken from the planning maps when the lot is placed. */
function MapFact({ what }: { what: 'fsr' | 'height' }) {
  const plan = usePlan(st => st.plan)
  const facts = useMap(st => st.place?.planning ?? null)
  const s = checkSettingsOf(plan?.checks)
  const fromMap = facts?.[what] ?? null
  const value = what === 'fsr' ? s.lepFsr : s.lepHeight
  return (
    <div className="check-fact">
      {what === 'fsr' ? (
        <Num label="Floor space ratio from the LEP map" value={value ?? 0} unit=":1" decimals={2} min={0} onCommit={v => setCheckSettings({ lepFsr: v > 0 ? v : undefined })} />
      ) : (
        <Num label="Height limit from the LEP map" value={value ?? 0} unit="m" decimals={1} min={0} onCommit={v => setCheckSettings({ lepHeight: v > 0 ? v : undefined })} />
      )}
      <div className="row">
        {fromMap !== null ? (
          <button className="secondary" onClick={() => setCheckSettings(what === 'fsr' ? { lepFsr: fromMap } : { lepHeight: fromMap })}>
            Use the map’s {what === 'fsr' ? `${fromMap}:1` : `${fromMap} m`}
          </button>
        ) : (
          <button className="link" onClick={() => navigate({ kind: 'app', area: 'site', tab: 'map', view: 'plan' })}>
            Look it up: put the block on Site › Map
          </button>
        )}
      </div>
    </div>
  )
}


/** The lot's facts the survey doesn't hold, as the last group: open while the street side isn't set. */
function LotFacts({ m, s, council, pathway, open, onToggle }: { m: Measures; s: CheckSettings; council: Council | null; pathway: Pathway; open?: boolean; onToggle: (open: boolean) => void }) {
  const needsFront = s.frontEdge === undefined
  const da = pathway === 'da' && !!council
  const missing = [needsFront, da && !!council?.fsr && s.lepFsr === undefined, da && !!council?.height && s.lepHeight === undefined].filter(Boolean).length
  const shown = open ?? needsFront
  // Until the map value is entered, the council's own figure if its DCP has one; blank (0) for a council whose DCP has none.
  const k = activeCouncil(s)
  const height = s.lepHeight ?? (k ? (k.height?.fallback?.max ?? 0) : 9)
  const edgeOptions = [{ id: -1, label: 'Not set' }, ...m.edges.map(e => ({ id: e.index, label: `${e.label} · ${e.length.toFixed(2)} m` }))]
  return (
    <section className={`check-group lot-facts${missing ? ' fact' : ''}${shown ? ' open' : ''}`}>
      <div className="cg-head">
        <button className="cg-toggle" aria-expanded={shown} onClick={() => onToggle(!shown)}>
          <span className="cg-chev" aria-hidden />
          <span className="cg-title">Lot facts</span>
          <span className="cg-badges">{missing > 0 ? <span className="check-badge fact">{missing} to add</span> : <span className="check-badge ok">Set</span>}</span>
        </button>
      </div>
      {shown && (
        <div className="lot-facts-body">
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
          <p className="muted small">
            The same as the street side in{' '}
            <button className="link" onClick={goToStreetSide}>
              Site › Block
            </button>
            , which Street view in 3D looks from.
          </p>
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
        </div>
      )}
    </section>
  )
}
