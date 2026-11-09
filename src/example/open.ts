// "Open an example": a new project with the example house in it, opened in 3D on Design so the
// plan is one click away. It never touches the projects already here; Undo tucks it away under
// Archived and goes back to the one that was open.

import { openGuide } from '../guide/store'
import { navigate } from '../nav/router'
import { resumeRoute } from '../nav/route'
import { usePhoneMode } from '../phone/device'
import { projectActions, projectsNow } from '../projects/session'
import { showToast, useSafety } from '../safety/store'
import { exampleProjectText } from './exampleProject'

export async function openExample(): Promise<void> {
  if (useSafety.getState().busy) return
  const { list, currentId } = projectsNow()
  const before = list.find(m => m.id === currentId && !m.archived) ?? null
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
  showToast({
    // Short, so it stays a line or two beside its two actions on a phone.
    text: 'Opened the example: a made-up house on a made-up block. Your own projects aren’t touched.',
    link: { label: 'Getting started', go: () => openGuide() },
    undo: async () => {
      await projectActions.archive(id)
      if (before) {
        await projectActions.open(before.id)
        navigate(resumeRoute(projectsNow().opened?.prefs.place))
      } else navigate({ kind: 'projects' })
      showToast({ text: `Put “${meta.name}” away under Archived.` })
    },
  })
}
