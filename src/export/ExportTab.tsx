// Share › Export: a DXF for a surveyor or engineer, pictures of the plan and the 3D view, and the
// door and window schedule (on screen, and as a CSV for a spreadsheet).

import { useState } from 'react'
import { Waiting } from '../shell/tabs/Waiting'
import { useLoaded } from '../shell/useSite'
import { dxfText, saveDxf, savePicture, saveScheduleCsv, scheduleRows } from './files'
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
  const picture = async (which: 'plan' | '3d') => setError(await savePicture(d.plan, which))
  const dxf = () => {
    setDxfError(null)
    try {
      // Written first, so a plan that can't be drawn says so instead of saving an empty file.
      dxfText({ plan: d.plan, survey: d.survey, terrain: d.terrain, earth: d.earth })
      saveDxf({ plan: d.plan, survey: d.survey, terrain: d.terrain, earth: d.earth })
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
          The block boundary, the survey’s contours, the house walls (each floor on its own layer), the finished contours once the ground is cut or filled,
          retaining walls and the driveway.
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
          <table className="schedule">
            <thead>
              <tr>
                <th>Mark</th>
                <th>Type</th>
                <th>Where</th>
                <th>W × H</th>
                <th>Sill</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>{r.id}</td>
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
