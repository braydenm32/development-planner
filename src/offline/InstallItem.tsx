// "Install Contour & Gable" in the project menu, only where the browser offers it (Chrome and
// Edge on a computer or Android). On an iPhone or iPad it's Share › Add to Home Screen instead,
// which search says (src/nav/menu.ts, install-app).

import { Icon } from '../nav/icons'
import { installApp, useOffline } from './state'

export function InstallItem({ onRun }: { onRun: () => void }) {
  const offered = useOffline(s => !!s.install)
  if (!offered) return null
  return (
    <button
      data-item="install-app"
      className="menu-item"
      onClick={() => {
        onRun()
        void installApp()
      }}
    >
      <Icon name="download" size={16} />
      <span>Install Contour &amp; Gable</span>
    </button>
  )
}
