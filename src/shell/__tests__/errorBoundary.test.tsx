// A part of the page that hits a bug while drawing shows a calm note and Reload; the parts
// beside it keep theirs. The server renderer has no error boundaries, so these drive the
// boundary the way React does: getDerivedStateFromError, then render.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ErrorBoundary, FALLBACK_TEXT, FALLBACK_TITLE } from '../ErrorBoundary'

function Broken(): never {
  throw new TypeError("Cannot read properties of undefined (reading 'L1')")
}

/** What a boundary shows once React has caught `error` from its children. */
function caught(variant?: 'page' | 'inline' | 'float') {
  const b = new ErrorBoundary({ children: <Broken />, variant })
  b.state = { ...b.state, ...ErrorBoundary.getDerivedStateFromError() }
  return renderToStaticMarkup(<>{b.render()}</>)
}

describe('the error boundary', () => {
  it('shows its children while nothing has gone wrong', () => {
    expect(renderToStaticMarkup(<ErrorBoundary>Plan</ErrorBoundary>)).toBe('Plan')
  })

  it('shows a calm note and Reload in place of the part that broke', () => {
    const html = caught()
    expect(html).toContain(FALLBACK_TITLE)
    expect(html).toContain(FALLBACK_TEXT)
    expect(html).toMatch(/<button[^>]*>Reload<\/button>/)
    expect(html).toContain('role="alert"')
    expect(caught('float')).toContain('error-fallback float')
  })

  it('keeps the parts beside it: only the broken one is replaced', () => {
    const b = new ErrorBoundary({ children: <Broken /> })
    b.state = ErrorBoundary.getDerivedStateFromError()
    const html = renderToStaticMarkup(
      <main>
        <p>Canvas</p>
        {b.render()}
        <ErrorBoundary>
          <p>Panel</p>
        </ErrorBoundary>
      </main>,
    )
    expect(html).toContain('<p>Canvas</p>')
    expect(html).toContain('<p>Panel</p>')
    expect(html.match(new RegExp(FALLBACK_TITLE, 'g'))).toHaveLength(1)
  })

  it('still says what broke in the console', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    new ErrorBoundary({ children: null }).componentDidCatch(new Error('boom'), { componentStack: '\n    at Broken' })
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }), '\n    at Broken')
    log.mockRestore()
  })
})
