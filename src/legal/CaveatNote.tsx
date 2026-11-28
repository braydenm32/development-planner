// The one caveat as a line of small print, with the way to How accurate is this?

import { ACCURACY_TITLE, CAVEAT } from './caveat'

export function Caveat({ className = 'muted small', newTab = false }: { className?: string; newTab?: boolean }) {
  return (
    <p className={`${className} lg-caveat`}>
      {CAVEAT}{' '}
      <a href="#/accuracy" {...(newTab ? { target: '_blank', rel: 'noopener' } : {})}>
        {ACCURACY_TITLE}
      </a>
    </p>
  )
}
