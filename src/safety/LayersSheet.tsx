// The layer review for a survey whose contours weren't on the layers they're usually on: the
// file's layers, each with what it holds, to say which hold the contours and spot levels. The
// survey opens once they give some ground; until then Use these layers waits. Cancel opens nothing.

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useModal } from '../nav/useModal'
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
  const answer = useRef(ask.answer)
  useLayoutEffect(() => {
    answer.current = ask.answer
  })
  const sheet = useRef<HTMLDivElement>(null)
  // Focus starts on Cancel and Tab stays in the sheet; Esc only closes this (src/nav/useModal.ts).
  useModal(sheet, true, () => answer.current(null))
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
      <div ref={sheet} className="sf-sheet sf-layers" role="dialog" aria-modal="true" aria-labelledby="sf-layers-title">
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
          <button className="sf-btn" onClick={() => ask.answer(null)} data-autofocus>
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
