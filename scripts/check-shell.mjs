#!/usr/bin/env node
// The app's frame on a desktop: does the 3D view open without errors, and does nothing in the
// frame show cut off or covered? Opens the made-up sample survey with a made-up plan at
// 1280 × 900 and 1440 × 900 and checks that
//   - Design › 3D, Site › 3D and Earthworks › 3D open and close with no errors in the console
//   - every tab and summary chip that shows is wholly inside its row (none cut mid-word), and
//     a row with hidden items has an arrow; the open tab is in sight
//   - the hint at the foot of the plan keeps clear of the view bar
//   - the level chip keeps clear of a hidden panel's pill
//
// Run it against a dev server (it reaches into the app's own modules, so not a build):
//   npx vite --port 5400 --strictPort &
//   PLAYWRIGHT=/path/to/playwright/index.mjs node scripts/check-shell.mjs http://127.0.0.1:5400/
// It exits 1 when something fails.

import { fileURLToPath } from 'node:url'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173/'
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright')
const SURVEY = fileURLToPath(new URL('../samples/sample-block.dxf', import.meta.url))

let failed = 0
const fail = msg => {
  failed++
  console.log(`  ✗ ${msg}`)
}
const ok = msg => console.log(`  ✓ ${msg}`)

async function open(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  page.on('console', m => m.type() === 'error' && errors.push(m.text()))
  await page.goto(BASE)
  await page.waitForLoadState('networkidle')
  const inputs = page.locator('input[type=file]')
  for (let i = 0; i < (await inputs.count()); i++) {
    if (/dxf/.test((await inputs.nth(i).getAttribute('accept')) ?? '')) {
      await inputs.nth(i).setInputFiles(SURVEY)
      break
    }
  }
  await page.waitForSelector('.app-shell .tab-bar', { timeout: 20000 })
  await page.evaluate(async () => {
    const store = await import('/src/plan/store.ts')
    const model = await import('/src/plan/model.ts')
    const fx = await import('/src/plan/__tests__/fixtures.ts')
    store.usePlan.getState().load(model.normalizePlan({ ...fx.garageFloor(), name: 'Sample house', placement: { e: 5006, n: 8004, rotation: 0, ffl: 45.5 } }))
  })
  await page.waitForTimeout(1500)
  return { page, errors }
}

const go = async (page, hash) => {
  await page.evaluate(h => (location.hash = h), hash)
  await page.waitForTimeout(1200)
}

/** In the page: items of each scrolling row that show but aren't wholly inside it, and whether the row has hidden items and an arrow. */
function rows() {
  const out = []
  for (const row of document.querySelectorAll('.scroll-cue')) {
    const scroller = row.firstElementChild
    const r = scroller.getBoundingClientRect()
    const arrows = [...row.querySelectorAll('.scroll-arrow')].map(a => a.getBoundingClientRect())
    const cut = []
    let hidden = 0
    for (const item of scroller.children) {
      const q = item.getBoundingClientRect()
      if (q.width < 1) continue
      if (getComputedStyle(item).opacity === '0') {
        hidden++
        continue
      }
      const under = arrows.some(a => q.right > a.left + 0.5 && q.left < a.right - 0.5)
      if (q.left < r.left - 0.5 || q.right > r.right + 0.5 || under) cut.push(item.textContent.trim().slice(0, 30))
    }
    out.push({ row: row.className, cut, hidden, arrows: arrows.length })
  }
  return out
}

const overlap = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
const rect = (page, sel) => page.evaluate(s => document.querySelector(s)?.getBoundingClientRect().toJSON() ?? null, sel)

async function checkWidth(browser, width) {
  console.log(`\n${width} × 900`)
  const { page, errors } = await open(browser, width)

  for (const hash of ['#/design/plan?view=plan', '#/design/checks?view=plan', '#/earthworks/cut-fill?view=plan', '#/site/features?view=plan']) {
    await go(page, hash)
    for (const r of await page.evaluate(rows)) {
      if (r.cut.length) fail(`${hash} ${r.row}: cut off: ${r.cut.join(', ')}`)
      else if (r.hidden && !r.arrows) fail(`${hash} ${r.row}: ${r.hidden} hidden with no arrow`)
      else ok(`${hash} ${r.row}: nothing cut off${r.hidden ? `, ${r.hidden} hidden behind an arrow` : ''}`)
    }
    const on = await page.evaluate(() => {
      const t = document.querySelector('.tab.on')
      return t ? getComputedStyle(t).opacity !== '0' : false
    })
    if (on) ok(`${hash} the open tab is in sight`)
    else fail(`${hash} the open tab is hidden`)
  }

  await go(page, '#/design/plan?view=plan')
  const hint = await rect(page, '.plan-status')
  const bar = await rect(page, '.canvas-controls')
  if (overlap(hint, bar)) fail('the hint runs under the view bar')
  else ok('the hint keeps clear of the view bar')

  await go(page, '#/design/floors?view=plan')
  await page.locator('.tab-panel header .icon-button').first().click()
  await page.waitForTimeout(400)
  const pill = await rect(page, '.panel-pill')
  const chip = await rect(page, '.level-chip')
  if (overlap(pill, chip)) fail("the level chip is under the hidden panel's pill")
  else ok("the level chip keeps clear of the hidden panel's pill")

  errors.length = 0
  for (const hash of ['#/design/plan?view=3d', '#/site/3d?view=3d', '#/earthworks/cut-fill?view=3d', '#/design/plan?view=plan']) {
    await go(page, hash)
    await page.waitForTimeout(2500)
  }
  if (errors.length) fail(`3D logged ${errors.length} error(s): ${errors[0].slice(0, 120)}`)
  else ok('3D opens and closes with no errors')
  await page.close()
}

const browser = await chromium.launch()
try {
  for (const w of [1280, 1440]) await checkWidth(browser, w)
} finally {
  await browser.close()
}
console.log(failed ? `\n${failed} check(s) failed.` : '\nEvery check passed.')
process.exit(failed ? 1 : 0)
