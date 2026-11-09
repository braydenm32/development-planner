// A calm stop for a part of the page that hits a bug while drawing, so one broken panel shows
// a short note and a Reload button instead of taking the whole page down with it to a blank
// white screen. Everything else keeps working; the projects save as they go, so a reload
// picks up where the person was.

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /**
   * How the note sits: `page` (the default) in the middle of the page, `inline` in place of a
   * panel's body, `float` as a small card in the corner, for a layer over the page.
   */
  variant?: 'page' | 'inline' | 'float'
}

interface State {
  failed: boolean
}

export const FALLBACK_TITLE = 'Something went wrong here.'
export const FALLBACK_TEXT = 'Your work is saved as you go, so reloading the page picks up where you were.'

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Still in the console, for anyone looking into it.
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className={`error-fallback ${this.props.variant ?? 'page'}`} role="alert">
        <p className="error-fallback-title">{FALLBACK_TITLE}</p>
        <p>{FALLBACK_TEXT}</p>
        <button type="button" className="error-fallback-reload" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
