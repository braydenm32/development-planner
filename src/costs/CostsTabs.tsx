// The Costs area: Estimate, Materials and Quotes, the strip's line, the card beside the plan,
// and More's rates and notes. Everything reads the one estimate (src/costs/estimate.ts) worked
// out from the design's own quantities.

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Icon } from '../nav/icons'
import { areaById, MORE, type NumberId } from '../nav/menu'
import { navigate, useRouter } from '../nav/router'
import { tabRoute, type AppRoute } from '../nav/route'
import { floorTypeInfo } from '../plan/floorTypes'
import { usePhone } from '../phone/device'
import { shareOrSave } from '../phone/share'
import { saveFile } from '../lib/download'
import { fileSafe } from '../print/export'
import { projectTitle } from '../share/project'
import { andList, m2, whereShown } from '../shell/format'
import { useLoaded, type Loaded } from '../shell/useSite'
import { Waiting } from '../shell/tabs/Waiting'
import { CHOICE_LINES, choiceDeltas, rateFor, type CostLine, type Estimate } from './estimate'
import { atName, dateText, delta, estimateCsv, incompleteText, money, NO_TOTAL, parseMoney, qtyText, rateText } from './format'
import { today, type CostsData } from './model'
import {
  CHOICE_GROUPS,
  CHOICES,
  CONTINGENCY,
  FINISH_GUIDE_SOURCE,
  finishGuide,
  GROUPS,
  MARGIN,
  OWNER_BUILDER,
  RANGE,
  RATES_AS_AT,
  SOURCES,
  STARTING_RATES,
  type ChoiceGroup,
  type RateId,
} from './rates'
import { useCosts, type Pointed } from './store'
import { useEstimate, useQuantities } from './useEstimate'
import './costs.css'

/** The route now: links from here keep its floor and selection. */
const here = (): AppRoute => {
  const r = useRouter.getState().route
  return r.kind === 'app' ? r : { kind: 'app', area: 'costs', tab: 'estimate', view: 'plan' }
}

/** Go to one of the Costs tabs (and a More item in it). */
const go = (tab: string, focus?: string) => navigate(tabRoute(here(), 'costs', tab), focus ? { focus } : {})

/** Go to where a line's quantity lives: "design/roofs". */
function goAt(at: string) {
  const [area, tab] = at.split('/')
  const a = areaById(area)
  if (a) navigate(tabRoute(here(), a.id, tab))
}

const commit = (fn: (d: CostsData) => CostsData) => useCosts.getState().commit(fn)

/** What a line points out, in words, for the card over the plan. */
const pointedOf = (l: CostLine): Pointed => ({
  line: l.id,
  label: l.label,
  what: [l.missing ?? l.from, qtyText(l)].filter(Boolean).join(' · '),
  target: l.missing ? null : l.target,
})

// ---------------------------------------------------------------------------
// Estimate

export function EstimateTab() {
  const d = useLoaded()
  return d ? <EstimateBody d={d} /> : <Waiting />
}

