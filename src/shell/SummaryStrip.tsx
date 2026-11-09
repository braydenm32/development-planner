// One quiet line of the key numbers under the top bar. Each chip goes to the panel that is
// its number's home; a chip steps back to a label pointing at where the number already shows
// ("Floor → panel") when the open panel or the plan has it (CALM 5). Out of balance is the one
// loud chip, with its fix.

import type { ReactNode, RefObject } from 'react'
import { retainedText } from '../components/planNumbers'
import { Icon } from '../nav/icons'
import { areaById, type NumberId } from '../nav/menu'
import { navigate } from '../nav/router'
import { tabRoute, type AppRoute } from '../nav/route'
import { ENGINEER_TEXT } from '../checks/engineer'
import { TO_CHECK_ID, useSiteWarnings } from '../site/sync'
import { m2, netText, whereShown } from './format'
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
  /** What the strip says in place of the numbers while there are none (see ./drawn.ts). */
  emptyText?: string
}

function Chip({ id, label, shown, children, title, term, route, readOnly }: { id: NumberId; label: string; shown?: string; children: ReactNode; title?: string; term?: string; route: AppRoute; readOnly?: boolean }) {
  const [area, tab] = HOME[id]
  const go = () => navigate({ kind: 'app', area, tab, view: areaById(area)!.tabs.find(t => t.id === tab)?.view ?? route.view, level: route.level, sel: route.sel })
  // A chip whose label is a planning word says what it means (src/guide/Term.tsx), with its own note under that.
  const tip = term ? { 'data-term': term, 'data-term-note': title } : { title }
  if (shown)
    return (
      <span className="chip ghost" {...(term ? { 'data-term': term, 'data-term-note': `${label} is ${shown}` } : { title: `${label} is ${shown}` })}>
        {label} <em>{whereShown(shown)}</em>
      </span>
    )
  if (readOnly)
    return (
      <span className="chip" {...tip}>
        <span className="chip-label">{label}</span> {children}
      </span>
    )
  return (
    <button className="chip" onClick={go} {...tip}>
      <span className="chip-label">{label}</span> {children}
    </button>
  )
}

