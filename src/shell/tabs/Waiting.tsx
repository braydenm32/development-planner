import { useShell } from '../context'

/** What a panel shows before the survey reads and the plan loads. */
export function Waiting() {
  const { siteError } = useShell()
  return <p className="muted">{siteError ? 'This needs the survey. Check the survey layers under Site › More.' : 'Loading the plan…'}</p>
}
