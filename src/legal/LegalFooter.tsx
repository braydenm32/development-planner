// The small footer of links: on the start screen, the Projects home and the pages themselves.

import { ACCURACY_TITLE, CONTACT_EMAIL } from './caveat'

export function LegalFooter({ newTab = false }: { newTab?: boolean }) {
  // A tab of its own where leaving would lose something (a sheet in progress, a shared view).
  const t = newTab ? { target: '_blank', rel: 'noopener' } : {}
  return (
    <footer className="lg-foot">
      <nav aria-label="About this app">
        <a href="#/about" {...t}>About</a>
        <a href="#/privacy" {...t}>Privacy</a>
        <a href="#/terms" {...t}>Terms</a>
        <a href="#/accuracy" {...t}>{ACCURACY_TITLE}</a>
        <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
      </nav>
    </footer>
  )
}
