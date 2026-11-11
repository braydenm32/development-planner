// Earthworks › Cut & fill, results first: the pad, cut, fill, what's left over and the deepest,
// then Balance (with what it would move), the warnings, the slopes, and the grading brush, the
// suggested walls and how it all works folded away underneath. On a phone the peek shows the numbers.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { sourceWords, worksNearBoundary } from '../checks/earthSources'
import { useCheckTrees } from '../checks/siteTrees'
import { checksFor } from '../checks/useChecks'
import { Select } from '../components/fields'
import { useRetainingWalls } from '../components/planNumbers'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { DemFlag } from '../map/DemNotes'
import { useMap } from '../map/store'
import { navigate } from '../nav/router'
import { crossedBoundaries } from '../plan/keyNumbers'
import { earthworksOf, type Earthworks, type Plan } from '../plan/model'
import { housePadRL } from '../plan/platforms'
import { usePlan } from '../plan/store'
import type { Earth } from '../plan/useEarthworks'
import { useProjects } from '../projects/session'
import { showToast } from '../safety/store'
import { useSunFacts } from '../sun/useSun'
import { balancePreview, balanceRows, type BalancePreview, type CountFails } from './balance'
import { closeBalance, useBalanceAsk } from './balanceAsk'
import { BrushSection, ImpliedWalls, SuggestedWalls } from './GradingPanel'
import { BATTER_CHOICES, batterLabel, useSuggestions } from './words'
import { useBrush } from './store'
import './grading.css'

interface Props {
  plan: Plan
  survey: Survey
  terrain: Terrain
  earth: Earth | null
}

const setEarthworks = (patch: Partial<Earthworks>) => usePlan.getState().commit(p => ({ ...p, earthworks: { ...earthworksOf(p), ...patch } }))

