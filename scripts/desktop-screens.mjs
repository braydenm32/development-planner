#!/usr/bin/env node
// Screenshots of the desktop app's own parts, in a browser that stands in for it: the page gets a
// fake window.__TAURI_INTERNALS__ (what Tauri puts there), answering the app's commands with
// made-up folders and slicers. Also Share › Export's 3D model formats, which the website has too.
//
//   npx vite --port 5402 --strictPort &
//   OUT=/tmp/shots node scripts/desktop-screens.mjs http://127.0.0.1:5402/

import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173/'
const OUT = process.env.OUT ?? 'desktop-screens'
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright')
mkdirSync(OUT, { recursive: true })

/** Tauri's invoke, answered with made-up folders, slicers and files. */
function fakeTauri() {
  const docs = 'C:\\Users\\you\\Documents\\Contour and Gable'
  const written = []
  window.__desktopCalls = written
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    transformCallback: () => 0,
    invoke: async (cmd, args, opts) => {
      written.push({ cmd, headers: opts?.headers })
      switch (cmd) {
        case 'desktop_info':
          return { version: '0.1.0', os: 'windows', projectsDir: `${docs}\\Projects`, exportsDir: `${docs}\\Exports` }
        case 'find_slicers':
          return [
            { name: 'OrcaSlicer', path: 'C:\\Program Files\\OrcaSlicer\\orca-slicer.exe' },
            { name: 'ElegooSlicer', path: 'C:\\Program Files\\ElegooSlicer\\elegoo-slicer.exe' },
          ]
        case 'list_files':
          return [
            { name: 'Sample house.project.json', path: `${docs}\\Projects\\Sample house.project.json`, modified: Date.now() - 60000, size: 180000 },
            { name: 'Courtyard option.project.json', path: `${docs}\\Projects\\Courtyard option.project.json`, modified: Date.now() - 86400000 * 2, size: 200000 },
          ]
        case 'write_file':
          return `${decodeURIComponent(opts.headers['x-dir'])}\\${decodeURIComponent(opts.headers['x-name'])}`
        default:
          return null
      }
    },
  }
}

const go = (page, route) => page.evaluate(async r => (await import('/src/nav/router.ts')).navigate(r), route)
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) })

async function run(desktop) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  if (desktop) await ctx.addInitScript(fakeTauri)
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
  const prefix = desktop ? 'desktop-app' : 'website'
  await go(page, { kind: 'app', area: 'share', tab: 'export', view: '3d' })
  await page.waitForSelector('.model-formats', { timeout: 15000 })
  await page.waitForTimeout(800)
  await shot(page, `${prefix}-01-export`)
  await page.evaluate(() => document.querySelector('.model-formats')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(300)
  await shot(page, `${prefix}-02-model-formats`)
  if (desktop) {
    await page.getByRole('button', { name: 'SketchUp (.dae)' }).click()
    await page.waitForSelector('text=Saved Sample-house-3d-model.dae in Exports', { timeout: 30000 }).catch(() => page.waitForTimeout(3000))
    await shot(page, `${prefix}-03-saved-toast`)
    await go(page, { kind: 'app', area: 'share', tab: '3d-print', view: '3d' })
    await page.waitForSelector('.dk-slicer', { timeout: 15000 })
    await page.waitForFunction(() => !document.querySelector('.print-foot button.primary')?.hasAttribute('disabled'), null, { timeout: 90000 }).catch(() => undefined)
    await page.waitForTimeout(800)
    await shot(page, `${prefix}-04-print-slicer`)
    await page.click('.print-foot button.primary')
    await page.waitForTimeout(1500)
    await shot(page, `${prefix}-05-sent-to-slicer`)
    await go(page, { kind: 'projects' })
    await page.waitForSelector('.dk-folder-projects', { timeout: 15000 })
    await page.waitForTimeout(500)
    await shot(page, `${prefix}-06-projects-folder`)
    console.log(JSON.stringify((await page.evaluate(() => window.__desktopCalls)).map(c => c.cmd)))
  }
  await browser.close()
}

await run(true)
await run(false)
