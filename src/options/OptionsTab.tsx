// Design › Options: the project's named versions of the design (slab vs piers, say), to open,
// copy, rename and delete, and the Compare table beside them. The survey is shared; each option
// is its own plan (src/options/model.ts).

import { useEffect, useMemo, useRef, useState } from 'react'
import { useCheckTrees } from '../checks/siteTrees'
import { useCosts } from '../costs/store'
import { useMap } from '../map/store'
import { useProjects } from '../projects/session'
import { Icon } from '../nav/icons'
import { projectThumbnail } from '../projects/summary'
import type { ProjectThumbnail } from '../projects/types'
import { askReview, showToast } from '../safety/store'
import { useLoaded, type Loaded } from '../shell/useSite'
import { Waiting } from '../shell/tabs/Waiting'
import { bestIn, ROWS } from './compare'
import { MAX_NAME, MAX_OPTIONS, plansOf } from './model'
import { earthOfPlan, optionNumbers, type OptionNumbers } from './numbers'
import { copyOption, openOption, removeOption, renameOption, restoreOption, useOptions } from './store'
import './options.css'

const fail = (e: unknown) => showToast({ text: (e as Error)?.message || 'That didn’t work.' })

export function OptionsTab() {
  const d = useLoaded()
  return d ? <Options d={d} /> : <Waiting />
}

