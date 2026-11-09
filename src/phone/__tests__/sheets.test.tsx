// Sheets that follow the finger: how far down closes one, and the street side picker in
// Site › 3D, which turns Street view to the side picked.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { useCamera } from '../cameraStore'
import { sheetOffset, SHEETS, shouldClose } from '../sheetDrag'
import { StreetSidePicker } from '../StreetSide'
import { loadBlock, words } from './block'

describe('dragging a sheet down', () => {
  it('closes it past a quarter of its height, and at least 80 px', () => {
    expect(shouldClose(79, 200, 1000)).toBe(false)
    expect(shouldClose(80, 200, 1000)).toBe(true)
    expect(shouldClose(149, 600, 1000)).toBe(false)
    expect(shouldClose(150, 600, 1000)).toBe(true)
  })

  it('closes it with a quick flick, but not a twitch', () => {
    expect(shouldClose(40, 600, 50)).toBe(true)
    expect(shouldClose(20, 600, 10)).toBe(false)
    expect(shouldClose(40, 600, 200)).toBe(false)
  })

  it('never closes it on a drag up', () => {
    expect(shouldClose(0, 600, 10)).toBe(false)
    expect(shouldClose(-300, 600, 10)).toBe(false)
  })

  it('moves with the finger down, and only a little up', () => {
    expect(sheetOffset(120)).toBe(120)
    expect(sheetOffset(-20)).toBe(-5)
    expect(sheetOffset(-400)).toBe(-15)
  })

  it('serves the Overview, the selection and the tab panels', () => {
    expect(SHEETS.map(s => s.sheet)).toEqual(['.overview-sheet', '.inspector', '.tab-panel'])
  })
})

describe('the street side', () => {
  const { survey, terrain } = loadBlock()

  it('starts on the low side, and says which way that faces', () => {
    const html = renderToStaticMarkup(<StreetSidePicker projectKey="p1" survey={survey} terrain={terrain} />)
    expect(words(html)).toContain('The low side faces north.')
    expect(html).toMatch(/<button class="on" aria-pressed="true">Low side<\/button>/)
  })

  it('shows the side picked for the project', () => {
    useCamera.getState().setStreetSide('p2', 'E')
    // A static render reads the store's server snapshot, its initial state.
    Object.assign(useCamera.getInitialState(), useCamera.getState())
    const html = renderToStaticMarkup(<StreetSidePicker projectKey="p2" survey={survey} terrain={terrain} />)
    expect(html).toMatch(/<button class="on" aria-pressed="true">E<\/button>/)
    expect(useCamera.getState().streetSides).toMatchObject({ p2: 'E' })
  })

  it('counts each camera order, so the same one twice still moves the camera', () => {
    const n = useCamera.getState().command?.n ?? 0
    useCamera.getState().go('street')
    useCamera.getState().go('street', false)
    expect(useCamera.getState().command).toEqual({ to: 'street', n: n + 2, animate: false })
  })
})
