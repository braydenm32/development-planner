// The app's menu and routes: every feature in features.json has exactly one home,
// every tab and More item can be reached, every route survives the address bar, Back and
// reload land where they should, and ⌘K finds every feature by its name.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AreaNav, TabBar } from '../../shell/Nav'
import { MORE_SECTIONS, TAB_PANELS } from '../../shell/sections'
import features from '../features.json'
import { allPlaces, areaById, AREAS, HOMES, homeOf, MORE, tabIds, type Entry } from '../menu'
import { navigate, startRouter, useRouter } from '../router'
import { areaRoute, canvasOf, carriesSelection, defaultRoute, everyRoute, formatHash, PAGE_IDS, pageOf, pageRoute, parseHash, PROJECTS, resumeRoute, tabRoute, unknownHash, type AppRoute, type Route } from '../route'
import { buildIndex, featureLabel, projectItems, search, specOnly, stem, thingItems, withoutCloud, type SearchItem } from '../search'
import { LEADS, MORE_WORDS, NOT_HERE } from '../searchWords'
import { forgetTabs, openingTab, rememberTab } from '../../shell/lastTab'

const places = allPlaces()
const entries = places.map(p => p.entry)
const featureIds = new Set(features.map(f => f.id))

describe('features.json', () => {
  it('has one entry per feature id, each with a name', () => {
    expect(features.length).toBe(featureIds.size)
    for (const f of features) expect(f.name.trim().length, f.id).toBeGreaterThan(0)
  })

  it('lists the features added since the feature map was made', () => {
    const added = [
      // sections and elevations
      'sections-tab',
      'section-line-draw',
      'section-drawing',
      'section-flip-delete',
      'elevations',
      'elevation-height',
      'sections-large',
      'section-marks-plan',
      'sections-pdf',
      // furniture
      'tool-furniture',
      'furniture-catalog',
      'place-furniture',
      'drag-furniture',
      'furniture-turn',
      'kbd-furniture-turn',
      'furniture-wall-distances',
      'furniture-settings',
      'furniture-pdf',
      'furniture-3d-print',
      'show-furniture-3d',
      'furniture-3d',
      // ground vs this floor
      'ground-vs-floor-toggle',
      'ground-vs-floor-key',
      'ground-meets-floor-line',
      'ground-pointer-readout',
      'room-ground-range',
      // driveway grade
      'driveway-average-grade',
      'driveway-cross-fall',
      'driveway-verdict',
      // 1:50 print (#13)
      'print-scale-1-50',
      // retaining walls and finished contours (#14)
      'tool-retaining',
      'new-retaining-type',
      'retaining-new-wall',
      'retaining-side',
      'retaining-height',
      'retaining-levels',
      'retaining-bench',
      'retaining-section',
      'retaining-engineer-flag',
      'retaining-holds-back-pill',
      'finished-contours-toggle',
      'finished-contours-key',
      'finished-contours-plan',
      'finished-contours-pdf',
      // the app's frame
      'summary-strip',
      'overview-sheet',
      'command-search',
      'projects-home',
      'fit-block',
      // compliance checks
      'compliance-checks',
      'checks-pathway',
      'checks-sources',
      'lot-facts',
      'tree-protection-checks',
      'mark-tree-removal',
      'checks-chip',
      // projects (#16)
      'project-new',
      'project-open',
      'project-card',
      'project-duplicate',
      'project-rename',
      'project-archive',
      'project-restore',
      'project-delete-review',
      'project-file-as-new',
      'save-failed-notice',
      'replace-survey-keep',
      // site features (#17)
      'site-to-check',
      'site-tree-zones',
      'site-feature-inspector',
      'site-feature-list',
      'site-drawing-add',
      'site-drawing-line-up',
      'site-drawing-settings',
      'site-drawing-include',
      'site-drawing-found',
      'site-trace',
      'site-plan-toolbar',
      'site-features-plan',
      'tool-garage',
      'new-garage-door-size',
      'garage-door-symbol',
      'garage-door-3d',
      'new-roof-mode',
      // rooms from walls and the rectangle room (usability audit, wave 2)
      'rooms-from-walls',
      'rectangle-room',
      'click-room-floor',
      'first-outline-fit',
      'new-tool-settings-kept',
      'roof-click-inside',
      'setback-dimensions-plan',
      'setback-dimensions-toggle',
      'setback-dimensions-pdf',
      'driveway-levels',
      'driveway-design-grade',
      'site-features-3d',
      'site-extra-dxf',
      'site-feature-layer-roles',
      'site-features-pdf',
      'site-features-3d-print',
      'site-features-project-file',
      'site-checks-chip',
      // the phone
      'phone-view-edit',
      'plan-touch-gestures',
      'camera-presets-3d',
      'camera-remembered',
      'show-people-3d',
      'street-side-3d',
      'ground-tap-level',
      'peek-sheet',
      'key-chip',
      'share-from-phone',
      // start and safety (#31, #32, #33, #34, #36, #43, #4)
      'start-two-choices',
      'sketch-without-survey',
      'sketch-block-size',
      'start-never-traps',
      'sketch-block-notice',
      'sketch-change-size',
      'sketch-canvas-chip',
      'add-survey-later',
      'review-replace-survey',
      'previous-survey-kept',
      'review-import-plan',
      'review-new-plan',
      'review-open-project',
      'open-any-file',
      'plan-without-survey',
      'undo-toast',
      'review-sheet',
      'undo-after-reload',
      'project-delete-undo',
      // view memory and the import read-back
      'plan-view-remembered',
      'plan-zoom-buttons',
      'survey-read-back',
      'camera-clear-of-panels',
      // passkey sign-in and cloud saves (#38, #39)
      'cloud-sign-in',
      'cloud-create-account',
      'cloud-recovery-code',
      'cloud-add-passkey',
      'cloud-sign-out',
      'cloud-sync',
      'cloud-sync-chip',
      'cloud-conflict-copies',
      'cloud-first-upload',
      'cloud-device-only',
      // read-only share links
      'share-link-make',
      'share-link-list',
      'share-link-off',
      'share-link-view',
      // costs
      'cost-strip',
      'cost-estimate',
      'cost-line-source',
      'cost-range',
      'cost-who-builds',
      'cost-owner-builder-split',
      'cost-quote-add',
      'cost-plan-highlight',
      'cost-csv',
      'cost-materials',
      'cost-floor-linked',
      'cost-quotes-list',
      'cost-rates',
      'cost-reset-rate',
      'cost-allowances',
      'cost-sources',
      'cost-owner-builder-rules',
      'cost-project-file',
      'cost-undo',
      // sun and shadow
      'sun-location',
      'sun-true-north',
      'sun-study-3d',
      'sun-day-time',
      'sun-play-day',
      'sun-living-hours',
      'plan-shadow-diagram',
      'shadow-over-boundary',
      'room-living-area',
      'sun-checks',
      'shadow-diagram-pdf',
      'overview-sun',
    ]
    expect(added.filter(id => !featureIds.has(id))).toEqual([])
  })
})

