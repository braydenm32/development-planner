import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import { normalizeDemSource } from '../../lib/storage'
import { normalizePlan } from '../../plan/model'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { parseProjectFile, projectFileText } from '../../share/project'
import { buildSurvey } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { BATCH, clearElevationCache, DEM, ElevationError, groundAt, readSample, setElevationFetch, TIMEOUT } from '../elevation'
import { blockFromLot, demPlace, demSurvey, DEM_FILE_NAME, gridOverLot, isDem, MARGIN, MAX_POINTS } from '../demSite'
import { gridToMga } from '../fit'
import { toMga, type EN } from '../geo'
import { lotsOfProperty, setFetch } from '../services'
import { LOT_REPLY, SAMPLES_REPLY } from './replies'

const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

/** The points a getSamples request asked for, as lon/lat. */
const askedPoints = (init?: RequestInit): [number, number][] => JSON.parse(new URLSearchParams(String(init?.body)).get('geometry') ?? '{}').points

/** A made-up slope: 20 m AHD rising 1 m every 10 m north, sampled anywhere. */
const slope = (init?: RequestInit) => {
  const pts = askedPoints(init)
  return reply({ samples: pts.map(([x, y], i) => ({ locationId: i, value: String(20 + (toMga([x, y], 56)[1] - 6189000) / 10), resolution: 5 })) })
}

beforeEach(() => clearElevationCache())
afterEach(() => {
  setElevationFetch(null)
  setFetch(null)
  vi.useRealTimers()
})

// Wollongong's council offices, the Crown St mall, Mount Keira's foothills and lookout, and out at sea.
const PLACES: [number, number][] = [
  [150.8936, -34.4259],
  [150.8975, -34.4245],
  [150.871, -34.41],
  [150.847, -34.404],
  [150.95, -34.43],
]
const mga = PLACES.map(p => toMga(p, 56))

