// One quiet line of the key numbers under the top bar. Each chip goes to the panel that is
// its number's home; a chip steps back to a dashed label when the open panel or the plan
// already shows its number (CALM 5). Out of balance is the one loud chip, with its fix.

import type { ReactNode } from 'react'
import { retainedText } from '../components/planNumbers'
import { Icon } from '../nav/icons'
import { areaById, type NumberId } from '../nav/menu'
import { navigate } from '../nav/router'
import { tabRoute, type AppRoute } from '../nav/route'
import { ENGINEER_HEIGHT } from '../plan/keyNumbers'
import { TO_CHECK_ID, useSiteWarnings } from '../site/sync'
import { m2, netText } from './format'
import type { KeyNumbers } from './useKeyNumbers'
import type { Council } from '../checks/councils'
import type { CheckCounts } from '../checks/rules'
import { checkedAgainst } from '../checks/settings'
import type { Pathway } from '../checks/types'

/** Where each number lives. */
const HOME: Record<NumberId, [AppRoute['area'], string]> = {
  'floor-area': ['design', 'rooms'],
  ffl: ['earthworks', 'place'],
  'cut-fill': ['earthworks', 'cut-fill'],
  retaining: ['earthworks', 'retaining-walls'],
  'roof-height': ['design', 'roofs'],
  warnings: ['earthworks', 'cut-fill'],
  checks: ['design', 'checks'],
  'site-checks': ['site', 'features'],
  cost: ['costs', 'estimate'],
}

interface Props {
  route: AppRoute
  numbers: KeyNumbers | null
  /** The compliance checks' tally for the chosen pathway. */
  checks?: { pathway: Pathway; council: Council | null; counts: CheckCounts }
  /** Numbers already in view: on the plan or in the open panel or inspector, and where. */
  shown: Partial<Record<NumberId, string>>
  onBalance: () => void
  onOverview: () => void
  overviewOpen: boolean
  /** A shared view (src/share-links): the same numbers, as plain labels, with nothing to go to or change. */
  readOnly?: boolean
}

function Chip({ id, label, shown, children, title, route, readOnly }: { id: NumberId; label: string; shown?: string; children: ReactNode; title?: string; route: AppRoute; readOnly?: boolean }) {
  const [area, tab] = HOME[id]
  const go = () => navigate({ kind: 'app', area, tab, view: areaById(area)!.tabs.find(t => t.id === tab)?.view ?? route.view, level: route.level, sel: route.sel })
  if (shown)
    return (
      <span className="chip ghost" title={`${label} is ${shown}`}>
        {label} <em>{shown}</em>
      </span>
    )
  if (readOnly)
    return (
      <span className="chip" title={title}>
        <span className="chip-label">{label}</span> {children}
      </span>
    )
  return (
    <button className="chip" onClick={go} title={title}>
      <span className="chip-label">{label}</span> {children}
    </button>
  )
}

