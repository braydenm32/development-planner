// Site › Features: easements, trees, fences and the other things already on the block, the
// drawings laid over the plan, and the tools to trace and line up. The panel is the old
// layout's own; lining up and tracing happen on the plan, so its buttons bring the plan up
// here in Site rather than going to Design.

import { useEffect } from 'react'
import { useRouter } from '../../nav/router'
import { SiteFeaturesPanel } from '../../site/SiteFeaturesPanel'
import { useSiteStore } from '../../site/store'
import { TO_CHECK_ID } from '../../site/sync'
import { useShell } from '../context'
import { canEdit, usePhone, usePhoneMode } from '../../phone/device'
import { switchView } from '../useSite'

export function SiteFeaturesTab() {
  const { survey } = useShell()
  const focus = useRouter(s => s.focus)
  const loaded = useSiteStore(s => s.loaded)
  // A phone in View reads the features only (the shell's ViewLock says how to Edit).
  const viewOnly = !canEdit(usePhone(), usePhoneMode(s => s.mode))

  // Scroll to the To check list and flash it, once the features have loaded.
  useEffect(() => {
    if (focus !== TO_CHECK_ID || !loaded) return
    const el = document.getElementById(TO_CHECK_ID)
    if (el) {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' })
      el.classList.remove('flash')
      void el.offsetWidth
      el.classList.add('flash')
    }
    useRouter.setState({ focus: null })
  }, [focus, loaded])

  return <SiteFeaturesPanel survey={survey} onShowPlan={() => switchView('plan')} viewOnly={viewOnly} />
}
