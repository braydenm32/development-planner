// The layer review for a survey whose contours weren't on the layers they're usually on: the
// file's layers, each with what it holds, to say which hold the contours and spot levels. The
// survey opens once they give some ground; until then Use these layers waits. Cancel opens nothing.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SurveyLayers } from '../components/SiteSections'
import { parseDxf } from '../lib/dxf'
import { buildSurvey, NoGroundError, type LayerRole, type Survey } from '../lib/survey'
import { useSafety, type LayersAsk } from './store'
import { SurveyorRequest } from './SurveyorRequest'

export function LayersSheet() {
  const ask = useSafety(s => s.layers)
  // Keyed, so each file starts from its own guessed layers.
  return ask ? <LayersReview key={ask.id} ask={ask} /> : null
}

function LayersReview({ ask }: { ask: LayersAsk }) {
  const [roles, setRoles] = useState(ask.roles)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const answer = useRef(ask.answer)
  useLayoutEffect(() => {
    answer.current = ask.answer
  })
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      answer.current(null)
    }
    // Before the start screen's and the plan's own keys, so Esc only closes this.
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('keydown', esc, true)
      opener?.focus?.()
    }
  }, [])
  // It read once already, so it reads again; only the layers change.
  const doc = useMemo(() => parseDxf(ask.dxfText), [ask.dxfText])
  const built = useMemo((): { survey: Survey } | { error: string } => {
    try {
      return { survey: buildSurvey(doc, roles) }
    } catch (e) {
      return { error: e instanceof NoGroundError ? 'No contours or spot levels on the layers picked yet.' : (e as Error).message }
    }
  }, [doc, roles])
  const survey = 'survey' in built ? built.survey : null
  const setRole = (layer: string, role: LayerRole) => setRoles(r => ({ ...r, [layer]: role }))
  return (
    <div className="sf-scrim" onPointerDown={e => e.target === e.currentTarget && ask.answer(null)}>
      <div className="sf-sheet sf-layers" role="dialog" aria-modal="true" aria-labelledby="sf-layers-title">
        <div className="sf-grab" aria-hidden="true" />
        <header className="sf-head">
          <span className="sf-step">Pick the survey layers</span>
          <h2 id="sf-layers-title">Which layers hold the contours?</h2>
        </header>
        <div className="sf-body">
          <p className="sf-lede">
            No contours or spot levels were found in <b>{ask.fileName}</b> on the layers they’re usually on. Set the layer with the contour lines to <b>Contours</b>, and any
            spot heights to <b>Spot levels</b>.
          </p>
          <div className="sf-layer-list">
            <SurveyLayers layers={ask.layers} roles={roles} onRoleChange={setRole} survey={survey} />
          </div>
          {'error' in built && (
            <p className="sf-warn" role="status">
              {built.error}
            </p>
          )}
          <SurveyorRequest lead="If no layer holds them, the file may not have heights on its contours. To ask your surveyor for one that does:" />
        </div>
        <footer className="sf-actions">
          <button ref={cancelRef} className="sf-btn" onClick={() => ask.answer(null)}>
            Cancel
          </button>
          <button className="sf-btn primary" disabled={!survey} onClick={() => ask.answer({ fileName: ask.fileName, dxfText: ask.dxfText, roles })}>
            Use these layers
          </button>
        </footer>
      </div>
    </div>
  )
}
