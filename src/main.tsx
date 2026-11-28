import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/threeConsole'
import './access.css'
import './nav/arrowKeys'
import App from './App.tsx'
import { CloudLayer } from './cloud'
import { GuideLayer } from './guide/GuideSheet'
import { TermTip } from './guide/Term'
import { isShareHash, readShareHash, shareKey } from './share-links/address'
import { INCOMPLETE_LINK } from './share-links/load'
import { SharedView, Trouble } from './share-links/SharedView'
import { ErrorBoundary } from './shell/ErrorBoundary'
import { OfflineLayer } from './offline/OfflineLayer'
import { startOffline } from './offline/register'
import { startDesktop } from './desktop/files'

// A share link (#/view/<token>) opens the shared view on its own: no projects, no sign-in.
const shared = readShareHash(location.hash)
// A share link cut short or mangled on the way: its own plain page, never the visitor's own project.
const brokenLink = !shared && isShareHash(location.hash)
const here = shareKey(location.hash)

// Going from the app to a share link in the same tab (a pasted link, Back), the other way, or to
// another link, starts the page afresh, so the two never share a session. Registered before the
// router's own listeners, which then never see the change.
const across = (e: Event) => {
  if (shareKey(location.hash) === here) return
  e.stopImmediatePropagation()
  location.reload()
}
window.addEventListener('hashchange', across)
window.addEventListener('popstate', across)

// Working offline: the service worker, in a built app only (src/offline).
// The desktop app's folders and slicer first: there, files never go through the browser's download.
startDesktop()
startOffline()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Each part on its own: a bug in one shows a calm note and Reload, and the rest stays. */}
    {shared ? (
      <ErrorBoundary>
        <SharedView address={shared} />
      </ErrorBoundary>
    ) : brokenLink ? (
      <ErrorBoundary>
        <Trouble trouble={INCOMPLETE_LINK} retry={() => location.reload()} />
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
      <GuideLayer example={!shared && !brokenLink} />
      <TermTip />
      <OfflineLayer />
    </ErrorBoundary>
  </StrictMode>,
)
