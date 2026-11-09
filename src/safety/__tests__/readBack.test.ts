// The one line a survey import says back: its counts are the survey's own, and its area and
// levels are the terrain stats the Site panel shows, so nothing is worked out a second way.
// Synthetic blocks only: a 20 × 30 m rectangle on the tilted plane z = 80 + 0.1x + 0.2y.

import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { dxf, lwpolyline, plane, point, polyline3d } from '../../lib/__tests__/fixtures'
import { parseDxf } from '../../lib/dxf'
import type { SavedProject } from '../../lib/storage'
import { analyzeLayers, guessRoles } from '../../lib/survey'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { ensureProjects, projectActions } from '../../projects/session'
import { readSite } from '../files'
import { connectHost, openRead, replaceSurvey, startSketch } from '../flows'
import { CHECK_LAYERS, foundText, readBackLine, rlRangeText, siteAreaText } from '../readBack'
import { useSafety, type Review } from '../store'

type P = [number, number, number]
const W = 20
const D = 30
const E0 = 5000
const N0 = 7000

/** The rectangle, with contours every 0.5 m, a 5 × 7 grid of spot levels, and (if asked) its boundary. */
function rectangle(withBoundary = true): string {
  const ents: string[] = []
  // 0.1x + 0.2y = c - 80, across the block and a little past it.
  for (let c = 79.5; c <= 88.5; c += 0.5) {
    const pts: P[] = []
    for (let x = -2; x <= W + 2; x += 2) {
      const y = (c - 80 - 0.1 * x) / 0.2
      if (y >= -2 && y <= D + 2) pts.push([E0 + x, N0 + y, c])
    }
    if (pts.length >= 2) ents.push(polyline3d('CONTOURS', pts))
  }
  for (let i = 0; i < 5; i++) for (let j = 0; j < 7; j++) ents.push(point('SPOT_LEVELS', [E0 + i * 5, N0 + j * 5, plane(i * 5, j * 5)]))
  if (withBoundary)
    ents.push(
      lwpolyline(
        'LOT_BOUNDARY',
        [
          [E0, N0],
          [E0 + W, N0],
          [E0 + W, N0 + D],
          [E0, N0 + D],
        ],
        0,
        true,
      ),
    )
  return dxf(ents)
}

function saved(fileName = 'rectangle.dxf', withBoundary = true): SavedProject {
  const dxfText = rectangle(withBoundary)
  return { fileName, dxfText, roles: guessRoles(analyzeLayers(parseDxf(dxfText))) }
}

/** How many contour lines the generator draws (each needs two points on the block's band). */
function contoursDrawn() {
  let n = 0
  for (let c = 79.5; c <= 88.5; c += 0.5) {
    let pts = 0
    for (let x = -2; x <= W + 2; x += 2) {
      const y = (c - 80 - 0.1 * x) / 0.2
      if (y >= -2 && y <= D + 2) pts++
    }
    if (pts >= 2) n++
  }
  return n
}

