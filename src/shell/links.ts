import type { MouseEvent } from 'react'
import { formatHash, type Route } from '../nav/route'

export type Go = (to: Route) => void

/** href and click handler for a link to a route: a plain click goes there without reloading. */
export function linkTo(to: Route, go: Go) {
  return {
    href: formatHash(to),
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      go(to)
    },
  }
}