describe('the menu', () => {
  it('gives every feature exactly one home', () => {
    const homes = new Map<string, string[]>()
    for (const { entry } of places) for (const f of entry.features) homes.set(f, [...(homes.get(f) ?? []), entry.id])
    const homeless = features.filter(f => !homes.has(f.id)).map(f => f.id)
    const twice = [...homes].filter(([, at]) => at.length > 1).map(([f, at]) => `${f}: ${at.join(', ')}`)
    expect(homeless).toEqual([])
    expect(twice).toEqual([])
    for (const f of features) expect(homeOf(f.id)?.entry.id).toBe(homes.get(f.id)![0])
  })

  it('names only features that exist', () => {
    const unknown = entries.flatMap(e => e.features.filter(f => !featureIds.has(f)).map(f => `${e.id}: ${f}`))
    expect(unknown).toEqual([])
  })

  it('gives every entry its own id and a label', () => {
    const ids = entries.map(e => e.id)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
    for (const e of entries) expect(e.label.trim().length, e.id).toBeGreaterThan(0)
  })

  it('has the six areas, each with its tabs in order and a More where it has rare things', () => {
    expect(AREAS.map(a => a.id)).toEqual(['site', 'design', 'earthworks', 'approvals', 'costs', 'share'])
    expect(AREAS.map(a => tabIds(a))).toEqual([
      ['block', 'features', 'map', '3d', 'sun', MORE],
      ['plan', 'floors', 'rooms', 'walls', 'roofs', 'furniture', 'sections', 'options', MORE],
      ['place', 'cut-fill', 'retaining-walls', 'driveway', MORE],
      ['checks', 'basix', 'stormwater', 'da-pack'],
      ['estimate', 'materials', 'quotes', MORE],
      ['plans', 'export', 'send', '3d-print', MORE],
    ])
    for (const a of AREAS) {
      expect(a.tabs.some(t => t.id === a.defaultTab), a.id).toBe(true)
      if (a.id !== 'approvals') expect(a.more.items.length, a.id).toBeGreaterThan(0)
    }
  })

  it('starts the project menu with All projects', () => {
    const menu = HOMES.find(h => h.id === 'project-menu')!
    expect(menu.items[0]).toMatchObject({ label: 'All projects…', action: 'projects' })
    expect(menu.items.map(i => i.label)).toEqual([
      'All projects…',
      'New project…',
      'Open an example',
      'Where it’s saved',
      'Sign in and cloud saves',
      'Project name',
      'Survey file name',
      'Download a backup (project file)',
      'Open a project file…',
      'Export the house plan only',
      'Start the plan again',
      'About Contour & Gable',
      'Privacy policy',
      'Terms of use',
      'How accurate is this?',
    ])
  })

  it('gives the site features their home in Site › Features, on the plan', () => {
    const tab = areaById('site')!.tabs.find(t => t.id === 'features')!
    expect(tab.features).toEqual(expect.arrayContaining(['site-to-check', 'site-drawing-add', 'site-drawing-line-up', 'site-trace', 'site-feature-inspector']))
    expect(tab.view).toBe('plan')
    expect(tab.shows).toEqual(['site-checks'])
    expect(TAB_PANELS['site/features']).toBeDefined()
    // what reaches past the tab lives where it shows
    expect(homeOf('site-features-pdf')?.entry.id).toBe('plans')
    expect(homeOf('site-features-3d-print')?.entry.id).toBe('3d-print')
    expect(homeOf('site-features-project-file')?.entry.id).toBe('send')
    expect(homeOf('site-feature-layer-roles')?.entry.id).toBe('survey-layers')
    expect(homeOf('site-checks-chip')?.entry).toMatchObject({ id: 'site-checks', at: 'site/features' })
  })

  it('finds the Rectangle room by the words people look for it with, and runs it (CB-17)', () => {
    const index = buildIndex(features)
    for (const word of ['rectangle', 'draw a room', 'room shape']) expect(search(index, word)[0]?.entry, word).toMatchObject({ id: 'rect-room', action: 'rect-room', run: 'now', shortcut: 'shift+W' })
    expect(homeOf('rectangle-room')?.entry.id).toBe('rect-room')
    expect(homeOf('rooms-from-walls')?.entry.id).toBe('plan')
  })

  it('gives the sun its own Site tab, found by the words people use for it', () => {
    const tab = areaById('site')!.tabs.find(t => t.id === 'sun')!
    expect(tab).toMatchObject({ label: 'Sun', view: '3d' })
    expect(TAB_PANELS['site/sun']).toBeDefined()
    expect(homeOf('plan-shadow-diagram')?.entry.id).toBe('plan-shadows')
    expect(homeOf('room-living-area')?.entry.id).toBe('inspect-room')
    expect(homeOf('shadow-diagram-pdf')?.entry.id).toBe('plans')
    expect(homeOf('sun-checks')?.entry.id).toBe('checks')
    const index = buildIndex(features)
    for (const word of ['sun', 'overshadowing', 'solar']) expect(search(index, word)[0]?.place, word).toMatchObject({ kind: 'tab', area: { id: 'site' }, tab: { id: 'sun' } })
    // "shadow" finds the plan's shadows first, and the Sun tab too.
    expect(search(index, 'shadow')[0]?.entry.id).toBe('plan-shadows')
    expect(search(index, 'shadow').some(r => r.place.kind === 'tab' && r.place.tab.id === 'sun')).toBe(true)
  })

  it('puts Costs between Earthworks and Share, with its rates in More and ⌘K words for money', () => {
    const costs = areaById('costs')!
    expect(costs).toMatchObject({ label: 'Costs', defaultTab: 'estimate', view: 'plan', report: true })
    expect(costs.more.items.map(i => i.id)).toEqual(['cost-rates', 'cost-about'])
    expect(costs.keywords).toEqual(expect.arrayContaining(['cost', 'estimate', 'budget', 'price', 'quote', 'owner-builder', 'materials', 'rates']))
    expect(costs.tabs.find(t => t.id === 'estimate')!.shows).toEqual(['cost'])
    expect(TAB_PANELS['costs/estimate'] && TAB_PANELS['costs/materials'] && TAB_PANELS['costs/quotes']).toBeDefined()
    expect(MORE_SECTIONS['cost-rates'] && MORE_SECTIONS['cost-about']).toBeDefined()
    expect(homeOf('cost-reset-rate')).toMatchObject({ entry: { id: 'cost-rates' }, place: { kind: 'more', area: { id: 'costs' } } })
    expect(homeOf('cost-project-file')?.entry.id).toBe('send')
    expect(homeOf('cost-csv')?.entry.id).toBe('estimate')
    // ⌘K finds it by the words people use for money
    const index = buildIndex(features)
    for (const word of ['cost', 'estimate', 'budget', 'price', 'quote', 'owner-builder', 'materials', 'rates']) expect(search(index, word)[0]?.place, word).toMatchObject({ area: { id: 'costs' } })
  })
})

