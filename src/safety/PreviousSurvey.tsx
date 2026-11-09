// The survey a Replace took the place of stays with the project, so it can come back later
// (through the same review, and with Undo), long after the toast has gone.

import { useProjects } from '../projects/session'
import { replaceSurvey } from './flows'
import { showToast } from './store'

export function PreviousSurvey() {
  const opened = useProjects().opened
  const previous = opened?.previousSurvey
  if (!previous || !opened?.survey) return null
  const putBack = () => replaceSurvey(previous).catch((e: unknown) => showToast({ text: (e as Error)?.message || 'The earlier survey couldn’t be put back.' }))
  return (
    <p className="muted small previous-survey">
      Before it: <b>{previous.fileName}</b>.{' '}
      <button className="link" onClick={() => void putBack()}>
        Put it back…
      </button>
    </p>
  )
}
