// Skip links: the first Tab stops on the page, out of sight until Tab reaches them. They jump
// past the areas, tabs and top bar (some 28 stops) to the tab's panel, the plan's tools, the plan
// or 3D view itself, or the selection's details (WCAG 2.4.1). Buttons, not links: the address
// is the app's route, so "#panel" can't be used.

import { useRouter } from '../nav/router'
import { usePlan } from '../plan/store'
import { skipsFor } from './skips'
import './a11y.css'

/** Move focus to a part of the page; one that Tab doesn't stop on takes it for this once. */
function focusPart(el: HTMLElement) {
  if (el.tabIndex < 0 && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus()
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

/** To the part a skip names; to the main part of the page when that isn't showing (a phone in View has no tools). */
function go(to: string[]) {
  const el = [...to, 'main'].map(q => document.querySelector<HTMLElement>(q)).find(Boolean)
  if (el) focusPart(el)
}

export function SkipLinks() {
  const route = useRouter(s => s.route)
  const picked = usePlan(s => !!s.selection)
  const loaded = usePlan(s => !!s.plan)
  const skips = skipsFor(route, loaded, picked)
  return (
    <div className="skip-links">
      {skips.map(s => (
        <button key={s.id} type="button" onClick={() => go(s.to)}>
          {s.label}
        </button>
      ))}
      {/* Always one, to take the first Tab. */}
      {skips.length === 0 && (
        <button type="button" onClick={() => go([])}>
          Skip to the main part
        </button>
      )}
    </div>
  )
}
