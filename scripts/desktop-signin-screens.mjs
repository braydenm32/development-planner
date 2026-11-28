#!/usr/bin/env node
// Screenshots of signing the desktop app in to the cloud, with the cloud stood in for: the app's
// side (a fake window.__TAURI_INTERNALS__, as scripts/desktop-screens.mjs has) and the website's
// side, opened at the link the app gives.
//
//   npx vite --port 5402 --strictPort &
//   OUT=/tmp/shots node scripts/desktop-signin-screens.mjs http://127.0.0.1:5402/

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173/'
const OUT = process.env.OUT ?? 'desktop-screens'
const pw = await import(process.env.PLAYWRIGHT ?? 'playwright')
const chromium = pw.chromium ?? pw.default.chromium
mkdirSync(OUT, { recursive: true })

const CODE = 'K7QX-3MPA'
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const reply = (body, status = 200) => ({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) })

/** A made-up cloud: signed in or not, and a link nobody has approved yet. */
async function fakeCloud(page, user) {
  await page.route(/\/api\//, route => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (path === '/api/health') return route.fulfill(reply({ ok: true, app: 'block-and-house-planner', api: 1, signup: 'invite', email: true }))
    if (path === '/api/session') return route.fulfill(reply({ user }))
    if (path === '/api/projects') return route.fulfill(reply({ projects: [] }))
    if (path === '/api/app/link') return route.fulfill(reply({ code: CODE, secret: 's', expires: Date.now() + 600000, url: `https://contourandgable.com/?app-link=${CODE}` }))
    if (path === '/api/app/link/claim') return route.fulfill(reply({ waiting: true }, 202))
    if (path.startsWith('/api/app/link/')) return route.fulfill(reply({ code: CODE, expires: Date.now() + 600000, approved: false }))
    return route.fulfill(reply({ error: 'not-found', message: 'There is nothing here.' }, 404))
  })
}

function fakeTauri() {
  const docs = 'C:\\Users\\you\\Documents\\Contour and Gable'
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    transformCallback: () => 0,
    invoke: async cmd => (cmd === 'desktop_info' ? { version: '0.5.0', os: 'windows', projectsDir: `${docs}\\Projects`, exportsDir: `${docs}\\Exports` } : cmd === 'list_files' || cmd === 'find_slicers' ? [] : null),
  }
}

const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) })
const browser = await chromium.launch()

// The desktop app.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await ctx.addInitScript(fakeTauri)
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log('page error:', e.message))
  await fakeCloud(page, null)
  await page.goto(BASE)
  await page.waitForSelector('text=Sign in', { timeout: 30000 })
  await page.waitForTimeout(800)
  await shot(page, 'signin-01-desktop-start')
  await page.evaluate(async () => (await import('/src/cloud/state.ts')).cloudActions.open('sign-in'))
  await page.waitForSelector('text=Sign in with your browser')
  await page.waitForTimeout(400)
  await shot(page, 'signin-02-desktop-sheet')
  await page.getByRole('button', { name: 'Sign in with your browser' }).click()
  await page.waitForSelector(`text=${CODE}`)
  await page.waitForTimeout(400)
  await shot(page, 'signin-03-desktop-waiting')
  await ctx.close()
}

// The website, opened at the app's link, already signed in.
for (const [name, viewport] of [
  ['signin-04-website-approve', { width: 1440, height: 900 }],
  ['signin-05-website-approve-phone', { width: 390, height: 844 }],
]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log('page error:', e.message))
  await fakeCloud(page, { id: 'u1', name: 'Sam', deleteAfter: null })
  await page.goto(`${BASE}?app-link=${CODE}`)
  await page.waitForSelector('text=Let the desktop app in?', { timeout: 30000 })
  await page.waitForTimeout(500)
  await shot(page, name)
  console.log(name, 'address after:', page.url())
  await ctx.close()
}

await browser.close()
