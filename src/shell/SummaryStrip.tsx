// One quiet line of the key numbers under the top bar. Each chip goes to the panel that is
// its number's home. A number the open panel or the plan already shows keeps its value, dimmed,
// with where else it is in its tooltip (C33): an arrow read as a link or an error. Every label
// says what it is in plain words first, with the planning term after it (C36). Out of balance is
// the one loud chip, and its button says what Balance will do.
//
// Share has a strip of its own (`variant="share"`): the numbers that go on the plans, with
// nothing to change from there. Costs has its own too (src/costs/CostsTabs.tsx).

import type { ReactNode, RefObject } from 'react'
import { retainedText } from '../components/planNumbers'
import { shortMoney } from '../costs/format'
import { Icon } from '../nav/icons'
import { areaById, type NumberId } from '../nav/menu'
import { navigate } from '../nav/router'
import { tabRoute, type AppRoute } from '../nav/route'
import { ENGINEER_TEXT } from '../checks/engineer'
import { TO_CHECK_ID, useSiteWarnings } from '../site/sync'
import { m2, netText } from './format'
import { balanceWords, floorsText, type ChecksHeadline, type CostHeadline } from './headline'
import type { KeyNumbers } from './useKeyNumbers'
import type { Council } from '../checks/councils'
import type { CheckCounts } from '../checks/rules'
import { checkedAgainst } from '../checks/settings'
import type { Pathway } from '../checks/types'
import { ScrollCue } from './ScrollCue'

/** Where each number lives. */
const HOME: Record<NumberId, [AppRoute['area'], string]> = {
  'floor-area': ['design', 'rooms'],
  ffl: ['earthworks', 'place'],
  'cut-fill': ['earthworks', 'cut-fill'],
  retaining: ['earthworks', 'retaining-walls'],
  'roof-height': ['design', 'roofs'],
  warnings: ['earthworks', 'cut-fill'],
  checks: ['approvals', 'checks'],
  'site-checks': ['site', 'features'],
  cost: ['costs', 'estimate'],
}

interface Props {
  route: AppRoute
  numbers: KeyNumbers | null
  /** The compliance checks' tally for the chosen pathway. */
  checks?: { pathway: Pathway; council: Council | null; counts: CheckCounts }
  /** The same checks' verdict, in Approvals › Checks' words. */
  verdict?: ChecksHeadline
  /** The estimate's total, where there is one. */
  cost?: CostHeadline
  /** Numbers already in view: on the plan or in the open panel or inspector, and where. */
  shown: Partial<Record<NumberId, string>>
  onBalance: () => void
  onOverview: () => void
  overviewOpen: boolean
  /** A shared view (src/share-links): the same numbers, as plain labels, with nothing to go to or change. */
  readOnly?: boolean
  /** Share's own strip: what goes on the plans, with no fixes offered. */
  variant?: 'share'
  /** The level being drawn on, so a house of several levels says that level's floor first. */
  level?: string
  /** What the strip says in place of the numbers while there are none (see ./drawn.ts). */
  emptyText?: string
}

function Chip({ id, label, shown, children, title, term, route, readOnly }: { id: NumberId; label: string; shown?: string; children: ReactNode; title?: string; term?: string; route: AppRoute; readOnly?: boolean }) {
  const [area, tab] = HOME[id]
  const go = () => navigate({ kind: 'app', area, tab, view: areaById(area)!.tabs.find(t => t.id === tab)?.view ?? route.view, level: route.level, sel: route.sel })
  // A chip whose label is a planning word says what it means (src/guide/Term.tsx), with its own note under that.
  const note = shown ? [title, `Also ${shown}.`].filter(Boolean).join(' ') : title
  const tip = term ? { 'data-term': term, 'data-term-note': note } : { title: note }
  const body = (
    <>
      <span className="chip-label">{label}</span> {children}
    </>
  )
  // Already in view: still there to read, quieter, and no need to go anywhere for it.
  if (shown)
    return (
      <span className="chip echo" {...tip}>
        {body}
      </span>
    )
  if (readOnly)
    return (
      <span className="chip" {...tip}>
        {body}
      </span>
    )
  return (
    <button className="chip" onClick={go} {...tip}>
      {body}
    </button>
  )
}

