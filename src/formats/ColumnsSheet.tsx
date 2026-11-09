// "Which column is which?": the first rows of a spot-level file with a menu over each column.
// It opens only when the file's columns aren't certain, with the best guess already picked.

import { useEffect, useRef, useState } from 'react'
import { COLUMN_LABELS, type ColumnRole } from '../lib/pointsCsv'
import { useColumns, type ColumnsAsk } from './columns'
import '../safety/safety.css'
import './formats.css'

const CHOICES: ColumnRole[] = ['e', 'n', 'rl', 'id', 'code', 'skip']
const SHOWN = 6

function Sheet({ ask }: { ask: ColumnsAsk }) {
  const [roles, setRoles] = useState(ask.roles)
  const [header, setHeader] = useState(ask.header)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const answer = useRef(ask.answer)
  useEffect(() => {
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
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('keydown', esc, true)
      opener?.focus?.()
    }
  }, [])

  const set = (c: number, r: ColumnRole) =>
    setRoles(old => old.map((x, i) => (i === c ? r : r !== 'skip' && r !== 'code' && x === r ? 'skip' : x)))
  const missing = (['e', 'n', 'rl'] as const).filter(r => !roles.includes(r)).map(r => COLUMN_LABELS[r])
  const rows = ask.rows.slice(0, SHOWN + (header ? 1 : 0))
  const width = roles.length

  return (
    <div className="sf-scrim" onPointerDown={e => e.target === e.currentTarget && ask.answer(null)}>
      <div className="sf-sheet fm-columns" role="dialog" aria-modal="true" aria-labelledby="fm-title">
        <div className="sf-grab" aria-hidden="true" />
        <header className="sf-head">
          <span className="sf-step">Check before it opens</span>
          <h2 id="fm-title">Which column is which?</h2>
        </header>
        <div className="sf-body">
          <p className="fm-lead">
            {ask.fileName} has spot levels but no clear column names. Pick what each column is. We’ve guessed, so check easting and northing aren’t swapped.
          </p>
          <div className="fm-table-wrap">
            <table className="fm-table">
              <thead>
                <tr>
                  {Array.from({ length: width }, (_, c) => (
                    <th key={c}>
                      <select aria-label={`Column ${c + 1}`} value={roles[c]} onChange={e => set(c, e.target.value as ColumnRole)}>
                        {CHOICES.map(r => (
                          <option key={r} value={r}>
                            {COLUMN_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={header && i === 0 ? 'fm-head-row' : undefined}>
                    {Array.from({ length: width }, (_, c) => (
                      <td key={c}>{r[c] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="fm-check">
            <input type="checkbox" checked={header} onChange={e => setHeader(e.target.checked)} /> The first row is column names
          </label>
          <p className="sf-warn" role="note">
            Spot levels only make the ground. The site boundary comes from points coded BDY or BOUNDARY; without those, the outline of the points is used. Send a DXF later if you need the exact boundary.
          </p>
          {missing.length > 0 && (
            <p className="fm-missing" role="alert">
              Still to pick: {missing.join(', ')}.
            </p>
          )}
        </div>
        <footer className="sf-actions">
          <button ref={cancelRef} className="sf-btn" onClick={() => ask.answer(null)}>
            Cancel
          </button>
          <button className="sf-btn primary" disabled={missing.length > 0} onClick={() => ask.answer({ roles, header })}>
            Use these columns
          </button>
        </footer>
      </div>
    </div>
  )
}

export function ColumnsSheet() {
  const ask = useColumns(s => s.ask)
  return ask ? <Sheet key={ask.fileName} ask={ask} /> : null
}
