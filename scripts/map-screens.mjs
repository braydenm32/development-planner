#!/usr/bin/env node
// Screenshots of Site › Map and the checks it adds, on the made-up sample survey. The lot is made
// up too: the sample block's boundary, turned and set down at PLACE (public bushland by default,
// so no one's home is in the picture). The cadastre and address search are always answered with
// that made-up lot; the aerial tiles and planning layers are real, unless MOCK=1 (no network:
// plain tiles and recorded planning replies).
//
//   npx vite --port 5401 --strictPort &
//   PLAYWRIGHT=/path/to/playwright/index.mjs OUT=/tmp/shots node scripts/map-screens.mjs http://127.0.0.1:5401/

import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173/'
const OUT = process.env.OUT ?? 'map-screens'
const MOCK = process.env.MOCK === '1'
const PLACE = (process.env.PLACE ?? '150.8705,-34.4005').split(',').map(Number)
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright')
mkdirSync(OUT, { recursive: true })

const SAMPLE = [
  [5000, 8000],
  [5023.4, 8000.6],
  [5024.1, 8034.2],
  [4999.2, 8033.5],
]

const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#9aa894"/><path d="M0 128h256M128 0v256" stroke="#87957f" stroke-width="2"/></svg>`
const ok = body => ({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) })

async function setUp(page) {
  // The made-up lot: the sample's corners a little off (as the cadastre is), turned 18°, at PLACE.
  const lot = await page.evaluate(
    async ({ sample, place }) => {
      const g = await import('/src/map/geo.ts')
      const zone = g.zoneOf(place[0])
      const [E, N] = g.toMga(place, zone)
      const c = Math.cos((18 * Math.PI) / 180)
      const s = Math.sin((18 * Math.PI) / 180)
      const jitter = [
        [0.12, -0.08],
        [-0.1, 0.15],
        [0.05, 0.1],
        [-0.14, -0.05],
      ]
      const ring = sample.map(([x, y], i) => {
        const dx = x - 5000 + jitter[i][0]
        const dy = y - 8000 + jitter[i][1]
        return g.fromMga([E + c * dx - s * dy, N + s * dx + c * dy], zone)
      })
      return ring
    },
    { sample: SAMPLE, place: PLACE },
  )
  const merc = ([lon, lat]) => [(lon * Math.PI * 6378137) / 180, 6378137 * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))]
  const feature = { attributes: { lotidstring: '12//DP1000001' }, geometry: { rings: [[...lot, lot[0]]] } }
  await page.route(/maps\.six\.nsw\.gov\.au\/.*NSW_Cadastre/, r => r.fulfill(ok({ features: [feature] })))
  await page.route(/ePlanningApi\/address/, r => r.fulfill(ok([{ address: '12 SAMPLE STREET EXAMPLETON 2500', propId: 1 }, { address: '12A SAMPLE STREET EXAMPLETON 2500', propId: 2 }])))
  await page.route(/ePlanningApi\/lot/, r => r.fulfill(ok([{ geometry: { rings: [[...lot, lot[0]].map(merc)] }, attributes: { LotDescription: '12/-/DP1000001' } }])))
  if (MOCK) {
    await page.route(/NSW_Imagery/, r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: TILE_SVG }))
    const rows = {
      8: [{ EPI_NAME: 'Wollongong Local Environmental Plan 2009', LGA_NAME: 'WOLLONGONG' }],
      19: [{ EPI_NAME: 'Wollongong Local Environmental Plan 2009', LGA_NAME: 'WOLLONGONG', SYM_CODE: 'R2', LAY_CLASS: 'Low Density Residential' }],
      14: [{ MAX_B_H: 9, MAX_B_H_M: 9, UNITS: 'm' }],
      11: [{ FSR: 0.5 }],
      22: [{ LOT_SIZE: 449, UNITS: 'm²' }],
      16: [],
      229: [{ d_Category: 'Vegetation Buffer' }],
      230: [],
      232: [],
    }
    await page.route(/mapprod3\.environment\.nsw\.gov\.au/, r => {
      const layer = Number(r.request().url().match(/MapServer\/(\d+)\/query/)?.[1])
      r.fulfill(ok({ features: (rows[layer] ?? []).map(attributes => ({ attributes })) }))
    })
  }
}

const go = (page, route) => page.evaluate(async r => (await import('/src/nav/router.ts')).navigate(r), route)
const shot = async (page, name) => {
  await page.waitForTimeout(900)
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  console.log('saved', name)
}

async function run(ctxOpts, prefix) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext(ctxOpts)
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log('page error:', e.message))
  await page.goto(BASE)
  await page.waitForSelector('input[type=file]', { state: 'attached', timeout: 30000 })
  await page.locator('input[type=file]').first().setInputFiles(resolve('samples/sample-block.dxf'))
  await page.waitForSelector('.app-shell', { timeout: 30000 })
  await page.waitForTimeout(1200)
  await page.evaluate(async () => {
    const store = await import('/src/plan/store.ts')
    const model = await import('/src/plan/model.ts')
    const fx = await import('/src/plan/__tests__/fixtures.ts')
    store.usePlan.getState().load(model.normalizePlan({ ...fx.garageFloor(), name: 'Sample house', placement: { e: 5006, n: 8004, rotation: 0, ffl: 45.5 } }))
  })
  await setUp(page)
  await go(page, { kind: 'app', area: 'site', tab: 'map', view: 'plan' })
  await page.waitForSelector('.map-tab', { timeout: 15000 })
  await shot(page, `${prefix}-01-start`)

  await page.fill('.map-search input', '12 Sample St')
  await page.waitForSelector('.map-hits button', { timeout: 10000 })
  await shot(page, `${prefix}-02-address`)
  await page.click('.map-hits button')
  await page.waitForSelector('.map-picked', { timeout: 10000 })
  await shot(page, `${prefix}-03-lot-picked`)

  await page.click('.map-picked button.primary')
  await page.waitForSelector('.map-facts', { timeout: 60000 })
  await shot(page, `${prefix}-04-placed`)
  if (!ctxOpts.isMobile) {
    await page.evaluate(() => document.querySelector('.map-planning')?.scrollIntoView())
    await shot(page, `${prefix}-05-planning`)
  }
  await go(page, { kind: 'app', area: 'design', tab: 'checks', view: 'plan' })
  await page.waitForSelector('.check-list', { timeout: 15000 })
  await page.evaluate(() => document.querySelector('.check-list')?.scrollIntoView())
  await shot(page, `${prefix}-06-checks`)
  if (!ctxOpts.isMobile) {
    await go(page, { kind: 'app', area: 'design', tab: 'plan', view: 'plan' })
    await shot(page, `${prefix}-07-plan-aerial`)
  }
  await browser.close()
}

await run({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, 'desktop')
await run({ ...devices['iPhone 13'], deviceScaleFactor: 1 }, 'phone')