/** The hrefs in some markup, with `&amp;` read back as `&`. */
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map(m => m[1].replaceAll('&amp;', '&'))

describe('reaching every tab and More item', () => {
  it('links every area from the rail and the bottom bar', () => {
    for (const variant of ['rail', 'bottom'] as const) {
      const from: AppRoute = { kind: 'app', area: 'design', tab: 'rooms', view: 'plan', level: 'upper', sel: 'r1' }
      const links = hrefs(renderToStaticMarkup(createElement(AreaNav, { route: from, go: () => {}, variant })))
      for (const a of AREAS) expect(links, `${variant} ${a.id}`).toContain(formatHash(tabRoute(from, a.id, a.defaultTab)))
      if (variant === 'rail') expect(links).toContain(formatHash(PROJECTS))
    }
  })

  it("links every tab and More from its area's tab bar, keeping the level and selection", () => {
    for (const a of AREAS) {
      const from: AppRoute = { ...areaRoute(a.id), level: 'upper', sel: 'w2' }
      const links = hrefs(renderToStaticMarkup(createElement(TabBar, { route: from, go: () => {} })))
      expect(links.length).toBe(tabIds(a).length)
      for (const t of tabIds(a)) {
        const to = parseHash(formatHash(tabRoute(from, a.id, t)))
        expect(links, `${a.id}/${t}`).toContain(formatHash(tabRoute(from, a.id, t)))
        expect(to).toMatchObject({ area: a.id, tab: t, level: 'upper', sel: 'w2' })
      }
    }
  })

  it('shows a panel for every tab that has one, and a section for every More item', () => {
    const tabs = AREAS.flatMap(a => a.tabs.filter(t => !t.noPanel).map(t => `${a.id}/${t.id}`))
    const more = AREAS.flatMap(a => a.more.items.map(i => i.id))
    expect(tabs.filter(k => !TAB_PANELS[k])).toEqual([])
    expect(more.filter(k => !MORE_SECTIONS[k])).toEqual([])
    // and nothing is wired up that the menu doesn't name
    expect(Object.keys(TAB_PANELS).filter(k => !tabs.includes(k))).toEqual([])
    expect(Object.keys(MORE_SECTIONS).filter(k => !more.includes(k))).toEqual([])
  })

  it('sends ⌘K only to places that exist', () => {
    for (const e of entries.filter((x): x is Entry & { at: string } => !!x.at)) {
      const [area, tab, item] = e.at.split('/')
      const r = parseHash(`#/${area}/${tab}`)
      expect(r, e.id).toMatchObject({ kind: 'app', area, tab })
      if (item) {
        expect(tab, e.id).toBe(MORE)
        expect(areaById(area)!.more.items.map(i => i.id), e.id).toContain(item)
      }
    }
  })

  it('gives every global item something ⌘K can do: run it, open the project menu at it, show where it is, or say how', () => {
    const idle = HOMES.flatMap(h =>
      h.items.filter(i => !(i.action && i.run) && h.id !== 'project-menu' && !i.at && !i.hint && !i.shortcut).map(i => `${h.id}/${i.id}`),
    )
    expect(idle).toEqual([])
    // an action that isn't run straight away needs a home to offer it from
    for (const e of entries.filter(x => x.action)) expect(e.run, e.id).toBeDefined()
  })
})

