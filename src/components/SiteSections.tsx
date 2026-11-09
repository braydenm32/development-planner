// The Site area's sections: the block's facts, the survey's warnings, the 3D view's settings
// and the survey layers. Site › Block, Site › 3D and Site's More render them (src/shell/tabs).

import type { LayerInfo, LayerRole, Survey } from '../lib/survey'
import { FEATURE_ROLES, ROLE_LABELS, SURVEY_ROLES } from '../lib/survey'
import type { ViewSettings } from '../lib/storage'
import { bearingName, type SiteStats } from '../lib/terrain'
import { foundText } from '../safety/readBack'

function describeLayer(l: LayerInfo): string {
  const parts: string[] = []
  if (l.polylines) parts.push(`${l.polylines} line${l.polylines > 1 ? 's' : ''}`)
  if (l.points) parts.push(`${l.points} point${l.points > 1 ? 's' : ''}`)
  if (l.circles) parts.push(`${l.circles} circle${l.circles > 1 ? 's' : ''}`)
  if (l.inserts) parts.push(`${l.inserts} block${l.inserts > 1 ? 's' : ''}`)
  if (l.faces) parts.push(`${l.faces} face${l.faces > 1 ? 's' : ''}`)
  if (l.texts) parts.push(`${l.texts} label${l.texts > 1 ? 's' : ''}`)
  return parts.join(', ')
}

const fmt = (n: number, d = 2) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })

/** Site area, perimeter, RL range, fall and slope. */
export function SiteFacts({ stats }: { stats: SiteStats }) {
  return (
    <dl className="stats">
      <dt>Area</dt>
      <dd>{fmt(stats.area, 0)} m²</dd>
      <dt>Perimeter</dt>
      <dd>{fmt(stats.perimeter, 1)} m</dd>
      <dt>Levels</dt>
      <dd>
        RL {fmt(stats.minRL)} to {fmt(stats.maxRL)}
      </dd>
      <dt>Total fall</dt>
      <dd>{fmt(stats.maxRL - stats.minRL)} m</dd>
      <dt>Average slope</dt>
      <dd>
        {fmt(stats.meanSlopePct, 0)}% (1 in {fmt(100 / Math.max(stats.meanSlopePct, 0.01), 1)})
      </dd>
      <dt>Steepest</dt>
      <dd>{fmt(stats.maxSlopePct, 0)}%</dd>
      <dt>Falls towards</dt>
      <dd>{stats.maxSlopePct < 0.05 ? 'Level (no fall)' : `${bearingName(stats.fallBearing)} (${fmt(stats.fallBearing, 0)}°)`}</dd>
    </dl>
  )
}

export function SurveyWarnings({ survey }: { survey: Survey | null }) {
  if (!survey || survey.warnings.length === 0) return null
  return (
    <section className="warnings">
      {survey.warnings.map(w => (
        <p key={w}>{w}</p>
      ))}
    </section>
  )
}

type SetView = (patch: Partial<ViewSettings>) => void

export function ExaggerationSlider({ view, onChange: set }: { view: ViewSettings; onChange: SetView }) {
  return (
    <label className="slider">
      <span>
        Vertical exaggeration <b>{view.exaggeration.toFixed(1)}×</b>
      </span>
      <input type="range" min={1} max={3} step={0.1} value={view.exaggeration} onChange={e => set({ exaggeration: Number(e.target.value) })} />
    </label>
  )
}

/** What the 3D view shows. */
export function ViewToggles({ view, onChange: set }: { view: ViewSettings; onChange: SetView }) {
  return (
    <>
      <label className="check">
        <input type="checkbox" checked={view.showContours} onChange={e => set({ showContours: e.target.checked })} />
        Contours
      </label>
      <label className="check">
        <input type="checkbox" checked={view.showLevels} onChange={e => set({ showLevels: e.target.checked })} />
        Spot levels
      </label>
      <label className="check">
        <input type="checkbox" checked={view.showReference} onChange={e => set({ showReference: e.target.checked })} />
        Reference points
      </label>
      <label className="check">
        <input type="checkbox" checked={view.showSolid} onChange={e => set({ showSolid: e.target.checked })} />
        Show as a solid block
      </label>
      <label className="check">
        <input type="checkbox" checked={view.showHouse} onChange={e => set({ showHouse: e.target.checked })} />
        House
      </label>
      <label className="check">
        <input type="checkbox" checked={view.showRoof} disabled={!view.showHouse} onChange={e => set({ showRoof: e.target.checked })} />
        Roof
      </label>
      <label className="check">
        <input type="checkbox" checked={view.showFurniture} disabled={!view.showHouse} onChange={e => set({ showFurniture: e.target.checked })} />
        Furniture
      </label>
      <label className="check">
        <input type="checkbox" checked={view.showEarthworks} onChange={e => set({ showEarthworks: e.target.checked })} />
        Cut and fill (finished ground)
      </label>
    </>
  )
}

export function ResetCameraButton({ onReset }: { onReset: () => void }) {
  return (
    <button className="secondary" onClick={onReset}>
      Reset camera
    </button>
  )
}

export function SurveyLayers({
  layers,
  roles,
  onRoleChange,
  survey,
}: {
  layers: LayerInfo[]
  roles: Record<string, LayerRole>
  onRoleChange: (layer: string, role: LayerRole) => void
  /** The survey these layers make, to say what they gave. */
  survey?: Survey | null
}) {
  return (
    <>
      {survey && (
        <p className="found-line">Found {foundText(survey)}.</p>
      )}
      <p className="muted">Tell the planner what each layer in your DXF holds: the ground, or site features such as trees and easements.</p>
      <ul className="layers">
        {layers.map(l => (
          <li key={l.name}>
            <div>
              <span className="layer-name">{l.name}</span>
              <span className="muted">{describeLayer(l)}</span>
            </div>
            <select value={roles[l.name] ?? 'ignore'} onChange={e => onRoleChange(l.name, e.target.value as LayerRole)} aria-label={`Use of layer ${l.name}`}>
              <optgroup label="Survey">
                {SURVEY_ROLES.map(r => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Site features">
                {FEATURE_ROLES.map(r => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </optgroup>
            </select>
          </li>
        ))}
      </ul>
    </>
  )
}
