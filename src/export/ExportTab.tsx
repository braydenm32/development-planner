// Share › Export: a DXF for a surveyor or engineer, pictures of the plan and the 3D view, and the
// door and window schedule (on screen, and as a CSV for a spreadsheet).

import { useState } from 'react'
import { toastDownloaded } from '../components/printFiles'
import { Waiting } from '../shell/tabs/Waiting'
import { useLoaded } from '../shell/useSite'
import { sortedLevels } from '../plan/model'
import { dxfText, saveDxf, savePicture, saveScheduleCsv, scheduleRows } from './files'
import { openingLayer, wallLayer } from './planDxf'
import './export.css'
import '../share/share.css'

const mm = (m: number) => Math.round(m * 1000)

export function ExportTab() {
  const d = useLoaded()
  const [error, setError] = useState<string | null>(null)
  const [dxfError, setDxfError] = useState<string | null>(null)
  if (!d) return <Waiting />
  const rows = scheduleRows(d.plan)
  // The floor only helps when there is more than one.
  const floors = d.plan.levels.length > 1
  // The layer names as this plan's file has them, so the list reads like the file.
  const lowest = sortedLevels(d.plan)[0]?.id
  const layers = lowest ? `${wallLayer(d.plan, lowest)}, ${openingLayer(d.plan, lowest)}` : 'WALLS-GROUND-FLOOR, OPENINGS-GROUND-FLOOR'
  const picture = async (which: 'plan' | '3d') => setError(await savePicture(d.plan, which))
  const dxf = () => {
    setDxfError(null)
    try {
      // Written first, so a plan that can't be drawn says so instead of saving an empty file.
      dxfText({ plan: d.plan, survey: d.survey, terrain: d.terrain, earth: d.earth })
      toastDownloaded(saveDxf({ plan: d.plan, survey: d.survey, terrain: d.terrain, earth: d.earth }))
    } catch (err) {
      setDxfError((err as Error).message || 'The DXF could not be written.')
    }
  }
  return (
    <>
      <h3>DXF for your surveyor or engineer</h3>
      <p className="muted small">On the survey’s own eastings and northings, so it lays straight over their file.</p>
      <details className="sh-whats">
        <summary>What’s in it</summary>
        <p className="muted small">
          The block boundary, the survey’s contours and the finished contours once the ground is cut or filled. Each level’s walls, doors and windows, and
          stairs, on layers named after the level ({layers}, …). Roofs, retaining walls with their top RLs, the driveway
          and other outdoor areas, section lines, your notes, and each floor level (FFL) and pad level as text. Saved as “your project-design.dxf”, so it can’t be
          mixed up with the survey file.
        </p>
      </details>
      <div className="row">
        <button className="secondary" onClick={dxf}>
          Download DXF
        </button>
      </div>
      {dxfError && <p className="error">{dxfError}</p>}

      <h3>Pictures</h3>
      <p className="muted small">A PNG of what the plan or the 3D view shows now. For 3D, open it from the top bar first.</p>
      <div className="row">
        <button className="secondary" onClick={() => void picture('plan')}>
          Plan picture (PNG)
        </button>
        <button className="secondary" onClick={() => void picture('3d')}>
          3D picture (PNG)
        </button>
      </div>
      {error && <p className="notice small">{error}</p>}

      <h3>Door and window schedule</h3>
      {rows.length === 0 ? (
        <p className="muted small">No doors or windows yet. Add some with the Door and Window tools and they list here.</p>
      ) : (
        <div className="schedule-wrap">
          {/* A caption, header scopes and the unit on each size, so a screen reader ties every figure to its column (AX-24). */}
          <table className="schedule">
            <caption>Door and window schedule: each door and window, where it is and its size in millimetres</caption>
            <thead>
              <tr>
                <th scope="col">Mark</th>
                <th scope="col">Type</th>
                <th scope="col">Where</th>
                <th scope="col">
                  <abbr title="Width by height">W × H</abbr> (mm)
                </th>
                <th scope="col">Sill (mm)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <th scope="row">{r.id}</th>
                  <td>{r.type}</td>
                  <td>
                    {r.room}
                    {floors && <span className="muted"> · {r.floor}</span>}
                  </td>
                  <td>
                    {mm(r.width)} × {mm(r.height)}
                  </td>
                  <td>{mm(r.sill)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Sizes in millimetres; the sill is the height of the bottom above the floor.</p>
      <div className="row">
        <button className="secondary" disabled={rows.length === 0} onClick={() => saveScheduleCsv(d.plan)}>
          Download schedule (CSV)
        </button>
      </div>
    </>
  )
}