describe('routes', () => {
  const examples: Route[] = [
    ...everyRoute(),
    { kind: 'app', area: 'design', tab: 'plan', view: 'plan', level: 'level_ground', sel: 'r1' },
    { kind: 'app', area: 'earthworks', tab: 'more', view: '3d', level: 'level 2', sel: 'w&1=?#x' },
    { kind: 'app', area: 'share', tab: '3d-print', view: 'plan', sel: 'roof_9' },
  ]

  it('round-trip through the address bar', () => {
    expect(everyRoute().length).toBe(3 + AREAS.reduce((t, a) => t + tabIds(a).length * 2, 0))
    for (const r of examples) expect(parseHash(formatHash(r)), formatHash(r)).toEqual(r)
  })

  it('read the form the brief gives', () => {
    expect(formatHash({ kind: 'app', area: 'design', tab: 'rooms', view: '3d', level: 'level_ground', sel: 'r1' })).toBe(
      '#/design/rooms?view=3d&level=level_ground&sel=r1',
    )
    expect(formatHash(PROJECTS)).toBe('#/projects')
    expect(parseHash('#/projects')).toEqual(PROJECTS)
    expect(parseHash('#/projects/archived')).toEqual({ kind: 'projects', show: 'archived' })
    expect(parseHash('#/projects/new')).toEqual({ kind: 'projects', show: 'new' })
    expect(parseHash('#/projects/whatever')).toEqual(PROJECTS)
  })

  it('fill in a partial link and ignore one that is not ours', () => {
    expect(parseHash('')).toBeNull()
    expect(parseHash('#')).toBeNull()
    expect(parseHash('#section-2')).toBeNull()
    expect(parseHash('#/nowhere/plan')).toBeNull()
    // Earthworks opens on its first step, Place (HO-40).
    expect(parseHash('#/earthworks')).toEqual({ kind: 'app', area: 'earthworks', tab: 'place', view: 'plan' })
    expect(parseHash('#/site/bogus')).toEqual({ kind: 'app', area: 'site', tab: 'block', view: '3d' })
    expect(parseHash('#/design/plan?view=sideways')).toEqual({ kind: 'app', area: 'design', tab: 'plan', view: 'plan' })
    expect(parseHash('#/site/block')).toEqual({ kind: 'app', area: 'site', tab: 'block', view: '3d' })
  })

  // LD-30: a cut-off percent-escape threw "URI malformed" and left the address and the screen out of step.
  it('treat a part that will not decode as no address of ours, without throwing', () => {
    expect(parseHash('#/design/%E0%A4%A')).toBeNull()
    expect(parseHash('#/%E0%A4%A/plan?view=plan')).toBeNull()
    expect(parseHash('#/design/plan?view=plan&sel=%E0%A4%A')).toMatchObject({ area: 'design', tab: 'plan' })
  })

  // LD-31: a More item opened by its id stays in the address, so a reload lands on it.
  it('keep a More item in the address', () => {
    const r = parseHash('#/design/more/wall-preset')
    expect(r).toEqual({ kind: 'app', area: 'design', tab: 'more', view: 'plan', item: 'wall-preset' })
    expect(formatHash(r!)).toBe('#/design/more/wall-preset?view=plan')
    expect(parseHash(formatHash({ ...(r as AppRoute), level: 'L1', sel: 'w1' }))).toEqual({ ...r, level: 'L1', sel: 'w1' })
    // An item the area's More doesn't have drops out; so does one after a tab that isn't More.
    expect(parseHash('#/design/more/nope')).toEqual({ kind: 'app', area: 'design', tab: 'more', view: 'plan' })
    expect(parseHash('#/design/plan/wall-preset')).toEqual({ kind: 'app', area: 'design', tab: 'plan', view: 'plan' })
    // Going on to another tab leaves it behind.
    expect(tabRoute(r!, 'design', 'plan')).toEqual({ kind: 'app', area: 'design', tab: 'plan', view: 'plan' })
  })

  // LF-31: an address that names no page here opens somewhere sensible, and the app says so once.
  it('tell an address that names no page here from a partial or moved one', () => {
    for (const h of ['#/design/costs', '#/nope/nope', '#/accuracy/x', '#about', '#/design/%E0%A4%A', '#/projects/whatever', '#section-2']) expect(unknownHash(h), h).toBe(true)
    for (const h of ['', '#', '#/', '#/design', '#/earthworks/cut-fill?view=3d', '#/design/checks', '#/share/print'.replace('print', 'plans'), '#/projects', '#/projects/new', '#/about', '#/design/more/wall-preset']) expect(unknownHash(h), h).toBe(false)
  })

  // HO-40: Earthworks opens on Place; back from another area it opens where it was left this visit.
  it('open Earthworks on Place, then on the tab it was left on', () => {
    forgetTabs()
    const earth = areaById('earthworks')!
    const design = areaById('design')!
    expect(earth.defaultTab).toBe('place')
    expect(earth.tabs[0].id).toBe('place')
    expect(openingTab('p1', earth)).toBe('place')
    rememberTab('p1', earth, 'cut-fill')
    expect(openingTab('p1', earth)).toBe('cut-fill')
    // Another project starts at Place again; an area that doesn't remember always opens on its first tab.
    expect(openingTab('p2', earth)).toBe('place')
    rememberTab('p1', design, 'roofs')
    expect(openingTab('p1', design)).toBe('plan')
    forgetTabs()
  })

  it('take old links to Checks, BASIX and Stormwater to Approvals', () => {
    expect(parseHash('#/design/checks?view=plan&level=L1')).toEqual({ kind: 'app', area: 'approvals', tab: 'checks', view: 'plan', level: 'L1' })
    expect(parseHash('#/design/basix?view=3d')).toEqual({ kind: 'app', area: 'approvals', tab: 'basix', view: '3d' })
    expect(parseHash('#/earthworks/stormwater?view=plan&sel=r1')).toEqual({ kind: 'app', area: 'approvals', tab: 'stormwater', view: 'plan', sel: 'r1' })
    expect(resumeRoute('#/design/checks?view=plan')).toMatchObject({ area: 'approvals', tab: 'checks' })
    // A More that the area doesn't have lands on its first tab.
    expect(parseHash('#/approvals/more')).toEqual({ kind: 'app', area: 'approvals', tab: 'checks', view: 'plan' })
  })

  it('open the Levels tab from its name, #/design/levels, as well as #/design/floors (final check 6)', () => {
    expect(parseHash('#/design/levels')).toEqual({ kind: 'app', area: 'design', tab: 'floors', view: 'plan' })
    expect(parseHash('#/design/levels?view=3d&level=L2')).toMatchObject({ area: 'design', tab: 'floors', view: '3d', level: 'L2' })
    expect(unknownHash('#/design/levels')).toBe(false)
    expect(formatHash(parseHash('#/design/levels')!)).toMatch(/^#\/design\/floors\?/)
  })

  it('tell pages apart by area and tab, not by what is selected or which level shows', () => {
    expect(pageOf(parseHash('#/design/plan?view=plan&sel=w1')!)).toBe(pageOf(parseHash('#/design/plan?view=3d&level=L2')!))
    expect(pageOf(parseHash('#/design/plan')!)).not.toBe(pageOf(parseHash('#/design/roofs')!))
    expect(pageOf(PROJECTS)).toBe('#/projects')
  })

  it('land a first visit, or an old saved mode, somewhere sensible', () => {
    expect(defaultRoute()).toEqual({ kind: 'app', area: 'design', tab: 'plan', view: 'plan' })
    expect(defaultRoute('plan')).toEqual({ kind: 'app', area: 'design', tab: 'plan', view: 'plan' })
    expect(defaultRoute('3d')).toEqual({ kind: 'app', area: 'site', tab: '3d', view: '3d' })
    expect(defaultRoute('print')).toEqual({ kind: 'app', area: 'share', tab: 'plans', view: 'plan' })
    expect(defaultRoute('something else')).toEqual(defaultRoute())
  })

  it('keep the canvas within an area and take the new area’s canvas from another', () => {
    const in3d: AppRoute = { kind: 'app', area: 'earthworks', tab: 'place', view: '3d', level: 'L1', sel: 's1' }
    expect(tabRoute(in3d, 'earthworks', 'cut-fill')).toEqual({ ...in3d, tab: 'cut-fill' })
    expect(tabRoute(in3d, 'site', '3d')).toMatchObject({ area: 'site', tab: '3d', view: '3d', level: 'L1', sel: 's1' })
    expect(tabRoute(in3d, 'design', 'plan')).toMatchObject({ area: 'design', tab: 'plan', view: 'plan', level: 'L1', sel: 's1' })
    expect(tabRoute(PROJECTS, 'share', 'plans')).toEqual(areaRoute('share', 'plans'))
  })

  it("put down a selection in an area that doesn't work on it", () => {
    const wall: AppRoute = { kind: 'app', area: 'earthworks', tab: 'retaining-walls', view: 'plan', level: 'L1', sel: 'w3' }
    // A retaining wall picked in Earthworks doesn't follow you to Design › Roofs, where its card has no place…
    expect(carriesSelection(wall, tabRoute(wall, 'design', 'roofs'), 'retaining')).toBe(false)
    expect(carriesSelection(wall, tabRoute(wall, 'site', '3d'), 'retaining')).toBe(false)
    // …but it does to Design › Plan, which edits everything, and around Earthworks.
    expect(carriesSelection(wall, tabRoute(wall, 'design', 'plan'), 'retaining')).toBe(true)
    expect(carriesSelection(wall, tabRoute(wall, 'earthworks', 'cut-fill'), 'retaining')).toBe(true)
    // A roof goes to Design › Roofs from anywhere (Stormwater's links do that), and a room to Rooms & areas.
    const drain: AppRoute = { kind: 'app', area: 'approvals', tab: 'stormwater', view: 'plan', sel: 'roof1' }
    expect(carriesSelection(drain, { ...drain, area: 'design', tab: 'roofs' }, 'roof')).toBe(true)
    expect(carriesSelection(drain, { ...drain, area: 'design', tab: 'rooms' }, 'room')).toBe(true)
    expect(carriesSelection(drain, { ...drain, area: 'design', tab: 'roofs' }, 'room')).toBe(false)
    // Within an area a selection always stays.
    const roofs: AppRoute = { kind: 'app', area: 'design', tab: 'roofs', view: 'plan', sel: 'w1' }
    expect(carriesSelection(roofs, tabRoute(roofs, 'design', 'sections'), 'wall')).toBe(true)
  })

  it('show the print preview only on Share › 3D print', () => {
    for (const r of everyRoute()) {
      if (r.kind !== 'app') continue
      expect(canvasOf(r), formatHash(r)).toBe(r.area === 'share' && r.tab === '3d-print' ? 'print' : r.view)
    }
  })
})

// ---------------------------------------------------------------------------
// A pretend browser: an address bar, a history list, storage and window events.

function fakeBrowser(href: string, stored: Record<string, string> = {}) {
  const url = new URL(href)
  const entries = [url.href]
  let at = 0
  const events = new EventTarget()
  const store = new Map(Object.entries(stored))
  const go = (to: string | URL | null | undefined) => {
    if (to != null) url.href = new URL(String(to), url.href).href
  }
  const move = (by: number) => {
    at += by
    url.href = entries[at]
    events.dispatchEvent(new Event('popstate'))
  }
  const history = {
    state: null,
    pushState: (_s: unknown, _t: string, to?: string | URL | null) => {
      go(to)
      entries.splice(at + 1, Infinity, url.href)
      at++
    },
    replaceState: (_s: unknown, _t: string, to?: string | URL | null) => {
      go(to)
      entries[at] = url.href
    },
    back: () => move(-1),
    forward: () => move(1),
  }
  vi.stubGlobal('location', {
    get href() {
      return url.href
    },
    get hash() {
      return url.hash
    },
    get search() {
      return url.search
    },
  })
  vi.stubGlobal('history', history)
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  })
  vi.stubGlobal('window', { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) })
  return { url, history, store, entries: () => [...entries], at: () => at }
}

