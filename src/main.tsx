import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { CloudLayer } from './cloud'
import { GuideLayer } from './guide/GuideSheet'
import { TermTip } from './guide/Term'
import { readShareHash } from './share-links/address'
import { SharedView } from './share-links/SharedView'
import { ErrorBoundary } from './shell/ErrorBoundary'

// A share link (#/view/<token>) opens the shared view on its own: no projects, no sign-in.
const shared = readShareHash(location.hash)

// Going from the app to a share link in the same tab (a pasted link, Back), the other way, or to
// another link, starts the page afresh, so the two never share a session. Registered before the
// router's own listeners, which then never see the change.
const across = (e: Event) => {
  if ((readShareHash(location.hash)?.token ?? null) === (shared?.token ?? null)) return
  e.stopImmediatePropagation()
  location.reload()
}
window.addEventListener('hashchange', across)
window.addEventListener('popstate', across)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Each part on its own: a bug in one shows a calm note and Reload, and the rest stays. */}
    {shared ? (
      <ErrorBoundary>
        <SharedView address={shared} />
      </ErrorBoundary>
    ) : (
      <>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <ErrorBoundary variant="float">
          <CloudLayer />
        </ErrorBoundary>
      </>
    )}
    {/* The guide and what each planning word means, over every screen; a shared view has no example to open. */}
    <ErrorBoundary variant="float">
      <GuideLayer example={!shared} />
      <TermTip />
    </ErrorBoundary>
  </StrictMode>,
)
