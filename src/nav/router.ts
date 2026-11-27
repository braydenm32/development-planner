// The app's router: the route lives in the address bar's hash, and the browser's own
// history steps through it. No router library: pushState for going somewhere, replaceState
// for keeping the level and selection up to date, and popstate/hashchange for Back,
// Forward and typed links.

import { create } from 'zustand'
import { afterBacks, forgetMarks, leaveMark, markMoved, sheetPopped, withoutMark } from './backCloses'
import { areaById, MORE } from './menu'
import { defaultRoute, formatHash, parseHash, unknownHash, type Route } from './route'

interface RouterState {
  route: Route
  /** A More item to scroll to and highlight once its panel shows. */
  focus: string | null
  /** Counts the addresses opened that name no page here, so the app can say so once each (LF-31). */
  lost: number
}

export const useRouter = create<RouterState>(() => ({ route: defaultRoute(), focus: null, lost: 0 }))

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

/**
 * Each history entry the app has shown says whether one of the app's own is behind it: false on
 * the entry the tab opened the app at, true on every one after. So a Back control can tell "back
 * within the app" from "back to whatever site this tab was on before" (history.length can't).
 */
const backMark = (): boolean | undefined => (history.state as { appBack?: boolean } | null)?.appBack
// A new place's entry never carries an open sheet's mark (src/nav/backCloses.ts).
const withMark = (appBack: boolean) => ({ ...(withoutMark(history.state) as object | null), appBack })

/** True when the browser's Back would stay in the app. */
export const hasAppHistory = (): boolean => backMark() === true

/** Go somewhere. `replace` updates the current history entry instead of adding one. */
export function navigate(route: Route, opts: { replace?: boolean; focus?: string | null } = {}) {
  // A More item opened by search or a link goes in the address, so a reload lands on it (LD-31).
  if (route.kind === 'app' && route.tab === MORE && opts.focus && areaById(route.area)?.more.items.some(i => i.id === opts.focus)) route = { ...route, item: opts.focus }
  const hash = formatHash(route)
  // After a Back that closes a sheet has landed, or this would be written on the entry it leaves.
  afterBacks(() => {
    if (location.hash === hash) return
    if (opts.replace) {
      history.replaceState(history.state, '', hash)
      markMoved(hash)
    }
    // A sheet's entry on top becomes the new place, so Back goes to where the sheet was opened.
    else if (leaveMark()) history.replaceState(withMark(true), '', hash)
    else history.pushState(withMark(true), '', hash)
  })
  const cur = useRouter.getState()
  if (!same(cur.route, route) || opts.focus !== undefined) useRouter.setState({ route, focus: opts.focus ?? cur.focus })
}

/** Read the address now; a first visit or an old link gets a sensible route written into it. */
function sync() {
  // An entry made by a plain link or a typed address has no mark yet: it came after one of ours.
  if (backMark() === undefined) history.replaceState(withMark(true), '')
  if (unknownHash(location.hash)) useRouter.setState(s => ({ lost: s.lost + 1 }))
  const parsed = parseHash(location.hash)
  if (parsed) {
    // A link to one of More's items opens it there, as search does.
    const item = parsed.kind === 'app' ? parsed.item : undefined
    if (!same(parsed, useRouter.getState().route)) useRouter.setState(item ? { route: parsed, focus: item } : { route: parsed })
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

/** Back or Forward: a sheet that was open closes first (src/nav/backCloses.ts); a Back of its own changes no place. */
function popped() {
  if (!sheetPopped()) sync()
}

/** Follow the address bar. Returns a function that stops it. */
export function startRouter(): () => void {
  dropLayoutSwitch()
  forgetMarks()
  // The entry the app opens at (a reload keeps the mark it had).
  if (backMark() === undefined) history.replaceState(withMark(false), '')
  sync()
  window.addEventListener('popstate', popped)
  window.addEventListener('hashchange', sync)
  return () => {
    window.removeEventListener('popstate', popped)
    window.removeEventListener('hashchange', sync)
  }
}