const routeNow = () => useRouter.getState().route

describe('the router', () => {
  let stop: (() => void) | null = null
  beforeEach(() => useRouter.setState({ route: defaultRoute(), focus: null }))
  afterEach(() => {
    stop?.()
    stop = null
    vi.unstubAllGlobals()
  })

  it('writes a first visit with no hash as Design › Plan', () => {
    const b = fakeBrowser('https://example.test/app/')
    stop = startRouter()
    expect(b.url.hash).toBe('#/design/plan?view=plan')
    expect(b.entries()).toHaveLength(1)
  })

  it("lands a first visit where the old layout's saved mode was", () => {
    const b = fakeBrowser('https://example.test/app/', { 'view-v1': JSON.stringify({ mode: '3d', exaggeration: 2 }) })
    stop = startRouter()
    expect(routeNow()).toEqual({ kind: 'app', area: 'site', tab: '3d', view: '3d' })
    expect(b.url.hash).toBe('#/site/3d?view=3d')
    stop()
    vi.unstubAllGlobals()
    const p = fakeBrowser('https://example.test/app/', { 'view-v1': JSON.stringify({ mode: 'print' }) })
    stop = startRouter()
    expect(p.url.hash).toBe('#/share/plans?view=plan')
  })

  it('steps Back and Forward through areas and tabs', () => {
    const b = fakeBrowser('https://example.test/app/#/design/plan?view=plan')
    stop = startRouter()
    navigate(tabRoute(routeNow(), 'design', 'floors'))
    navigate(tabRoute(routeNow(), 'design', 'rooms'))
    navigate(tabRoute(routeNow(), 'earthworks', 'cut-fill'))
    expect(b.entries()).toHaveLength(4)
    b.history.back()
    expect(routeNow()).toMatchObject({ area: 'design', tab: 'rooms' })
    b.history.back()
    expect(routeNow()).toMatchObject({ area: 'design', tab: 'floors' })
    b.history.forward()
    expect(routeNow()).toMatchObject({ area: 'design', tab: 'rooms' })
    b.history.back()
    b.history.back()
    expect(routeNow()).toMatchObject({ area: 'design', tab: 'plan' })
  })

  it("keeps the level and selection up to date without adding Back steps", () => {
    const b = fakeBrowser('https://example.test/app/#/design/rooms?view=plan')
    stop = startRouter()
    navigate({ ...(routeNow() as AppRoute), level: 'level_ground', sel: 'r1' }, { replace: true })
    expect(b.entries()).toEqual(['https://example.test/app/#/design/rooms?view=plan&level=level_ground&sel=r1'])
    // the same place again changes nothing
    navigate({ ...(routeNow() as AppRoute) })
    expect(b.entries()).toHaveLength(1)
  })

  it('restores the area, tab, view, level and selection on reload', () => {
    const at = '#/earthworks/retaining-walls?view=3d&level=level_upper&sel=w7'
    fakeBrowser(`https://example.test/app/${at}`)
    stop = startRouter()
    expect(routeNow()).toEqual({ kind: 'app', area: 'earthworks', tab: 'retaining-walls', view: '3d', level: 'level_upper', sel: 'w7' })
  })

  it('opens the pages about the app from a typed link, with no project, and Back leaves them', () => {
    const b = fakeBrowser('https://example.test/app/#/design/plan?view=plan')
    stop = startRouter()
    for (const page of PAGE_IDS) {
      navigate(pageRoute(page))
      expect(routeNow()).toEqual({ kind: 'page', page })
      expect(b.url.hash).toBe(`#/${page}`)
    }
    b.history.back()
    expect(routeNow()).toEqual({ kind: 'page', page: 'terms' })
    stop()
    fakeBrowser('https://example.test/app/#/privacy')
    stop = startRouter()
    expect(routeNow()).toEqual({ kind: 'page', page: 'privacy' })
  })

  it('follows a typed link and tidies it into its full form', () => {
    const b = fakeBrowser('https://example.test/app/#/design/plan?view=plan')
    stop = startRouter()
    b.history.pushState(null, '', '#/share')
    b.history.back()
    b.history.forward()
    expect(routeNow()).toEqual({ kind: 'app', area: 'share', tab: 'plans', view: 'plan' })
    expect(b.url.hash).toBe('#/share/plans?view=plan')
  })

  it('keeps a More item that search opened in the address, and opens it again from a link', () => {
    const b = fakeBrowser('https://example.test/app/#/design/plan?view=plan')
    stop = startRouter()
    navigate(tabRoute(routeNow(), 'design', MORE), { focus: 'wall-preset' })
    expect(b.url.hash).toBe('#/design/more/wall-preset?view=plan')
    expect(useRouter.getState().focus).toBe('wall-preset')
    // A focus that isn't one of More's items (a field on a tab) stays out of the address.
    navigate(tabRoute(routeNow(), 'design', 'floors'), { focus: 'storey-height' })
    expect(b.url.hash).toBe('#/design/floors?view=plan')
    stop()
    useRouter.setState({ route: defaultRoute(), focus: null })
    fakeBrowser('https://example.test/app/#/design/more/wall-preset')
    stop = startRouter()
    expect(routeNow()).toMatchObject({ area: 'design', tab: 'more', item: 'wall-preset' })
    expect(useRouter.getState().focus).toBe('wall-preset')
  })

  it('counts an address that names no page here, and still lands somewhere', () => {
    const before = useRouter.getState().lost
    const b = fakeBrowser('https://example.test/app/#/design/%E0%A4%A')
    stop = startRouter()
    expect(b.url.hash).toBe('#/design/plan?view=plan')
    expect(useRouter.getState().lost).toBe(before + 1)
    b.history.pushState(null, '', '#/design/costs')
    b.history.back()
    b.history.forward()
    expect(routeNow()).toMatchObject({ area: 'design', tab: 'plan' })
    expect(useRouter.getState().lost).toBe(before + 2)
    // A good address counts nothing.
    navigate(tabRoute(routeNow(), 'earthworks', 'place'))
    expect(useRouter.getState().lost).toBe(before + 2)
  })

  it('opens the projects home', () => {
    const b = fakeBrowser('https://example.test/app/#/design/plan?view=plan')
    stop = startRouter()
    navigate(PROJECTS)
    expect(b.url.hash).toBe('#/projects')
    b.history.back()
    expect(routeNow()).toMatchObject({ area: 'design', tab: 'plan' })
  })
})

