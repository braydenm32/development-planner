// The service worker that lets the app open and work with no connection, written by hand (no
// library). Built as its own file, sw.js, beside index.html by ../../scripts/offlinePlugin.ts,
// which fills in __CG_BUILD__: the build's files, its version and the kill switch.
//
// Installing keeps every file of this version in a cache of its own. It then waits: the page asks
// before it takes over (./register.ts shows "A new version is ready · Reload"), so a page never
// runs on a mix of two versions. Taking over deletes the caches older than the one before it.
// What it answers is decided by ./routing.ts; everything else goes to the network untouched.

import { cacheName, cachesToDelete, CACHE_PREFIX, keepFetched, PAGE_WAIT_MS, pageKey, route } from './routing'

declare const __CG_BUILD__: { files: string[]; version: string; off: boolean }

// The parts of the service worker scope this file uses (the DOM types don't have them, and the
// webworker ones can't sit beside them in one project).
interface ExtendableEvent extends Event {
  waitUntil(p: Promise<unknown>): void
}
interface FetchEvent extends ExtendableEvent {
  request: Request
  respondWith(r: Promise<Response> | Response): void
}
interface MessageEvt extends ExtendableEvent {
  data: unknown
  ports: readonly MessagePort[]
}
interface Scope {
  registration: ServiceWorkerRegistration
  clients: { claim(): Promise<void> }
  skipWaiting(): Promise<void>
  addEventListener(type: 'install' | 'activate', fn: (e: ExtendableEvent) => void): void
  addEventListener(type: 'fetch', fn: (e: FetchEvent) => void): void
  addEventListener(type: 'message', fn: (e: MessageEvt) => void): void
}

const sw = self as unknown as Scope
const BUILD = __CG_BUILD__
const CACHE = cacheName(BUILD.version)
const scope = () => sw.registration.scope
const abs = (u: string) => new URL(u, scope()).href
let keptUrls: Set<string> | null = null
const keptSet = () => (keptUrls ??= new Set(BUILD.files.map(abs)))
/** When this cache was made, kept in it, so taking over knows which old cache is the newest. */
const STAMP = '__installed'

/** A response with any redirect taken out: a page load can't be answered by a redirected one. */
async function clean(res: Response): Promise<Response> {
  if (!res.redirected) return res
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers })
}

async function keepAll(): Promise<void> {
  const cache = await caches.open(CACHE)
  const others = (await caches.keys()).filter(n => n.startsWith(CACHE_PREFIX) && n !== CACHE)
  await Promise.all(
    BUILD.files.map(async file => {
      const url = abs(file)
      if (await cache.match(url)) return
      // A hashed file kept by an older version is the same bytes: copied, not downloaded again.
      if (file.startsWith('assets/'))
        for (const name of others) {
          const old = await (await caches.open(name)).match(url)
          if (old) return cache.put(url, old)
        }
      // no-cache: checked with the server, so an icon or the page is never an old copy from the HTTP cache.
      const res = await fetch(url, { cache: 'no-cache' })
      if (!res.ok) throw new Error(`${file}: ${res.status}`)
      // The page must be this version's, or offline it would ask for files this cache hasn't got
      // (a newer deploy landed meanwhile): the install fails and is tried again later.
      if (file === './' && !(await res.clone().text()).includes(`content="${BUILD.version}"`)) throw new Error('the page is from another version')
      await cache.put(url, await clean(res))
    }),
  )
  await cache.put(abs(STAMP), new Response(String(Date.now())))
}

async function tidy(): Promise<void> {
  const names = await caches.keys()
  const installed: Record<string, number> = {}
  for (const n of names) {
    if (!n.startsWith(CACHE_PREFIX)) continue
    const stamp = await (await caches.open(n)).match(abs(STAMP))
    installed[n] = stamp ? Number(await stamp.text()) || 0 : 0
  }
  await Promise.all(cachesToDelete(names, CACHE, installed).map(n => caches.delete(n)))
}

/** The kept copy, from this version's cache, then the one before it. */
async function kept(url: string): Promise<Response | undefined> {
  const mine = await (await caches.open(CACHE)).match(url)
  if (mine) return mine
  for (const n of await caches.keys()) {
    if (!n.startsWith(CACHE_PREFIX) || n === CACHE) continue
    const r = await (await caches.open(n)).match(url)
    if (r) return r
  }
  return undefined
}

async function page(req: Request): Promise<Response> {
  const fromCache = () => caches.open(CACHE).then(c => c.match(pageKey(scope())))
  try {
    const res = await new Promise<Response>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('slow')), PAGE_WAIT_MS)
      fetch(req).then(
        r => (clearTimeout(t), resolve(r)),
        e => (clearTimeout(t), reject(e)),
      )
    })
    // A server in trouble: the kept page works better than its error.
    if (res.status >= 500) return (await fromCache()) ?? res
    return res
  } catch (e) {
    const copy = await fromCache()
    if (copy) return copy
    throw e
  }
}

async function asset(req: Request): Promise<Response> {
  const copy = await kept(req.url)
  if (copy) return copy
  // Not kept: the network, and kept from then on if it's a built file. Offline that fails, and
  // the app offers a reload (./register.ts, vite:preloadError).
  const res = await fetch(req)
  if (keepFetched(req.url, scope(), res.status)) {
    const c = res.clone()
    void caches.open(CACHE).then(cache => cache.put(req.url, c))
  }
  return res
}

if (BUILD.off) {
  // The kill switch (./killSwitch.ts): take over at once, delete every cache of this app's, and go.
  // No fetch handler, and no reload: open pages carry on, from the network.
  sw.addEventListener('install', () => void sw.skipWaiting())
  sw.addEventListener('activate', e =>
    e.waitUntil(
      (async () => {
        const names = await caches.keys()
        await Promise.all(names.filter(n => n.startsWith(CACHE_PREFIX)).map(n => caches.delete(n)))
        await sw.registration.unregister()
      })(),
    ),
  )
} else {
  // The very first one takes the open page straight away (there's no older version for it to
  // mix with), so it works offline without a reload. Later ones wait to be asked.
  let first = false
  sw.addEventListener('install', e => {
    first = !sw.registration.active
    e.waitUntil(keepAll())
  })
  sw.addEventListener('activate', e => e.waitUntil(tidy().then(() => (first ? sw.clients.claim() : undefined))))
  sw.addEventListener('message', e => {
    const data = e.data as { type?: string } | null
    // The page asked: the person chose Reload.
    if (data?.type === 'take-over') void sw.skipWaiting()
    if (data?.type === 'version') e.ports[0]?.postMessage({ version: BUILD.version })
  })
  sw.addEventListener('fetch', e => {
    const req = e.request
    const kind = route({ url: req.url, method: req.method, mode: req.mode, range: req.headers.has('range') }, { scope: scope(), kept: keptSet() })
    if (kind === 'page') e.respondWith(page(req))
    else if (kind === 'asset') e.respondWith(asset(req))
  })
}