describe('the read-back line', () => {
  it('counts what the layers gave and gives the Site panel’s area and levels', () => {
    const site = readSite(saved())
    const { survey, terrain } = site
    // The survey as the layers built it: what the line counts.
    expect(survey.contours.length).toBe(contoursDrawn())
    expect(survey.levels.length).toBe(35)
    expect(survey.boundaryIsGuess).toBe(false)
    // The stats it reports, against the rectangle worked out by hand.
    expect(Math.abs(terrain.stats.area)).toBeCloseTo(W * D, 6)
    // The ground is sampled on a grid, so the corners' levels come within a cell's fall.
    expect(Math.abs(terrain.stats.minRL - plane(0, 0))).toBeLessThan(0.1)
    expect(Math.abs(terrain.stats.maxRL - plane(W, D))).toBeLessThan(0.1)

    expect(foundText(survey)).toBe(`${survey.contours.length} contours, 35 spot levels and the boundary`)
    expect(siteAreaText(terrain.stats)).toBe('600 m²')
    expect(rlRangeText(terrain.stats)).toBe(`RL ${terrain.stats.minRL.toFixed(2)} to ${terrain.stats.maxRL.toFixed(2)}`)
    expect(readBackLine(site)).toBe(`Found ${survey.contours.length} contours, 35 spot levels and the boundary · 600 m² · ${rlRangeText(terrain.stats)}`)
    expect(readBackLine(site)).toMatch(/^Found \d+ contours, 35 spot levels and the boundary · 600 m² · RL 80\.\d\d to 8[78]\.\d\d$/)
  })

  it('says when there was no boundary, and that there is a warning', () => {
    const site = readSite(saved('no-boundary.dxf', false))
    expect(site.survey.boundaryIsGuess).toBe(true)
    expect(site.survey.warnings).toHaveLength(1)
    expect(foundText(site.survey)).toBe(`${site.survey.contours.length} contours and 35 spot levels, but no boundary`)
    expect(readBackLine(site)).toMatch(/, but no boundary · [\d,]+ m² · RL [\d.]+ to [\d.]+ · 1 warning$/)
  })

  it('reads one of a thing in the singular', () => {
    const site = readSite(saved())
    const one = { ...site, survey: { ...site.survey, contours: site.survey.contours.slice(0, 1), levels: site.survey.levels.slice(0, 1) } }
    expect(foundText(one.survey)).toBe('1 contour, 1 spot level and the boundary')
  })
})

// ---------------------------------------------------------------------------

async function review(): Promise<Review & { answer: (c: string | null) => void }> {
  for (let i = 0; i < 200; i++) {
    const r = useSafety.getState().review
    if (r) return r
    await new Promise(res => setTimeout(res, 1))
  }
  throw new Error('No review was asked for.')
}

const toLayers = vi.fn()
beforeAll(() => ensureProjects())
beforeEach(() => {
  useSafety.setState({ review: null, toast: null, busy: false })
  toLayers.mockClear()
  connectHost({ toProject: () => {}, toLayers })
})

describe('after an import', () => {
  it('from the start screen, says the line in the toast, with a link to the layers', async () => {
    await openRead({ kind: 'survey', name: 'rectangle.dxf', survey: saved() }, { into: 'new' })
    const t = useSafety.getState().toast
    expect(t?.text).toBe(readBackLine(readSite(saved())))
    expect(t?.link?.label).toBe(CHECK_LAYERS)
    // Long enough to read and follow.
    expect(t!.ms).toBeGreaterThanOrEqual(10_000)
    t!.link!.go()
    expect(toLayers).toHaveBeenCalledTimes(1)
    // No review, nothing to undo: nothing was replaced.
    expect(useSafety.getState().review).toBeNull()
    expect(t?.undo).toBeUndefined()
  })

  it('says nothing for a sketch block, which isn’t an import', async () => {
    await startSketch({ width: 15, depth: 30, fall: 0, street: 'S' })
    expect(useSafety.getState().toast?.text ?? '').not.toMatch(/^Found/)
  })

  it('on Replace survey, puts what it found first in the review, and the link in the Undo toast', async () => {
    await projectActions.create({ survey: saved('first.dxf'), plan: garageFloor() })
    const done = replaceSurvey(saved('revised.dxf', false))
    const r = await review()
    const to = readSite(saved('revised.dxf', false))
    expect(r.facts?.slice(0, 3)).toEqual([
      { label: 'Found', value: foundText(to.survey) },
      { label: 'Site area', value: siteAreaText(to.terrain.stats) },
      { label: 'Levels', value: rlRangeText(to.terrain.stats) },
    ])
    r.answer('keep')
    await done
    const t = useSafety.getState().toast
    expect(t?.undo).toBeDefined()
    expect(t?.link?.label).toBe(CHECK_LAYERS)
    t!.link!.go()
    expect(toLayers).toHaveBeenCalledTimes(1)
    await projectActions.flush()
  })
})
