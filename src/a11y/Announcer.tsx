// The one polite live region, and what feeds it from around the app: the new place, the tool
// picked up, the level and the selection, and the save chip when saving stops or starts again.
// The results that change after an edit come from the shell (./announceResults.ts), which has them.

import { useEffect, useRef, useState } from 'react'
import { chipLook } from '../cloud/words'
import { localSaveLook } from '../cloud/saveState'
import { useCloud } from '../cloud/state'
import { canvasOf, type Route } from '../nav/route'
import { useRouter } from '../nav/router'
import { usePlan } from '../plan/store'
import { useProjects } from '../projects/session'
import { announce, saveWords, selectionWords, toolWords, useAnnounce } from './announce'
import { placeWords } from './title'
import './a11y.css'

/** Things said within this long of one another go out together, so none is cut off by the next (ms). */
const GATHER_MS = 150
/** What was said is cleared after this long, so it isn't found again later by reading down the page (ms). */
const CLEAR_MS = 10_000

const placeKey = (r: Route) => (r.kind === 'app' ? `${r.area}/${r.tab}` : r.kind === 'projects' ? `projects/${r.show ?? ''}` : r.kind)

/** The live region itself. Mounted once, by the shell. */
export function Announcer() {
  const n = useAnnounce(s => s.n)
  const [text, setText] = useState('')
  const waiting = useRef<string[]>([])
  const last = useRef('')
  useEffect(() => {
    if (!n) return
    waiting.current.push(useAnnounce.getState().text)
    const say = setTimeout(() => {
      // Each its own sentence, so "Block, Site" and "Floors, Design" said together don't run into one.
      let words = waiting.current.map(t => (/[.!?…]$/.test(t) ? t : `${t}.`)).join(' ')
      waiting.current = []
      // The same words again are still a change to the region, so they are spoken again.
      if (words === last.current) words += ' '
      last.current = words
      setText(words)
    }, GATHER_MS)
    const clear = setTimeout(() => setText(''), CLEAR_MS)
    return () => {
      clearTimeout(say)
      clearTimeout(clear)
    }
  }, [n])
  usePlaceAnnounce()
  usePlanAnnounce()
  useSaveAnnounce()
  return (
    <div className="a11y-hidden" role="status" aria-live="polite" aria-atomic="true" data-announcer>
      {text}
    </div>
  )
}

/** "Checks, Approvals" when the area or tab changes, and "3D view" or "Plan" when only the canvas does. */
function usePlaceAnnounce() {
  const route = useRouter(s => s.route)
  const key = placeKey(route)
  const view = route.kind === 'app' ? canvasOf(route) : null
  const was = useRef({ key, view })
  useEffect(() => {
    const before = was.current
    was.current = { key, view }
    if (before.key !== key) announce(placeWords(useRouter.getState().route))
    else if (before.view !== view && view) announce(view === '3d' ? '3D view' : view === 'plan' ? 'Plan' : 'Print preview')
  }, [key, view])
}

/** The tool, the level being drawn on and the selection, as each changes. */
function usePlanAnnounce() {
  useEffect(
    () =>
      usePlan.subscribe((s, prev) => {
        // A project opening sets all three: its title says where you are.
        if (!s.plan || !prev.plan || s.fitToken !== prev.fitToken) return
        if (s.tool !== prev.tool) announce(toolWords(s.tool))
        if (s.activeLevel !== prev.activeLevel) {
          const name = s.plan.levels.find(l => l.id === s.activeLevel)?.name
          if (name) announce(`${name} showing.`)
        }
        if (s.selection?.id !== prev.selection?.id || s.extra.length !== prev.extra.length) {
          // Changing level puts the selection down: the level is the news, not that.
          if (!s.selection && s.activeLevel !== prev.activeLevel) return
          announce(selectionWords(s.plan, s.selection, s.extra.length, !!prev.selection))
        }
      }),
    [],
  )
}

/** Saving stopped, or works again. Routine saves stay quiet: the chip has the time. */
function useSaveAnnounce() {
  const phase = useCloud(s => s.phase)
  const sync = useCloud(s => s.sync)
  const anyInCloud = useCloud(s => s.inCloud.length > 0)
  const p = useProjects()
  const local = localSaveLook({ phase, saved: p.current?.updated ?? null, saveError: p.saveError, memoryOnly: p.memoryOnly, persisted: p.persisted })
  const look = phase === 'signed-in' ? chipLook(sync, anyInCloud) : local
  const label = look?.label ?? null
  const detail = look?.detail ?? ''
  const was = useRef(label)
  useEffect(() => {
    // "Saving…" is on its way to one or the other: wait for which.
    if (label === 'Saving…') return
    const before = was.current
    was.current = label
    const words = saveWords(before === null ? null : { label: before }, label === null ? null : { label, detail })
    if (words) announce(words)
    // Only a change of the chip's word is news; its detail carries a time that moves on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label])
}
