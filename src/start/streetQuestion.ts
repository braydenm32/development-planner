// The one question after a survey import: which side of the block faces the street. The survey
// doesn't say, and both the checks and the 3D Street view need it, so it's asked once, for the
// project just made, and never again once answered or put off.

import { create } from 'zustand'
import type { Survey } from '../lib/survey'
import { streetBearing } from '../phone/camera'
import { sideLabel } from '../plan/keyNumbers'
import type { Placement, Plan } from '../plan/model'
import { boundaryClearances } from '../plan/placement'
import { edgeFacing, frontEdgeOf } from '../plan/streetSide'
import { projectsNow } from '../projects/session'

interface StreetAsk {
  /** The project to ask about, until it's answered or put off. */
  project: string | null
}

export const useStreetAsk = create<StreetAsk>(() => ({ project: null }))

export const askStreetSide = (project: string | null) => useStreetAsk.setState({ project })
export const streetAsked = () => useStreetAsk.setState({ project: null })

/** Whether the question is up on this plan now: asked for the project open, and not yet answered. */
export function useStreetAskOpen(plan: Plan | null, boundary: Survey['boundary']) {
  const project = useStreetAsk(s => s.project)
  return !!project && !!plan && project === projectsNow().currentId && frontEdgeOf(plan, boundary) === undefined
}

/** The block's sides as the checks name them, longest first, with the low one marked. */
export function streetChoices(survey: Pick<Survey, 'boundary' | 'origin'>, placement: Placement, fallBearing: number) {
  // boundaryClearances names every side even for a house of one tiny line, as the checks do.
  const sides = boundaryClearances([[[0, 0], [0.001, 0]]], placement, survey as Survey)
  const low = edgeFacing(survey.boundary, streetBearing(survey.boundary, fallBearing, 'auto'))
  return sides
    .map((s, i) => {
      const a = survey.boundary[i]
      const b = survey.boundary[(i + 1) % survey.boundary.length]
      return { index: i, label: sideLabel(sides, s), length: Math.hypot(b[0] - a[0], b[1] - a[1]), low: i === low }
    })
    .filter(c => c.length >= 0.5)
    .sort((x, y) => y.length - x.length)
}