export function SummaryStrip({ route, numbers: n, checks, shown, onBalance, onOverview, overviewOpen, readOnly = false }: Props) {
  // Easements and tree zones the plan reaches into: the amber ones only, as Site features counts them.
  const siteChecks = useSiteWarnings().filter(w => w.severity === 'attn').length
  return (
    <div className="summary-strip" role="region" aria-label="Key numbers">
      <div className="chips">
        {!n ? (
          <span className="chip ghost">Key numbers show once the survey and plan load.</span>
        ) : (
          <>
            {n.floorArea !== null && (
              <Chip id="floor-area" label="Floor" shown={shown['floor-area']} route={route} readOnly={readOnly} title={n.levels.map(l => `${l.name}: ${m2(l.area)}`).join('\n')}>
                <b>{m2(n.floorArea)}</b>
              </Chip>
            )}
            <Chip id="ffl" label="FFL" shown={shown.ffl} route={route} readOnly={readOnly} title="Ground floor level">
              <b>RL {n.ffl.toFixed(2)}</b>
            </Chip>
            {n.earth &&
              (n.earth.outOfBalance && !shown['cut-fill'] && readOnly ? (
                <span className="chip attn">
                  <Icon name="warn" size={14} />
                  <span className="attn-text">
                    Out of balance<span className="attn-net"> · {netText(n.earth.net)}</span>
                  </span>
                </span>
              ) : n.earth.outOfBalance && !shown['cut-fill'] ? (
                <span className="chip attn">
                  <Icon name="warn" size={14} />
                  <button className="attn-text" onClick={() => navigate({ kind: 'app', area: 'earthworks', tab: 'cut-fill', view: 'plan', level: route.level, sel: route.sel })}>
                    Out of balance<span className="attn-net"> · {netText(n.earth.net)}</span>
                  </button>
                  <button className="act" onClick={onBalance} title={`Move the floor to RL ${n.earth.balancedRL?.toFixed(2)}, where cut and fill are about equal`}>
                    Balance
                  </button>
                </span>
              ) : (
                <Chip id="cut-fill" label="Cut · fill" shown={shown['cut-fill']} route={route} readOnly={readOnly}>
                  <b>
                    {n.earth.cut.toFixed(1)} · {n.earth.fill.toFixed(1)} m³
                  </b>
                </Chip>
              ))}
            {n.retaining && (
              <Chip id="retaining" label="Tallest wall" shown={shown.retaining} route={route} readOnly={readOnly} title={`Holds back up to ${retainedText(n.retaining.maxHeight)}`}>
                <b>{n.retaining.maxHeight.toFixed(2)} m</b>
                {n.retaining.engineer && <span className="badge warn">Engineer &gt; {ENGINEER_HEIGHT.toFixed(0)} m</span>}
              </Chip>
            )}
            {n.roof && (
              <Chip id="roof-height" label="Roof" shown={shown['roof-height']} route={route} readOnly={readOnly} title="The most the roof rises above the natural ground under it">
                <b>{n.roof.height.toFixed(2)} m</b> above ground
              </Chip>
            )}
            {n.batters &&
              (readOnly && !shown.warnings ? (
                <span className="chip warn" title={`The earthworks run past ${n.batters}.`}>
                  <i className="dot" /> Batters cross {n.batters}
                </span>
              ) : shown.warnings ? (
                <span className="chip ghost">
                  Batters <em>{shown.warnings}</em>
                </span>
              ) : (
                <button
                  className="chip warn"
                  onClick={() => navigate({ kind: 'app', area: 'earthworks', tab: 'cut-fill', view: 'plan', level: route.level, sel: route.sel })}
                  title={`The earthworks run past ${n.batters}. Hold them back with a retaining wall, or move the house.`}
                >
                  <i className="dot" /> Batters cross {n.batters}
                </button>
              ))}
            {checks && <ChecksChip checks={checks} shown={shown.checks} route={route} readOnly={readOnly} />}
            {siteChecks > 0 &&
              (readOnly && !shown['site-checks'] ? (
                <span className="chip warn" title="Easements and tree protection zones the house, driveway or cut and fill reach into.">
                  <i className="dot" /> {siteChecks} to check
                </span>
              ) : shown['site-checks'] ? (
                <span className="chip ghost">
                  To check <em>{shown['site-checks']}</em>
                </span>
              ) : (
                <button
                  className="chip warn"
                  onClick={() => navigate(tabRoute(route, 'site', 'features'), { focus: TO_CHECK_ID })}
                  title="Easements and tree protection zones the house, driveway or cut and fill reach into. Opens Site › Features."
                >
                  <i className="dot" /> {siteChecks} to check
                </button>
              ))}
          </>
        )}
      </div>
      <button className={`overview-button${overviewOpen ? ' on' : ''}`} onClick={onOverview} aria-expanded={overviewOpen}>
        Overview <Icon name={overviewOpen ? 'chevU' : 'chevD'} size={14} />
      </button>
    </div>
  )
}

/** The checks: a warning chip when something fails or needs checking, otherwise a quiet label (the strip is crowded on a phone). */
export function ChecksChip({ checks: { pathway, council, counts }, shown, route, readOnly = false }: { checks: { pathway: Pathway; council: Council | null; counts: CheckCounts }; shown?: string; route: AppRoute; readOnly?: boolean }) {
  const name = pathway === 'cdc' ? 'CDC' : 'DA'
  const go = () => navigate({ kind: 'app', area: 'design', tab: 'checks', view: route.view, level: route.level, sel: route.sel })
  const loud = counts.fail + counts.warn > 0
  const against = checkedAgainst(pathway, council)
  if (shown || !loud) {
    // A design that isn't drawn enough to check says so before anything passes.
    const text = counts.incomplete ? `${counts.incomplete} not drawn yet` : counts.unknown ? `${counts.unknown} need${counts.unknown > 1 ? '' : 's'} a fact` : 'pass'
    if (readOnly && !shown)
      return (
        <span className="chip ghost" title={against}>
          {name} checks <em>{text}</em>
        </span>
      )
    return shown ? (
      <span className="chip ghost" title={`The ${name} checks are ${shown}`}>
        {name} checks <em>{shown}</em>
      </span>
    ) : (
      <button className="chip ghost" onClick={go} title={against}>
        {name} checks <em>{text}</em>
      </button>
    )
  }
  const parts = [counts.fail && `${counts.fail} fail${counts.fail > 1 ? 's' : ''}`, counts.warn && `${counts.warn} to check`].filter(Boolean).join(' · ')
  if (readOnly)
    return (
      <span className={`chip ${counts.fail ? 'fail' : 'warn'}`} title={against}>
        <i className="dot" /> {name} checks · {parts}
      </span>
    )
  return (
    <button className={`chip ${counts.fail ? 'fail' : 'warn'}`} onClick={go} title={against}>
      <i className="dot" /> {name} checks · {parts}
    </button>
  )
}