describe('ground levels at points', () => {
  it('reads the recorded reply, with null where the model has no level (at sea)', async () => {
    let url = ''
    let sent: RequestInit | undefined
    setElevationFetch((u, init) => {
      url = String(u)
      sent = init
      return reply(SAMPLES_REPLY)
    })
    const z = await groundAt(mga, 56)
    expect(url).toBe(`${DEM.url}/getSamples`)
    expect(sent?.method).toBe('POST')
    const asked = askedPoints(sent)
    // Back to the same lon/lat to well under a millimetre's worth of degrees.
    asked.forEach((p, i) => expect(Math.hypot(p[0] - PLACES[i][0], p[1] - PLACES[i][1])).toBeLessThan(1e-7))
    expect(z.slice(0, 4).map(v => v?.toFixed(2))).toEqual(['13.05', '15.61', '52.12', '241.54'])
    expect(z[4]).toBeNull()
  })

  it('treats NoData values as no level', () => {
    expect(readSample('NoData')).toBeNull()
    expect(readSample('')).toBeNull()
    expect(readSample(-3.4028234663852886e38)).toBeNull()
    expect(readSample('-9999')).toBeNull()
    expect(readSample('12.5 13.1')).toBe(12.5)
    expect(readSample(0.4)).toBe(0.4)
  })

  it('asks in batches the server takes, and every point once', async () => {
    const sizes: number[] = []
    setElevationFetch((_u, init) => {
      sizes.push(askedPoints(init).length)
      return slope(init)
    })
    const pts: EN[] = Array.from({ length: 2500 }, (_, i) => [300000 + (i % 50), 6189000 + Math.floor(i / 50)])
    const progress: number[] = []
    const z = await groundAt([...pts, pts[0]], 56, { onProgress: d => progress.push(d) })
    expect(sizes.sort((a, b) => b - a)).toEqual([BATCH, BATCH, 500])
    expect(z).toHaveLength(2501)
    expect(z[2500]).toBe(z[0])
    expect(z[60]).toBeCloseTo(20.1, 3) // one row north
    expect(progress[0]).toBe(0)
    expect(progress[progress.length - 1]).toBe(2501)
  })

  it('remembers what it was told', async () => {
    let calls = 0
    setElevationFetch((_u, init) => {
      calls++
      return slope(init)
    })
    const pts: EN[] = [
      [300000, 6189000],
      [300000, 6189010],
    ]
    await groundAt(pts, 56)
    const again = await groundAt([pts[1], pts[0]], 56)
    expect(calls).toBe(1)
    expect(again[0]).toBeCloseTo(21, 3)
    expect(again[1]).toBeCloseTo(20, 3)
    // A new point is asked for on its own.
    await groundAt([...pts, [300000, 6189020]], 56)
    expect(calls).toBe(2)
  })

  it('says plainly when the service is down, slow or refuses', async () => {
    setElevationFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    await expect(groundAt(mga, 56)).rejects.toThrow(/didn’t answer. Check you’re online/)
    setElevationFetch(() => reply({}, 503))
    await expect(groundAt(mga, 56)).rejects.toThrow(/error \(503\)/)
    setElevationFetch(() => reply({ error: { code: 400, message: 'Invalid geometry' } }))
    await expect(groundAt(mga, 56)).rejects.toThrow(ElevationError)

    vi.useFakeTimers()
    setElevationFetch(
      (_u, init) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const slow = groundAt(mga, 56)
    const caught = slow.catch((e: Error) => e)
    await vi.advanceTimersByTimeAsync(TIMEOUT + 10)
    const e = await caught
    expect(e).toBeInstanceOf(ElevationError)
    expect((e as Error).message).toMatch(/taking too long/)
  })

  it('stops when the person does, without an error of its own', async () => {
    setElevationFetch(
      (_u, init) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const ctrl = new AbortController()
    const p = groundAt(mga, 56, { signal: ctrl.signal })
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('the grid over a lot', () => {
  const lot: EN[] = [
    [300000, 6189000],
    [300015, 6189000],
    [300015, 6189040],
    [300000, 6189040],
  ]

  it('samples half the model’s pixel apart, a margin past the lot', () => {
    const g = gridOverLot(lot)
    expect(g.spacing).toBe(DEM.resolution / 2)
    expect(g.points).toHaveLength(g.nx * g.ny)
    const xs = g.points.map(p => p[0])
    const ys = g.points.map(p => p[1])
    // Out to about the margin each side, centred on the lot.
    expect(Math.min(...xs)).toBeLessThanOrEqual(300000 - MARGIN + g.spacing)
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(300015 + MARGIN - g.spacing)
    expect(Math.min(...ys)).toBeLessThanOrEqual(6189000 - MARGIN + g.spacing)
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(6189040 + MARGIN - g.spacing)
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(300007.5, 6)
    // Row by row from the south, west to east.
    expect(g.points[1][0] - g.points[0][0]).toBe(g.spacing)
    expect(g.points[g.nx][1] - g.points[0][1]).toBe(g.spacing)
  })

  it('samples a metre apart from a finer model, never closer', () => {
    expect(gridOverLot(lot, { resolution: 2 }).spacing).toBe(1)
    expect(gridOverLot(lot, { resolution: 0.5 }).spacing).toBe(1)
  })

  it('spreads out on a big lot so the requests stay few', () => {
    const big: EN[] = [
      [300000, 6189000],
      [300400, 6189000],
      [300400, 6189300],
      [300000, 6189300],
    ]
    const g = gridOverLot(big)
    expect(g.points.length).toBeLessThanOrEqual(MAX_POINTS)
    expect(g.points.length).toBeGreaterThan(MAX_POINTS / 2)
    expect(g.spacing % 0.5).toBe(0)
    expect(gridOverLot(big, { cap: 100 }).points.length).toBeLessThanOrEqual(100)
  })
})

describe('a block from the model', () => {
  const lot: EN[] = [
    [300003.4, 6189002.2],
    [300018.4, 6189002.2],
    [300018.4, 6189042.2],
    [300003.4, 6189042.2],
  ]
  const grid = gridOverLot(lot)
  const levels = grid.points.map(([, n]) => 20 + (n - 6189000) / 10)
  const at = new Date('2026-11-09T01:00:00Z')

  it('builds the same ground as spot levels would, on the lot as its boundary', () => {
    const b = demSurvey(lot, 56, grid, levels, DEM, at)
    const survey = buildSurvey(parseDxf(b.survey.dxfText), b.survey.roles)
    expect(survey.boundaryIsGuess).toBe(false)
    expect(survey.boundary).toHaveLength(4)
    expect(survey.levels.length).toBe(grid.points.length)
    // Half-metre contours across the slope, every one at a single level.
    expect(survey.contours.length).toBeGreaterThan(5)
    for (const c of survey.contours) expect(c.z * 2).toBeCloseTo(Math.round(c.z * 2), 6)
    const t = buildTerrain(survey)
    expect(t.stats.area).toBeCloseTo(600, 1)
    expect(t.stats.minRL).toBeCloseTo(20.22, 1)
    expect(t.stats.maxRL).toBeCloseTo(24.22, 1)
    expect(t.stats.fallBearing).toBeCloseTo(180, 0)
    // The ground matches the model at a point in the lot.
    const fit = b.fit
    const [x, y] = [fit.from[0] + 5, fit.from[1] + 20]
    const [, n] = gridToMga(fit, [x, y])
    expect(t.grid.sample(x - survey.origin[0], y - survey.origin[1])).toBeCloseTo(20 + (n - 6189000) / 10, 2)
  })

  it('keeps where the levels came from on the survey, and never where the block is', () => {
    const b = demSurvey(lot, 56, grid, levels, DEM, at)
    expect(b.survey.fileName).toBe(DEM_FILE_NAME)
    expect(isDem(b.survey)).toBe(true)
    expect(b.survey.dem).toEqual({
      service: DEM.id,
      name: DEM.name,
      from: DEM.from,
      at: '2026-11-09T01:00:00.000Z',
      spacing: grid.spacing,
      resolution: DEM.resolution,
      accuracy: DEM.accuracy,
      credit: DEM.credit,
    })
    // Local coordinates near 1000, not MGA.
    expect(b.survey.dxfText).not.toMatch(/\n300\d{3}\./)
    expect(b.survey.dxfText).not.toMatch(/\n6189\d{3}\./)
    // The map record puts it back on the lot exactly, pinned at the survey's origin.
    const survey = buildSurvey(parseDxf(b.survey.dxfText), b.survey.roles)
    expect(b.fit.from).toEqual(survey.origin)
    for (const p of survey.boundary) {
      const back = gridToMga(b.fit, [p[0] + survey.origin[0], p[1] + survey.origin[1]])
      expect(Math.min(...lot.map(q => Math.hypot(q[0] - back[0], q[1] - back[1])))).toBeLessThan(0.002)
    }
  })

  it('leaves out the model’s gaps, and refuses a lot it has no ground for', () => {
    const gappy = levels.map((v, i) => (i % 7 === 0 ? null : v))
    const b = demSurvey(lot, 56, grid, gappy, DEM, at)
    const survey = buildSurvey(parseDxf(b.survey.dxfText), b.survey.roles)
    expect(survey.levels.length).toBe(gappy.filter(v => v !== null).length)
    expect(() => demSurvey(lot, 56, grid, levels.map(() => null))).toThrow(/no ground levels for this lot/)
    // Ground only off the lot (the lot is at sea).
    const offLot = grid.points.map(([e, n], i) => (e < 300003 || n < 6189002 ? levels[i] : null))
    expect(() => demSurvey(lot, 56, grid, offLot)).toThrow(ElevationError)
  })

  it('reads a lot found on the map, and lays it back on that lot', async () => {
    setFetch(() => reply(LOT_REPLY))
    const [found] = await lotsOfProperty(3204805)
    let asked = 0
    setElevationFetch((_u, init) => {
      asked += askedPoints(init).length
      return slope(init)
    })
    const b = await blockFromLot(found)
    expect(asked).toBeGreaterThan(100)
    expect(asked).toBeLessThanOrEqual(MAX_POINTS)
    const place = demPlace(b, found)
    expect(place.lot.id).toBe('401//DP715513')
    expect(place.rms).toBe(0)
    expect(place.include).toBe(false)
    expect(place.fit.rotation).toBe(0)
  })
})

describe('projects that came from a real survey', () => {
  const real = { fileName: 'survey.dxf', dxfText: '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n', roles: { CONTOURS: 'contour' as const } }

  it('open from a project file exactly as they were, with no source label', () => {
    const text = projectFileText(real, normalizePlan(garageFloor()))
    const back = parseProjectFile(text).survey
    expect(back).toEqual(real)
    expect('dem' in back).toBe(false)
    expect(isDem(back)).toBe(false)
  })

  it('keep the source label on a block from the model through a project file', () => {
    const lot: EN[] = [
      [300000, 6189000],
      [300015, 6189000],
      [300015, 6189040],
      [300000, 6189040],
    ]
    const grid = gridOverLot(lot)
    const b = demSurvey(
      lot,
      56,
      grid,
      grid.points.map(() => 30),
      DEM,
      new Date('2026-11-09T01:00:00Z'),
    )
    const back = parseProjectFile(projectFileText(b.survey, normalizePlan(garageFloor()))).survey
    expect(back.dem).toEqual(b.survey.dem)
    expect(back.dxfText).toBe(b.survey.dxfText)
  })

  it('reads a damaged label as rough, never as precise', () => {
    expect(normalizeDemSource(null)).toBeUndefined()
    expect(normalizeDemSource('yes')).toBeUndefined()
    const d = normalizeDemSource({ accuracy: -1, spacing: 'x' })
    expect(d?.accuracy).toBe(1)
    expect(d?.spacing).toBe(5)
    expect(d?.credit).toMatch(/State of New South Wales/)
  })
})
