// Site › Block and Site › 3D, from the site's sections (src/components/SiteSections.tsx).

import { useEffect } from 'react'
import { ResetCameraButton, SiteFacts, ViewToggles } from '../../components/SiteSections'
import type { ViewSettings } from '../../lib/storage'
import { navigate, useRouter } from '../../nav/router'
import { tabRoute } from '../../nav/route'
import { StreetSideField, StreetSideLink } from '../../phone/StreetSide'
import { STREET_SIDE_ID } from '../../phone/streetSideWords'
import { useProjects } from '../../projects/session'
import { guessCount, layersKey, useLayersSeen } from '../../site/layersSeen'
import { SketchNotice } from '../../start/SketchNotice'
import { DemNotice } from '../../map/DemNotes'
import { useShell } from '../context'
import './site-tabs.css'

export function SiteBlockTab() {
  const { terrain, survey, siteError } = useShell()
  const focus = useRouter(s => s.focus)

  // A link to the street side (from Site › 3D or the checks) scrolls to it and flashes it.
  useEffect(() => {
    if (focus !== STREET_SIDE_ID) return
    const el = document.getElementById(STREET_SIDE_ID)?.parentElement?.querySelector<HTMLElement>('.street-side-pick')
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.focus({ preventScroll: true })
      el.classList.remove('flash')
      void el.offsetWidth
      el.classList.add('flash')
    }
    useRouter.setState({ focus: null })
  }, [focus])

  if (!terrain) return <p className="muted">{siteError ?? 'The survey could not be read.'} Check the survey layers under More.</p>
  const warnings = survey?.warnings.length ?? 0
  return (
    <>
      <SketchNotice />
      <DemNotice />
      <SiteFacts stats={terrain.stats}>{survey && <StreetSideField survey={survey} terrain={terrain} />}</SiteFacts>
      <LayerGuesses />
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

/** "Survey layers: 5 guesses", until the layers have been looked at, so the import's toast isn't the only way to them. */
function LayerGuesses() {
  const { layers, project } = useShell()
  const id = useProjects().currentId
  const seen = useLayersSeen(s => s.seen.includes(layersKey(id, project.fileName)))
  const route = useRouter(s => s.route)
  const n = guessCount(layers, project.roles)
  if (seen || n === 0) return null
  return (
    <p className="layer-guesses">
      <span className="badge">
        Survey layers: {n} guess{n === 1 ? '' : 'es'}
      </span>
      <button className="link" onClick={() => navigate(tabRoute(route, 'site', 'more'), { focus: 'survey-layers' })}>
        Check what each was read as
      </button>
    </p>
  )
}

export function Site3dTab() {
  const { view, changeView, resetCamera, survey, terrain } = useShell()
  const set = (patch: Partial<ViewSettings>) => changeView({ ...view, ...patch })
  return (
    <>
      <ViewToggles view={view} onChange={set} />
      {survey && terrain && <StreetSideLink survey={survey} terrain={terrain} />}
      <ResetCameraButton onReset={resetCamera} />
    </>
  )
}
