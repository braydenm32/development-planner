// Sheets that follow the finger: how far down closes one, and the street side picker in
// Site › Block, which Street view in 3D looks from.

import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { useCamera } from '../cameraStore'
import { release, sheetOffset, SHEETS, shouldClose, shouldGrow } from '../sheetDrag'
import { StreetSideField, StreetSideLink } from '../StreetSide'
import { usePlan } from '../../plan/store'
import { withStreetSide } from '../../plan/streetSide'
import { house, loadBlock, words } from './block'
import { buildIndex, search } from '../../nav/search'
import { PaletteOffer } from '../../shell/CommandPalette'

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

describe('pulling a tab panel up', () => {
  it('is the tab panels that grow, not the Overview or the selection', () => {
    expect(SHEETS.filter(s => s.grow).map(s => s.sheet)).toEqual(['.tab-panel'])
  })

  it('follows the finger all the way up where the sheet can grow', () => {
    expect(sheetOffset(-200, true)).toBe(-200)
    expect(sheetOffset(-20, true)).toBe(-20)
    expect(sheetOffset(120, true)).toBe(120)
  })

  it('goes tall past 48 px up, or with a quick flick', () => {
    expect(shouldGrow(-47, 1000)).toBe(false)
    expect(shouldGrow(-48, 1000)).toBe(true)
    expect(shouldGrow(-30, 20)).toBe(true)
    expect(shouldGrow(30, 20)).toBe(false)
    expect(release(-200, 300, 400, true, false)).toBe('grow')
  })

  it('comes back down to its usual height before a drag down closes it', () => {
    expect(release(150, 600, 400, true, true)).toBe('shrink')
    expect(release(150, 600, 400, true, false)).toBe('close')
    expect(release(20, 600, 400, true, true)).toBe('stay')
  })

  it("leaves the Overview and the selection as they were: a drag up doesn't grow them", () => {
    expect(release(-200, 300, 400, false, false)).toBe('stay')
    expect(release(150, 600, 400, false, false)).toBe('close')
    expect(release(-200, 300, 400, true, true)).toBe('stay')
  })
})

describe('the street side', () => {
  const { survey, terrain } = loadBlock()

  it('starts on the low side, and says which way that faces', () => {
    const html = renderToStaticMarkup(<dl><StreetSideField survey={survey} terrain={terrain} /></dl>)
    expect(html).toMatch(/<option value="auto" selected="">Auto \(low side: north\)<\/option>/)
    expect(words(renderToStaticMarkup(<StreetSideLink survey={survey} terrain={terrain} />))).toContain('Street view looks from the north side (the low side, until you set it).')
  })

  it("shows the plan's street side, the one the checks use", () => {
    usePlan.getState().load(withStreetSide(house(), survey.boundary, 'E'))
    // A static render reads the store's server snapshot, its initial state.
    Object.assign(usePlan.getInitialState(), usePlan.getState())
    const html = renderToStaticMarkup(<dl><StreetSideField survey={survey} terrain={terrain} /></dl>)
    expect(html).toMatch(/<option value="E" selected="">East side<\/option>/)
    expect(words(renderToStaticMarkup(<StreetSideLink survey={survey} terrain={terrain} />))).toContain('Street view looks from the east side.')
    expect(usePlan.getState().plan?.checks?.frontEdge).toBe(1)
    usePlan.getState().load(null)
    Object.assign(usePlan.getInitialState(), usePlan.getState())
  })

  it('counts each camera order, so the same one twice still moves the camera', () => {
    const n = useCamera.getState().command?.n ?? 0
    useCamera.getState().go('street')
    useCamera.getState().go('street', false)
    expect(useCamera.getState().command).toEqual({ to: 'street', n: n + 2, animate: false })
  })
})

describe('search on a phone, choosing an action', () => {
  const item = search(buildIndex([]), 'replace survey')[0]

  it('finds one that is offered to run where it lives', () => {
    expect(item.entry.label).toBe('Replace survey')
    expect(item.run).toBe('offer')
  })

  it('swaps the full-screen search for the offer alone, with no search box or results', () => {
    const html = renderToStaticMarkup(<PaletteOffer item={item} run={() => {}} onClose={() => {}} />)
    expect(html).toMatch(/^<div class="palette-backdrop offering">/)
    expect(html).not.toContain('palette-input')
    expect(html).not.toContain('palette-list')
    expect(words(html)).toContain('It’s here now. Run it? Run now Not now')
  })

  it('shows the offer as a bar along the bottom, with the place it went to showing above it', () => {
    const css = readFileSync(new URL('../../shell/shell.css', import.meta.url), 'utf8')
    const rule = (sel: string) => new RegExp(`${sel.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
    const backdrop = rule('.app-shell.phone .palette-backdrop.offering')
    expect(backdrop).toMatch(/align-items:\s*flex-end/)
    expect(backdrop).toMatch(/background:\s*transparent/)
    expect(rule('.app-shell.phone .palette.offering')).toMatch(/border-radius:\s*12px 12px 0 0/)
  })
})
