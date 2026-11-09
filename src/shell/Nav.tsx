// The areas (side rail on a desktop, bottom bar on a phone) and the current area's tabs,
// all rendered from the menu. Each is a real link to its route, so Back, reload and
// "open in new tab" all work; a plain click goes there without reloading.

import { useEffect, useRef } from 'react'
import { CommentsBadge } from '../comments/OwnerComments'
import { Icon, Logo } from '../nav/icons'
import { AREAS, areaById, MORE } from '../nav/menu'
import { PROJECTS, tabRoute, type AppRoute, type Route } from '../nav/route'
import { linkTo, type Go } from './links'

/** The areas, as the side rail or the phone's bottom bar. */
export function AreaNav({ route, go, variant }: { route: Route; go: Go; variant: 'rail' | 'bottom' }) {
  return (
    <nav className={variant === 'rail' ? 'area-rail' : 'bottom-bar'} aria-label="Areas">
      {variant === 'rail' && (
        <a className="rail-logo" {...linkTo(PROJECTS, go)} title="All projects" aria-label="Contour & Gable: all projects">
          <Logo size={26} />
        </a>
      )}
      {AREAS.map(a => {
        const on = route.kind === 'app' && route.area === a.id
        return (
          <a key={a.id} className={`area-link${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} {...linkTo(tabRoute(route, a.id, a.defaultTab), go)}>
            <Icon name={a.icon!} size={variant === 'rail' ? 20 : 22} />
            <span>{a.label}</span>
            {a.id === 'share' && <CommentsBadge keep />}
          </a>
        )
      })}
    </nav>
  )
}

/** The current area's tabs, ending in More. */
export function TabBar({ route, go }: { route: AppRoute; go: Go }) {
  const area = areaById(route.area)!
  const bar = useRef<HTMLElement>(null)
  // Where the tabs scroll (a phone), keep the open one in sight.
  useEffect(() => {
    bar.current?.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [route.area, route.tab])
  return (
    <nav className="tab-bar" aria-label={`${area.label} tabs`} ref={bar}>
      {area.tabs.map(t => {
        const on = route.tab === t.id
        return (
          <a key={t.id} className={`tab${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} {...linkTo(tabRoute(route, area.id, t.id), go)}>
            {t.label}
            {area.id === 'share' && t.id === 'send' && <CommentsBadge />}
          </a>
        )
      })}
      <a
        className={`tab more${route.tab === MORE ? ' on' : ''}`}
        aria-current={route.tab === MORE ? 'page' : undefined}
        {...linkTo(tabRoute(route, area.id, MORE), go)}
      >
        <Icon name={area.more.icon} size={15} />
        {area.more.label}
      </a>
    </nav>
  )
}
