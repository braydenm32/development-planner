// The notes about the app itself, over every screen: "A new version is ready · Reload" once a new
// version has installed in the background (./register.ts), and a reload offered when a part of
// the app couldn't load. Neither reloads by itself: the person chooses when.

import { Icon } from '../nav/icons'
import { reloadNow } from './register'
import { useOffline } from './state'
import './offline.css'

export function OfflineLayer() {
  const update = useOffline(s => s.update)
  const missing = useOffline(s => s.missingPart)
  const online = useOffline(s => s.online)
  if (!update && !missing) return null
  const text = missing
    ? online
      ? 'Part of the app didn’t load.'
      : 'You’re offline, and this part of the app isn’t on this device yet.'
    : 'A new version is ready'
  return (
    <div className="of-note" role="status">
      <span>{text}</span>
      {(online || !missing) && (
        <button className="of-reload" onClick={() => void reloadNow()}>
          <Icon name="rotate" size={14} /> Reload
        </button>
      )}
      <button className="of-close" aria-label="Not now" title="Not now" onClick={() => useOffline.setState({ update: false, missingPart: false })}>
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}