function EstimateBody({ d }: { d: Loaded }) {
  const e = useEstimate(d)
  const open = useCosts(s => s.open)
  const opened = useCosts(s => s.opened?.line ?? null)
  const phone = usePhone()
  const ob = e.who === 'owner'
  // Leaving the estimate stops pointing at its lines (a hovered line unmounts without a mouseleave).
  useEffect(() => () => useCosts.setState({ hover: null, opened: null }), [])
  const download = () => {
    const f = { name: `${fileSafe(projectTitle(d.plan))}-estimate.csv`, data: estimateCsv(e, projectTitle(d.plan), RATES_AS_AT), type: 'text/csv' }
    if (phone) void shareOrSave(f, `${projectTitle(d.plan)}: estimate`)
    else saveFile(f.name, f.data, f.type)
  }
  return (
    <div className={`costs-est${ob ? ' ob' : ''}`}>
      <div className="ce-total">
        {e.ready ? (
          <div>
            <div className="ce-big tnum">{money(e.total)}</div>
            <div className="ce-range tnum">
              Likely {money(e.low)} to {money(e.high)}
            </div>
            {e.missing.length > 0 && <div className="ce-incomplete">{incompleteText(e.missing)}</div>}
          </div>
        ) : (
          <div>
            <div className="ce-big ce-none">No total yet</div>
            <div className="ce-range">{NO_TOTAL}</div>
          </div>
        )}
        <div className="ce-right tnum">
          Floor area <b>{e.floorArea > 0 ? m2(e.floorArea) : '—'}</b>
          <br />
          Per m² <b>{e.perM2 === null ? '—' : money(e.perM2)}</b>
        </div>
        <FinishGuide e={e} />
        {ob && e.ready && (
          <>
            <div className="ce-split" role="img" aria-label={`Materials and fees ${money(e.materials)}, labour ${money(e.labour)}`}>
              <i style={{ width: `${e.total > 0 ? (100 * e.materials) / e.total : 0}%` }} />
            </div>
            <div className="ce-split-labels tnum">
              <span>Materials and fees {money(e.materials)}</span>
              <span>Labour, if you hire trades {money(e.labour)}</span>
            </div>
          </>
        )}
      </div>
      <WhoBuilds />
      <div className="ce-list">
        {e.groups.map(g => {
          const on = open.includes(g.id)
          return (
            <div key={g.id} className={`ce-grp${on ? ' open' : ''}`}>
              <button className="ce-gh" aria-expanded={on} onClick={() => useCosts.getState().toggleGroup(g.id)}>
                <Icon name="chevR" size={14} />
                <span className="ce-gl">{g.label}</span>
                {g.quoted ? <span className="ce-qchip">{g.quoted} quoted</span> : <span />}
                <span className="ce-amt tnum">{money(g.total)}</span>
              </button>
              {on && (
                <div className="ce-lines">
                  {ob && (
                    <div className="ce-colhead" aria-hidden="true">
                      <span />
                      <span>Quantity</span>
                      <span>Materials</span>
                      <span>Labour</span>
                    </div>
                  )}
                  {g.lines.map(l => (
                    <Line key={l.id} l={l} ob={ob} on={opened === l.id} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="ce-foot">
        <p className="muted">Starting rates are rough NSW {RATES_AS_AT.slice(-4)} figures from public guides. A quote replaces the estimate on its line.</p>
        <button className="secondary" onClick={download}>
          <Icon name="download" size={15} /> Download CSV
        </button>
      </div>
    </div>
  )
}

function WhoBuilds() {
  const who = useCosts(s => s.data.who)
  return (
    <div className="ce-who">
      <span className="muted">Who builds it</span>
      <div className="ce-seg" role="group" aria-label="Who builds it">
        {(
          [
            ['builder', 'A builder'],
            ['owner', 'Me, as owner-builder'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={who === id ? 'on' : ''} aria-pressed={who === id} onClick={() => commit(d => ({ ...d, who: id }))}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Line({ l, ob, on }: { l: CostLine; ob: boolean; on: boolean }) {
  const point = () => useCosts.setState({ hover: pointedOf(l) })
  const unpoint = () => {
    if (useCosts.getState().hover?.line === l.id) useCosts.setState({ hover: null })
  }
  const toggle = () => useCosts.setState(s => ({ opened: s.opened?.line === l.id ? null : pointedOf(l) }))
  const qty = qtyText(l)
  const cells = (
    <>
      <span className="ce-what">
        {l.label}
        <small>{l.quote ? `Quote · ${l.quote.from || 'no name given'}` : (l.missing ?? l.from)}</small>
      </span>
      <span className="ce-qty tnum">{qty}</span>
      {ob ? (
        <>
          <span className={`ce-amt tnum${l.quote ? ' quoted' : ''}`}>{money(l.materials)}</span>
          <span className="ce-amt tnum muted">{money(l.labour)}</span>
        </>
      ) : (
        <>
          <span className="ce-rate tnum">{l.rate === null || l.unit === 'item' ? '' : rateText(l.rate, l.unit)}</span>
          <span className={`ce-amt tnum${l.quote ? ' quoted' : ''}`}>
            {money(l.amount)}
            {l.quote && <s>{money(l.estimate)}</s>}
          </span>
        </>
      )}
    </>
  )
  return (
    <div className={`ce-ln${on ? ' on' : ''}${l.missing ? ' missing' : ''}`} onMouseEnter={point} onMouseLeave={unpoint}>
      {l.computed ? (
        <div className="ce-ln-main">{cells}</div>
      ) : (
        <button className="ce-ln-main" aria-expanded={on} onClick={toggle} onFocus={point} onBlur={unpoint} title={on ? undefined : l.quote ? 'Change or remove the quote' : 'Add a quote for this line'}>
          {cells}
        </button>
      )}
      {on && <QuoteForm l={l} onDone={() => useCosts.setState({ opened: null })} />}
    </div>
  )
}

/** A quote for a line: what it is and who it's from. It replaces the line's estimate. */
function QuoteForm({ l, onDone }: { l: CostLine; onDone: () => void }) {
  const [amount, setAmount] = useState(l.quote ? String(Math.round(l.quote.amount * 100) / 100) : '')
  const [from, setFrom] = useState(l.quote?.from ?? '')
  const value = parseMoney(amount)
  const save = (ev: FormEvent) => {
    ev.preventDefault()
    if (value === null) return
    commit(d => ({ ...d, quotes: { ...d.quotes, [l.id]: { amount: value, from: from.trim(), date: l.quote?.date ?? today() } } }))
    onDone()
  }
  const remove = () => {
    commit(d => {
      const quotes = { ...d.quotes }
      delete quotes[l.id]
      return { ...d, quotes }
    })
    onDone()
  }
  return (
    <form className="ce-quote" onSubmit={save}>
      <div className="ce-quote-row">
        <input aria-label={`Quote for ${l.label}, dollars, GST included`} placeholder="Quote, $" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
        <input aria-label="Who the quote is from" placeholder="From" value={from} onChange={e => setFrom(e.target.value)} />
        <button type="submit" className="secondary" disabled={value === null}>
          {l.quote ? 'Update quote' : 'Use this quote'}
        </button>
        {l.quote && (
          <button type="button" className="link" onClick={remove}>
            Remove quote
          </button>
        )}
      </div>
      <p className="muted small">
        {l.quote ? `Quoted ${dateText(l.quote.date)}. ` : ''}
        {l.missing ? `${l.missing}. ` : ''}
        {l.at && (
          <>
            Quantity from{' '}
            <span className="ce-nowrap">
              <button type="button" className="link" onClick={() => goAt(l.at!)}>
                {atName(l.at)}
              </button>
              .
            </span>{' '}
          </>
        )}
        {l.rateId && (
          <>
            Rate in{' '}
            <span className="ce-nowrap">
              <button type="button" className="link" onClick={() => go(MORE, 'cost-rates')}>
                More › Rates
              </button>
              .
            </span>
          </>
        )}
      </p>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Materials

/** The rows of material choices, each option with what it adds or saves against the one chosen. */
function MaterialRows({ d, detail = false }: { d: Loaded; detail?: boolean }) {
  const q = useQuantities(d)
  const data = useCosts(s => s.data)
  const deltas = useMemo(() => choiceDeltas(q, data), [q, data])
  const e = useEstimate(d)
  const floor = q.ground ? q.ground.parts.map(p => floorTypeInfo(p.type).label).join(' and ') : 'No floor yet'
  return (
    <div className={`cm-rows${detail ? ' detail' : ''}`}>
      <div className="cm-row">
        <span className="cm-k">Floor</span>
        <span className="cm-linked">
          {floor} · from{' '}
          <button className="link" onClick={() => goAt('design/floors')}>
            Design › Floors
          </button>
        </span>
      </div>
      {CHOICE_GROUPS.map(g => (
        <div key={g} className="cm-row">
          <span className="cm-k">{CHOICES[g].label}</span>
          <div>
            <div className="cm-chips" role="group" aria-label={CHOICES[g].label}>
              {CHOICES[g].options.map(o => {
                const on = data.choices[g] === o.id
                const dv = deltas[g][o.id]
                return (
                  <button key={o.id} className={`cm-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => commit(x => ({ ...x, choices: { ...x.choices, [g]: o.id } }))}>
                    {o.label}
                    {!on && Math.round(dv) !== 0 && <em className="tnum">{delta(dv)}</em>}
                  </button>
                )
              })}
            </div>
            {detail && <ChoiceNote g={g} e={e} />}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Where the house itself sits against the rough guide for the finish picked. While the estimate
 * is missing things (no windows, say) the house reads cheap for the wrong reason, so it says
 * what to draw instead of "Under the guide".
 */
export function FinishGuide({ e }: { e: Estimate }) {
  const finish = useCosts(s => s.data.choices.finish)
  if (e.housePerM2 === null) return null
  const g = finishGuide(finish)
  const name = CHOICES.finish.options.find(o => o.id === finish)?.label ?? 'Mid'
  const where = e.housePerM2 < g.low ? 'under' : e.housePerM2 > g.high ? 'over' : 'in'
  return (
    <p className="ce-guide tnum" title={FINISH_GUIDE_SOURCE}>
      <span>
        House only <b>{money(e.housePerM2)}</b> per m² · {name} finish guide {money(g.low)} to {money(g.high)}
        {e.who === 'owner' && ', which has a builder’s margin in it'}
      </span>
      {e.missing.length > 0 ? (
        <span className="ce-guide-wait">Compare once there are {andList(e.missing)}</span>
      ) : (
        <span className={`ce-guide-tag ${where}`}>{where === 'in' ? 'Within the guide' : where === 'under' ? 'Under the guide' : 'Over the guide'}</span>
      )}
    </p>
  )
}

/** The rough guides for each finish level, in a line. */
const guidesText = () =>
  CHOICES.finish.options
    .map(o => {
      const g = finishGuide(o.id)
      return `${o.label} ${money(g.low)} to ${money(g.high)}`
    })
    .join(', ')

/** Which lines a choice changes, and how much they come to now. */
function ChoiceNote({ g, e }: { g: ChoiceGroup; e: Estimate }) {
  const lines = e.lines.filter(l => CHOICE_LINES[g].includes(l.id))
  if (!lines.length) return <p className="muted small">Nothing in the design uses it yet.</p>
  const quoted = lines.filter(l => l.quote)
  const words =
    g === 'finish'
      ? `Scales ${lines.map(l => l.label.toLowerCase()).join(', ')}: ${money(lines.reduce((t, l) => t + l.amount, 0))} now.`
      : lines.map(l => (l.missing ? `${l.label}: ${l.missing.toLowerCase()}.` : `${l.label}: ${qtyText(l)} at ${l.rate === null ? '' : rateText(l.rate, l.unit)}, ${money(l.amount)}.`)).join(' ')
  return (
    <p className="muted small">
      {words}
      {quoted.length > 0 && ` ${quoted.length === lines.length ? 'It is' : 'Part is'} quoted, so a change here doesn’t move the quote.`}
      {g === 'finish' && ` Rough guides per m² of the house itself: ${guidesText()} (RLB 2026, custom-built houses in Sydney).${e.housePerM2 === null ? '' : ` This design: ${money(e.housePerM2)}.`}`}
    </p>
  )
}

export function MaterialsTab() {
  const d = useLoaded()
  return d ? (
    <>
      <MaterialRows d={d} detail />
      <p className="muted small">Each choice shows what it adds or saves against the one picked now, with every other line as it is. How the floor is built is chosen in Design › Floors, where it also sets the earthworks.</p>
    </>
  ) : (
    <Waiting />
  )
}

/** Beside the plan on a wide desktop, on the Estimate tab: what a hovered line measures, and the material choices. */
export function EstimateAside() {
  const d = useLoaded()
  const pointed = useCosts(s => s.hover ?? s.opened)
  const phone = usePhone()
  if (!d || phone) return null
  return <Aside d={d} pointed={pointed} />
}

function Aside({ d, pointed }: { d: Loaded; pointed: Pointed | null }) {
  return (
    <>
      <div className="float-card costs-legend" role="status">
        {pointed ? (
          <>
            <b>{pointed.label}</b> · {pointed.what}
            {!pointed.target && <span className="muted"> · nothing to show on the plan</span>}
          </>
        ) : (
          <>
            <b>Hover a line</b> to see what it measures on the plan. Quantities update as the design changes.
          </>
        )}
      </div>
      <section className="float-card costs-materials" aria-label="Materials">
        <header>
          <h3>Materials</h3>
          <button className="link" onClick={() => go('materials')}>
            All choices
          </button>
        </header>
        <MaterialRows d={d} />
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Quotes

export function QuotesTab() {
  const d = useLoaded()
  return d ? <QuotesBody d={d} /> : <Waiting />
}

function QuotesBody({ d }: { d: Loaded }) {
  const e = useEstimate(d)
  const quotes = useCosts(s => s.data.quotes)
  const [editing, setEditing] = useState<string | null>(null)
  const quoted = e.lines.filter(l => l.quote)
  const elsewhere = Object.entries(quotes).filter(([id]) => !e.lines.some(l => l.id === id))
  const sum = quoted.reduce((t, l) => t + l.amount, 0)
  const est = quoted.reduce((t, l) => t + l.estimate, 0)
  const remove = (id: string) =>
    commit(x => {
      const qs = { ...x.quotes }
      delete qs[id]
      return { ...x, quotes: qs }
    })
  return (
    <div className="costs-quotes">
      <p className="cq-sum">
        <b>
          {e.quoted} of {e.quotable} lines quoted
        </b>
        {quoted.length > 0 && (
          <span className="muted tnum">
            {' '}
            · quotes come to {money(sum)} against {money(est)} estimated ({delta(sum - est)})
          </span>
        )}
      </p>
      {quoted.length === 0 && (
        <div className="cq-empty">
          <p className="muted">No quotes yet. When someone gives you a price, open its line in the estimate and add it: the quote replaces the estimate on that line.</p>
          <button className="secondary" onClick={() => go('estimate')}>
            Open the estimate
          </button>
        </div>
      )}
      {quoted.map(l => (
        <div key={l.id} className="cq-row">
          <div className="cq-head">
            <div className="cq-what">
              <b>{l.label}</b>
              <small className="muted">
                {GROUPS.find(g => g.id === l.group)?.label} · {l.quote!.from || 'no name given'}
                {l.quote!.date && ` · ${dateText(l.quote!.date)}`}
              </small>
            </div>
            <div className="cq-amt tnum">
              <span className="quoted">{money(l.amount)}</span>
              <s>{money(l.estimate)}</s>
              <small className="muted">{delta(l.amount - l.estimate)}</small>
            </div>
          </div>
          {editing === l.id ? (
            <QuoteForm l={l} onDone={() => setEditing(null)} />
          ) : (
            <div className="cq-actions">
              <button className="link" onClick={() => setEditing(l.id)}>
                Change
              </button>
              <button className="link" onClick={() => remove(l.id)}>
                Remove
              </button>
            </div>
          )}
        </div>
      ))}
      {elsewhere.length > 0 && (
        <>
          <h3>Not in the estimate now</h3>
          <p className="muted small">The design has nothing for these lines at the moment (a door type removed, say). Their quotes are kept until you remove them.</p>
          {elsewhere.map(([id, q]) => (
            <div key={id} className="cq-row">
              <div className="cq-head">
                <div className="cq-what">
                  <b>{lineName(id)}</b>
                  <small className="muted">
                    {q.from || 'no name given'}
                    {q.date && ` · ${dateText(q.date)}`}
                  </small>
                </div>
                <div className="cq-amt tnum">{money(q.amount)}</div>
              </div>
              <div className="cq-actions">
                <button className="link" onClick={() => remove(id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

/** A line's name from its id, for a quote whose line has gone. */
function lineName(id: string): string {
  const r = STARTING_RATES.find(x => x.id === id)
  if (r) return r.label
  const names: Record<string, string> = { frame: 'Wall frames and roof trusses', roof: 'Roofing', cladding: 'External walls', windows: 'Windows' }
  return names[id] ?? id
}

// ---------------------------------------------------------------------------
// More

/** Every rate, changeable for this project, with the starting rate to go back to. */
export function RatesSection() {
  const data = useCosts(s => s.data)
  return (
    <div className="costs-rates">
      <p className="muted small">
        Dollars per unit, GST included. Fit-out rates are for a mid finish; Materials › Finish scales them. A change applies to this project only, and Undo takes it
        back.
      </p>
      {GROUPS.map(g => (
        <div key={g.id} className="cr-group">
          <h3>{g.label}</h3>
          {STARTING_RATES.filter(r => r.group === g.id).map(r => (
            <RateRow
              key={r.id}
              label={r.label + ('finish' in r && r.finish ? ' (mid finish)' : '')}
              unit={r.unit === 'item' ? '' : r.unit === 'each' ? 'each' : r.unit === 'room' ? 'a room' : `/${r.unit === 'm² face' ? 'm² of face' : r.unit}`}
              value={rateFor(data, r.id)}
              start={r.rate}
              source={r.source}
              onCommit={v => setRate(r.id, v)}
            />
          ))}
          {g.id === 'fees' && (
            <>
              <RateRow
                label="Builder’s margin and overheads, on the building work"
                unit="%"
                percent
                value={data.margin}
                start={MARGIN}
                source="Rough figure: builders usually add 15–25%. Left out when you build it yourself."
                onCommit={v => commit(x => ({ ...x, margin: v }))}
              />
              <RateRow
                label="Contingency, on everything above"
                unit="%"
                percent
                value={data.contingency}
                start={CONTINGENCY}
                source="For what can’t be seen yet: rock, extra steel, changes."
                onCommit={v => commit(x => ({ ...x, contingency: v }))}
              />
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function setRate(id: RateId, v: number) {
  commit(x => {
    const rates = { ...x.rates }
    const start = STARTING_RATES.find(r => r.id === id)!.rate
    if (Math.abs(v - start) < 1e-9) delete rates[id]
    else rates[id] = v
    return { ...x, rates }
  })
}

function RateRow({
  label,
  unit,
  value,
  start,
  source,
  percent = false,
  onCommit,
}: {
  label: string
  unit: string
  value: number
  start: number
  source: string
  percent?: boolean
  onCommit: (v: number) => void
}) {
  const shown = percent ? String(Number((value * 100).toFixed(2))) : String(Math.round(value * 100) / 100)
  const [editing, setEditing] = useState<string | null>(null)
  const changed = Math.abs(value - start) > 1e-9
  const commitText = () => {
    const t = editing
    setEditing(null)
    if (t === null) return
    const n = parseMoney(t)
    if (n === null) return
    const v = percent ? n / 100 : n
    if (percent && v > 1) return
    if (Math.abs(v - value) > 1e-9) onCommit(v)
  }
  return (
    <div className={`cr-row${changed ? ' changed' : ''}`}>
      <label className="cr-label">
        <span>{label}</span>
        <span className="cr-input">
          {!percent && <em>$</em>}
          <input
            inputMode="decimal"
            value={editing ?? shown}
            onFocus={() => setEditing(shown)}
            onChange={e => setEditing(e.target.value)}
            onBlur={commitText}
            onKeyDown={e => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') {
                setEditing(null)
                ;(e.target as HTMLInputElement).blur()
              }
            }}
          />
          <em className="cr-unit">{unit}</em>
        </span>
      </label>
      <p className="muted small">
        {changed && (
          <>
            Starting rate {percent ? `${Number((start * 100).toFixed(2))}%` : money(start)}.{' '}
            <button className="link" onClick={() => onCommit(start)}>
              Reset to starting rate
            </button>
            .{' '}
          </>
        )}
        {source}
      </p>
    </div>
  )
}

/** How the estimate is made, where the rates come from, and the NSW owner-builder rules. */
export function AboutCostsSection() {
  return (
    <div className="costs-about">
      <p className="small">
        Each line is a quantity measured from the design, times a rate. The quantities are the ones the rest of the app shows (floor area, cut and fill, retaining wall faces,
        the roof’s sloping area), so they change as the design does. A quote replaces its line’s estimate.
      </p>
      <p className="small">
        A builder adds a margin for overheads and profit on the building work. Building it yourself leaves that out, adds the owner-builder permit and course, and shows how much
        is materials and how much is labour if you hire trades. Then a contingency goes on top. The likely range is {Math.round(RANGE * 100)}% either way.
      </p>
      <h3>Owner-builder in NSW</h3>
      <p className="small">
        Work worth more than {money(OWNER_BUILDER.permitOver)} (GST included) needs an owner-builder permit; over {money(OWNER_BUILDER.courseOver)} you also need the approved
        course. The permit is {money(OWNER_BUILDER.permitFee)} for a year from July 2026. Checked on nsw.gov.au in {RATES_AS_AT}.
      </p>
      <h3>Not included</h3>
      <p className="small">The land and stamp duty, council and water contributions, heating and cooling, window coverings, furniture, a pool, and anything not drawn.</p>
      <h3>Sources</h3>
      <p className="small">Starting rates are rough figures for NSW as at {RATES_AS_AT}, GST included. Where a public guide gave a range, the rate sits inside it; the rest are plainly rough, and say so in Rates.</p>
      <ul className="costs-sources">
        {SOURCES.map(s => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer noopener">
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The strip

/**
 * The Costs area's line under the top bar: Estimate $X ± 20% · Per m² · N of M lines quoted ·
 * Overview. The estimate and per m² step back to a label while the Estimate panel shows them.
 */
export function CostsStrip({
  d,
  route,
  shown,
  onOverview,
  overviewOpen,
}: {
  d: Loaded
  route: AppRoute
  shown: Partial<Record<NumberId, string>>
  onOverview: () => void
  overviewOpen: boolean
}) {
  const e = useEstimate(d)
  const to = (tab: string) => () => navigate(tabRoute(route, 'costs', tab))
  return (
    <div className="summary-strip costs-strip" role="region" aria-label="Costs">
      <div className="chips">
        {shown.cost ? (
          <>
            <span className="chip ghost">
              Estimate <em>{whereShown(shown.cost)}</em>
            </span>
            <span className="chip ghost">
              Per m² <em>{whereShown(shown.cost)}</em>
            </span>
          </>
        ) : (
          <>
            {e.ready ? (
              <button className="chip" onClick={to('estimate')} title={incompleteText(e.missing) || undefined}>
                <span className="chip-label">Estimate</span> <b className="tnum">{money(e.total)}</b> <span className="chip-label">± {Math.round(RANGE * 100)}%</span>
                {e.missing.length > 0 && <span className="badge warn">Incomplete</span>}
              </button>
            ) : (
              <button className="chip ghost" onClick={to('estimate')} title={NO_TOTAL}>
                Estimate <em>no walls yet</em>
              </button>
            )}
            {e.perM2 !== null && (
              <button className="chip" onClick={to('estimate')}>
                <span className="chip-label">Per m²</span> <b className="tnum">{money(e.perM2)}</b>
              </button>
            )}
          </>
        )}
        <button className="chip" onClick={to('quotes')}>
          <i className="dot accent" />
          {e.quoted} of {e.quotable} lines quoted
        </button>
      </div>
      <button className={`overview-button${overviewOpen ? ' on' : ''}`} onClick={onOverview} aria-expanded={overviewOpen}>
        Overview <Icon name={overviewOpen ? 'chevU' : 'chevD'} size={14} />
      </button>
    </div>
  )
}
