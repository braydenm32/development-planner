import { useEffect, useMemo } from 'react'
import type { SavedProject } from '../lib/storage'
import type { Survey } from '../lib/survey'
import type { Heightfield } from '../lib/terrain'
import type { Vec2 } from '../lib/geom'
import type { Plan } from '../plan/model'
import { usePlan } from '../plan/store'
import { toLocal } from './model'
import { startSiteRecords } from './persist'
import { allFeatures, useSiteStore, type SiteData } from './store'
import { siteWarnings, type SiteWarning } from './warnings'

/**
 * Keep the site features in step with the survey: call once where the project is loaded.
 * `finished` is the ground after cut and fill, when the plan has any.
 */
export function useSiteSource(project: SavedProject | null, survey: Survey | null, natural?: Heightfield | null, finished?: Heightfield | null) {
  useEffect(() => {
    startSiteRecords()
  }, [])
  const dxfText = project?.dxfText
  const roles = project?.roles
  useEffect(() => {
    useSiteStore.setState({ main: dxfText && roles ? { dxfText, roles } : null })
  }, [dxfText, roles])
  useEffect(() => {
    useSiteStore.setState({ origin: survey?.origin ?? null, boundary: survey?.boundary ?? null })
  }, [survey])
  useEffect(() => {
    useSiteStore.setState({ ground: natural && finished && finished !== natural ? { natural, finished } : null })
  }, [natural, finished])
}

type State = ReturnType<typeof useSiteStore.getState>
type SiteMain = State['main']
type SiteGround = State['ground']

/** The element id of Site features' To check list, for links that land on it. */
export const TO_CHECK_ID = 'site-to-check'

/** Worked out once for every component that shows them. */
let cache: { key: unknown[]; out: SiteWarning[] } | null = null

/**
 * Easement and tree-zone warnings for the plan as it stands. Amber ones ("attn") need looking
 * into; notes are worth knowing. The summary strip can show these.
 */
export function useSiteWarnings(): SiteWarning[] {
  const plan = usePlan(s => s.plan)
  const data = useSiteStore(s => s.data)
  const main = useSiteStore(s => s.main)
  const extraDxfText = useSiteStore(s => s.extraDxfText)
  const origin = useSiteStore(s => s.origin)
  const ground = useSiteStore(s => s.ground)
  const boundary = useSiteStore(s => s.boundary)
  return useMemo(() => warningsFor(plan, data, main, extraDxfText, origin, ground, boundary), [plan, data, main, extraDxfText, origin, ground, boundary])
}

/** The same warnings outside React, from the same cache: for downloads started from ⌘K. */
export function siteWarningsNow(): SiteWarning[] {
  const s = useSiteStore.getState()
  return warningsFor(usePlan.getState().plan, s.data, s.main, s.extraDxfText, s.origin, s.ground, s.boundary)
}

function warningsFor(...key: [Plan | null, SiteData, SiteMain, string | null, Vec2 | null, SiteGround, Vec2[] | null]): SiteWarning[] {
  if (cache && cache.key.every((k, i) => k === key[i])) return cache.out
  const [plan, data, main, extraDxfText, origin, ground, boundary] = key
  const out = origin ? siteWarnings(plan, allFeatures({ data, main, extraDxfText }).map(f => toLocal(f, origin)), origin, ground, boundary) : []
  cache = { key, out }
  return out
}
