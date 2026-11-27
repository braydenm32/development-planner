// The plain line anything that needs the internet shows while there's no connection: sign-in and
// cloud saves, share links, comments, the NSW map. It goes by itself when the connection is back.

import type { ReactNode } from 'react'
import { Icon } from '../nav/icons'
import { useOnline } from './state'
import './offline.css'

export const NEEDS_CONNECTION = 'You’re offline: this needs a connection.'

/** `offline` says so for it (a part given whether it's online, as in a test); else it asks the browser. */
export function NeedsConnection({ children, offline }: { children?: ReactNode; offline?: boolean }) {
  const online = useOnline()
  if (!(offline ?? !online)) return null
  return (
    <p className="needs-connection" role="status">
      <Icon name="cloudOff" size={15} />
      <span>
        <b>{NEEDS_CONNECTION}</b>
        {children && <> {children}</>}
      </span>
    </p>
  )
}
