// Every key number within two taps on a phone, from anywhere the menu can go: the numbers
// are all in the Overview, the peek sheet opens it with one tap, and whatever covers the
// peek is one tap away from gone (or Site in the bottom bar clears it).

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { areaById, AREAS } from '../../nav/menu'
import { canvasOf, everyRoute, tabRoute, type AppRoute } from '../../nav/route'
import { ShellContext } from '../../shell/context'
import { OverviewSheet } from '../../shell/OverviewSheet'
import { PeekSheet } from '../PeekSheet'
import { arriveAt, inspectorShows, panelLocked, panelStartsHidden, peekShows, PHONE_NUMBERS, tapsToNumbers, type Screen } from '../reach'
import { earthOf, house, loadBlock, numbersOf, shellData, words } from './block'

const appRoutes = everyRoute().filter((r): r is AppRoute => r.kind === 'app')
const bools = [false, true]

/** What a phone shows on a route, with each sheet that can be open there open or not. */
function* screensOn(r: AppRoute): Generator<Screen> {
  const canvas = canvasOf(r)
  const area = areaById(r.area)!
  const tab = area.tabs.find(t => t.id === r.tab)
  for (const selected of bools)
    for (const panel of tab?.noPanel ? [false] : bools)
      for (const toolCard of canvas === 'plan' ? bools : [false])
        for (const overview of bools)
          yield { phone: true, loaded: true, canvas, inspector: inspectorShows(canvas, true, selected, false), panel, toolCard, overview }
}

describe('two taps to every number on a phone', () => {
  it('holds on every route the menu can make, whatever is open', () => {
    const far: string[] = []
    let screens = 0
    for (const r of appRoutes)
      for (const s of screensOn(r)) {
        screens++
        const n = tapsToNumbers(s)
        if (n > 2) far.push(`${r.area}/${r.tab}/${r.view} ${JSON.stringify(s)}: ${n}`)
      }
    expect(screens).toBeGreaterThan(100)
    expect(far).toEqual([])
  })

  it('is one tap wherever nothing covers the peek sheet', () => {
    for (const r of appRoutes) expect(tapsToNumbers({ phone: true, loaded: true, canvas: canvasOf(r), inspector: false, panel: false, toolCard: false, overview: false })).toBe(1)
  })

  it('leans on Site in the bottom bar opening the 3D view, where nothing covers the peek', () => {
    // From every route, as the bottom bar links it.
    for (const r of appRoutes) {
      const to = tabRoute(r, 'site', areaById('site')!.defaultTab)
      expect(canvasOf(to)).toBe('3d')
    }
    for (const selected of bools) expect(peekShows(arriveAt('site', selected))).toBe(true)
    expect(panelStartsHidden(true, '3d')).toBe(true)
    expect(panelStartsHidden(false, '3d')).toBe(false)
    expect(panelStartsHidden(true, 'plan')).toBe(false)
  })

  it('only shows the peek on a phone', () => {
    expect(peekShows({ phone: false, loaded: true, canvas: 'plan', inspector: false, panel: false, toolCard: false, overview: false })).toBe(false)
    expect(peekShows({ phone: true, loaded: false, canvas: 'plan', inspector: false, panel: false, toolCard: false, overview: false })).toBe(false)
  })

  it('shows the selection sheet on the plan only', () => {
    expect(inspectorShows('plan', true, true, false)).toBe(true)
    expect(inspectorShows('3d', true, true, false)).toBe(false)
    expect(inspectorShows('plan', true, true, true)).toBe(false)
    expect(inspectorShows('plan', true, false, false)).toBe(false)
  })

  it('locks the panels that change things in View, and only on a phone', () => {
    for (const r of appRoutes) {
      const key = `${r.area}/${r.tab}`
      // Design › Sections only shows drawings in View; its line tools wait for Edit (src/sections/SectionsTab.tsx).
      const changes = (r.area === 'design' && key !== 'design/sections') || r.area === 'earthworks' || key === 'site/features'
      expect(panelLocked(true, false, key), key).toBe(changes)
      expect(panelLocked(true, true, key), key).toBe(false)
      expect(panelLocked(false, false, key), key).toBe(false)
    }
  })

  it('covers every area', () => {
    expect(new Set(appRoutes.map(r => r.area))).toEqual(new Set(AREAS.map(a => a.id)))
  })
})

describe('the numbers it reaches', () => {
  const { survey, terrain } = loadBlock()
  const plan = house()
  const earth = earthOf(plan, survey, terrain)
  const n = numbersOf(plan, survey, terrain, earth)

  it('are all in the Overview', () => {
    const overview = words(
      renderToStaticMarkup(
        <ShellContext.Provider value={shellData(survey, terrain, earth)}>
          <OverviewSheet numbers={n} stats={terrain.stats} onClose={() => {}} onBalance={() => {}} />
        </ShellContext.Provider>,
      ),
    )
    for (const p of PHONE_NUMBERS) expect(overview, p.label).toContain(p.overview)
    expect(overview).toContain(`${n.earth!.fill.toFixed(1)} m³`)
    expect(overview).toContain(`RL ${n.ffl.toFixed(2)}`)
  })

  it('lead in the peek sheet: floor, FFL and roof height, with the ground’s range', () => {
    const peek = words(renderToStaticMarkup(<PeekSheet numbers={n} stats={terrain.stats} title="Showing people" onOpen={() => {}} />))
    expect(peek).toContain('Showing people')
    expect(peek).toContain('Pull up for every number')
    for (const p of PHONE_NUMBERS) if (p.peek) expect(peek, p.label).toContain(p.peek)
    expect(peek).toContain(`FFL RL ${n.ffl.toFixed(2)}`)
    expect(peek).toContain(`Roof ${n.roof!.height.toFixed(2)} m above ground`)
    expect(peek).toContain(`RL ${terrain.stats.minRL.toFixed(2)}`)
    expect(peek).toContain(`RL ${terrain.stats.maxRL.toFixed(2)}`)
  })

  it('say first what Site features has to check, then the balance', () => {
    const peek = (checks: number) => words(renderToStaticMarkup(<PeekSheet numbers={n} stats={terrain.stats} title="Showing people" onOpen={() => {}} checks={checks} />))
    expect(peek(2)).toContain('2 to check in Site features')
    expect(peek(2)).not.toContain('Out of balance')
    if (n.earth?.outOfBalance) expect(peek(0)).toContain('Out of balance')
    expect(peek(0)).not.toContain('to check')
  })

  it('say when there is no roof yet, rather than leave a gap', () => {
    const bare = house({ roofs: [] })
    const m = numbersOf(bare, survey, terrain, null)
    expect(words(renderToStaticMarkup(<PeekSheet numbers={m} stats={terrain.stats} title="Showing people" onOpen={() => {}} />))).toContain('Roof No roof yet')
  })
})
