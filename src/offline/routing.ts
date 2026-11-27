// Which requests the service worker (./sw.ts) answers, and how. Pure, so the rules are tested on
// their own (./__tests__/routing.test.ts); the worker only carries them out.
//
//   pass   not touched at all: the browser fetches it as if there were no service worker. The
//          Worker API (sign-in, cloud saves, share links, comments), every other site (the NSW
//          maps and planning services), anything that isn't a GET, and anything outside the app.
//   page   the app's page: the network first, so a new deploy is picked up as soon as it's out;
//          the kept copy when there's no connection.
//   asset  a file of the build: the kept copy first (its name has a hash, so it never goes
//          stale); the network when it isn't kept.

export type Route = 'pass' | 'page' | 'asset'

export interface RouteRequest {
  url: string
  method: string
  /** Request.mode: "navigate" for a page load. */
  mode?: string
  /** A Range request (media seeking): left to the browser. */
  range?: boolean
}

export interface RouteContext {
  /** The service worker's scope, absolute, ending in "/": the app's base. */
  scope: string
  /** The kept files' absolute addresses. */
  kept: ReadonlySet<string>
}

const path = (u: string) => new URL(u).pathname

export function route(req: RouteRequest, ctx: RouteContext): Route {
  if (req.method !== 'GET' || req.range) return 'pass'
  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return 'pass'
  }
  const scope = new URL(ctx.scope)
  if (url.origin !== scope.origin) return 'pass'
  if (!url.pathname.startsWith(scope.pathname)) return 'pass'
  const rest = url.pathname.slice(scope.pathname.length)
  // The Worker's API is at the base (a build for a sub-path finds it there) and at the root.
  if (rest === 'api' || rest.startsWith('api/') || url.pathname === '/api' || url.pathname.startsWith('/api/')) return 'pass'
  if (req.mode === 'navigate') {
    if (rest === '' || rest === 'index.html') return 'page'
    return ctx.kept.has(url.origin + url.pathname) ? 'asset' : 'pass'
  }
  // The kept copy answers only the exact file; a query string means someone wants something else.
  if (url.search === '' && ctx.kept.has(url.origin + url.pathname)) return 'asset'
  // A built file this worker didn't keep (a newer deploy's): fetched, and kept from then on.
  if (url.search === '' && rest.startsWith('assets/')) return 'asset'
  return 'pass'
}

/** The address the page is kept under: the base itself. */
export const pageKey = (scope: string) => scope

/** Whether a fetched build file may be kept, beside the ones kept at install. */
export const keepFetched = (url: string, scope: string, status: number) => status === 200 && path(url).startsWith(path(scope) + 'assets/')

/** How long a page load waits for the network before the kept copy answers instead (a weak signal). */
export const PAGE_WAIT_MS = 6000

/** This app's caches, by the prefix every one of them has (a site may have others). */
export const CACHE_PREFIX = 'cg-offline-'

export const cacheName = (version: string) => CACHE_PREFIX + version

/**
 * The caches to delete once a new version takes over: every older one of this app's but the
 * newest of them, so a tab still open on the last version can load a part it hasn't yet, even
 * offline. `installed` gives when each was made (unknown: oldest).
 */
export function cachesToDelete(names: readonly string[], current: string, installed: Readonly<Record<string, number>>): string[] {
  const old = names.filter(n => n.startsWith(CACHE_PREFIX) && n !== current).sort((a, b) => (installed[b] ?? 0) - (installed[a] ?? 0))
  return old.slice(1)
}
