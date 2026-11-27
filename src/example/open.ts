// "Open an example": a new project with the example house in it, opened in 3D on Design so the
// plan is one click away. It never touches the projects already here; Undo tucks it away under
// Archived and goes back to the one that was open.
//
// The example already among the projects opens again as it was left, rather than another copy
// being added with every click; the note that says so offers a fresh copy.

import { openGuide } from '../guide/store'
import { navigate } from '../nav/router'
import { resumeRoute } from '../nav/route'
import { usePhoneMode } from '../phone/device'
import { projectActions, projectsNow } from '../projects/session'
import { forgetFileStep, rememberFileStep } from '../safety/fileUndo'
import { showToast, useSafety } from '../safety/store'
import type { ProjectMeta } from '../projects/types'
import { EXAMPLE_NAME } from './examplePlan'
import { exampleProjectText } from './exampleProject'

/** The example already here: an active project still carrying the example's name (or "… 2"), the latest one edited. */
export function exampleHere(list: ProjectMeta[]): ProjectMeta | null {
  const named = (m: ProjectMeta) => m.name === EXAMPLE_NAME || (m.name.startsWith(`${EXAMPLE_NAME} `) && /^\d+$/.test(m.name.slice(EXAMPLE_NAME.length + 1)))
  return list.filter(m => !m.archived && named(m)).sort((a, b) => b.updated - a.updated)[0] ?? null
}

/** Open the example: the one already here, or a new one (always a new one with `fresh`). */
export async function openExample(opts: { fresh?: boolean } = {}): Promise<void> {
  if (useSafety.getState().busy) return
  const { list, currentId } = projectsNow()
  const before = list.find(m => m.id === currentId && !m.archived) ?? null
  const here = opts.fresh ? null : exampleHere(list)
  if (here) return reopenExample(here, before)
  useSafety.setState({ busy: true })
  let meta
  try {
    meta = await projectActions.openFile(exampleProjectText())
  } finally {
    useSafety.setState({ busy: false })
  }
  // A new project is for changing: a phone opens it in Edit.
  usePhoneMode.getState().setMode('edit')
  navigate({ kind: 'app', area: 'design', tab: 'plan', view: '3d' })
  const id = meta.id
  // The toast's Undo and the top bar's (src/safety/fileUndo.ts) both put it away, once.
  let undone = false
  const putAway = async () => {
    if (undone) return
    undone = true
    forgetFileStep()
    await projectActions.archive(id)
    if (before) {
      await projectActions.open(before.id)
      navigate(resumeRoute(projectsNow().opened?.prefs.place))
    } else navigate({ kind: 'projects' })
    showToast({ text: `Put “${meta.name}” away under Archived.` })
  }
  showToast({
    // Short: on a phone it is two lines above its two actions (PH-05).
    text: 'Opened the example, a made-up house. Your own projects aren’t touched.',
    link: { label: 'Getting started', go: () => openGuide() },
    undo: putAway,
  })
  // The toast goes after a few seconds; Undo stays on the top bar until something is changed.
  rememberFileStep({ label: 'Open the example', opened: true, undo: putAway })
}

/** Open the example project that's already here, where it was left. Undo goes back to the project open before. */
async function reopenExample(here: ProjectMeta, before: ProjectMeta | null) {
  useSafety.setState({ busy: true })
  try {
    if (projectsNow().currentId !== here.id || !projectsNow().opened) await projectActions.open(here.id)
  } finally {
    useSafety.setState({ busy: false })
  }
  navigate(resumeRoute(projectsNow().opened?.prefs.place))
  const back = before && before.id !== here.id ? before : null
  showToast({
    text: 'Opened the example you already have, as you left it.',
    link: { label: 'Start a fresh copy', go: () => void openExample({ fresh: true }) },
    undo: back
      ? async () => {
          await projectActions.open(back.id)
          navigate(resumeRoute(projectsNow().opened?.prefs.place))
        }
      : undefined,
  })
}
