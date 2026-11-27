// A page about the app (About, Privacy, Terms, How accurate is this?). It shows on its own, with
// no project and no sign-in, so it works on a first visit and from a shared view's footer.
// It reads on a phone and prints as a plain document.

import { useEffect, useRef, type ReactNode } from 'react'
import { Icon, Logo } from '../nav/icons'
import { PAGE_IDS, PROJECTS, formatHash, pageRoute, type PageId } from '../nav/route'
import { navigate } from '../nav/router'
import { LAST_UPDATED } from './caveat'
import { LegalFooter } from './LegalFooter'
import { About, Accuracy, Privacy, Terms } from './pages'
import { startAtTop } from './startAtTop'
import { PAGE_TITLES } from './titles'
import './legal.css'

const PAGE_BODIES: Record<PageId, () => ReactNode> = { about: About, privacy: Privacy, terms: Terms, accuracy: Accuracy }

export function LegalPage({ page, onBack, onHome }: { page: PageId; onBack: () => void; onHome?: () => void }) {
  const Body = PAGE_BODIES[page]
  const title = PAGE_TITLES[page]
  const scroller = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const before = document.title
    document.title = `${title} · Contour & Gable`
    window.scrollTo(0, 0)
    startAtTop(scroller.current, heading.current)
    return () => {
      document.title = before
    }
  }, [title])
  return (
    <div className="lg-page" ref={scroller}>
      <header className="lg-top">
        <button className="lg-back" onClick={onBack}>
          <Icon name="chevL" size={16} />
          Back
        </button>
        {/* The way into the app from a page opened on its own: the open project, or Projects. */}
        <a
          className="lg-brand"
          href={formatHash(PROJECTS)}
          aria-label="Contour & Gable: go to the app"
          onClick={e => {
            if (!onHome || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
            e.preventDefault()
            onHome()
          }}
        >
          <Logo size={22} />
          <span>Contour &amp; Gable</span>
        </a>
      </header>
      <nav className="lg-tabs" aria-label="About this app">
        {PAGE_IDS.map(id => (
          <a
            key={id}
            href={`#/${id}`}
            aria-current={id === page ? 'page' : undefined}
            // Between these pages replaces the entry, so Back still leaves for where you came from.
            onClick={e => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
              e.preventDefault()
              navigate(pageRoute(id), { replace: true })
            }}
          >
            {id === 'accuracy' ? 'Accuracy' : PAGE_TITLES[id]}
          </a>
        ))}
      </nav>
      <main className="lg-main">
        <h1 tabIndex={-1} ref={heading}>
          {title}
        </h1>
        {page !== 'about' && <p className="lg-date">Last updated {LAST_UPDATED}</p>}
        <Body />
      </main>
      <LegalFooter />
    </div>
  )
}
