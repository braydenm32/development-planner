// The Costs area: Estimate (with the material choices folded into it), Materials and Quotes,
// the strip's line, the card beside the plan that says what a line measures, and More's rates
// and notes. Everything reads the one estimate (src/costs/estimate.ts) worked
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
import { atName, dateText, delta, estimateCsv, incompleteText, money, NO_TOTAL, parseMoney, qtyText, rateText, shortMoney } from './format'
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
  RATE_GROUPS,
  RATES_AS_AT,
  SOURCES,
  STARTING_RATES,
  type ChoiceGroup,
  type RateId,
} from './rates'
import { useCosts, type Pointed } from './store'
import { useEstimate, useFeeContext, useQuantities } from './useEstimate'
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
            <div className="ce-range-why">± {Math.round(RANGE * 100)}%: an early estimate can land this far either way.</div>
            {e.missing.length > 0 && <div className="ce-incomplete">{incompleteText(e.missing)}</div>}
          </div>
        ) : (
          <div>
            <div className="ce-big ce-none">No total yet</div>
            <div className="ce-range">{NO_TOTAL}</div>
          </div>
        )}
        <dl className="ce-right tnum">
          <div>
            <dt>Floor area</dt>
            <dd>{e.floorArea > 0 ? m2(e.floorArea) : '—'}</dd>
          </div>
          <div title="The whole estimate per m² of floor: site works, outside, fees and contingency included">
            <dt>All in</dt>
            <dd>{e.perM2 === null ? '—' : `${money(e.perM2)}/m²`}</dd>
          </div>
          <div title="The house itself per m² of floor, with the builder’s margin: no site works, outside works, fees or contingency. The finish guides measure this.">
            <dt>House only</dt>
            <dd>{e.housePerM2 === null ? '—' : `${money(e.housePerM2)}/m²`}</dd>
          </div>
        </dl>
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
        <MaterialsFold d={d} />
        {e.groups.map(g => {
          const on = open.includes(g.id)
          return (
            <div key={g.id} className={`ce-grp${on ? ' open' : ''}${g.id === 'gov' ? ' gov' : ''}`}>
              <button className="ce-gh" aria-expanded={on} onClick={() => useCosts.getState().toggleGroup(g.id)}>
                <Icon name="chevR" size={14} />
                <span className="ce-gl">{g.label}</span>
                {g.quoted ? <span className="ce-qchip">{g.quoted} {g.id === 'gov' ? 'from council' : 'quoted'}</span> : <span />}
                <span className="ce-amt tnum">{money(g.total)}</span>
              </button>
              {on && (
                <div className="ce-lines">
                  {g.id === 'gov' && <p className="muted small ce-gov-note">Rough figures from the NSW scales and the council’s plan. Open a line to put in the council’s own figure.</p>}
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
        <Summary e={e} />
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

/**
 * Under the groups, always unfolded: what they come to, the builder's margin, the contingency and
 * the total, so the two biggest additions aren't hidden in a group of their own.
 */
function Summary({ e }: { e: Estimate }) {
  const pct = (x: number) => `${Number((x * 100).toFixed(1))}%`
  return (
    <div className="ce-sum tnum" role="group" aria-label="Total">
      <div className="ce-sum-row">
        <span>Subtotal</span>
        <span>{money(e.subtotal)}</span>
      </div>
      {e.who === 'builder' ? (
        <div className="ce-sum-row" onMouseEnter={() => useCosts.setState({ hover: null })}>
          <span>
            Builder’s margin {pct(e.margin.share)}
            <small>Overheads and profit, on the building work</small>
          </span>
          <span>+{money(e.margin.amount)}</span>
        </div>
      ) : (
        <div className="ce-sum-row muted">
          <span>
            No builder’s margin
            <small>You build it, as owner-builder</small>
          </span>
          <span>$0</span>
        </div>
      )}
      <div className="ce-sum-row">
        <span>
          Contingency {pct(e.contingency.share)}
          <small>For what can’t be seen yet, on everything above</small>
        </span>
        <span>+{money(e.contingency.amount)}</span>
      </div>
      <div className="ce-sum-row total">
        <span>Total</span>
        <span>{e.ready ? money(e.total) : '—'}</span>
      </div>
      <p className="muted small">
        Change the margin or contingency in{' '}
        <button className="link" onClick={() => go(MORE, 'cost-rates')}>
          More › Rates
        </button>
        .
      </p>
    </div>
  )
}

/** The material choices, folded into the estimate: a line that says what's picked, opening to the chips. */
function MaterialsFold({ d }: { d: Loaded }) {
  const [on, setOn] = useState(false)
  const choices = useCosts(s => s.data.choices)
  const picked = CHOICE_GROUPS.map(g => CHOICES[g].options.find(o => o.id === choices[g])?.label)
    .filter(Boolean)
    .join(' · ')
  return (
    <div className={`ce-grp ce-mat${on ? ' open' : ''}`}>
      <button className="ce-gh" aria-expanded={on} onClick={() => setOn(!on)}>
        <Icon name="chevR" size={14} />
        <span className="ce-gl">Materials</span>
        <span className="ce-picked">{picked} finish</span>
        <span />
      </button>
      {on && (
        <div className="ce-lines">
          <MaterialRows d={d} />
          <p className="muted small">
            Each choice shows what it adds or saves.{' '}
            <button className="link" onClick={() => go('materials')}>
              More on each choice
            </button>
          </p>
        </div>
      )}
    </div>
  )
}

function WhoBuilds() {
  const who = useCosts(s => s.data.who)
  const margin = useCosts(s => s.data.margin)
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
      <p className="ce-who-says">
        {who === 'owner'
          ? 'Leaves out the builder’s margin and adds the owner-builder permit and course. You hire and run the trades; the lines split into materials and labour.'
          : `A builder runs the job and adds ${Math.round(margin * 100)}% for overheads and profit on the building work.`}
      </p>
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
        <small>{l.quote ? `${l.group === 'gov' ? 'Your figure' : 'Quote'} · ${l.quote.from || 'no name given'}` : (l.missing ?? l.from)}</small>
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
        <button className="ce-ln-main" aria-expanded={on} onClick={toggle} onFocus={point} onBlur={unpoint} title={on ? undefined : l.group === 'gov' ? 'Put in the council’s own figure' : l.quote ? 'Change or remove the quote' : 'Add a quote for this line'}>
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
  // A council or government fee takes the council's own figure in place of the rough one.
  const fee = l.group === 'gov'
  return (
    <form className="ce-quote" onSubmit={save}>
      <div className="ce-quote-row">
        <input
          aria-label={fee ? `${l.label}, dollars` : `Quote for ${l.label}, dollars, GST included`}
          placeholder={fee ? 'Amount, $' : 'Quote, $'}
          inputMode="decimal"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          autoFocus
        />
        <input aria-label={fee ? 'Where the figure is from' : 'Who the quote is from'} placeholder={fee ? 'From (council)' : 'From'} value={from} onChange={e => setFrom(e.target.value)} />
        <button type="submit" className="secondary" disabled={value === null}>
          {fee ? (l.quote ? 'Update' : 'Use this figure') : l.quote ? 'Update quote' : 'Use this quote'}
        </button>
        {l.quote && (
          <button type="button" className="link" onClick={remove}>
            {fee ? 'Back to the rough figure' : 'Remove quote'}
          </button>
        )}
      </div>
      <p className="muted small">
        {l.quote ? `${fee ? 'Added' : 'Quoted'} ${dateText(l.quote.date)}. ` : ''}
        {fee && `Rough figure ${money(l.estimate)}. `}
        {l.missing ? `${l.missing}. ` : ''}
        {l.at && (
          <>
            {fee ? 'Council and pathway from' : 'Quantity from'}{' '}
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
  const fees = useFeeContext(d)
  const deltas = useMemo(() => choiceDeltas(q, data, fees), [q, data, fees])
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
 * The estimate beside what the rough guide for the finish picked would make it, and in a line why
 * they differ. While the estimate is missing things (no windows, say) the house reads cheap for
 * the wrong reason, so it says what to draw instead of comparing.
 */
export function FinishGuide({ e }: { e: Estimate }) {
  const finish = useCosts(s => s.data.choices.finish)
  if (e.housePerM2 === null || !e.guide) return null
  const g = finishGuide(finish)
  const name = CHOICES.finish.options.find(o => o.id === finish)?.label ?? 'Mid'
  const where = e.housePerM2 < g.low ? 'under' : e.housePerM2 > g.high ? 'over' : 'in'
  if (e.missing.length > 0 || !e.ready)
    return (
      <p className="ce-guide tnum" title={FINISH_GUIDE_SOURCE}>
        <span>
          {name} finish guide {money(g.low)} to {money(g.high)} per m² of the house
        </span>
        <span className="ce-guide-wait">Compare once there are {andList(e.missing.length ? e.missing : ['outside walls'])}</span>
      </p>
    )
  const why =
    where === 'under'
      ? 'Why the gap: the guide is RLB’s range for custom-built Sydney houses; the quantities price only what’s drawn, at rough rates. Project-home builders often land nearer the quantities.'
      : where === 'over'
        ? 'The house comes in over RLB’s range for custom-built Sydney houses at this finish. Check the rates and quotes for anything unusual.'
        : 'The house sits within RLB’s range for custom-built Sydney houses at this finish.'
  return (
    <div className="ce-guide" title={FINISH_GUIDE_SOURCE}>
      <p className="ce-two tnum">
        <span>
          From quantities <b>{shortMoney(e.total)}</b>
        </span>
        <span aria-hidden="true">·</span>
        <span>
          From the {name.toLowerCase()} finish guide{' '}
          <b>
            {shortMoney(e.guide.low)} to {shortMoney(e.guide.high)}
          </b>
        </span>
        <span className={`ce-guide-tag ${where}`}>{where === 'in' ? 'Within the guide' : where === 'under' ? 'Under the guide' : 'Over the guide'}</span>
      </p>
      <p className="ce-why">
        {why}
        {e.who === 'owner' && ' The guide has a builder’s margin in it.'}
      </p>
    </div>
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

/** Over the plan on a desktop, on the Estimate tab: what a hovered line measures. The material choices are in the panel. */
export function EstimateAside() {
  const d = useLoaded()
  const pointed = useCosts(s => s.hover ?? s.opened)
  const phone = usePhone()
  if (!d || phone) return null
  return <Aside pointed={pointed} />
}

function Aside({ pointed }: { pointed: Pointed | null }) {
  return (
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

/**
 * Every rate, changeable for this project, folded by group, each changed one with its starting
 * rate to go back to. "Show only what I changed" hides the rest, and opens every group that has one.
 */
export function RatesSection() {
  const data = useCosts(s => s.data)
  const [open, setOpen] = useState<string[]>([])
  const [onlyChanged, setOnlyChanged] = useState(false)
  const changedRate = (id: RateId, start: number) => Math.abs(rateFor(data, id) - start) > 1e-9
  const extras = [
    {
      id: 'margin',
      label: 'Builder’s margin and overheads, on the building work',
      value: data.margin,
      start: MARGIN,
      source: 'Rough figure: builders usually add 15–25%. Left out when you build it yourself.',
      set: (v: number) => commit(x => ({ ...x, margin: v })),
    },
    {
      id: 'contingency',
      label: 'Contingency, on everything above',
      value: data.contingency,
      start: CONTINGENCY,
      source: 'For what can’t be seen yet: rock, extra steel, changes.',
      set: (v: number) => commit(x => ({ ...x, contingency: v })),
    },
  ]
  const groups = [
    ...RATE_GROUPS.map(g => ({ id: g.id as string, label: g.label, rates: STARTING_RATES.filter(r => r.group === g.id), extras: [] as typeof extras })),
    { id: 'summary', label: 'Margin and contingency', rates: [], extras },
  ].filter(g => g.rates.length + g.extras.length > 0)
  const changedIn = (g: (typeof groups)[number]) => g.rates.filter(r => changedRate(r.id, r.rate)).length + g.extras.filter(x => Math.abs(x.value - x.start) > 1e-9).length
  const total = groups.reduce((t, g) => t + changedIn(g), 0)
  const resetAll = () => commit(x => ({ ...x, rates: {}, margin: MARGIN, contingency: CONTINGENCY }))
  return (
    <div className="costs-rates">
      <p className="muted small">
        Dollars per unit, GST included. Fit-out rates are for a mid finish; Materials › Finish scales them. A change applies to this project only, and Undo takes it
        back.
      </p>
      <div className="cr-tools">
        <label className="check">
          <input type="checkbox" checked={onlyChanged} onChange={e => setOnlyChanged(e.target.checked)} />
          Show only what I changed{total > 0 ? ` (${total})` : ''}
        </label>
        {total > 0 && (
          <button className="link" onClick={resetAll}>
            Reset all
          </button>
        )}
      </div>
      {onlyChanged && total === 0 && <p className="muted small">Nothing changed yet: every rate is the starting rate.</p>}
      {groups.map(g => {
        const n = changedIn(g)
        if (onlyChanged && n === 0) return null
        const on = onlyChanged || open.includes(g.id)
        return (
          <div key={g.id} className={`cr-group${on ? ' open' : ''}`}>
            <button
              className="cr-gh"
              aria-expanded={on}
              disabled={onlyChanged}
              onClick={() => setOpen(o => (o.includes(g.id) ? o.filter(x => x !== g.id) : [...o, g.id]))}
            >
              <Icon name="chevR" size={14} />
              <span>{g.label}</span>
              <span className="cr-count">{n > 0 ? `${n} changed` : `${g.rates.length + g.extras.length} ${g.rates.length + g.extras.length === 1 ? 'rate' : 'rates'}`}</span>
            </button>
            {on && (
              <div className="cr-lines">
                {g.rates
                  .filter(r => !onlyChanged || changedRate(r.id, r.rate))
                  .map(r => (
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
                {g.extras
                  .filter(x => !onlyChanged || Math.abs(x.value - x.start) > 1e-9)
                  .map(x => (
                    <RateRow key={x.id} label={x.label} unit="%" percent value={x.value} start={x.start} source={x.source} onCommit={x.set} />
                  ))}
              </div>
            )}
          </div>
        )
      })}
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
      {changed && (
        <button className="cr-reset" onClick={() => onCommit(start)} title="Back to the starting rate" aria-label={`Reset ${label} to the starting rate`}>
          <Icon name="rotate" size={13} /> {percent ? `${Number((start * 100).toFixed(2))}%` : money(start)}
        </button>
      )}
      <p className="muted small">{source}</p>
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
      <h3>Council and government fees</h3>
      <p className="small">
        Rough figures on the cost of the building work: the development application fee from the NSW scale for 2026/27 (none for complying development), the long
        service levy (0.25% of work costing $250,000 or more; owner-builders can apply for up to half off), and the council’s development contribution where the
        app has its plan (Wollongong’s section 7.12 levy so far). Put the council’s own figure on a line once you have it.
      </p>
      <h3>Owner-builder in NSW</h3>
      <p className="small">
        Work worth more than {money(OWNER_BUILDER.permitOver)} (GST included) needs an owner-builder permit; over {money(OWNER_BUILDER.courseOver)} you also need the approved
        course. The permit is {money(OWNER_BUILDER.permitFee)} for a year from July 2026. Checked on nsw.gov.au in {RATES_AS_AT}.
      </p>
      <h3>Not included</h3>
      <p className="small">The land and stamp duty, water and sewer contributions, contributions the app has no figure for, heating and cooling, window coverings, furniture, a pool, and anything not drawn.</p>
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
                <span className="chip-label">All in</span> <b className="tnum">{money(e.perM2)}</b> <span className="chip-label">per m²</span>
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
