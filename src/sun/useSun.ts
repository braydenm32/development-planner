// The sun facts and the shadow diagram for the design as it is, worked out once it has settled:
// dragging a wall changes the plan many times a second, and the shadows wait until it stops.

import { useEffect, useMemo, useState } from 'react'
import type { Survey } from '../lib/survey'
import type { Heightfield, Terrain } from '../lib/terrain'
import type { Plan } from '../plan/model'
import type { Earth } from '../plan/useEarthworks'
import { keptShadowDiagram, keptSunFacts, winterDay, type ShadowDiagram, type SiteInput, type SunFacts } from './facts'

/** How long the design must sit still before the sun is worked out again (ms). */
const SETTLE_MS = 300

/** The ground shadows fall on: the finished ground once it's cut or filled. */
export const groundFor = (terrain: Terrain, earth: Earth | null | undefined): Heightfield => earth?.result.grid ?? terrain.grid

/** The input as it was when it last sat still; a new survey (another project) goes straight through. */
function useSettled(input: SiteInput): SiteInput {
  const [settled, setSettled] = useState(input)
  const sameSite = settled.boundary === input.boundary && settled.origin === input.origin
  const shown = sameSite ? settled : input
  useEffect(() => {
    if (settled === input) return
    // Another site shows at once (see `shown`); this only catches the kept input up.
    const t = setTimeout(() => setSettled(input), sameSite ? SETTLE_MS : 0)
    return () => clearTimeout(t)
  }, [input, settled, sameSite])
  return shown
}

function useSiteInput(plan: Plan, survey: Survey, terrain: Terrain, earth: Earth | null | undefined): SiteInput {
  const ground = groundFor(terrain, earth)
  return useMemo(() => ({ plan, boundary: survey.boundary, origin: survey.origin, ground, date: winterDay() }), [plan, survey, ground])
}

/** Hours of sun on the living areas and the shadow over the boundary, on 21 June. */
export function useSunFacts(plan: Plan, survey: Survey, terrain: Terrain, earth: Earth | null | undefined): SunFacts {
  const settled = useSettled(useSiteInput(plan, survey, terrain, earth))
  return useMemo(() => keptSunFacts(settled), [settled])
}

/** The house's shadows at 9 am, 12 pm and 3 pm on 21 June; null while `on` is false. */
export function useShadowDiagram(plan: Plan, survey: Survey, terrain: Terrain, earth: Earth | null | undefined, on: boolean): ShadowDiagram | null {
  const settled = useSettled(useSiteInput(plan, survey, terrain, earth))
  return useMemo(() => (on ? keptShadowDiagram(settled) : null), [settled, on])
}
