#!/usr/bin/env node
// Do the panels fit what's in them? Opens the app on a made-up sloping block at
// a 1440 × 900 desktop and an iPhone 13, visits every tab, More, inspector, tool card, plan card
// and key, and reports any panel that scrolls sideways (scrollWidth > clientWidth) or cuts off
// what's in it. Also checks that a retaining wall's card fits a 1440 × 900 screen without
// scrolling, with its details folded away.
//
// Run it against a dev server (it reaches into the app's own modules, so not a build):
//   npx vite --port 5400 --strictPort &
//   PLAYWRIGHT=/path/to/playwright/index.mjs node scripts/check-panels.mjs http://127.0.0.1:5400/
// It exits 1 when something doesn't fit. Uses no real survey: the block is drawn below.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173/'
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright')

// ---------------------------------------------------------------------------
// A made-up block: 30 × 45 m, rising 0.15 m per metre to the north, contours every 0.5 m.

const ground = (x, y) => 80 + 0.04 * x + 0.15 * y
function syntheticDxf() {
  const pairs = (...items) => items.map(String).join('\n')
  const ents = []
  for (let z = 80; z <= 88; z += 0.5) {
    const pts = []
    for (let x = -2; x <= 32; x += 2) {
      const y = (z - 80 - 0.04 * x) / 0.15
      if (y >= -2 && y <= 47) pts.push([1000 + x, 1000 + y, z])
    }
    if (pts.length < 2) continue
    const layer = z % 1 === 0 ? 'CONTOUR_MAJOR' : 'CONTOUR_MINOR'
    ents.push(
      [pairs(0, 'POLYLINE', 8, layer, 66, 1, 10, 0, 20, 0, 30, 0, 70, 8), ...pts.map(([x, y, zz]) => pairs(0, 'VERTEX', 8, layer, 10, x, 20, y, 30, zz, 70, 32)), pairs(0, 'SEQEND', 8, layer)].join('\n'),
    )
  }
  for (const [x, y] of [
    [5, 5],
    [25, 8],
    [15, 22],
    [6, 40],
    [26, 38],
  ])
    ents.push(pairs(0, 'POINT', 8, 'SPOT_LEVELS', 10, 1000 + x, 20, 1000 + y, 30, ground(x, y).toFixed(3)))
  const lot = [
    [0, 0],
    [30, 0],
    [30, 45],
    [0, 45],
  ]
  ents.push(pairs(0, 'LWPOLYLINE', 8, 'BOUNDARY', 90, 4, 70, 1, 38, 0, ...lot.flatMap(([x, y]) => [10, 1000 + x, 20, 1000 + y])))
  return [pairs(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC'), pairs(0, 'SECTION', 2, 'ENTITIES'), ...ents, pairs(0, 'ENDSEC', 0, 'EOF')].join('\n')
}

/** A house on it: a 12 × 9 m ground floor with a garage, a retaining wall behind, a drive and a roof. */
function syntheticPlan() {
  const L = 'level_ground'
  const w = (id, a, b, thickness = 0.27, kind = 'external') => ({ id, level: L, a, b, thickness, kind })
  return {
    version: 1,
    levels: [{ id: L, name: 'Ground floor', elevation: 0, height: 2.7, floorType: 'slab' }],
    walls: [
      w('s', [0, 0], [12, 0]),
      w('e', [12, 0], [12, 9]),
      w('n', [12, 9], [0, 9]),
      w('w', [0, 9], [0, 0]),
      w('mid', [6, 0], [6, 9], 0.09, 'internal'),
      { id: 'rw', level: L, a: [-2, 11], b: [14, 11], thickness: 0.2, kind: 'retaining', retain: { high: 'left', lowLevel: 'pad', lowBench: 1.5 } },
    ],
    openings: [
      { id: 'gd', wall: 's', kind: 'garage', offset: 3, width: 4.8, height: 2.1, sill: 0, flipHinge: false, flipSwing: false },
      { id: 'door', wall: 's', kind: 'door', offset: 9, width: 0.82, height: 2.04, sill: 0, flipHinge: false, flipSwing: false },
      { id: 'win', wall: 'e', kind: 'window', offset: 4.5, width: 1.8, height: 1.2, sill: 0.9, flipHinge: false, flipSwing: false },
    ],
    rooms: [
      { id: 'garage', level: L, name: 'Garage', at: [3, 4.5] },
      { id: 'living', level: L, name: 'Living', at: [9, 4.5] },
    ],
    areas: [{ id: 'drive', level: L, name: 'Driveway', kind: 'driveway', top: 0, pts: [[0.6, -0.2], [5.4, -0.2], [5.4, -9.5], [0.6, -9.5]] }],
    roofs: [{ id: 'roof', level: L, pts: [[-0.45, -0.45], [12.45, -0.45], [12.45, 9.45], [-0.45, 9.45]], type: 'hip', pitch: 22.5, overhang: 0.45 }],
    stairs: [],
    furniture: [],
    placement: { e: 1009, n: 1012, rotation: 0, ffl: 82.4 },
  }
}

// ---------------------------------------------------------------------------
// Measuring

/** In the page: each panel matching `sel`, whether it scrolls sideways, and what in it is cut off. */
function measure(sel) {
  const name = el => `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`
  const out = []
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2 || getComputedStyle(el).visibility === 'hidden') continue
    const cs = getComputedStyle(el)
    const left = r.left + parseFloat(cs.borderLeftWidth)
    const right = r.right - parseFloat(cs.borderRightWidth)
    const cut = []
    for (const d of el.querySelectorAll('*')) {
      if (d.closest('svg') && d.tagName.toLowerCase() !== 'svg') continue
      const q = d.getBoundingClientRect()
      if (q.width < 1 || q.height < 1) continue
      const dcs = getComputedStyle(d)
      if (dcs.visibility === 'hidden' || dcs.position === 'fixed') continue
      // Out past the panel's sides.
      if (q.right > right + 1 || q.left < left - 1) cut.push(`${name(d)} "${(d.textContent || '').trim().slice(0, 40)}" sticks out`)
      // Text cut short with an ellipsis or hidden overflow, unless its full text is in a tooltip.
      else if (dcs.overflowX !== 'visible' && d.scrollWidth > d.clientWidth + 1 && !d.closest('[title]') && d.children.length === 0)
        cut.push(`${name(d)} "${(d.textContent || '').trim().slice(0, 40)}" cut short`)
    }
    out.push({
      panel: name(el),
      w: Math.round(r.width),
      h: Math.round(r.height),
      sideways: el.scrollWidth > el.clientWidth + 1,
      tall: el.scrollHeight > el.clientHeight + 1,
      cut: [...new Set(cut)],
    })
  }
  return out
}

