// Every key number within two taps on a phone, from anywhere the menu can go: the numbers
// are all in the Overview, the peek sheet opens it with one tap, and whatever covers the
// peek is one tap away from gone (or Site in the bottom bar clears it).

import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { areaById, AREAS } from '../../nav/menu'
import { areaRoute, canvasOf, everyRoute, tabRoute, type AppRoute } from '../../nav/route'
import { ShellContext } from '../../shell/context'
import { checksHeadline, checksName } from '../../shell/headline'
import { OverviewSheet } from '../../shell/OverviewSheet'
import { SummaryStrip } from '../../shell/SummaryStrip'
import { PeekSheet } from '../PeekSheet'
import { arriveAt, inspectorShows, panelLocked, panelReads, panelStartsHidden, peekShows, PHONE_NUMBERS, tabTapped, tapsToNumbers, wasTapped, type Screen } from '../reach'
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

  it('leans on Site in the bottom bar opening its panel on the 3D view, one tap from the numbers (PH-25)', () => {
    // From every route, as the bottom bar links it.
    for (const r of appRoutes) {
      const to = tabRoute(r, 'site', areaById('site')!.defaultTab)
      expect(canvasOf(to)).toBe('3d')
    }
    // A tap on Site opens Site's panel (what was asked for), whose Key numbers button opens the Overview.
    for (const selected of bools) {
      const there = arriveAt('site', selected)
      expect(there.panel).toBe(true)
      expect(there.inspector).toBe(false)
      expect(tapsToNumbers(there)).toBe(1)
    }
    // Arriving any other way (Back, a link, search), the 3D view's panel still starts folded as a pill.
    expect(panelStartsHidden(true, '3d')).toBe(true)
    expect(panelStartsHidden(false, '3d')).toBe(false)
    expect(panelStartsHidden(true, 'plan')).toBe(false)
  })

  it('is one tap from a tab’s panel alone, by its Key numbers button (PH-25)', () => {
    for (const canvas of ['plan', '3d', 'print'] as const) expect(tapsToNumbers({ phone: true, loaded: true, canvas, inspector: false, panel: true, toolCard: false, overview: false })).toBe(1)
    // Under the selection's sheet it's two: close the sheet, then the button.
    expect(tapsToNumbers({ phone: true, loaded: true, canvas: 'plan', inspector: true, panel: true, toolCard: false, overview: false })).toBe(2)
  })

  it('opens a tab’s panel only for the tab that was tapped, and only for that one navigation (PH-25)', async () => {
    tabTapped('site/sun')
    expect(wasTapped('site/sun')).toBe(true)
    expect(wasTapped('site/block')).toBe(false)
    await new Promise(r => setTimeout(r, 5))
    // A later Back to the tab isn't a tap.
    expect(wasTapped('site/sun')).toBe(false)
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
      // Approvals › DA pack only takes the title block's details and downloads, so it stays open too.
      const changes = (r.area === 'design' && key !== 'design/sections') || r.area === 'earthworks' || (r.area === 'approvals' && key !== 'approvals/da-pack') || key === 'site/features'
      expect(panelLocked(true, false, key), key).toBe(changes)
      expect(panelLocked(true, true, key), key).toBe(false)
      expect(panelLocked(false, false, key), key).toBe(false)
    }
  })

  it('keeps Approvals’ locked panels open to read: only those (PH-07)', () => {
    for (const r of appRoutes) expect(panelReads(`${r.area}/${r.tab}`), `${r.area}/${r.tab}`).toBe(r.area === 'approvals')
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

  it('are a region with a heading and a list, opened by one button that says what it opens (AX-36)', () => {
    const html = renderToStaticMarkup(<PeekSheet numbers={n} stats={terrain.stats} title="Key numbers" onOpen={() => {}} />)
    // Not one big button, which would flatten the heading and the numbers for a screen reader.
    expect(html).toMatch(/^<div class="peek-sheet[^"]*" role="region" aria-label="Key numbers"/)
    expect(html).not.toContain('role="button"')
    expect(html).toContain('<button type="button" class="sheet-grab" aria-label="Key numbers. Open the overview"></button>')
    expect(html).toContain('<h2>Key numbers</h2>')
  })

  it('lead in the peek sheet: floor, FFL and roof height, with the ground’s range', () => {
    const peek = words(renderToStaticMarkup(<PeekSheet numbers={n} stats={terrain.stats} title="Showing people" onOpen={() => {}} />))
    expect(peek).toContain('Showing people')
    expect(peek).toContain('Pull up for every number')
    for (const p of PHONE_NUMBERS) if (p.peek) expect(peek, p.label).toContain(p.peek)
    expect(peek).toContain(`Floor level (FFL) RL ${n.ffl.toFixed(2)}`)
    expect(peek).toContain(`Building height ${n.roof!.height.toFixed(2)} m`)
    expect(peek).toContain(`RL ${terrain.stats.minRL.toFixed(2)}`)
    expect(peek).toContain(`RL ${terrain.stats.maxRL.toFixed(2)}`)
  })

  it('the checks have one name in Key numbers, the Overview and the strip (PH-18)', () => {
    // It was "Fast-track (CDC) checks" here, "Complying development (CDC) checks" in the Overview and "CDC checks" on the strip.
    for (const pathway of ['cdc', 'da'] as const) {
      const verdict = checksHeadline(pathway, [])
      const name = checksName(verdict.name)
      expect(name).toBe(pathway === 'cdc' ? 'Fast-track (CDC) checks' : 'Council (DA) checks')
      const peek = words(renderToStaticMarkup(<PeekSheet numbers={n} stats={terrain.stats} title="Key numbers" onOpen={() => {}} verdict={verdict} />))
      const overview = words(
        renderToStaticMarkup(
          <ShellContext.Provider value={shellData(survey, terrain, earth)}>
            <OverviewSheet numbers={n} stats={terrain.stats} onClose={() => {}} onBalance={() => {}} verdict={verdict} />
          </ShellContext.Provider>,
        ),
      )
      const counts = { pass: 3, fail: 1, warn: 0, unknown: 0, incomplete: 0, pending: 0, info: 0 }
      const strip = (share: boolean) =>
        words(renderToStaticMarkup(<SummaryStrip route={areaRoute(share ? 'share' : 'design')} numbers={n} checks={{ pathway, council: null, counts }} verdict={verdict} shown={{}} onBalance={() => {}} onOverview={() => {}} overviewOpen={false} />))
      for (const [where, text] of [
        ['Key numbers', peek],
        ['Overview', overview],
        ['strip', strip(false)],
        ['Share’s strip', strip(true)],
      ]) {
        expect(text, where).toContain(name)
        expect(text, where).not.toMatch(/Complying development \(CDC\) checks|Development application \(DA\) checks/)
      }
    }
  })

  it('the one-line Key numbers says the checks’ plain name, never the bare letters', () => {
    for (const pathway of ['cdc', 'da'] as const) {
      const verdict = checksHeadline(pathway, [])
      const html = renderToStaticMarkup(<PeekSheet numbers={n} stats={terrain.stats} title="Key numbers" onOpen={() => {}} verdict={verdict} slim />)
      const line = words(html.match(/<span class="peek-verdict[^>]*>(.*?)<\/span>/)![1])
      expect(line).toMatch(pathway === 'cdc' ? /^Fast-track checks / : /^Council checks /)
      expect(line).not.toMatch(/\b(CDC|DA)\b/)
    }
  })

  it('say first what Site features has to check, then the balance', () => {
    const peek = (checks: number) => words(renderToStaticMarkup(<PeekSheet numbers={n} stats={terrain.stats} title="Showing people" onOpen={() => {}} checks={checks} />))
    expect(peek(2)).toContain('2 to check in Site features')
    expect(peek(2)).not.toContain('Out of balance')
    if (n.earth?.outOfBalance) expect(peek(0)).toContain('Out of balance')
    expect(peek(0)).not.toContain('to check')
  })

  it('give the distances to the boundary in metres, like every other length in the Overview', () => {
    const overview = words(
      renderToStaticMarkup(
        <ShellContext.Provider value={shellData(survey, terrain, earth)}>
          <OverviewSheet numbers={n} stats={terrain.stats} onClose={() => {}} onBalance={() => {}} />
        </ShellContext.Provider>,
      ),
    )
    const sides = n.placement!.sides.filter(sd => sd.over <= 0)
    expect(sides.length).toBeGreaterThan(0)
    for (const sd of sides) expect(overview).toContain(`${sd.dist.toFixed(2)} m`)
    expect(overview).not.toMatch(/\d mm\b/)
  })

  it("gives the Overview's Open links a whole finger's worth of room on a phone", () => {
    const css = readFileSync(new URL('../../shell/shell.css', import.meta.url), 'utf8')
    const rule = /\.app-shell\.phone \.ov-group > \.ov-head > button\.link \{([^}]*)\}/.exec(css)
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/min-height: 44px/)
    expect(rule![1]).toMatch(/min-width: 44px/)
  })

  it('give the height of the walls before there is a roof (as the checks do), and say when there are no walls, rather than leave a gap', () => {
    const bare = house({ roofs: [] })
    const m = numbersOf(bare, survey, terrain, null)
    expect(words(renderToStaticMarkup(<PeekSheet numbers={m} stats={terrain.stats} title="Showing people" onOpen={() => {}} />))).toContain(`Building height ${m.height!.toFixed(2)} m`)
    const empty = numbersOf(house({ roofs: [], walls: [], rooms: [] }), survey, terrain, null)
    expect(words(renderToStaticMarkup(<PeekSheet numbers={empty} stats={terrain.stats} title="Showing people" onOpen={() => {}} />))).toContain('Building height No walls yet')
  })

  it('say when no house is drawn yet, rather than a bare dash (a block just imported)', () => {
    const m = { ...numbersOf(house({ roofs: [] }), survey, terrain, null), floorArea: null }
    const peek = words(renderToStaticMarkup(<PeekSheet numbers={m} stats={terrain.stats} title="Key numbers" onOpen={() => {}} />))
    expect(peek).toContain('No house drawn yet')
    expect(peek).toContain('Floor None drawn yet')
    expect(peek).not.toMatch(/Floor –/)
  })
})
