// The areas (side rail on a desktop, bottom bar on a phone) and the current area's tabs,
// all rendered from the menu. Each is a real link to its route, so Back, reload and
// "open in new tab" all work; a plain click goes there without reloading.

import { useEffect, type RefObject } from 'react'
import { CommentsBadge } from '../comments/OwnerComments'
import { Icon, Logo } from '../nav/icons'
import { AREAS, areaById, MORE } from '../nav/menu'
import { PROJECTS, tabRoute, type AppRoute, type Route } from '../nav/route'
import { linkTo, type Go } from './links'
import { ScrollCue } from './ScrollCue'
import { usePhone } from '../phone/device'

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

/** The current area's tabs, ending in More. Where they don't all fit, the ones that would be cut off hide behind an arrow. */
export function TabBar({ route, go }: { route: AppRoute; go: Go }) {
  // A phone's bar has room for a tab or two: slim arrows, with no count.
  const phone = usePhone()
  return <ScrollCue className="tab-cue" label="tabs" count={!phone} narrow={phone} render={ref => <Tabs route={route} go={go} bar={ref} />} />
}

function Tabs({ route, go, bar }: { route: AppRoute; go: Go; bar: RefObject<HTMLElement | null> }) {
  const area = areaById(route.area)!
  // Keep the open tab in sight, clear of the arrows (the bar's scroll-padding).
  useEffect(() => {
    bar.current?.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [route.area, route.tab, bar])
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
      {area.more.items.length > 0 && (
        <a className={`tab more${route.tab === MORE ? ' on' : ''}`} aria-current={route.tab === MORE ? 'page' : undefined} {...linkTo(tabRoute(route, area.id, MORE), go)}>
          <Icon name={area.more.icon} size={15} />
          {area.more.label}
        </a>
      )}
    </nav>
  )
}