describe('old links from when there were two layouts', () => {
  afterEach(() => vi.unstubAllGlobals())
  let stop = () => {}
  afterEach(() => stop())

  it('drop ?layout=new and keep the place they point to', () => {
    const b = fakeBrowser('https://example.test/app/?layout=new#/earthworks/cut-fill?view=plan', { 'layout-v1': 'new' })
    stop = startRouter()
    expect(b.url.href).toBe('https://example.test/app/#/earthworks/cut-fill?view=plan')
    expect(routeNow()).toMatchObject({ area: 'earthworks', tab: 'cut-fill' })
    expect(b.store.has('layout-v1')).toBe(false)
  })

  it('open the one layout for ?layout=old too, keeping any other parameter', () => {
    const b = fakeBrowser('https://example.test/app/?layout=old&projects', { 'layout-v1': 'old' })
    stop = startRouter()
    expect([...new URLSearchParams(b.url.search).keys()]).toEqual(['projects'])
    expect(b.url.hash).toBe('#/design/plan?view=plan')
    expect(b.store.has('layout-v1')).toBe(false)
  })

  it('work when storage is unavailable', () => {
    fakeBrowser('https://example.test/app/?layout=new')
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() => (stop = startRouter())).not.toThrow()
  })
})

describe('⌘K search', () => {
  const index = buildIndex(features)

  it("finds every feature by its name, among the results it shows", () => {
    // A row that only records a timing is left out; its name still finds its home.
    const missed = features.filter(f => !search(index, f.name).some(r => (specOnly(f.name) ? r.entry.features.includes(f.id) : r.featureId === f.id))).map(f => f.id)
    expect(missed).toEqual([])
  })

  // LF-15: on a copy with no cloud, "Upload projects to the cloud" dropped you on All projects with
  // nothing said, and ten cloud features were listed that can't be reached there.
  it('leaves out cloud commands that would dead-end when the app has no cloud, and keeps the one that explains', () => {
    const local = withoutCloud(index)
    const labels = (q: string, ix = local) => search(ix, q).map(r => r.label)
    expect(labels('upload projects', index)).toContain('Upload projects to the cloud')
    expect(labels('upload projects')).not.toContain('Upload projects to the cloud')
    expect(labels('cloud sync status')).not.toContain('Cloud sync status')
    expect(local.filter(i => i.kind === 'feature' && i.featureId?.startsWith('cloud-'))).toEqual([])
    for (const q of ['recovery code', 'delete my account', 'cloud space']) expect(search(local, q).filter(r => r.kind === 'feature' && r.featureId?.startsWith('cloud-')), q).toEqual([])
    // "Sign in" still finds the command that says signing in isn't available on this copy.
    expect(search(local, 'sign in')[0]).toMatchObject({ label: 'Sign in and cloud saves', action: 'cloud' })
    expect(search(local, 'recovery code').some(r => r.action === 'cloud')).toBe(true)
    // Nothing else goes: everything that isn't the cloud's is still found.
    expect(index.length - local.length).toBe(index.filter(i => i.featureId?.startsWith('cloud-') || (i.kind !== 'feature' && i.action !== 'cloud' && i.entry.features.length > 0 && i.entry.features.every(f => f.startsWith('cloud-')))).length)
    expect(labels('where it’s saved')).toContain('Where it’s saved')
    expect(labels('projects')).toContain('All projects…')
  })

  it('ranks tabs and actions before features, and what a word means last (C35)', () => {
    const easement = search(index, 'easement')
    expect(easement[0]).toMatchObject({ kind: 'tab', key: 'tab:site/features' })
    const term = easement.findIndex(r => r.kind === 'term')
    expect(term).toBeGreaterThan(-1)
    expect(easement.slice(term).every(r => r.kind === 'term')).toBe(true)
    expect(easement.findIndex(r => r.kind === 'feature')).toBeGreaterThan(easement.findIndex(r => r.kind === 'tab'))
    // Feature rows are short labels, and timings aren't rows at all.
    for (const r of index.filter(i => i.kind === 'feature')) expect(r.label.length, r.key).toBeLessThanOrEqual(61)
    expect(index.some(i => i.featureId === 'plan-autosave')).toBe(false)
    expect(featureLabel('Plan saves automatically to its project in the browser (400 ms debounce)')).toBe('Plan saves automatically to its project in the browser')
  })

  it('leads every feature to its home', () => {
    for (const f of features) {
      if (specOnly(f.name)) continue
      const item = index.find(i => i.featureId === f.id)!
      expect(item.entry.features, f.id).toContain(f.id)
    }
  })

  it('finds every area, tab, More item and command by its label', () => {
    const missed = index
      // (A line that says the app doesn't do something is found by the words for it, not by its own.)
      .filter(i => i.kind !== 'feature' && i.kind !== 'absent')
      .filter(i => !search(index, i.label).some(r => r.key === i.key))
      .map(i => i.key)
    expect(missed).toEqual([])
  })

  it('puts the best match first', () => {
    expect(search(index, 'earthworks')[0]).toMatchObject({ kind: 'area', label: 'Earthworks' })
    expect(search(index, 'retaining walls')[0]).toMatchObject({ kind: 'tab', label: 'Retaining walls' })
    expect(search(index, 'balance')[0]).toMatchObject({ action: 'balance' })
    expect(search(index, 'pdf').some(r => r.action === 'download-pdf')).toBe(true)
  })

  it('finds the measure and note tools and the DXF, picture and schedule exports by plain words', () => {
    for (const q of ['measure', 'ruler', 'distance', 'slope']) expect(search(index, q).some(r => r.action === 'tool:measure'), q).toBe(true)
    for (const q of ['note', 'label', 'text']) expect(search(index, q).some(r => r.action === 'tool:note'), q).toBe(true)
    expect(search(index, 'measure').find(r => r.action === 'tool:measure')).toMatchObject({ shortcut: 'L' })
    expect(search(index, 'note').find(r => r.action === 'tool:note')).toMatchObject({ shortcut: 'E' })
    const atExport = (q: string) => search(index, q).some(r => (r.place.kind === 'tab' && r.place.area.id === 'share' && r.place.tab.id === 'export') || r.entry.at === 'share/export')
    for (const q of ['dxf', 'cad', 'autocad', 'export', 'png', 'image', 'screenshot', 'schedule', 'doors', 'windows']) expect(atExport(q), q).toBe(true)
    expect(search(index, 'dxf').some(r => r.action === 'download-dxf')).toBe(true)
  })

  it('finds the retaining wall tool, finished contours and the 1:50 scale', () => {
    expect(search(index, 'retaining wall').slice(0, 3).map(r => r.key)).toEqual(
      expect.arrayContaining(['tab:earthworks/retaining-walls', 'command:tool-retaining']),
    )
    expect(search(index, 'retaining wall').find(r => r.key === 'command:tool-retaining')).toMatchObject({ action: 'tool:retaining', shortcut: 'T' })
    expect(search(index, 'finished contours')[0]).toMatchObject({ key: 'command:finished-contours', entry: { at: 'earthworks/cut-fill' } })
    expect(search(index, '1:50').some(r => r.featureId === 'print-scale-1-50' && r.place.kind === 'tab' && r.place.tab.id === '3d-print')).toBe(true)
  })

  it('finds things by plain words as well as names', () => {
    expect(search(index, 'backup').some(r => r.action === 'save-project')).toBe(true)
    // projects (#16)
    expect(search(index, 'projects')[0]).toMatchObject({ key: 'command:all-projects', action: 'projects' })
    expect(search(index, 'duplicate')[0]).toMatchObject({ key: 'command:project-duplicate', action: 'projects' })
    expect(search(index, 'archive')[0]).toMatchObject({ key: 'command:project-archive', action: 'projects' })
    // The project menu's one Open… takes a project file too: the best match leads there, and the command is found.
    expect(search(index, 'open project file')[0].entry).toMatchObject({ id: 'open-file', action: 'open-file' })
    expect(search(index, 'open project file').some(r => r.key === 'command:open-file')).toBe(true)
    expect(search(index, 'new project')[0]).toMatchObject({ action: 'new-project' })
    expect(search(index, 'delete project').some(r => r.key === 'command:project-delete')).toBe(true)
    expect(search(index, 'zoom').some(r => r.action === 'fit-house')).toBe(true)
    expect(search(index, 'easement').some(r => r.key === 'tab:site/features')).toBe(true)
    // start and safety
    expect(search(index, 'open').slice(0, 3).some(r => r.key === 'command:open-file')).toBe(true)
    expect(search(index, 'import plan').slice(0, 3).some(r => r.featureId === 'plan-import' || r.key === 'command:open-file')).toBe(true)
    expect(search(index, 'replace survey')[0]).toMatchObject({ action: 'replace-survey' })
    expect(search(index, 'sketch').some(r => r.featureId === 'sketch-without-survey')).toBe(true)
    expect(search(index, 'no survey').some(r => r.action === 'new-project')).toBe(true)
    expect(search(index, 'undo delete').some(r => r.featureId === 'undo-toast' || r.key === 'command:undo-toast')).toBe(true)
    // view memory and the import read-back
    expect(search(index, 'zoom in').slice(0, 3).some(r => r.action === 'zoom-in')).toBe(true)
    expect(search(index, 'zoom out').slice(0, 3).some(r => r.action === 'zoom-out')).toBe(true)
    expect(search(index, 'magnify').some(r => r.action === 'zoom-in')).toBe(true)
    expect(search(index, 'check the layers').slice(0, 3).some(r => r.featureId === 'survey-read-back' || r.key.includes('survey-layers'))).toBe(true)
  })

  it('finds sign-in and cloud saves by the words people use for them', () => {
    for (const words of ['sign in', 'log in', 'passkey', 'Face ID', 'recovery code', 'sign out', 'account']) expect(search(index, words)[0]?.entry.id, words).toBe('cloud')
    expect(search(index, 'offline').some(r => r.entry.id === 'sync-chip'), 'offline').toBe(true)
    expect(search(index, 'this device only').some(r => r.entry.id === 'cloud-upload'), 'this device only').toBe(true)
  })

  it('finds the pages about the app by the words people use for them', () => {
    const pageOf = (q: string) => search(index, q).slice(0, 3).find(r => r.action === 'about' || r.action === 'privacy' || r.action === 'terms' || r.action === 'accuracy')?.action
    expect(pageOf('how accurate is this')).toBe('accuracy')
    expect(pageOf('disclaimer')).toBe('accuracy')
    expect(pageOf('privacy policy')).toBe('privacy')
    expect(pageOf('cookies')).toBe('privacy')
    expect(pageOf('terms and conditions')).toBe('terms')
    expect(pageOf('contact')).toBe('about')
    expect(pageOf('who makes this')).toBe('about')
  })

  it('finds view-only links by the words people use for them', () => {
    const atSend = (r: SearchItem) => (r.place.kind === 'tab' && r.place.area.id === 'share' && r.place.tab.id === 'send') || r.entry.at === 'share/send'
    for (const q of ['share link', 'view-only link', 'read only', 'show people', 'family', 'turn off link', 'revoke', 'link']) expect(search(index, q).slice(0, 3).some(atSend), q).toBe(true)
    expect(search(index, 'view-only link').some(r => r.featureId === 'share-link-make')).toBe(true)
    expect(search(index, 'turn off link').some(r => r.featureId === 'share-link-off')).toBe(true)
  })

  it('finds the site features by the words people use for them', () => {
    const atFeatures = (r: SearchItem) => (r.place.kind === 'tab' && r.place.area.id === 'site' && r.place.tab.id === 'features') || r.entry.at === 'site/features'
    for (const q of ['easement', 'tree', 'tree protection zone', 'TPZ', 'PDF', 'line up drawing', 'trace', 'fence', 'arborist']) {
      expect(search(index, q).slice(0, 8).some(atFeatures), q).toBe(true)
    }
    expect(search(index, 'tree protection zone').some(r => r.featureId === 'site-tree-zones')).toBe(true)
    // Its tab first (C35), then the feature itself.
    expect(search(index, 'line up drawing')[0]).toMatchObject({ key: 'tab:site/features' })
    expect(search(index, 'line up drawing').slice(0, 4).some(r => r.featureId === 'site-drawing-line-up')).toBe(true)
    expect(search(index, 'trace').some(r => r.featureId === 'site-trace')).toBe(true)
    expect(search(index, 'pdf').some(r => r.featureId === 'site-drawing-add')).toBe(true)
  })

  it('finds nothing for an empty query or nonsense', () => {
    expect(search(index, '')).toEqual([])
    expect(search(index, '  ')).toEqual([])
    expect(search(index, 'zzqx')).toEqual([])
  })

  // HO-33, LD-21, CB-38, CB-27: the words people bring from everyday speech and other planners.
  it('answers everyday words with the nearest thing, first', () => {
    const first = (q: string) => search(index, q)[0]?.key
    for (const q of ['bedroom', 'bathroom', 'kitchen']) expect(first(q), q).toBe('command:tool-room')
    for (const q of ['stairs', 'staircase', 'steps']) expect(first(q), q).toBe('command:tool-stair')
    expect(first('print')).toBe('tab:share/plans')
    for (const q of ['rotate', 'turn']) expect(first(q), q).toBe('tab:earthworks/place')
    expect(first('template')).toBe('command:open-example')
    expect(first('save')).toBe('command:save-state')
    for (const q of ['level', 'basement', 'second floor', 'upstairs']) expect(first(q), q).toBe('tab:design/floors')
    for (const q of ['background', 'background image', 'blueprint']) expect(first(q), q).toBe('tab:site/features')
    expect(first('balcony')).toBe('command:tool-area')
    expect(first('curved')).toBe('command:tool-sketch')
    const found = (q: string, key: string) => search(index, q).slice(0, 6).some(r => r.key === key)
    expect(found('rectangle', 'command:tool-wall')).toBe(true)
    expect(found('grid', 'command:tool-sketch')).toBe(true)
    expect(found('floor plan picture', 'tab:site/features')).toBe(true)
    expect(found('underlay', 'tab:site/features')).toBe(true)
    expect(found('bedroom', 'tab:design/rooms')).toBe(true)
    // Every word list points at a real entry, and every lead at a real result.
    const ids = new Set(index.map(i => i.entry.id))
    const keys = new Set(index.map(i => i.key))
    expect(Object.keys(MORE_WORDS).filter(id => !ids.has(id))).toEqual([])
    expect(Object.values(LEADS).filter(k => !keys.has(k))).toEqual([])
  })

  it('says plainly what the planner does not do, after anything it does', () => {
    for (const n of NOT_HERE)
      for (const w of n.words) {
        const rows = search(index, w)
        const at = rows.findIndex(r => r.key === `absent:${n.id}`)
        expect(at, w).toBeGreaterThan(-1)
        expect(rows[at]).toMatchObject({ kind: 'absent', says: n.says })
        // Whatever the app does have for the word comes first.
        expect(rows.slice(at).every(r => r.kind === 'absent' || r.kind === 'term'), w).toBe(true)
      }
    for (const q of ['feet', 'imperial', 'render', 'walkthrough', 'mirror', 'skylight', 'beam', 'texture']) expect(search(index, q).length, q).toBeGreaterThan(0)
    expect(search(index, 'feet')[0]).toMatchObject({ label: 'Feet and inches', says: 'Not in this planner: it works in metres and millimetres only.' })
  })

  // LF-17: a button found by its own label, and a word found by another of its endings.
  it('finds Retain the edges by name, and "removal" for "remove"', () => {
    expect(search(index, 'retain the edges').slice(0, 3).some(r => r.featureId === 'retain-edges' || r.key === 'tab:earthworks/cut-fill')).toBe(true)
    expect(search(index, 'retain the edges').some(r => r.featureId === 'retain-edges')).toBe(true)
    expect(search(index, 'remove these walls').some(r => r.featureId === 'remove-retained-edges')).toBe(true)
    expect(search(index, 'tree removal').some(r => r.featureId === 'mark-tree-removal')).toBe(true)
    expect(stem('removal')).toBe(stem('remove'))
    expect(stem('stairs')).toBe('stair')
    expect(stem('rotation')).toBe(stem('rotate'))
    // Short words stay themselves, and the same words typed as written still rank first.
    expect(stem('pass')).toBe('pass')
    expect(search(index, 'projects')[0]).toMatchObject({ key: 'command:all-projects' })
  })

  // LF-14: the DA pack's download is in Approvals › DA pack, with its title block's details.
  it('sends every command to a tab that exists, and the DA pack to Approvals', () => {
    for (const { entry } of places) {
      if (!entry.at) continue
      const [area, tab] = entry.at.split('/')
      expect(tabIds(areaById(area)!), `${entry.id} at ${entry.at}`).toContain(tab)
    }
    expect(index.find(i => i.key === 'command:cmd-da-pack')?.entry.at).toBe('approvals/da-pack')
    expect(index.find(i => i.key === 'command:cmd-pdf')?.entry.at).toBe('share/plans')
    // Its row says where that is, rather than "Commands".
    expect(index.find(i => i.key === 'command:cmd-da-pack')?.where).toBe('Approvals › DA pack')
    expect(index.find(i => i.key === 'command:cmd-pdf')?.where).toBe('Share › Plans (PDF)')
  })

  // LD-21: the open project's own rooms, levels and roofs are found by name.
  it('finds the open project’s rooms, levels and roofs by name', () => {
    const things = thingItems({
      levels: [{ id: 'l1', name: 'Living level' }, { id: 'l2', name: 'Bedroom level' }],
      rooms: [{ id: 'r1', name: 'Kitchen and dining', level: 'l1' }, { id: 'r2', name: 'Bedroom 1', level: 'l2' }, { id: 'r3', name: ' ', level: 'l2' }],
      areas: [{ id: 'a1', name: 'Deck', level: 'l1' }],
      roofs: [{ id: 'rf1', level: 'l2' }],
    })
    expect(things.map(t => t.key)).toEqual(['thing:room:r1', 'thing:room:r2', 'thing:area:a1', 'thing:level:l1', 'thing:level:l2', 'thing:roof:rf1'])
    const all = [...index, ...things]
    expect(search(all, 'kitchen').slice(0, 3).map(r => r.key)).toContain('thing:room:r1')
    expect(search(all, 'living level')[0]).toMatchObject({ key: 'thing:level:l1', thing: { type: 'level', id: 'l1', level: 'l1' }, where: 'Level in this project' })
    expect(search(all, 'bedroom 1')[0]).toMatchObject({ key: 'thing:room:r2', where: 'Room on Bedroom level', thing: { type: 'room', id: 'r2', level: 'l2' } })
    expect(search(all, 'deck').some(r => r.key === 'thing:area:a1')).toBe(true)
    // Each leads to the tab that lists it.
    expect(things.map(t => (t.place.kind === 'tab' ? t.place.tab.id : ''))).toEqual(['rooms', 'rooms', 'rooms', 'floors', 'floors', 'roofs'])
    // Projects, on the Projects home (LF-31).
    const projects = projectItems([{ id: 'p1', name: 'Hillside house' }, { id: 'p2', name: 'Granny flat' }])
    expect(search(projects, 'granny').map(r => r.thing)).toEqual([{ type: 'project', id: 'p2' }])
    expect(search(projects, 'house')[0]).toMatchObject({ label: 'Hillside house', where: 'Project' })
  })

  it('carries each command’s shortcut', () => {
    expect(index.find(i => i.key === 'command:undo')?.shortcut).toBe('mod+Z')
    expect(index.find(i => i.key === 'command:tool-wall')?.shortcut).toBe('W')
  })
})
