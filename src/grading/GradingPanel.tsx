// The grading brush's part of Earthworks › Cut & fill: Cut, Fill or the eraser, the level and the
// brush size; the painted areas with their own cut and fill; the suggested retaining walls; and the
// walls the cut and fill imply (vertical edges).

import { useMemo } from 'react'
import { navigate } from '../nav/router'
import { Num } from '../components/fields'
import type { Survey } from '../lib/survey'
import type { Plan } from '../plan/model'
import { housePadRL } from '../plan/platforms'
import { usePlan } from '../plan/store'
import type { Earth } from '../plan/useEarthworks'
import { addSuggestion, dismissWall } from './actions'
import { impliedWalls } from './implied'
import { areaM2, areaName, BRUSH_MAX, BRUSH_MIN, type BrushMode, type GradeArea } from './model'
import { ownVolumes } from './ownVolumes'
import { beginBrush, BRUSH_KEY, setBrushLevel, setBrushMode, setBrushRadius, startLevelPick, stopBrush, stopLevelPick, useBrush } from './store'
import { ENGINEER_NOTE, pathLength } from './suggest'
import { undismissAll } from './walls'
import { sideOf, useSuggestions } from './words'
import './grading.css'

const MODES: { id: BrushMode; label: string }[] = [
  { id: 'cut', label: 'Cut' },
  { id: 'fill', label: 'Fill' },
  { id: 'erase', label: 'Eraser' },
]

const m3 = (v: number) => (v < 0.05 ? 'none' : `${v.toFixed(1)} m³`)

const useOwnVolumes = (earth: Earth | null, areas: GradeArea[]) => useMemo(() => ownVolumes(earth, areas), [earth, areas])

const removeArea = (id: string) =>
  usePlan.getState().commit(p => {
    const g = p.grading
    if (!g) return p
    const areas = g.areas.filter(a => a.id !== id)
    if (areas.length || g.dismissed?.length) return { ...p, grading: { ...g, areas } }
    const rest = { ...p }
    delete rest.grading
    return rest
  })