function Options({ d }: { d: Loaded }) {
  const rec = useOptions(s => s.rec)
  const busy = useOptions(s => s.busy)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [comparing, setComparing] = useState(false)
  const several = rec.items.length > 1

  const remove = async (id: string) => {
    const item = rec.items.find(i => i.id === id)
    if (!item) return
    const plan = id === rec.current ? d.plan : item.plan
    const parts = plan
      ? [`${plan.levels.length} ${plan.levels.length === 1 ? 'floor' : 'floors'}`, `${plan.walls.length} ${plan.walls.length === 1 ? 'wall' : 'walls'}`, `${plan.rooms.length} ${plan.rooms.length === 1 ? 'room' : 'rooms'}`]
      : []
    const ok = await askReview({
      kind: 'delete-option',
      title: `Delete “${item.name}”?`,
      facts: [],
      changes: [`The option “${item.name}” and its plan${parts.length ? ` (${parts.join(', ')})` : ''}`, ...(id === rec.current ? ['The project opens another option instead'] : [])],
      kept: ['The survey and the site features', 'Your other options', 'Undo brings it back for a few seconds'],
      confirm: 'Delete option',
      replaces: true,
    })
    if (!ok) return
    try {
      const removed = await removeOption(id)
      if (removed) showToast({ text: `Deleted “${removed.item.name}”.`, undo: () => restoreOption(removed) })
    } catch (e) {
      fail(e)
    }
  }

  return (
    <div className="opt">
      <p className="muted small">
        {several
          ? 'Each option is its own design on the same survey. Open one to work on it; Undo only ever goes back within the option you’re in.'
          : 'This project has one design. Make a copy to try another idea (slab or piers, say) and compare the two.'}
      </p>
      <ul className="opt-list">
        {rec.items.map(i => {
          const on = i.id === rec.current
          return (
            <li key={i.id} className={on ? 'on' : ''}>
              {renaming === i.id ? (
                <RenameField
                  initial={i.name}
                  onDone={async name => {
                    setRenaming(null)
                    if (name !== null && name !== i.name) await renameOption(i.id, name).catch(fail)
                  }}
                />
              ) : (
                <>
                  <button className="opt-open" aria-current={on ? 'true' : undefined} disabled={busy} onClick={() => void openOption(i.id).catch(fail)} title={on ? 'This is the option open now' : `Open “${i.name}”`}>
                    <span className="opt-name">{i.name}</span>
                    {on && <span className="opt-tag">Open now</span>}
                  </button>
                  <button className="icon-button" aria-label={`Rename “${i.name}”`} title="Rename" onClick={() => setRenaming(i.id)}>
                    <Icon name="pencil" size={16} />
                  </button>
                  {several && (
                    <button className="icon-button" aria-label={`Delete “${i.name}”`} title="Delete" disabled={busy} onClick={() => void remove(i.id)}>
                      <Icon name="x" size={16} />
                    </button>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>
      <div className="row opt-actions">
        <button className="secondary" disabled={busy || rec.items.length >= MAX_OPTIONS} onClick={() => void copyOption().then(id => id && setRenaming(id)).catch(fail)}>
          <Icon name="copy" size={16} /> Copy this option
        </button>
        <button className="secondary" disabled={!several} onClick={() => setComparing(true)} title={several ? undefined : 'Make a copy first, then compare the two'}>
          <Icon name="layers" size={16} /> Compare options
        </button>
      </div>
      <p className="muted small">The copy opens straight away, so you can change it while the first stays as it is. The survey, site features and cost choices are shared by every option.</p>
      {comparing && <CompareSheet d={d} onClose={() => setComparing(false)} />}
    </div>
  )
}

function RenameField({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [v, setV] = useState(initial)
  const done = useRef(false)
  const finish = (name: string | null) => {
    if (done.current) return
    done.current = true
    onDone(name && name.trim() ? name : null)
  }
  return (
    <input
      className="text opt-rename"
      aria-label="Option name"
      autoFocus
      maxLength={MAX_NAME}
      value={v}
      onFocus={e => e.currentTarget.select()}
      onChange={e => setV(e.target.value)}
      onBlur={() => finish(v)}
      onKeyDown={e => {
        if (e.key === 'Enter') finish(v)
        if (e.key === 'Escape') {
          e.stopPropagation()
          finish(null)
        }
      }}
    />
  )
}

/** The block with the house on it, small. */
function Thumb({ t, label }: { t: ProjectThumbnail | null; label: string }) {
  if (!t) return <span className="muted small">No block</span>
  return (
    <svg viewBox={t.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
      <path className="opt-block" d={t.block} />
      {t.house && <path className="opt-house" d={t.house} />}
    </svg>
  )
}

interface Column {
  id: string
  name: string
  open: boolean
  nums: OptionNumbers
  thumb: ProjectThumbnail | null
}

/** Every option's numbers, worked out with the app's own helpers; the open option from the live plan. */
function useColumns(d: Loaded): Column[] | null {
  const rec = useOptions(s => s.rec)
  const costs = useCosts(s => s.data)
  const features = useCheckTrees()
  // What Design › Checks counts besides the plan, so the checks row agrees with it.
  const planning = useMap(s => s.place?.planning ?? null)
  const dem = !!useProjects().opened?.survey?.dem
  const [cols, setCols] = useState<Column[] | null>(null)
  const plans = useMemo(() => plansOf(rec, d.plan), [rec, d.plan])
  useEffect(() => {
    // A moment after the sheet draws, so it opens at once even when the ground takes a while to work out.
    const t = setTimeout(() => {
      setCols(
        plans.map(p => ({
          id: p.id,
          name: p.name,
          open: p.id === rec.current,
          nums: optionNumbers(p.plan, d.survey, d.terrain, costs, features, p.id === rec.current ? (d.earth ?? earthOfPlan(p.plan, d.survey, d.terrain)) : undefined, { planning, dem }),
          thumb: projectThumbnail(d.survey, p.plan),
        })),
      )
    }, 20)
    return () => clearTimeout(t)
  }, [plans, rec, d.survey, d.terrain, d.earth, costs, features, planning, dem])
  return cols
}

export function CompareSheet({ d, onClose }: { d: Loaded; onClose: () => void }) {
  const sheet = useRef<HTMLDivElement>(null)
  const cols = useColumns(d)
  const busy = useOptions(s => s.busy)
  // Focus the sheet so Escape and Tab work in it, and give focus back when it closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    sheet.current?.focus()
    return () => before?.focus?.()
  }, [])
  const marks = useMemo(() => (cols ? ROWS.map(r => bestIn(r, cols.map(c => c.nums))) : []), [cols])
  const tooFew = cols !== null && cols.length < 2
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        ref={sheet}
        className="overview-sheet opt-sheet"
        role="dialog"
        aria-label="Compare options"
        tabIndex={-1}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <div className="sheet-grab" aria-hidden="true" />
        <header>
          <h2>Compare options</h2>
          <span className="muted">Same survey, each option’s own design</span>
          <button className="icon-button" onClick={onClose} aria-label="Close the comparison">
            <Icon name="x" size={18} />
          </button>
        </header>
        {!cols ? (
          <p className="muted opt-wait">Working out each option…</p>
        ) : tooFew ? (
          <p className="muted opt-wait">There’s only one option so far. Copy this one to try another.</p>
        ) : (
          <div className="opt-scroll" tabIndex={0} role="region" aria-label="Comparison table, scrolls sideways">
            <table className="opt-table">
              <thead>
                <tr>
                  <th scope="col" className="opt-corner">
                    <span className="sr-only">Measure</span>
                  </th>
                  {cols.map(c => (
                    <th key={c.id} scope="col" className={c.open ? 'open' : ''}>
                      <div className="opt-thumb">
                        <Thumb t={c.thumb} label={`${c.name} on the block`} />
                      </div>
                      <b>{c.name}</b>
                      {c.open ? (
                        <span className="opt-tag">Open now</span>
                      ) : (
                        <button
                          className="link quiet"
                          disabled={busy}
                          onClick={() => void openOption(c.id).then(onClose, fail)}
                        >
                          Open
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r, ri) => (
                  <tr key={r.id}>
                    <th scope="row">{r.label}</th>
                    {cols.map((c, ci) => (
                      <td key={c.id} className={marks[ri]?.[ci] ? 'best' : ''}>
                        <span className="opt-val">{r.text(c.nums)}</span>
                        {marks[ri]?.[ci] && <span className="opt-best">Best</span>}
                        {r.note?.(c.nums) && <small className={r.id === 'cost' && c.nums.cost.incomplete ? 'opt-incomplete' : ''}>{r.note(c.nums)}</small>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cols && !tooFew && (
          <p className="muted small opt-foot">
            “Best” marks the least cut, fill, depth, wall and cost, and the fewest failed checks. Cost is only compared between options whose estimate is complete. Floor area and floor level have no best: they’re choices.
          </p>
        )}
      </div>
    </>
  )
}
