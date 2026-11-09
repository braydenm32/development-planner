// Every key number in one place: the checks' verdict and the estimate at the top, then Site,
// House (every level's floor), Earthworks and the roofs (each one). Each number is
// the one its home panel shows, from the same helper and in the same format (CALM 8).

import { useEffect, useRef, type ReactNode } from 'react'
import { FragmentRow } from '../components/PlanSections'
import { retainedText } from '../components/planNumbers'
import { SiteFacts } from '../components/SiteSections'
import { Icon, type IconName } from '../nav/icons'
import { navigate } from '../nav/router'
import type { AppRoute } from '../nav/route'
import { ENGINEER_TEXT } from '../checks/engineer'
import { sideLabel } from '../plan/keyNumbers'
import { overText } from '../plan/setbacks'
import type { SiteStats } from '../lib/terrain'
import { shortMoney } from '../costs/format'
import { m2, netText } from './format'
import type { ChecksHeadline, CostHeadline } from './headline'
import { balanceWords } from './SummaryStrip'
import type { KeyNumbers, RoofNumbers } from './useKeyNumbers'
import { hoursText, overText as shadowText, type SunFacts } from '../sun/facts'
import { selectOnPlan } from './useSite'

const ROOF_NAMES = { hip: 'Hip', gable: 'Gable', skillion: 'Skillion', flat: 'Flat' }

interface Props {
  numbers: KeyNumbers | null
  stats: SiteStats | null
  onBalance: () => void
  onClose: () => void
  /** A shared view (src/share-links): every number, with nothing to open or change. */
  readOnly?: boolean
  /** The DA or CDC checks' verdict, in Approvals › Checks' words. */
  verdict?: ChecksHeadline
  /** The estimate's total; left out where there's no estimate. */
  cost?: CostHeadline
}

function Group({ icon, title, to, action, children }: { icon: IconName; title: string; to?: AppRoute; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="ov-group">
      <h3>
        <Icon name={icon} size={17} />
        <span>{title}</span>
        {action}
        {to && !action && (
          <button className="link quiet" onClick={() => navigate(to)}>
            Open
          </button>
        )}
      </h3>
      {children}
    </section>
  )
}

