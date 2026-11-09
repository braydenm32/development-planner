// One street side: the checks' front edge, which Street view in 3D looks from too. Older
// projects kept the 3D one on the device alone; it comes across to the plan once.

import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import type { Vec2 } from '../../lib/geom'
import { parseDxf } from '../../lib/dxf'
import type { SavedProject } from '../../lib/storage'
import { analyzeLayers, guessRoles } from '../../lib/survey'
import { loadStreetSide, projectKey, saveStreetSide } from '../../phone/camera'
import { ensureProjects, projectActions, projectsNow } from '../../projects/session'
import { readSite } from '../../safety/files'
import { openRead, startSketch } from '../../safety/flows'
import { useSafety } from '../../safety/store'
import { streetChoices, streetAsked, useStreetAsk } from '../../start/streetQuestion'
import { garageFloor } from './fixtures'
import { usePlan } from '../store'
import { compassOf, edgeBearings, edgeFacing, migratedStreetSide, migrateStoredStreetSide, streetBearingOf, streetSideOf, withStreetSide } from '../streetSide'

// 20 m wide along the street, 40 m deep, anticlockwise from the south-west corner.
const RECT: Vec2[] = [
  [0, 0],
  [20, 0],
  [20, 40],
  [0, 40],
]

describe('the street side', () => {
  it('names each side by the way it faces, either way round', () => {
    expect(edgeBearings(RECT).map(b => Math.round(b!))).toEqual([180, 90, 0, 270])
    expect(edgeBearings([...RECT].reverse()).map(b => Math.round(b!))).toEqual([0, 90, 180, 270])
    expect(edgeFacing(RECT, 180)).toBe(0)
    expect(edgeFacing(RECT, 100)).toBe(1)
    expect(['N', 'E', 'S', 'W'].map((_, i) => compassOf(i * 90 + 30))).toEqual(['N', 'E', 'S', 'W'])
  })

  it('is kept with the plan, as the checks’ front edge, and read back as a compass point for the 3D view', () => {
    const plan = garageFloor()
    expect(streetSideOf(plan, RECT)).toBe('auto')
    const east = withStreetSide(plan, RECT, 'E')
    expect(east.checks?.frontEdge).toBe(1)
    expect(streetSideOf(east, RECT)).toBe('E')
    // Street view looks from it; until it's set, from the low side.
    expect(streetBearingOf(east, RECT, 0)).toBeCloseTo(90, 9)
    expect(streetBearingOf(plan, RECT, 170)).toBeCloseTo(180, 9)
    // Back to the low side clears it, and a rear edge picked for the old front goes too.
    const back = withStreetSide({ ...east, checks: { ...east.checks!, rearEdge: 3 } }, RECT, 'auto')
    expect(back.checks).toMatchObject({ frontEdge: undefined, rearEdge: undefined })
  })

  it('ignores a front edge the boundary no longer has', () => {
    const plan = { ...garageFloor(), checks: { pathway: 'cdc' as const, battleAxe: false, frontEdge: 9 } }
    expect(streetSideOf(plan, RECT)).toBe('auto')
  })
})

describe('an older project’s street side', () => {
  it('comes across from the 3D view when the plan has none', () => {
    const next = migratedStreetSide(garageFloor(), RECT, ['auto', 'W'])
    expect(next?.checks?.frontEdge).toBe(3)
  })

  it('never overrides a street side the checks already have, and does nothing with none kept', () => {
    const set = withStreetSide(garageFloor(), RECT, 'S')
    expect(migratedStreetSide(set, RECT, ['N'])).toBeNull()
    expect(migratedStreetSide(garageFloor(), RECT, ['auto', 'auto'])).toBeNull()
  })

  describe('on this device', () => {
    const store = new Map<string, string>()
    const survey: SavedProject = { fileName: 'plane.dxf', dxfText: planeSurvey(), roles: guessRoles(analyzeLayers(parseDxf(planeSurvey()))) }
    beforeEach(() => {
      store.clear()
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      })
    })
    afterEach(() => {
      vi.unstubAllGlobals()
      usePlan.getState().load(null)
    })

    it('moves to the plan once, without an Undo step, and the old setting is let go', () => {
      // Kept under the survey's key, from before there were projects.
      saveStreetSide(projectKey(survey), 'E')
      usePlan.getState().load(garageFloor())
      migrateStoredStreetSide('p1', survey, RECT)
      expect(usePlan.getState().plan?.checks?.frontEdge).toBe(1)
      expect(usePlan.getState().past).toEqual([])
      expect(loadStreetSide(projectKey(survey))).toBe('auto')
      // Set back to the low side later, it stays there.
      usePlan.getState().commit(p => withStreetSide(p, RECT, 'auto'))
      migrateStoredStreetSide('p1', survey, RECT)
      expect(usePlan.getState().plan?.checks?.frontEdge).toBeUndefined()
    })

    it('prefers the project’s own over the survey’s', () => {
      saveStreetSide('p2', 'N')
      saveStreetSide(projectKey(survey), 'E')
      usePlan.getState().load(garageFloor())
      migrateStoredStreetSide('p2', survey, RECT)
      expect(usePlan.getState().plan?.checks?.frontEdge).toBe(2)
    })
  })
})

describe('asking which side faces the street', () => {
  const plane = (): SavedProject => ({ fileName: 'plane.dxf', dxfText: planeSurvey(), roles: guessRoles(analyzeLayers(parseDxf(planeSurvey()))) })
  beforeAll(() => ensureProjects())
  beforeEach(() => {
    useSafety.setState({ review: null, toast: null, busy: false })
    streetAsked()
  })

  it('happens once after a survey is imported, for the new project', async () => {
    await openRead({ kind: 'survey', name: 'plane.dxf', survey: plane() }, { into: 'new' })
    expect(useStreetAsk.getState().project).toBe(projectsNow().currentId)
  })

  it('doesn’t happen for a sketch block, whose street side is picked on the start screen', async () => {
    await startSketch({ width: 15, depth: 30, fall: 0, street: 'E' })
    expect(useStreetAsk.getState().project).toBeNull()
    const site = readSite(projectsNow().opened!.survey!)
    expect(streetSideOf(usePlan.getState().plan, site.survey.boundary)).toBe('E')
    await projectActions.flush()
  })

  it('offers each side by the name the checks give it, longest first, with the low side marked', () => {
    const site = readSite(plane())
    const choices = streetChoices(site.survey, garageFloor().placement, site.terrain.stats.fallBearing)
    expect(choices.length).toBe(site.survey.boundary.length)
    expect(choices.every(c => /side/.test(c.label))).toBe(true)
    expect(choices.filter(c => c.low)).toHaveLength(1)
    for (let i = 1; i < choices.length; i++) expect(choices[i - 1].length).toBeGreaterThanOrEqual(choices[i].length)
  })
})
