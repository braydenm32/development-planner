// The areas (side rail on a desktop, bottom bar on a phone) and the current area's tabs,
// all rendered from the menu. Each is a real link to its route, so Back, reload and
// "open in new tab" all work; a plain click goes there without reloading.

import { useEffect, type ReactNode, type RefObject } from 'react'
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

/** The room the "+3" at the end of the tabs takes (shell.css's .scroll-arrow.menu). */
const MORE_W = 50

/** The current area's tabs, ending in More. Where they don't all fit, the ones that would be cut off hide behind an arrow. */
export function TabBar({ route, go }: { route: AppRoute; go: Go }) {
  // A phone's bar has room for a tab or two: it scrolls under the finger, and no name is ever hidden.
  // On a computer the tabs that don't fit are listed by name under the "+3" at the end.
  const phone = usePhone()
  const area = areaById(route.area)!
  const hiddenTabs = (hidden: boolean[], close: () => void) => {
    const rows = [...area.tabs.map(t => ({ id: t.id, label: t.label as ReactNode })), ...(area.more.items.length > 0 ? [{ id: MORE, label: area.more.label as ReactNode }] : [])]
    return rows.map((t, i) => {
      if (!hidden[i]) return null
      const link = linkTo(tabRoute(route, area.id, t.id), go)
      return (
        <a
          key={t.id}
          className="cue-item"
          href={link.href}
          onClick={e => {
            link.onClick(e)
            close()
            // The keyboard carries on from the tab just opened, now in the bar.
            if (e.defaultPrevented) requestAnimationFrame(() => document.querySelector<HTMLElement>('.tab-bar .tab.on')?.focus())
          }}
        >
          {t.label}
        </a>
      )
    })
  }
  return <ScrollCue className="tab-cue" label="tabs" free={phone} keep=".tab.on" menu={phone ? undefined : hiddenTabs} render={ref => <Tabs route={route} go={go} bar={ref} phone={phone} />} />
}

function Tabs({ route, go, bar, phone }: { route: AppRoute; go: Go; bar: RefObject<HTMLElement | null>; phone: boolean }) {
  const area = areaById(route.area)!
  // Keep the open tab in sight, clear of the "+3" (the bar's scroll-padding). On a phone it sits in
  // the middle, so a neighbour's name shows at each side that has one.
  useEffect(() => {
    const el = bar.current
    const on = el?.querySelector<HTMLElement>('.tab.on')
    if (!el || !on) return
    if (phone) {
      on.scrollIntoView({ block: 'nearest', inline: 'center' })
      return
    }
    // On a computer the row starts at a tab's edge: as far back as still shows the open tab before the "+3".
    const room = el.clientWidth - MORE_W
    const end = on.offsetLeft + on.offsetWidth
    const first = el.scrollWidth <= el.clientWidth + 1 || end <= room ? null : ([...el.children] as HTMLElement[]).find(k => end - k.offsetLeft <= room)
    el.scrollTo({ left: first ? first.offsetLeft : 0 })
  }, [route.area, route.tab, bar, phone])
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
