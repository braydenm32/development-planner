// Site › Block and Site › 3D, from the site's sections (src/components/SiteSections.tsx).

import { ResetCameraButton, SiteFacts, ViewToggles } from '../../components/SiteSections'
import type { ViewSettings } from '../../lib/storage'
import { navigate } from '../../nav/router'
import { StreetSidePicker } from '../../phone/StreetSide'
import { SketchNotice } from '../../start/SketchNotice'
import { DemNotice } from '../../map/DemNotes'
import { useShell } from '../context'

export function SiteBlockTab() {
  const { terrain, survey, siteError } = useShell()
  if (!terrain) return <p className="muted">{siteError ?? 'The survey could not be read.'} Check the survey layers under More.</p>
  const warnings = survey?.warnings.length ?? 0
  return (
    <>
      <SketchNotice />
      <DemNotice />
      <SiteFacts stats={terrain.stats} />
      {warnings > 0 && (
        <p className="notice small">
          The survey came in with {warnings} warning{warnings > 1 ? 's' : ''}.{' '}
          <button className="link" onClick={() => navigate({ kind: 'app', area: 'site', tab: 'more', view: '3d' }, { focus: 'survey-warnings' })}>
            See them
          </button>
        </p>
      )}
    </>
  )
}

export function Site3dTab() {
  const { view, changeView, resetCamera, survey, terrain } = useShell()
  const set = (patch: Partial<ViewSettings>) => changeView({ ...view, ...patch })
  return (
    <>
      <ViewToggles view={view} onChange={set} />
      {survey && terrain && <StreetSidePicker survey={survey} terrain={terrain} />}
      <ResetCameraButton onReset={resetCamera} />
    </>
  )
}