const PANELS = [
  '.float-card',
  '.flow-card',
  '.flow-bar',
  '.ground-key',
  '.fc-key',
  '.overview-sheet',
  '.palette',
  '.menu-pop',
].join(', ')

const results = []
let failed = 0
/** SHOTS=<folder>: a screenshot of each place where something doesn't fit. */
const SHOTS = process.env.SHOTS

async function check(page, where, extra = {}) {
  await page.waitForTimeout(350)
  let shot = false
  for (const m of await page.evaluate(measure, PANELS)) {
    const bad = m.sideways || m.cut.length > 0
    if (bad) failed++
    shot ||= bad
    results.push({ where, ...m, ...extra })
    console.log(`${bad ? 'FAIL' : 'ok  '}  ${where.padEnd(44)} ${m.panel.slice(0, 40).padEnd(40)} ${String(m.w).padStart(4)}×${String(m.h).padEnd(4)}${m.sideways ? ' scrolls sideways' : ''}${m.cut.length ? ' ' + m.cut.slice(0, 3).join('; ') : ''}`)
  }
  if (shot && SHOTS) await page.screenshot({ path: join(SHOTS, `${where.replace(/[^a-z0-9]+/gi, '-')}.png`) })
}

/** A desktop's retaining wall card, its details folded away, shows whole without scrolling. */
async function fitsWithoutScrolling(page, sel, where) {
  const m = await page.evaluate(s => {
    const el = document.querySelector(s)
    return el ? { fits: el.scrollHeight <= el.clientHeight + 1, sh: el.scrollHeight, ch: el.clientHeight } : null
  }, sel)
  const ok = !!m?.fits
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${where} fits without scrolling: ${JSON.stringify(m)}`)
}

const select = (page, sel) => page.evaluate(async s => (await import('/src/plan/store.ts')).usePlan.getState().select(s), sel)
const tool = (page, t) => page.evaluate(async x => (await import('/src/plan/store.ts')).usePlan.getState().setTool(x), t)
const go = async (page, hash) => {
  await page.evaluate(h => (location.hash = h), hash)
  await page.waitForTimeout(500)
}

async function openApp(browser, { phone, survey }) {
  const opts = phone ? { ...devices['iPhone 13'] } : { viewport: { width: 1440, height: 900 } }
  delete opts.defaultBrowserType
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log('page error:', e.message))
  await page.goto(BASE)
  await page.waitForSelector('input[type=file]', { state: 'attached', timeout: 30000 })
  await page.locator('input[type=file]').first().setInputFiles(survey)
  await page.waitForSelector('.app-shell', { timeout: 30000 })
  await page.waitForTimeout(1200)
  await page.evaluate(
    async plan => {
      const store = await import('/src/plan/store.ts')
      const model = await import('/src/plan/model.ts')
      store.usePlan.getState().load(model.normalizePlan(plan))
    },
    syntheticPlan(),
  )
  // Site features with long names, and some under the house, so Site › Features has warnings to show.
  await page.evaluate(
    async ({ features, overlay }) => {
      const site = await import('/src/site/store.ts')
      site.addFeatures(features)
      site.useSiteStore.getState().commit(d => ({ ...d, overlays: [...d.overlays, overlay] }))
    },
    syntheticSite(),
  )
  await page.waitForTimeout(800)
  return { ctx, page }
}

/** Trees, easements, a sewer, a fence and a neighbour's house on the block (survey grid), and a drawing with a long name. */
function syntheticSite() {
  const at = (x, y) => [1000 + x, 1000 + y]
  const rect = (x0, y0, x1, y1) => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)]
  const f = (id, type, geom, more = {}) => ({ id, type, geom, source: 'trace', ...more })
  const features = [
    f('t1', 'tree', { kind: 'point', at: at(15, 24.5) }, { label: 'T1', trunk: 0.6, canopy: 8, height: 12 }),
    f('t2', 'tree', { kind: 'point', at: at(4, 30) }, { label: 'T2', trunk: 0.3, canopy: 5, height: 7 }),
    f('e1', 'easement', { kind: 'area', pts: rect(27, 0, 30, 45) }, { label: '(C)', purpose: 'Easement to drain water 3 wide', width: 3 }),
    f('e2', 'easement', { kind: 'area', pts: rect(18, 0, 20.5, 45) }, { label: '(D)', purpose: 'Easement to drain sewage 2.5 wide', width: 2.5 }),
    f('sw', 'service', { kind: 'line', pts: [at(19.2, 0), at(19.2, 45)] }, { service: 'sewer', label: 'Sewer main' }),
    f('fe', 'fence', { kind: 'line', pts: [at(0, 0.2), at(30, 0.2)] }, { label: 'Colorbond 1.8 m', height: 1.8 }),
    f('nb', 'building', { kind: 'area', pts: rect(31, 10, 40, 22) }, { label: 'No. 42 Long Street Name Avenue', neighbour: true, height: 6.5 }),
  ]
  const overlay = {
    id: 'ov1',
    name: 'Detail and level survey, sheet 2 of 3, revision C, issued for the development application.pdf',
    kind: 'pdf',
    page: 1,
    width: 1190,
    height: 842,
    pxPerUnit: 1,
    scale: 200,
    transform: [0.0706, 0, 0, 0.0706, 990, 990],
    aligned: false,
    opacity: 0.6,
    visible: false,
    locked: false,
    include: false,
    vector: false,
    added: [],
  }
  return { features, overlay }
}

async function everyPlace(browser, survey, phone) {
  const tag = phone ? 'phone' : 'desktop'
  const { ctx, page } = await openApp(browser, { phone, survey })
  if (phone) {
    await go(page, '#/design/plan')
    await page.getByRole('button', { name: 'Edit' }).first().click().catch(() => {})
  }
  const areas = await page.evaluate(async () => (await import('/src/nav/menu.ts')).AREAS.map(a => ({ id: a.id, tabs: [...a.tabs.map(t => t.id), 'more'] })))
  for (const a of areas) {
    for (const t of a.tabs) {
      await go(page, `#/${a.id}/${t}`)
      await check(page, `${tag} ${a.id} › ${t}`)
    }
  }
  // A site feature picked in Site › Features.
  await go(page, '#/site/features')
  for (const id of ['t1', 'e1', 'nb']) {
    await page.evaluate(async x => (await import('/src/site/store.ts')).useSiteStore.setState({ selected: x }), id)
    await check(page, `${tag} site feature ${id}`)
  }
  await page.evaluate(async () => (await import('/src/site/store.ts')).useSiteStore.setState({ selected: null }))
  // The inspector, for each kind of thing on the plan.
  await go(page, '#/design/plan')
  for (const [type, id] of [
    ['wall', 's'],
    ['wall', 'rw'],
    ['opening', 'gd'],
    ['room', 'garage'],
    ['area', 'drive'],
    ['roof', 'roof'],
  ]) {
    await select(page, { type, id })
    await check(page, `${tag} inspector: ${type} ${id}`)
    if (!phone && id === 'rw') await fitsWithoutScrolling(page, '.inspector', `${tag} retaining card in the inspector`)
  }
  await select(page, null)
  // A retaining wall in its own tab, with its details folded away, must fit without scrolling.
  await go(page, '#/earthworks/retaining-walls')
  await select(page, { type: 'wall', id: 'rw' })
  await check(page, `${tag} retaining wall in its tab`)
  if (!phone) await fitsWithoutScrolling(page, '.tab-panel .panel-body', `${tag} retaining card in its tab`)
  await select(page, null)
  // Each tool's card.
  await go(page, '#/design/plan')
  for (const t of ['wall', 'retaining', 'door', 'window', 'garage', 'room', 'area', 'roof', 'stair', 'furniture']) {
    await tool(page, t)
    await check(page, `${tag} tool card: ${t}`)
  }
  await tool(page, 'select')
  // The design flow's cards and bar.
  await page.evaluate(async () => {
    const plan = (await import('/src/plan/store.ts')).usePlan.getState()
    const flow = await import('/src/flow/store.ts')
    flow.useFlow.setState({ ask: { space: { level: plan.activeLevel, room: 'living', keys: ['living'] }, more: true } })
  })
  await check(page, `${tag} floor type card (all types)`)
  await page.evaluate(async () => {
    const flow = await import('/src/flow/store.ts')
    const offer = { kind: 'cut', depth: 1.25, side: { a: [-0.135, 9.135], b: [12.135, 9.135] }, facing: 'north', level: 'level_ground' }
    flow.useFlow.setState({ ask: null, offer: { space: { level: 'level_ground', room: 'living', keys: ['living'] }, offer, placement: 'gap', gap: 1 } })
  })
  await check(page, `${tag} retaining wall suggestion`)
  await page.evaluate(async () => {
    const flow = await import('/src/flow/store.ts')
    flow.useFlow.setState({ offer: null })
    flow.startContourPick('level_ground')
  })
  await check(page, `${tag} picking a contour`)
  await page.evaluate(async () => (await import('/src/flow/store.ts')).cancelContourPick())
  // Search and the project menu.
  if (!phone) {
    await page.keyboard.press('Control+k')
    await page.keyboard.type('retaining')
    await check(page, `${tag} search`)
    await page.keyboard.press('Escape')
    await page.locator('.project-button').first().click().catch(() => {})
    await check(page, `${tag} project menu`)
    await page.keyboard.press('Escape')
  }
  await ctx.close()
}

const dir = mkdtempSync(join(tmpdir(), 'check-panels-'))
const survey = join(dir, 'sloping-block.dxf')
writeFileSync(survey, syntheticDxf())
const browser = await chromium.launch()
try {
  for (const phone of [false, true]) {
    await everyPlace(browser, survey, phone)
  }
} finally {
  await browser.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(failed ? `\n${failed} panel(s) don't fit.` : `\nEvery panel fits (${results.length} checked).`)
process.exit(failed ? 1 : 0)