export function SummaryStrip({ route, numbers: n, checks, verdict, cost, shown, onBalance, onOverview, overviewOpen, readOnly = false, variant, level, emptyText = 'Key numbers show once the survey and plan load.' }: Props) {
  // Easements and tree zones the plan reaches into: the amber ones only, as Site features counts them.
  const siteChecks = useSiteWarnings().filter(w => w.severity === 'attn').length
  const share = variant === 'share'
  // In Share nothing is changed from the strip: the earthworks' fix waits in Earthworks.
  const calm = readOnly || share
  // A house of several levels: the floor being drawn first, then all of them.
  const here = n && n.levels.length > 1 && level ? n.levels.find(l => l.id === level) : undefined
  return (
    <div className={`summary-strip${share ? ' share-strip' : ''}`} role="region" aria-label="Key numbers">
      <ScrollCue
        className="chips-cue"
        label="numbers"
        count
        render={ref => (
          <div className="chips" ref={ref as RefObject<HTMLDivElement | null>}>
            {!n ? (
              <span className="chip ghost">{emptyText}</span>
            ) : (
              <>
                {verdict && share && <VerdictChip verdict={verdict} route={route} readOnly={readOnly} />}
                {n.floorArea !== null && (
                  <Chip
                    id="floor-area"
                    label={here ? `Floor, ${here.name}` : n.levels.length > 1 ? 'Floor, all levels' : 'Floor'}
                    shown={shown['floor-area']}
                    route={route}
                    readOnly={readOnly}
                    title={n.levels.map(l => `${l.name}: ${m2(l.area)}`).join('\n')}
                  >
                    <b>{m2(here ? here.area : n.floorArea)}</b>
                    {here && <span className="chip-label">of {m2(n.floorArea)}</span>}
                  </Chip>
                )}
                <Chip id="ffl" label={n.floors.length > 1 ? 'Floor levels (FFL)' : 'Floor level (FFL)'} shown={shown.ffl} route={route} readOnly={readOnly} term="ffl" title={n.floors.length > 1 ? n.floors.map(f => `${f.name}: RL ${f.rl.toFixed(2)}`).join('\n') : 'The ground floor’s level'}>
                  <b>{floorsText(n.floors, n.ffl)}</b>
                </Chip>
                {n.roof && (
                  <Chip id="roof-height" label="Building height" shown={shown['roof-height']} route={route} readOnly={readOnly} term="height" title="The most a roof rises above the natural ground under it">
                    <b>{n.roof.height.toFixed(2)} m</b>
                  </Chip>
                )}
                {n.earth &&
                  (n.earth.outOfBalance && !shown['cut-fill'] && !calm ? (
                    <span className="chip attn">
                      <Icon name="warn" size={14} />
                      <button className="attn-text" data-term="out-of-balance" onClick={() => navigate({ kind: 'app', area: 'earthworks', tab: 'cut-fill', view: 'plan', level: route.level, sel: route.sel })}>
                        Out of balance<span className="attn-net"> · {netText(n.earth.net)}</span>
                      </button>
                      <button className="act" onClick={onBalance} title={`Move the floor to RL ${n.earth.balancedRL?.toFixed(2)}, where cut and fill are about equal, so less earth is trucked away or brought in`}>
                        {balanceWords(n.ffl, n.earth.balancedRL)}
                      </button>
                    </span>
                  ) : n.earth.outOfBalance && !shown['cut-fill'] && readOnly ? (
                    <span className="chip attn">
                      <Icon name="warn" size={14} />
                      <span className="attn-text" data-term="out-of-balance">
                        Out of balance<span className="attn-net"> · {netText(n.earth.net)}</span>
                      </span>
                    </span>
                  ) : (
                    <Chip id="cut-fill" label="Cut · fill" shown={shown['cut-fill']} route={route} readOnly={readOnly} term="cut-fill">
                      <b>
                        {n.earth.cut.toFixed(1)} · {n.earth.fill.toFixed(1)} m³
                      </b>
                    </Chip>
                  ))}
                {n.retaining && (
                  <Chip
                    id="retaining"
                    label="Retained"
                    shown={shown.retaining}
                    route={route}
                    readOnly={readOnly}
                    term="retaining-wall"
                    title={`The most earth a retaining wall holds back. Holds back up to ${retainedText(n.retaining.maxHeight)}${n.retaining.impliedTallest ? '. An implied wall: a vertical edge of the cut and fill, not drawn yet.' : ''}`}
                  >
                    <b>{n.retaining.maxHeight.toFixed(2)} m</b>
                    {n.retaining.impliedTallest && <em className="chip-note"> implied</em>}
                    {n.retaining.engineer && <span className="badge warn">Engineer &gt; {ENGINEER_TEXT}</span>}
                  </Chip>
                )}
                {n.batters &&
                  (calm && !shown.warnings ? (
                    <span className="chip warn" data-term="batter" data-term-note={`The earthworks run past ${n.batters}: the slopes of earth at the edges of the cut and fill.`}>
                      <i className="dot" /> Earth slopes (batters) cross {n.batters}
                    </span>
                  ) : shown.warnings ? (
                    <span className="chip echo warn" data-term="batter" data-term-note={`The earthworks run past ${n.batters}: the slopes of earth at the edges of the cut and fill. Also ${shown.warnings}.`}>
                      <i className="dot" /> Earth slopes (batters) cross {n.batters}
                    </span>
                  ) : (
                    <button
                      className="chip warn"
                      onClick={() => navigate({ kind: 'app', area: 'earthworks', tab: 'cut-fill', view: 'plan', level: route.level, sel: route.sel })}
                      data-term="batter"
                      data-term-note={`The earthworks run past ${n.batters}: the slopes of earth at the edges of the cut and fill. Hold them back with a retaining wall, or move the house.`}
                    >
                      <i className="dot" /> Earth slopes (batters) cross {n.batters}
                    </button>
                  ))}
                {checks && !share && <ChecksChip checks={checks} shown={shown.checks} route={route} readOnly={readOnly} />}
                {cost && !shown.cost && <CostChip cost={cost} route={route} readOnly={readOnly} />}
                {siteChecks > 0 &&
                  !share &&
                  (readOnly ? (
                    <span className="chip warn" title="Easements and tree protection zones the house, driveway or cut and fill reach into.">
                      <i className="dot" /> Site · {siteChecks} to check
                    </span>
                  ) : shown['site-checks'] ? (
                    <span className="chip echo warn" title="Easements and tree protection zones the house, driveway or cut and fill reach into. Also in the panel.">
                      <i className="dot" /> Site · {siteChecks} to check
                    </span>
                  ) : (
                    <button
                      className="chip warn"
                      onClick={() => navigate(tabRoute(route, 'site', 'features'), { focus: TO_CHECK_ID })}
                      title="Easements and tree protection zones the house, driveway or cut and fill reach into. Opens Site › Features."
                    >
                      <i className="dot" /> Site · {siteChecks} to check
                    </button>
                  ))}
              </>
            )}
          </div>
        )}
      />
      <button className={`overview-button${overviewOpen ? ' on' : ''}`} onClick={onOverview} aria-expanded={overviewOpen}>
        Overview <Icon name={overviewOpen ? 'chevU' : 'chevD'} size={14} />
      </button>
    </div>
  )
}