export function CutFillPanel({ plan, survey, terrain, earth }: Props) {
  const walls = useRetainingWalls(plan, survey, terrain, earth)
  const suggestions = useSuggestions(plan, survey, earth)
  const brushOn = useBrush(s => s.on)
  const r = earth?.result
  const has = !!r && !!earth && earth.platforms.length > 0
  const crossed = has ? crossedBoundaries(r, survey) : null
  // What runs into the boundary: one line for each part of the design, so it's clear what to change.
  const culprits = useMemo(() => (crossed && earth ? worksNearBoundary(plan, earth.prep, earth.result, survey.boundary, earth.prep.natural.cell * 1.5) : []), [crossed, plan, earth, survey.boundary])
  return (
    <>
      {has ? (
        <>
          <Results plan={plan} earth={earth} />
          <DemFlag what="these volumes" />
          <BalanceBlock plan={plan} survey={survey} terrain={terrain} earth={earth} />
          {crossed && (
            <div className="notice small">
              <p>Earth slopes (batters) cross {crossed}. Add a suggested retaining wall (below), draw one there with the Retaining wall tool, or move the house.</p>
              {culprits.length > 0 && (
                <>
                  <p>What reaches the boundary:</p>
                  <ul className="cf-culprits">
                    {culprits.map(c => (
                      <li key={c.source.id}>{sourceWords(c.source).replace(/^the /, 'The ')}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          <ImpliedWalls survey={survey} earth={earth} />
        </>
      ) : (
        <p className="muted small">Draw walls on the lowest level, or a concrete slab, or paint ground with the grading brush below, to see cut and fill.</p>
      )}
      <SlopeFields plan={plan} />
      <Fold id="brush" title="Grading brush" open={brushOn || (plan.grading?.areas.length ?? 0) > 0}>
        <BrushSection plan={plan} earth={earth} />
      </Fold>
      <Fold id="suggested" title={`Suggested walls${suggestions.length ? ` (${suggestions.length})` : ''}`}>
        <SuggestedWalls plan={plan} survey={survey} earth={earth} />
      </Fold>
      {walls.length > 0 && (
        <p className="muted small">
          {walls.length} retaining wall{walls.length > 1 ? 's hold' : ' holds'} back the batters.{' '}
          <button className="link" onClick={() => navigate({ kind: 'app', area: 'earthworks', tab: 'retaining-walls', view: 'plan' })}>
            See retaining walls
          </button>
        </p>
      )}
      <Fold id="how" title="How this works">
        <HowItWorks />
      </Fold>
    </>
  )
}

/** The numbers: the pad, cut, fill, what's left over, and the deepest cut and fill. */
function Results({ plan, earth }: { plan: Plan; earth: Earth }) {
  const r = earth.result
  const net = r.cut - r.fill
  return (
    <dl className="stats cf-results">
      <Row label="House pad (under the slab)" value={`RL ${housePadRL(plan).toFixed(2)}`} />
      <Row label="Cut" value={`${r.cut.toFixed(1)} m³`} strong />
      <Row label="Fill" value={`${r.fill.toFixed(1)} m³`} strong />
      <Row label={net >= 0 ? 'Left over to take away' : 'Extra fill to bring in'} value={`${Math.abs(net).toFixed(1)} m³`} />
      <Row label="Deepest cut · fill" value={`${r.maxCut.toFixed(2)} · ${r.maxFill.toFixed(2)} m`} />
    </dl>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <>
      <dt className={strong ? 'strong' : undefined}>{label}</dt>
      <dd className={strong ? 'strong' : undefined}>{value}</dd>
    </>
  )
}

/** Counts the checks that fail as Design › Checks does: the same trees, planning facts and sun. */
function useCountFails(plan: Plan, survey: Survey, terrain: Terrain, earth: Earth | null): CountFails {
  const trees = useCheckTrees()
  const planning = useMap(s => s.place?.planning ?? null)
  const dem = !!useProjects().opened?.survey?.dem
  const sun = useSunFacts(plan, survey, terrain, earth)
  return useMemo(() => (p: Plan, e: Earth) => checksFor({ plan: p, survey, terrain, earth: e, trees, sun, dem, planning }).counts.fail, [survey, terrain, trees, sun, dem, planning])
}

/**
 * Balance, which asks first: what moving the floor would change (the floor, cut and fill, the
 * tallest wall, the roof, the batters and the checks), before and after, and only then moves it.
 * A design that cuts or fills on purpose can say so, and the strip's "Out of balance" goes quiet.
 */
function BalanceBlock({ plan, survey, terrain, earth }: Props) {
  const open = useBalanceAsk(s => s.open)
  const fails = useCountFails(plan, survey, terrain, earth)
  const [preview, setPreview] = useState<BalancePreview | null | 'none' | 'working'>(null)
  useEffect(() => {
    if (!open) {
      setPreview(null)
      return
    }
    setPreview('working')
    // A moment after the box draws, so it opens at once while the ground is worked out again.
    const t = setTimeout(() => setPreview(balancePreview(plan, survey, terrain, earth, fails) ?? 'none'), 30)
    return () => clearTimeout(t)
    // Worked out once each time it opens; a change to the plan closes it (./balanceAsk.ts).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const ew = earthworksOf(plan)
  const net = earth ? earth.result.cut - earth.result.fill : 0
  const apply = (p: BalancePreview) => {
    closeBalance()
    const st = usePlan.getState()
    st.commit(() => p.plan)
    const after = usePlan.getState().plan
    const by = p.after.ffl - p.before.ffl
    showToast({
      text: `Floor moved ${by > 0 ? 'up' : 'down'} ${Math.abs(by).toFixed(2)} m, to RL ${p.to.toFixed(2)}, where cut and fill are about equal.`,
      undo: () => {
        if (usePlan.getState().plan === after) usePlan.getState().undo()
      },
    })
  }
  return (
    <div className="cf-balance">
      {!open ? (
        <div className="row">
          <button className="secondary" onClick={() => useBalanceAsk.setState({ open: true })}>
            Balance cut and fill…
          </button>
        </div>
      ) : (
        <section className="cf-balance-card" role="dialog" aria-label="Balance cut and fill">
          {preview === 'working' || preview === null ? (
            <p className="muted small">Working out what would move…</p>
          ) : preview === 'none' ? (
            <p className="small">Cut and fill can’t be balanced by moving the floor up or down within 6 m.</p>
          ) : (
            <BalanceTable p={preview} />
          )}
          <div className="row">
            {preview && typeof preview === 'object' && (
              <button className="primary" onClick={() => apply(preview)}>
                Move the floor
              </button>
            )}
            <button className="secondary" onClick={closeBalance}>
              Cancel
            </button>
          </div>
        </section>
      )}
      {Math.abs(net) >= 0.05 && (
        <label className="check cf-keep">
          <input type="checkbox" checked={!!ew.keepNet} onChange={e => setEarthworks({ keepNet: e.target.checked || undefined })} />
          <span>
            I mean to {net > 0 ? 'take earth away' : 'bring fill in'}
            <span className="muted small"> · the strip stops saying “Out of balance”</span>
          </span>
        </label>
      )}
    </div>
  )
}

function BalanceTable({ p }: { p: BalancePreview }) {
  const rows = balanceRows(p)
  const by = p.after.ffl - p.before.ffl
  const worse = rows.filter(r => r.worse)
  return (
    <>
      <p className="small">
        <b>
          Moves the floor {by > 0 ? 'up' : 'down'} {Math.abs(by).toFixed(2)} m
        </b>
        , to RL {p.to.toFixed(2)}, and every level with it.
      </p>
      <table className="cf-delta">
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">Now</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label} className={r.worse ? 'worse' : r.changed ? 'changed' : undefined}>
              <th scope="row">{r.label}</th>
              <td>{r.before}</td>
              <td>{r.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {worse.length > 0 && <p className="notice small">Worse after: {worse.map(r => r.label.toLowerCase()).join(', ')}.</p>}
    </>
  )
}

/** The cut and fill slopes, with what a batter is said once. */
function SlopeFields({ plan }: { plan: Plan }) {
  const ew = earthworksOf(plan)
  const options = BATTER_CHOICES.map(b => ({ id: b, label: batterLabel(b) }))
  return (
    <div className="cf-slopes">
      <Select label="Cut slope" value={ew.cutBatter} options={options} onChange={cutBatter => setEarthworks({ cutBatter })} />
      <Select label="Fill slope" value={ew.fillBatter} options={options} onChange={fillBatter => setEarthworks({ fillBatter })} />
      <p className="muted small">
        A batter is the slope the levelled ground is trimmed back at to meet the natural ground: 1 in 2 is 2 m across for every 1 m up. Retaining wall leaves a
        vertical edge, a wall someone has to build.
      </p>
    </div>
  )
}

function HowItWorks() {
  return (
    <div className="cf-how">
      <p className="muted small">
        The ground is levelled under slab floors and concrete slabs, cut back under floors on piers to leave room underneath, and brought to a level where you paint it
        with the grading brush. Batters slope from there back to the natural ground.
      </p>
      <p className="muted small">
        Volumes are in the ground; dug soil bulks up by roughly a quarter once it is loose. Retaining walls stop the batters, so the ground behind them stays as it is,
        unless a wall is given a level for that side; then it’s levelled beside the wall and battered back.
      </p>
      <p className="muted small">On the plan, orange is cut and blue is fill, darker where it’s deeper, only where earth is moved.</p>
    </div>
  )
}

const folds = new Map<string, boolean>()

/** A folded section; it remembers being opened or closed for the visit. `open` opens it while true. */
function Fold({ id, title, open, children }: { id: string; title: string; open?: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(() => folds.get(id) ?? false)
  const isOpen = shown || !!open
  return (
    <details
      className="cf-fold"
      open={isOpen}
      onToggle={e => {
        const now = (e.target as HTMLDetailsElement).open
        if (now !== isOpen) {
          folds.set(id, now)
          setShown(now)
        }
      }}
    >
      <summary>{title}</summary>
      {isOpen && children}
    </details>
  )
}