export function SummaryStrip({ route, numbers: n, checks, shown, onBalance, onOverview, overviewOpen, readOnly = false, emptyText = 'Key numbers show once the survey and plan load.' }: Props) {
  // Easements and tree zones the plan reaches into: the amber ones only, as Site features counts them.
  const siteChecks = useSiteWarnings().filter(w => w.severity === 'attn').length
  return (
    <div className="summary-strip" role="region" aria-label="Key numbers">
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
                {n.floorArea !== null && (
                  <Chip id="floor-area" label="Floor" shown={shown['floor-area']} route={route} readOnly={readOnly} title={n.levels.map(l => `${l.name}: ${m2(l.area)}`).join('\n')}>
                    <b>{m2(n.floorArea)}</b>
                  </Chip>
                )}
                <Chip id="ffl" label="FFL" shown={shown.ffl} route={route} readOnly={readOnly} term="ffl" title="Ground floor level">
                  <b>RL {n.ffl.toFixed(2)}</b>
                </Chip>
                {n.earth &&
                  (n.earth.outOfBalance && !shown['cut-fill'] && readOnly ? (
                    <span className="chip attn">
                      <Icon name="warn" size={14} />
                      <span className="attn-text" data-term="out-of-balance">
                        Out of balance<span className="attn-net"> · {netText(n.earth.net)}</span>
                      </span>
                    </span>
                  ) : n.earth.outOfBalance && !shown['cut-fill'] ? (
                    <span className="chip attn">
                      <Icon name="warn" size={14} />
                      <button className="attn-text" data-term="out-of-balance" onClick={() => navigate({ kind: 'app', area: 'earthworks', tab: 'cut-fill', view: 'plan', level: route.level, sel: route.sel })}>
                        Out of balance<span className="attn-net"> · {netText(n.earth.net)}</span>
                      </button>
                      <button className="act" onClick={onBalance} title={`Move the floor to RL ${n.earth.balancedRL?.toFixed(2)}, where cut and fill are about equal`}>
                        Balance
                      </button>
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
                    label="Tallest wall"
                    shown={shown.retaining}
                    route={route}
                    readOnly={readOnly}
                    term="retaining-wall"
                    title={`Holds back up to ${retainedText(n.retaining.maxHeight)}${n.retaining.impliedTallest ? '. An implied wall: a vertical edge of the cut and fill, not drawn yet.' : ''}`}
                  >
                    <b>{n.retaining.maxHeight.toFixed(2)} m</b>
                    {n.retaining.impliedTallest && <em className="chip-note"> implied</em>}
                    {n.retaining.engineer && <span className="badge warn">Engineer &gt; {ENGINEER_TEXT}</span>}
                  </Chip>
                )}
                {n.roof && (
                  <Chip id="roof-height" label="Roof" shown={shown['roof-height']} route={route} readOnly={readOnly} term="height" title="The most the roof rises above the natural ground under it">
                    <b>{n.roof.height.toFixed(2)} m</b>
                  </Chip>
                )}
                {n.batters &&
                  (readOnly && !shown.warnings ? (
                    <span className="chip warn" data-term="batter" data-term-note={`The earthworks run past ${n.batters}.`}>
                      <i className="dot" /> Batters cross {n.batters}
                    </span>
                  ) : shown.warnings ? (
                    <span className="chip ghost" data-term="batter">
                      Batters <em>{whereShown(shown.warnings)}</em>
                    </span>
                  ) : (
                    <button
                      className="chip warn"
                      onClick={() => navigate({ kind: 'app', area: 'earthworks', tab: 'cut-fill', view: 'plan', level: route.level, sel: route.sel })}
                      data-term="batter"
                      data-term-note={`The earthworks run past ${n.batters}. Hold them back with a retaining wall, or move the house.`}
                    >
                      <i className="dot" /> Batters cross {n.batters}
                    </button>
                  ))}
                {checks && <ChecksChip checks={checks} shown={shown.checks} route={route} readOnly={readOnly} />}
                {siteChecks > 0 &&
                  (readOnly && !shown['site-checks'] ? (
                    <span className="chip warn" title="Easements and tree protection zones the house, driveway or cut and fill reach into.">
                      <i className="dot" /> Site · {siteChecks} to check
                    </span>
                  ) : shown['site-checks'] ? (
                    <span className="chip ghost">
                      Site checks <em>{whereShown(shown['site-checks'])}</em>
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

/** The checks: a warning chip when something fails or needs checking, otherwise a quiet label (the strip is crowded on a phone). */
export function ChecksChip({ checks: { pathway, council, counts }, shown, route, readOnly = false }: { checks: { pathway: Pathway; council: Council | null; counts: CheckCounts }; shown?: string; route: AppRoute; readOnly?: boolean }) {
  const name = pathway === 'cdc' ? 'CDC' : 'DA'
  const term = pathway === 'cdc' ? 'cdc' : 'da'
  const go = () => navigate({ kind: 'app', area: 'design', tab: 'checks', view: route.view, level: route.level, sel: route.sel })
  const loud = counts.fail + counts.warn > 0
  const against = checkedAgainst(pathway, council)
  if (shown || !loud) {
    // A design that isn't drawn enough to check says so before anything passes.
    const text = counts.incomplete ? `${counts.incomplete} not drawn yet` : counts.unknown ? `${counts.unknown} fact${counts.unknown > 1 ? 's' : ''} to add` : 'OK'
    if (readOnly && !shown)
      return (
        <span className="chip ghost" data-term={term} data-term-note={against}>
          {name} checks <em>{text}</em>
        </span>
      )
    return shown ? (
      <span className="chip ghost" data-term={term} data-term-note={`The ${name} checks are ${shown}`}>
        {name} checks <em>{whereShown(shown)}</em>
      </span>
    ) : (
      <button className="chip ghost" onClick={go} data-term={term} data-term-note={against}>
        {name} checks <em>{text}</em>
      </button>
    )
  }
  const parts = [counts.fail && `${counts.fail} to fix`, counts.warn && `${counts.warn} to confirm`].filter(Boolean).join(' · ')
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
