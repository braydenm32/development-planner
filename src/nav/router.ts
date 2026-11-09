// The app's router: the route lives in the address bar's hash, and the browser's own
// history steps through it. No router library: pushState for going somewhere, replaceState
// for keeping the level and selection up to date, and popstate/hashchange for Back,
// Forward and typed links.

import { create } from 'zustand'
import { defaultRoute, formatHash, parseHash, type Route } from './route'

interface RouterState {
  route: Route
  /** A More item to scroll to and highlight once its panel shows. */
  focus: string | null
}

export const useRouter = create<RouterState>(() => ({ route: defaultRoute(), focus: null }))

/** The old layout's mode, which picks where a first visit with no hash lands. */
function legacyMode(): string | null {
  try {
    const raw = localStorage.getItem('view-v1')
    return raw ? ((JSON.parse(raw) as { mode?: string }).mode ?? null) : null
  } catch {
    return null
  }
}

const same = (a: Route, b: Route) => formatHash(a) === formatHash(b)

/** Go somewhere. `replace` updates the current history entry instead of adding one. */
export function navigate(route: Route, opts: { replace?: boolean; focus?: string | null } = {}) {
  const hash = formatHash(route)
  if (location.hash !== hash) {
    if (opts.replace) history.replaceState(history.state, '', hash)
    else history.pushState(history.state, '', hash)
  }
  const cur = useRouter.getState()
  if (!same(cur.route, route) || opts.focus !== undefined) useRouter.setState({ route, focus: opts.focus ?? cur.focus })
}

/** Read the address now; a first visit or an old link gets a sensible route written into it. */
function sync() {
  const parsed = parseHash(location.hash)
  if (parsed) {
    if (!same(parsed, useRouter.getState().route)) useRouter.setState({ route: parsed })
    // Tidy a hand-typed or partial link into its full form.
    if (formatHash(parsed) !== location.hash) history.replaceState(history.state, '', formatHash(parsed))
    return
  }
  const route = defaultRoute(legacyMode())
  history.replaceState(history.state, '', formatHash(route))
  useRouter.setState({ route })
}

/**
 * While there were two layouts, `?layout=new` (or `old`) picked one and localStorage
 * `layout-v1` remembered it. There is one layout now: an old link or bookmark that still
 * carries the parameter has it dropped from the address, and the remembered choice goes too.
 */
function dropLayoutSwitch() {
  try {
    localStorage.removeItem('layout-v1')
  } catch {
    // Storage can be unavailable (private windows); there is nothing to forget then.
  }
  const u = new URL(location.href)
  if (!u.searchParams.has('layout')) return
  u.searchParams.delete('layout')
  history.replaceState(history.state, '', u.href)
}

/** Follow the address bar. Returns a function that stops it. */
export function startRouter(): () => void {
  dropLayoutSwitch()
  sync()
  window.addEventListener('popstate', sync)
  window.addEventListener('hashchange', sync)
  return () => {
    window.removeEventListener('popstate', sync)
    window.removeEventListener('hashchange', sync)
  }
}
