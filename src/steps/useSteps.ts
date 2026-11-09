// The six steps for the project open now, from the same stores and helpers the panels, the strip
// and the plan's question list read, so the list changes the moment something is fixed.

import { useMemo } from 'react'
import { useChecks } from '../checks/useChecks'
import { useRetainingWalls } from '../components/planNumbers'
import { costHeadline, checksHeadline } from '../shell/headline'
import { floorDrawn } from '../shell/drawn'
import { useKeyNumbers } from '../shell/useKeyNumbers'
import type { Loaded } from '../shell/useSite'
import { useEstimate } from '../costs/useEstimate'
import { useDaDetails } from '../da/details'
import { questionsFor, useQuestionContext } from '../flow/questions'
import { useFlow } from '../flow/store'
import { useHintPrefs } from '../guide/hints'
import { useMap } from '../map/store'
import { onGroundLevels } from '../plan/floorTypes'
import { groundAtPlan } from '../plan/groundOverlay'
import { frontEdgeOf } from '../plan/streetSide'
import { usePlan } from '../plan/store'
import { retainingNames } from '../plan/wallNames'
import { useProjects } from '../projects/session'
import { guessCount, layersKey, useLayersSeen } from '../site/layersSeen'
import { useStreetPending } from '../start/streetQuestion'
import { stepsOf, type Step } from './model'

export function useSteps(d: Loaded): Step[] {
  const { plan, survey, terrain, earth } = d
  const numbers = useKeyNumbers(plan, survey, terrain, earth)
  const profiles = useRetainingWalls(plan, survey, terrain, earth)
  const names = useMemo(() => retainingNames(plan, survey), [plan, survey])
  const checks = useChecks(plan, survey, terrain, earth)
  const estimate = useEstimate(d)
  const details = useDaDetails(s => s.details)
  const place = useMap(s => s.place)
  const projects = useProjects()
  const sketch = projects.opened?.survey?.sketch
  const seen = useLayersSeen(s => s.seen.includes(layersKey(projects.currentId, d.project.fileName)))

  // The plan's question list, as src/flow/QuestionTray.tsx works it out.
  const level = usePlan(s => s.activeLevel)
  const ask = useFlow(s => s.ask)
  const offer = useFlow(s => s.offer)
  const dismissed = useFlow(s => s.dismissed)
  const street = useStreetPending(plan, survey.boundary)
  const hints = useHintPrefs()
  const facts = useQuestionContext(s => s.facts)
  const questions = useMemo(
    () => questionsFor({ plan, level, street, ask: ask && { level: ask.space.level }, dismissed, offer, hints, facts }),
    [plan, level, street, ask, dismissed, offer, hints, facts],
  )

  // The levels on the natural ground, as the flow asks their floor types.
  const onGround = useMemo(() => [...onGroundLevels(plan, q => groundAtPlan(q, plan.placement, survey, terrain.grid))], [plan, survey, terrain])
  const drawn = floorDrawn(plan)
  return useMemo(() => {
    const h = checksHeadline(checks.pathway, checks.results)
    return stepsOf({
      plan,
      site: {
        area: terrain.stats.area,
        slopePct: terrain.stats.meanSlopePct,
        sketch: sketch ? (sketch.rough ? 'rough' : 'sized') : null,
        streetSet: frontEdgeOf(plan, survey.boundary) !== undefined,
        layerGuesses: seen ? 0 : guessCount(d.layers, d.project.roles),
        mapPlaced: !!place,
      },
      numbers: {
        floorArea: numbers.floorArea,
        ffl: numbers.ffl,
        earth: numbers.earth,
        roofHeight: numbers.roof?.height ?? null,
        implied: numbers.retaining?.implied ?? null,
      },
      onGround,
      retaining: profiles.map(p => ({ wall: p.wall, height: p.maxHeight, name: names.get(p.wall.id) })),
      checks: drawn ? { name: h.name, head: h.head, word: h.word, results: checks.results } : null,
      cost: costHeadline(estimate),
      da: { address: !!(details.address || place?.lot.address), lot: !!(details.lot || place?.lot.label), preparedBy: !!details.preparedBy },
      questions,
    })
  }, [plan, terrain, survey, sketch, seen, d.layers, d.project.roles, place, numbers, onGround, profiles, names, drawn, checks, estimate, details, questions])
}
