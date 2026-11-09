// The cloud on the Projects home and the start screen: a card to sign in (or one quiet line once
// he has said Not now), the line that says how saving is going, and each card's "This device only".

import { useState } from 'react'
import { Icon } from '../nav/icons'
import { cloudActions, useCloud } from './state'
import { chipLook, projects } from './words'
import './cloud.css'

const HIDE = 'cloud-card-hidden-v1'
const hiddenBefore = () => {
  try {
    return localStorage.getItem(HIDE) === '1'
  } catch {
    return false
  }
}

export function CloudCard() {
  const phase = useCloud(s => s.phase)
  const signup = useCloud(s => s.signup)
  const user = useCloud(s => s.user)
  const sync = useCloud(s => s.sync)
  const localOnly = useCloud(s => s.waiting.length + s.kept.length)
  const anyInCloud = useCloud(s => s.inCloud.length > 0)
  const [hidden, setHidden] = useState(hiddenBefore)

  if (phase === 'signed-out') {
    if (hidden)
      return (
        <p className="cloud-ui cl-line">
          <Icon name="cloud" size={16} />
          <button className="cl-link" onClick={() => cloudActions.open('sign-in')}>
            Sign in to save to the cloud
          </button>
        </p>
      )
    const hide = () => {
      setHidden(true)
      try {
        localStorage.setItem(HIDE, '1')
      } catch {
        // only a convenience
      }
    }
    return (
      <section className="cloud-ui cl-card" aria-labelledby="cl-card-title">
        <span className="cl-card-icon" aria-hidden="true">
          <Icon name="cloud" size={22} />
        </span>
        <div className="cl-card-text">
          <h2 id="cl-card-title">Sign in to save to the cloud</h2>
          <p>Your projects open on your other devices, and are safe if this one is lost. Sign in with a passkey: Face ID, Touch ID, Windows Hello or your phone.</p>
        </div>
        <div className="cl-card-actions">
          <button className="cl-btn primary" onClick={() => cloudActions.open('sign-in')}>
            Sign in
          </button>
          {signup !== 'closed' && (
            <button className="cl-btn" onClick={() => cloudActions.open('create')}>
              Create account
            </button>
          )}
          <button className="cl-link quiet" onClick={hide}>
            Not now
          </button>
        </div>
      </section>
    )
  }

  if (phase === 'signed-in' && user) {
    // "Saved" only once something is in the cloud; before the first upload, just signed in.
    const look = chipLook(sync, anyInCloud)
    return (
      <p className={`cloud-ui cl-line ${look.tone}`} role="status">
        <span className="cl-grp">
          <Icon name={look.icon} size={16} />
          <span>{look.label === 'Saved' ? 'Saved to the cloud' : look.label}</span>
          <span className="cl-sep" aria-hidden="true">
            ·
          </span>
          <button className="cl-link" onClick={() => cloudActions.open('account')}>
            {user.name}
          </button>
        </span>
        {localOnly > 0 && (
          <span className="cl-grp">
            <span>{projects(localOnly)} on this device only</span>
            <button className="cl-link" onClick={() => cloudActions.open('upload')}>
              Upload…
            </button>
          </span>
        )}
      </p>
    )
  }
  return null
}

/** On a project's card, while signed in: said only when it isn't in the cloud. */
export function CloudMark({ id }: { id: string }) {
  const show = useCloud(s => s.phase === 'signed-in' && !s.inCloud.includes(id))
  return show ? <span className="cl-mark">This device only</span> : null
}

/** The start screen's way back to projects saved in the cloud, on a device that has none yet. */
export function CloudStartLink() {
  const phase = useCloud(s => s.phase)
  if (phase !== 'signed-out') return null
  return (
    <p className="cloud-ui cl-start">
      <Icon name="cloud" size={16} />
      <span>Saved projects in the cloud?</span>
      <button className="cl-link" onClick={() => cloudActions.open('sign-in')}>
        Sign in
      </button>
    </p>
  )
}

/** The project menu's item: Sign in to save to the cloud, or Cloud saves with his name. Hidden with no cloud here. */
export function CloudMenuItem({ onRun }: { onRun: () => void }) {
  const phase = useCloud(s => s.phase)
  const user = useCloud(s => s.user)
  if (phase !== 'signed-in' && phase !== 'signed-out') return null
  return (
    <button data-item="cloud" className="menu-item" onClick={onRun}>
      <Icon name="cloud" size={16} />
      {phase === 'signed-in' && user ? (
        <span>
          Cloud saves <span className="cl-menu-name">· {user.name}</span>
        </span>
      ) : (
        <span>Sign in to save to the cloud…</span>
      )}
    </button>
  )
}
