import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { dxf, lwpolyline, planeSurvey, polyline3d } from '../../lib/__tests__/fixtures'
import { DxfError, parseDxf } from '../../lib/dxf'
import { ensureProjects, projectsNow } from '../../projects/session'
import { askSurveyor, PickLayersError, readFile, readSite, readSurvey, SURVEYOR_REQUEST } from '../files'
import { openFile } from '../flows'
import { useSafety, type LayersAsk } from '../store'
import { COPY_REQUEST, sayFileError } from '../surveyor'

// Synthetic surveys only: the tilted-plane test block, and a made-up block whose contours share a
// layer with sloping lines, so the layer guess finds no ground on it.

/** Contours (level lines) and two sloping strings on one layer, with a boundary. */
function mixedLayers(): string {
  const ents: string[] = []
  for (let i = 0; i < 4; i++)
    ents.push(
      lwpolyline(
        'SURVEY_LINES',
        [
          [0, 5 + i * 5],
          [20, 5 + i * 5],
        ],
        80 + i * 0.5,
      ),
    )
  ents.push(
    polyline3d('SURVEY_LINES', [
      [0, 0, 79.5],
      [20, 25, 82],
    ]),
    polyline3d('SURVEY_LINES', [
      [20, 0, 79.6],
      [0, 25, 81.9],
    ]),
    lwpolyline(
      'LOT_BOUNDARY',
      [
        [0, 0],
        [20, 0],
        [20, 25],
        [0, 25],
      ],
      0,
      true,
    ),
  )
  return dxf(ents)
}

const file = (name: string, text: string) => new File([text], name)

/** The layer review the flow is waiting on. */
async function layerReview(): Promise<LayersAsk> {
  for (let i = 0; i < 200; i++) {
    const a = useSafety.getState().layers
    if (a) return a
    await new Promise(res => setTimeout(res, 1))
  }
  throw new Error('No layer review was asked for.')
}

beforeAll(() => ensureProjects())
beforeEach(() => useSafety.setState({ review: null, layers: null, toast: null, busy: false }))

describe('a survey file that can’t be read', () => {
  it('says plainly that a binary DXF can’t be read, and what to ask for', () => {
    const binary = 'AutoCAD Binary DXF\r\n\x1a\x00\x00\x00\x02SECTION'
    expect(() => parseDxf(binary)).toThrow(DxfError)
    expect(() => parseDxf(binary)).toThrow(/saved in binary form.*Ask your surveyor for an ASCII DXF/)
    let err: unknown
    try {
      readSurvey('site.dxf', binary)
    } catch (e) {
      err = e
    }
    expect(askSurveyor(err)).toBe(true)
  })

  it('says a damaged DXF is damaged, not “bad group code”', () => {
    expect(() => parseDxf('SECTION\n2\nENTITIES')).toThrow(/doesn’t read as a DXF \(it goes wrong at line 1\)/)
    expect(() => parseDxf('SECTION\n2\nENTITIES')).not.toThrow(/group code/)
    expect(() => parseDxf('0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF')).toThrow(/nothing drawn in it/)
  })

  it('says an empty file is empty, rather than asking which layers hold the contours', async () => {
    const blank = await readFile(file('site.dxf', '')).catch((e: unknown) => e)
    expect((blank as Error).message).toBe('site.dxf is empty: there’s nothing in the file. Choose it again, or ask for it to be sent again.')
    expect(askSurveyor(blank)).toBe(true)
    // A DXF with an ENTITIES section and nothing in it.
    const none = await readFile(file('site.dxf', dxf([]))).catch((e: unknown) => e)
    expect(none).not.toBeInstanceOf(PickLayersError)
    expect((none as Error).message).toMatch(/^site\.dxf is empty: it has no lines, points or text in it/)
    expect(askSurveyor(none)).toBe(true)
  })

  it('tells a DWG and a PDF apart: only the DWG needs the surveyor', async () => {
    const dwg = await readFile(file('site.dwg', 'AC1032')).catch((e: unknown) => e)
    expect((dwg as Error).message).toMatch(/That’s a DWG.*ASCII DXF/)
    expect(askSurveyor(dwg)).toBe(true)
    const pdf = await readFile(file('survey.pdf', '%PDF-1.7')).catch((e: unknown) => e)
    expect((pdf as Error).message).toMatch(/isn’t one the planner can open/)
    expect(askSurveyor(pdf)).toBe(false)
  })

  it('offers the request to copy in the toast only where a better file is the fix', () => {
    expect(SURVEYOR_REQUEST).toMatch(/ASCII DXF \(AutoCAD 2013 or earlier\), with contours as polylines that have elevations/)
    sayFileError(new DxfError('This DXF is saved in binary form.'))
    expect(useSafety.getState().toast?.link?.label).toBe(COPY_REQUEST)
    sayFileError(new Error('That file isn’t one the planner can open.'))
    expect(useSafety.getState().toast?.link).toBeUndefined()
  })
})

describe('a survey with no contours on the layers guessed', () => {
  it('gives the layers to pick from instead of a dead end', () => {
    // The guess: sloping strings make up a third of SURVEY_LINES, so it isn't taken for contours.
    let err: unknown
    try {
      readSurvey('mixed.dxf', mixedLayers())
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(PickLayersError)
    const pick = err as PickLayersError
    expect(pick.message).toMatch(/No contours or spot levels found in mixed\.dxf.*Pick which layers hold them/)
    expect(pick.roles).toMatchObject({ SURVEY_LINES: 'ignore', LOT_BOUNDARY: 'boundary' })
    expect(pick.layers.map(l => l.name).sort()).toEqual(['LOT_BOUNDARY', 'SURVEY_LINES'])
    expect(askSurveyor(err)).toBe(true)
    // A survey that reads opens as before.
    expect(() => readSurvey('plane.dxf', planeSurvey())).not.toThrow()
  })

  it('opens the layer review, and opens the survey with the layers picked', async () => {
    const before = projectsNow().list.length
    const done = openFile(file('mixed.dxf', mixedLayers()), { into: 'new' })
    const ask = await layerReview()
    expect(ask.fileName).toBe('mixed.dxf')
    ask.answer({ fileName: ask.fileName, dxfText: ask.dxfText, roles: { ...ask.roles, SURVEY_LINES: 'contour' } })
    await done
    expect(useSafety.getState().layers).toBeNull()
    expect(projectsNow().list.length).toBe(before + 1)
    const survey = projectsNow().opened!.survey!
    expect(survey).toMatchObject({ fileName: 'mixed.dxf', roles: { SURVEY_LINES: 'contour' } })
    expect(readSite(survey).survey.contours.length).toBe(6)
  })

  it('opens nothing when the review is cancelled', async () => {
    const before = projectsNow().list.length
    const done = openFile(file('mixed.dxf', mixedLayers()), { into: 'new' })
    ;(await layerReview()).answer(null)
    await expect(done).resolves.toBeUndefined()
    expect(projectsNow().list.length).toBe(before)
  })
})