export function OverviewSheet({ numbers: n, stats, onBalance, onClose, readOnly = false, verdict, cost }: Props) {
  const sheet = useRef<HTMLDivElement>(null)
  // Focus the sheet so Escape and Tab work in it, and give focus back when it closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    sheet.current?.focus()
    return () => before?.focus?.()
  }, [])
  // In a shared view the groups have nowhere to go.
  const at = (area: AppRoute['area'], tab: string, view: AppRoute['view'] = 'plan'): AppRoute | undefined => (readOnly ? undefined : { kind: 'app', area, tab, view })
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        ref={sheet}
        className="overview-sheet"
        role="dialog"
        aria-label="Overview: every key number"
        tabIndex={-1}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <div className="sheet-grab" aria-hidden="true" />
        <header>
          <h2>Overview</h2>
          <span className="muted">Every key number in one place</span>
          <button className="icon-button" onClick={onClose} aria-label="Close the overview">
            <Icon name="x" size={18} />
          </button>
        </header>
        {(verdict || cost) && (
          <div className="ov-verdicts">
            {verdict && (
              <Verdict
                className={`w-${verdict.word}`}
                label={verdict.name === 'CDC' ? 'Complying development (CDC) checks' : 'Development application (DA) checks'}
                term={verdict.term}
                value={verdict.head}
                note={verdict.rest}
                to={readOnly ? undefined : () => navigate({ kind: 'app', area: 'approvals', tab: 'checks', view: 'plan' })}
              />
            )}
            {cost && (
              <Verdict
                label="Estimate"
                value={cost.ready ? shortMoney(cost.total) : 'No total yet'}
                note={cost.ready ? `likely ${shortMoney(cost.low)} to ${shortMoney(cost.high)}${cost.missing.length ? ` · incomplete: no ${cost.missing.join(', no ')}` : ''}` : 'Draw the house’s outside walls to start it.'}
                to={readOnly ? undefined : () => navigate({ kind: 'app', area: 'costs', tab: 'estimate', view: 'plan' })}
              />
            )}
          </div>
        )}
        <div className="ov-cols">
          <div>
            <Group icon="site" title="Site" to={at('site', 'block', '3d')}>
              {stats ? <SiteFacts stats={stats} /> : <p className="muted small">The survey could not be read.</p>}
            </Group>
            {n && (
              <Group icon="design" title="House" to={at('design', 'rooms')}>
                <dl className="stats">
                  {n.levels.map(l => (
                    <FragmentRow key={l.id} label={n.levels.length > 1 ? `Floor area, ${l.name}` : 'Floor area (outside of walls)'} value={m2(l.area)} strong />
                  ))}
                  {n.levels.length > 1 && n.floorArea !== null && <FragmentRow label="Floor area, all levels" value={m2(n.floorArea)} strong />}
                  {n.levels.some(l => l.rooms > 0) && <FragmentRow label="Rooms total" value={m2(n.levels.reduce((t, l) => t + l.roomsTotal, 0))} />}
                  {n.floors.length > 1 ? (
                    n.floors.map(f => <FragmentRow key={f.id} label={`Floor level (FFL), ${f.name}`} value={`RL ${f.rl.toFixed(2)}`} />)
                  ) : (
                    <FragmentRow label="Floor level (FFL)" value={`RL ${n.ffl.toFixed(2)}`} />
                  )}
                  {n.placement && <FragmentRow label="Ground under the house" value={`RL ${n.placement.minRL.toFixed(2)} to ${n.placement.maxRL.toFixed(2)}`} />}
                </dl>
                {n.placement && (
                  <>
                    <h4>Distance to boundary</h4>
                    <dl className="stats">
                      {n.placement.sides.map((s, i) => (
                        <FragmentRow key={i} label={sideLabel(n.placement!.sides, s)} value={s.over > 0 ? overText(s.over) : `${s.dist.toFixed(2)} m`} bad={s.over > 0} />
                      ))}
                    </dl>
                  </>
                )}
                {n.batters && (
                  <div className="ov-problem">
                    <span className="chip warn">
                      <Icon name="warn" size={14} /> Earth slopes (batters) cross {n.batters}
                    </span>
                    {!readOnly && (
                      <button className="primary" onClick={() => navigate(at('earthworks', 'retaining-walls')!)}>
                        Hold them back
                      </button>
                    )}
                  </div>
                )}
              </Group>
            )}
          </div>
          <div>
            {n && (
              <Group icon="earth" title="Earthworks" to={at('earthworks', 'cut-fill')}>
                {n.earth ? (
                  <>
                    <dl className="stats">
                      <FragmentRow label="Cut" value={`${n.earth.cut.toFixed(1)} m³`} strong />
                      <FragmentRow label="Fill" value={`${n.earth.fill.toFixed(1)} m³`} strong />
                      <FragmentRow label="House pad (under the slab)" value={`RL ${n.earth.pad.toFixed(2)}`} />
                      <FragmentRow label="Deepest cut" value={`${n.earth.deepestCut.toFixed(2)} m`} />
                      <FragmentRow label="Deepest fill" value={`${n.earth.deepestFill.toFixed(2)} m`} />
                    </dl>
                    {n.earth.outOfBalance ? (
                      <div className="ov-problem">
                        <span className="chip attn">
                          <Icon name="warn" size={14} /> Out of balance · {netText(n.earth.net)}
                        </span>
                        {!readOnly && (
                          <button className="primary" onClick={onBalance} title="Moves the floor to where cut and fill are about equal, so less earth is trucked away or brought in">
                            {balanceWords(n.ffl, n.earth.balancedRL)}
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="muted small">Cut and fill are in balance: {netText(n.earth.net)}.</p>
                    )}
                  </>
                ) : (
                  <p className="muted small">{readOnly ? 'No cut or fill yet.' : 'Draw walls on the lowest level, or a concrete slab, to see cut and fill.'}</p>
                )}
                {n.retaining && (
                  <>
                    <h4>Retaining walls</h4>
                    <dl className="stats">
                      {n.retaining.count > 0 && <FragmentRow label={`${n.retaining.count} wall${n.retaining.count > 1 ? 's' : ''}, total length`} value={`${n.retaining.length.toFixed(1)} m`} />}
                      {n.retaining.implied && (
                        <FragmentRow label={`${n.retaining.implied.count} implied wall${n.retaining.implied.count > 1 ? 's' : ''}, not drawn`} value={`${n.retaining.implied.length.toFixed(1)} m`} />
                      )}
                      <FragmentRow label="Holds back up to" value={`${retainedText(n.retaining.maxHeight)}${n.retaining.impliedTallest ? ' (implied)' : ''}`} strong />
                      {n.retaining.count > 0 && <FragmentRow label="Face, ground to ground" value={`${n.retaining.face.toFixed(1)} m²`} />}
                    </dl>
                    {n.retaining.engineer && <p className="notice small">Engineer needed: a wall holds back over {ENGINEER_TEXT}.</p>}
                  </>
                )}
              </Group>
            )}
            {n && (
              <Group
                icon="roof"
                title={n.roofs.length > 1 ? 'Roofs' : 'Roof'}
                to={at('design', 'roofs')}
                action={
                  n.roof && !readOnly ? (
                    <button className="secondary-sm" onClick={() => {
                        onClose()
                        selectOnPlan(n.roof!.roof.level, { type: 'roof', id: n.roof!.roof.id })
                      }}>
                      Open roof
                    </button>
                  ) : undefined
                }
              >
                {n.roof ? (
                  <>
                    <dl className="stats">
                      <FragmentRow label="Building height (highest roof above the ground)" value={`${n.roof.height.toFixed(2)} m`} strong />
                      {n.roofs.length > 1 && <FragmentRow label={`Roof area, all ${n.roofs.length} roofs`} value={`${n.roofArea.toFixed(1)} m²`} strong />}
                    </dl>
                    {n.roofs.map((r, i) => (
                      <RoofRows key={r.roof.id} r={r} n={n.roofs.length > 1 ? i + 1 : 0} />
                    ))}
                  </>
                ) : (
                  <p className="muted small">No roof yet.</p>
                )}
              </Group>
            )}
            {n?.sun && (
              <Group icon="sun" title="Sun on 21 June" to={at('site', 'sun', '3d')}>
                <SunNumbers sun={n.sun} />
              </Group>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/** The checks' verdict or the estimate, big, at the top: what people open the Overview to find. */
function Verdict({ label, value, note, term, className = '', to }: { label: string; value: string; note?: string; term?: string; className?: string; to?: () => void }) {
  const body = (
    <>
      <span className="ov-v-label" data-term={term}>
        {label}
      </span>
      <b>{value}</b>
      {note && <span className="ov-v-note">{note}</span>}
    </>
  )
  return to ? (
    <button className={`ov-verdict ${className}`} onClick={to}>
      {body}
    </button>
  ) : (
    <div className={`ov-verdict ${className}`}>{body}</div>
  )
}

/** One roof: its shape, pitch and area, its top and its height above the ground. */
function RoofRows({ r, n }: { r: RoofNumbers; n: number }) {
  const shape = ROOF_NAMES[r.roof.type]
  return (
    <>
      {n > 0 && <h4>Roof {n}</h4>}
      <dl className="stats">
        <FragmentRow
          label={r.roof.type === 'flat' ? 'Flat · area' : `${shape} · pitch · area`}
          value={r.roof.type === 'flat' ? `${r.area.toFixed(1)} m²` : `${r.roof.pitch.toFixed(1)}° · ${r.area.toFixed(1)} m²`}
        />
        <FragmentRow label="Top of roof" value={`RL ${r.top.toFixed(2)}`} />
        {n > 0 && <FragmentRow label="Above the ground" value={`${r.height.toFixed(2)} m`} />}
      </dl>
    </>
  )
}

/** Winter sun to each living area, and where the house's shadow goes from 9 to 3. */
function SunNumbers({ sun }: { sun: SunFacts }) {
  if (sun.empty) return <p className="muted small">No walls yet to cast a shadow.</p>
  return (
    <>
      {sun.rooms.length > 0 ? (
        <dl className="stats">
          {sun.rooms.map(r => (
            <FragmentRow key={r.room} label={`${r.name}, sun on its windows`} value={hoursText(r.hours)} strong />
          ))}
        </dl>
      ) : (
        <p className="muted small">No living areas yet.</p>
      )}
      <p className="muted small">{shadowText(sun)}</p>
    </>
  )
}
