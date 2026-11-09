// Hooks for comments on share links: the time now (a minute at a time, so "2 minutes ago" stays
// true), reading a link's comments in the shared view, and keeping the open project's comments
// read in the app while signed in.

import { useEffect, useState } from 'react'
import { useCloud } from '../cloud/state'
import { useProjects } from '../projects/session'
import { commentActions } from './store'

/** The time, a minute at a time. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** Read the link's comments again when the shared view comes back after this long away (ms), as the view does. */
const VIEWER_AGAIN_MS = 5000

/** Comments for the shared view of this link, once the project is showing: again with each newer revision, and when the page comes back. */
export function useSharedComments(token: string, shared: { sharedBy: string; revision: number } | null) {
  const ready = !!shared
  const sharedBy = shared?.sharedBy ?? ''
  const revision = shared?.revision ?? 0
  useEffect(() => {
    if (ready) void commentActions.startViewer(token, sharedBy)
  }, [token, ready, sharedBy, revision])
  useEffect(() => {
    if (!ready) return
    let away = 0
    const seen = () => {
      if (document.visibilityState === 'hidden') away = Date.now()
      else if (away && Date.now() - away > VIEWER_AGAIN_MS) void commentActions.loadViewer()
    }
    document.addEventListener('visibilitychange', seen)
    return () => document.removeEventListener('visibilitychange', seen)
  }, [ready])
  useEffect(() => () => commentActions.reset(), [])
}

/** Read them again when the page comes back after this long away (ms). */
const LOOK_AGAIN_MS = 60_000

/** Keep the open project's comments read while signed in and it is in the cloud. */
export function useOwnerComments() {
  const phase = useCloud(s => s.phase)
  const projectId = useProjects().currentId
  const inCloud = useCloud(s => !!projectId && s.inCloud.includes(projectId))
  const on = phase === 'signed-in' && !!projectId && inCloud
  useEffect(() => {
    if (on) void commentActions.loadOwner(projectId!)
    else commentActions.clearOwner()
  }, [on, projectId])
  useEffect(() => {
    if (!on) return
    let away = 0
    const seen = () => {
      if (document.visibilityState === 'hidden') away = Date.now()
      else if (away && Date.now() - away > LOOK_AGAIN_MS) void commentActions.loadOwner(projectId!)
    }
    document.addEventListener('visibilitychange', seen)
    return () => document.removeEventListener('visibilitychange', seen)
  }, [on, projectId])
}
