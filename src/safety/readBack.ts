// What a survey import found, said back in one quiet line (forensics A2): the contours, spot
// levels and boundary its layers gave, then the site area and the RL range. The counts are the
// survey's own (what the ground is built from) and the area and levels are the terrain stats
// the Site panel shows, in the same format, so no number is worked out a second way (CALM 8).

import { andList } from '../plan/keyNumbers'
import type { Survey } from '../lib/survey'
import type { SiteStats } from '../lib/terrain'
import type { Site } from './align'

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`

/** The block's area, as Site › Block shows it: "600 m²". */
export const siteAreaText = (stats: Pick<SiteStats, 'area'>) => `${Math.round(Math.abs(stats.area)).toLocaleString()} m²`

/** The ground's range, as Site › Block shows it: "RL 80.00 to 87.92". */
export const rlRangeText = (stats: Pick<SiteStats, 'minRL' | 'maxRL'>) => `RL ${stats.minRL.toFixed(2)} to ${stats.maxRL.toFixed(2)}`

/**
 * What the layers gave, in words: "17 contours, 35 spot levels and the boundary", or "17
 * contours, but no boundary" when the survey's extent has to stand in for one.
 */
export function foundText(survey: Survey): string {
  const parts = [survey.contours.length ? count(survey.contours.length, 'contour') : null, survey.levels.length ? count(survey.levels.length, 'spot level') : null].filter(
    (p): p is string => !!p,
  )
  if (survey.boundaryIsGuess) return `${andList(parts)}, but no boundary`
  return andList([...parts, 'the boundary'])
}

/**
 * The one line after an import, short enough for a toast: "Survey loaded · 600 m² · RL 80.00 to
 * 87.92", with ", but no boundary" and the warning count when they apply. The counts of what the
 * layers gave are a tap away (Check the layers) and at the top of Site › More › Survey layers.
 */
export function readBackLine(site: Site): string {
  const { survey, terrain } = site
  const warnings = survey.warnings.length ? ` · ${count(survey.warnings.length, 'warning')}` : ''
  const boundary = survey.boundaryIsGuess ? ', but no boundary' : ''
  return `Survey loaded${boundary} · ${siteAreaText(terrain.stats)} · ${rlRangeText(terrain.stats)}${warnings}`
}

/** The read-back's link: where the layers are checked (Site › More › Survey layers). */
export const CHECK_LAYERS = 'Check the layers'