/** The estimate's total, to its tab. */
function CostChip({ cost, route, readOnly }: { cost: CostHeadline; route: AppRoute; readOnly: boolean }) {
  if (!cost.ready) return null
  const title = `Likely ${shortMoney(cost.low)} to ${shortMoney(cost.high)}${cost.missing.length ? `. Incomplete: no ${cost.missing.join(', no ')}` : ''}`
  const body = (
    <>
      <span className="chip-label">Estimate</span> <b>{shortMoney(cost.total)}</b>
      {cost.missing.length > 0 && <span className="badge warn">Incomplete</span>}
    </>
  )
  if (readOnly)
    return (
      <span className="chip" title={title}>
        {body}
      </span>
    )
  return (
    <button className="chip" title={title} onClick={() => navigate(tabRoute(route, 'costs', 'estimate'))}>
      {body}
    </button>
  )
}

/** Share's strip leads with the verdict, as the plans' checks sheet does. */
function VerdictChip({ verdict, route, readOnly }: { verdict: ChecksHeadline; route: AppRoute; readOnly: boolean }) {
  const cls = `chip${verdict.word === 'fix' ? ' fail' : verdict.word === 'confirm' ? ' warn' : ''}`
  const body = (
    <>
      {(verdict.word === 'fix' || verdict.word === 'confirm') && <i className="dot" />}
      <span className="chip-label">{verdict.name} checks</span> <b>{verdict.head}</b>
    </>
  )
  if (readOnly)
    return (
      <span className={cls} data-term={verdict.term} data-term-note={verdict.rest}>
        {body}
      </span>
    )
  return (
    <button className={cls} data-term={verdict.term} data-term-note={verdict.rest} onClick={() => navigate(tabRoute(route, 'approvals', 'checks'))}>
      {body}
    </button>
  )
}

/** The checks: a warning chip when something fails or needs checking, otherwise a quiet label (the strip is crowded on a phone). */
export function ChecksChip({ checks: { pathway, council, counts }, shown, route, readOnly = false }: { checks: { pathway: Pathway; council: Council | null; counts: CheckCounts }; shown?: string; route: AppRoute; readOnly?: boolean }) {
  const name = pathway === 'cdc' ? 'CDC' : 'DA'
  const term = pathway === 'cdc' ? 'cdc' : 'da'
  const go = () => navigate({ kind: 'app', area: 'approvals', tab: 'checks', view: route.view, level: route.level, sel: route.sel })
  const loud = counts.fail + counts.warn > 0
  const against = checkedAgainst(pathway, council)
  const note = shown ? `${against} Also ${shown}.` : against
  const parts = [counts.fail && `${counts.fail} to fix`, counts.warn && `${counts.warn} to confirm`].filter(Boolean).join(' · ')
  if (shown || !loud) {
    // A design that isn't drawn enough to check says so before anything passes.
    const text = loud ? parts : counts.incomplete ? `${counts.incomplete} not drawn yet` : counts.unknown ? `${counts.unknown} fact${counts.unknown > 1 ? 's' : ''} to add` : 'OK'
    const cls = shown ? 'chip echo' : 'chip ghost'
    if (readOnly || shown)
      return (
        <span className={cls} data-term={term} data-term-note={note}>
          {name} checks <em>{text}</em>
        </span>
      )
    return (
      <button className={cls} onClick={go} data-term={term} data-term-note={note}>
        {name} checks <em>{text}</em>
      </button>
    )
  }
  if (readOnly)
    return (
      <span className={`chip ${counts.fail ? 'fail' : 'warn'}`} data-term={term} data-term-note={against}>
        <i className="dot" /> {name} checks · {parts}
      </span>
    )
  return (
    <button className={`chip ${counts.fail ? 'fail' : 'warn'}`} onClick={go} data-term={term} data-term-note={against}>
      <i className="dot" /> {name} checks · {parts}
    </button>
  )
}
