// Registers the service worker (./sw.ts) in a built app, and handles new versions safely: a new
// one installs in the background and the page says "A new version is ready · Reload"; it takes
// over only when the person chooses Reload, after the work waiting to save is saved. Nothing ever
// reloads on its own. Never registered by the dev server or in the tests (import.meta.env.PROD).

import { leavePage, projectActions } from '../projects/session'
import { SERVICE_WORKER_OFF } from './killSwitch'
import { useOffline } from './state'

/** The prefix of this app's caches: the same as ./routing.ts CACHE_PREFIX (the worker's copy; not imported, so the two builds share no code). */
export const CACHES = 'cg-offline-'
const HOUR = 60 * 60 * 1000

let reg: ServiceWorkerRegistration | null = null
let reloading = false

/** The version this page is (index.html's <meta name="cg-version">, written by the build). */
const pageVersion = () => document.querySelector('meta[name="cg-version"]')?.getAttribute('content') ?? null

/** Which version a service worker is, or null if it doesn't say in time. */
function versionOf(w: ServiceWorker | null): Promise<string | null> {
  if (!w) return Promise.resolve(null)
  return new Promise(resolve => {
    const ch = new MessageChannel()
    const t = setTimeout(() => resolve(null), 2000)
    ch.port1.onmessage = e => {
      clearTimeout(t)
      resolve((e.data as { version?: string })?.version ?? null)
    }
    w.postMessage({ type: 'version' }, [ch.port2])
  })
}

/** A new version has installed: offer it, unless this page already is that version (it came from the network). */
async function consider(w: ServiceWorker) {
  const v = await versionOf(w)
  if (v && v === pageVersion()) w.postMessage({ type: 'take-over' })
  else useOffline.setState({ update: true })
}

const check = () => void reg?.update().catch(() => undefined)

async function register() {
  const base = import.meta.env.BASE_URL
  reg = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base, updateViaCache: 'none' })
  if (reg.waiting && navigator.serviceWorker.controller) void consider(reg.waiting)
  reg.addEventListener('updatefound', () => {
    const w = reg?.installing
    w?.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) void consider(w)
    })
  })
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return location.reload()
    // Another tab chose Reload: this page still runs the version before. Offer it here too.
    void versionOf(navigator.serviceWorker.controller).then(v => {
      if (v && v !== pageVersion()) useOffline.setState({ update: true })
    })
  })
  // Look for a new version every hour, and on coming back to the tab.
  setInterval(check, HOUR)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
}

/** The kill switch is on (./killSwitch.ts): take away any service worker and cache left from before. */
async function turnOff() {
  for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
  if (typeof caches !== 'undefined') for (const n of await caches.keys()) if (n.startsWith(CACHES)) await caches.delete(n)
}

/** Start working offline (from src/main.tsx). Does nothing in the dev server, the tests, or a browser without service workers. */
export function startOffline(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (SERVICE_WORKER_OFF) return void turnOff().catch(() => undefined)
  // After the page has loaded, so keeping the files never slows the first visit.
  const go = () => void register().catch(() => undefined)
  if (document.readyState === 'complete') go()
  else window.addEventListener('load', go, { once: true })
}

/** Reload, the person's choice: what's waiting to save is saved first, then the new version takes over. */
export async function reloadNow(): Promise<void> {
  leavePage()
  await projectActions.flush().catch(() => undefined)
  const w = reg?.waiting
  if (!w) return location.reload()
  reloading = true
  w.postMessage({ type: 'take-over' })
  // If it doesn't take over in time, a plain reload still gets the new page.
  setTimeout(() => location.reload(), 3000)
}