/** The grading brush: Cut, Fill or the eraser, its level and size, and the painted areas (Cut & fill's "Grading brush" fold). */
export function BrushSection({ plan, earth }: { plan: Plan; earth: Earth | null }) {
  const brush = useBrush()
  const areas = plan.grading?.areas ?? []
  const own = useOwnVolumes(earth, areas)
  // Until one is set, the level shown (and painted to) is the house pad's.
  const level = brush.rl ?? Math.round(housePadRL(plan) * 100) / 100
  return (
    <section className="grade-panel" aria-label="Grading brush">
      <p className="muted small">
        Paint ground to bring it to a level. Cut lowers ground above the level and leaves lower ground alone; Fill raises ground below it and leaves higher ground alone.
        Batters slope from the painted edge at the slopes above.
      </p>
      <div className="grade-seg" role="radiogroup" aria-label="Brush">
        {MODES.map(m => (
          <button key={m.id} type="button" role="radio" aria-checked={brush.mode === m.id} className={brush.mode === m.id ? 'on' : ''} onClick={() => setBrushMode(m.id)}>
            {m.id !== 'erase' && <span className={`sw ${m.id}`} aria-hidden="true" />}
            {m.label}
          </button>
        ))}
      </div>
      {brush.mode !== 'erase' && (
        <>
          <Num label={brush.mode === 'cut' ? 'Cut down to' : 'Fill up to'} unit="RL" value={level} onCommit={setBrushLevel} />
          <div className="row">
            <button className="secondary" aria-pressed={brush.picking} onClick={() => (brush.picking ? stopLevelPick() : (beginBrush(), startLevelPick()))}>
              {brush.picking ? 'Picking… (Esc stops)' : 'Pick a level'}
            </button>
            <span className="muted small">A contour, or a spot on the ground.</span>
          </div>
        </>
      )}
      <label className="grade-size">
        <span>Brush size</span>
        <input type="range" min={BRUSH_MIN} max={BRUSH_MAX} step={0.25} value={brush.radius} onChange={e => setBrushRadius(Number(e.target.value))} aria-label="Brush radius in metres" />
        <span>{(brush.radius * 2).toFixed(1)} m across</span>
      </label>
      <div className="row">
        {brush.on && !brush.picking ? (
          <button className="primary" onClick={stopBrush}>
            Done painting
          </button>
        ) : (
          <button className="primary" onClick={() => beginBrush()}>
            {brush.mode === 'erase' ? 'Rub out on the plan' : 'Paint on the plan'} <kbd>{BRUSH_KEY}</kbd>
          </button>
        )}
      </div>
      {brush.on && <p className="muted small">Drag on the plan to paint (a finger on a phone; two fingers move the plan). Each stroke is one Undo. [ and ] change the size.</p>}

      {areas.length > 0 && (
        <>
          <h4>Painted ground</h4>
          <ul className="grade-list">
            {areas.map(a => {
              const v = own.get(a.id)
              return (
                <li key={a.id}>
                  <div className="head">
                    <span className={`sw ${a.mode}`} aria-hidden="true" />
                    <strong>{areaName(a)}</strong>
                    <span className="muted">{areaM2(a, plan.grading?.cell).toFixed(0)} m²</span>
                  </div>
                  {v && (
                    <span className="muted small">
                      Its own cut {m3(v.cut)}, fill {m3(v.fill)}, batters included
                    </span>
                  )}
                  <div className="actions">
                    <button
                      className="link"
                      onClick={() => {
                        setBrushMode(a.mode)
                        setBrushLevel(a.rl)
                        beginBrush()
                      }}
                    >
                      Paint more
                    </button>
                    <button className="link" onClick={() => removeArea(a.id)}>
                      Remove
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          {own.get('') && (
            <p className="muted small">
              All painted ground: cut {m3(own.get('')!.cut)}, fill {m3(own.get('')!.fill)}. The totals above include it.
            </p>
          )}
        </>
      )}
    </section>
  )
}

/** The suggested retaining walls, each with why, Add and Dismiss (Cut & fill's "Suggested walls" fold). */
export function SuggestedWalls({ plan, survey, earth }: { plan: Plan; survey: Survey; earth: Earth | null }) {
  const suggestions = useSuggestions(plan, survey, earth)
  const dismissed = plan.grading?.dismissed?.length ?? 0
  return (
    <section className="grade-panel" aria-label="Suggested retaining walls">
      {suggestions.length ? (
        <>
          <p className="muted small">Where a wall would do better than a batter, dashed on the plan. Add makes it a real retaining wall; Undo takes it back.</p>
          <ol className="grade-list">
            {suggestions.map((s, n) => (
              <li key={s.key}>
                <div className="head">
                  <span className="n">{n + 1}</span>
                  <strong>{s.why}.</strong>
                </div>
                {s.engineer && <span className="small eng">{ENGINEER_NOTE}</span>}
                <div className="actions">
                  <button className="secondary" onClick={() => addSuggestion(s, survey, earth?.prep.natural ?? null)}>
                    Add wall
                  </button>
                  <button className="link" onClick={() => dismissWall(s, survey.origin)}>
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="muted small">{earth && earth.platforms.length ? 'None: every batter has room, clear of the boundary.' : 'Once there is a house pad or painted ground, any walls the batters need show here.'}</p>
      )}
      {dismissed > 0 && (
        <button className="link" onClick={() => usePlan.getState().commit(undismissAll)}>
          Show {dismissed} dismissed suggestion{dismissed > 1 ? 's' : ''} again
        </button>
      )}
    </section>
  )
}

/**
 * The walls the cut and fill imply (vertical edges, ./implied.ts): with the slopes set to Retaining
 * wall they're walls someone has to build, drawn or not. Each has Add as retaining wall.
 */
export function ImpliedWalls({ survey, earth }: { survey: Survey; earth: Earth | null }) {
  const walls = impliedWalls(survey, earth)
  if (!walls.length) return null
  const tall = Math.max(...walls.map(w => w.height))
  const kinds = new Set(walls.map(w => w.kind))
  const which = kinds.size > 1 ? 'Cut and fill slopes are' : kinds.has('cut') ? 'Cut slopes are' : 'Fill slopes are'
  return (
    <section className="grade-implied" aria-label="Implied retaining walls">
      <p className="notice small">
        {which} set to Retaining wall, so {walls.length === 1 ? 'one vertical edge is a wall' : `${walls.length} vertical edges are walls`} someone has to build, up to{' '}
        {tall.toFixed(2)} m high (dashed on the plan).{' '}They count in Tallest wall, the engineer count and Costs as implied walls.
      </p>
      <ol className="grade-list">
        {walls.map((s, n) => (
          <li key={s.key}>
            <div className="head">
              <span className="n implied">{n + 1}</span>
              <strong>
                Implied wall, {sideOf(s)} side · {pathLength(s.path).toFixed(1)} m
              </strong>
              <span className={s.engineer ? 'warn-text' : 'muted'}>{s.height.toFixed(2)} m</span>
            </div>
            {s.engineer && <span className="small eng">{ENGINEER_NOTE}</span>}
            <div className="actions">
              <button className="secondary" onClick={() => addSuggestion(s, survey, earth?.prep.natural ?? null)}>
                Add as retaining wall
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** On Earthworks › Retaining walls: how many walls are suggested (dashed on the plan), and where to add them. */
export function SuggestionsNote({ plan, survey, earth }: { plan: Plan; survey: Survey; earth: Earth | null }) {
  const n = useSuggestions(plan, survey, earth).length
  if (!n) return null
  return (
    <p className="muted small">
      {n === 1 ? 'One wall is' : `${n} walls are`} suggested where the batters need one, dashed on the plan with Add beside {n === 1 ? 'it' : 'each'}.{' '}
      <button className="link" onClick={() => navigate({ kind: 'app', area: 'earthworks', tab: 'cut-fill', view: 'plan' })}>
        See why
      </button>
    </p>
  )
}
