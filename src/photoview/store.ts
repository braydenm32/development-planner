// The photo view's state outside the 3D view: whether it's on and with which photo, how the model
// shows over it, and the lining-up helper's clicks. The views themselves (spot, direction, lens)
// are site data, kept and undone with the drawings (src/site/store.ts); the changes to them go
// through here so each is one undo step, and a drag or a pinch one step when it ends.

import { create } from 'zustand'
import { takeKeys } from '../nav/keys'
import { useSiteStore, type SiteData } from '../site/store'
import { switchView } from '../shell/useSite'
import { useWalk } from '../walk/walkStore'
import type { PhotoView } from './model'

/** What the model shows over the photo. */
export type ShowOver = 'house' | 'earthworks' | 'all'

/** The lining-up helper: the pairs so far, and a photo point waiting for its model point. */
export interface Picking {
  pairs: { photo: [number, number]; model: [number, number, number]; label: string }[]
  /** A point clicked in the photo, waiting for the same point on the model. */
  photo: [number, number] | null
  /** With two pairs, solve the lens angle or the lean. */
  extra: 'fov' | 'roll'
  /** Why the last try couldn't line it up, in plain words. */
  problem: string | null
}

/** The photo's place on the screen, in the 3D canvas's pixels. */
export interface PhotoRect {
  left: number
  top: number
  width: number
  height: number
}

interface PhotoViewState {
  /** Looking from a photo now. */
  active: boolean
  /** The photo looked from (or chosen to set up). */
  id: string | null
  /** An ask to open the view, with a photo id or none; `n` counts them. Kept until the 3D view takes it. */
  ask: { id: string | null; n: number } | null
  /** Asked to stop; the 3D view puts the camera back. */
  leaveN: number
  show: ShowOver
  /** How much of the photo shows through the model, 0..0.9. */
  seeThrough: number
  /** The block's boundary and the ground's contours drawn as lines, to help line up. */
  lines: boolean
  picking: Picking | null
  /** Where the photo sits on the canvas (px), worked out in the 3D view for the layer that draws it. */
  rect: PhotoRect | null
  /** How much of each edge of the canvas the photo view's own panel covers (px). */
  panel: { l: number; r: number; t: number; b: number } | null
  set: (s: Partial<Omit<PhotoViewState, 'set'>>) => void
}

export const usePhotoView = create<PhotoViewState>(set => ({
  active: false,
  id: null,
  ask: null,
  leaveN: 0,
  show: 'house',
  seeThrough: 0,
  lines: false,
  picking: null,
  rect: null,
  panel: null,
  set: s => set(s),
}))

// While looking from a photo, the plain keys are the view's: no other single-key shortcut fires (src/nav/keys.ts).
usePhotoView.subscribe((s, prev) => s.active !== prev.active && takeKeys(s.active))

/** Open the 3D view looking from a photo (or to add one, with none yet). */
export function openPhotoView(id: string | null = null) {
  if (useWalk.getState().active) useWalk.getState().leave()
  const st = usePhotoView.getState()
  const pick = id ?? st.id ?? photosNow()[0]?.id ?? null
  st.set({ ask: { id: pick, n: (st.ask?.n ?? 0) + 1 }, id: pick })
  switchView('3d')
}

export function leavePhotoView() {
  const st = usePhotoView.getState()
  st.set({ ask: null, leaveN: st.leaveN + 1, picking: null })
}

export const photosNow = (): PhotoView[] => useSiteStore.getState().data.photos ?? []

export const photoById = (id: string | null): PhotoView | null => (id ? (photosNow().find(p => p.id === id) ?? null) : null)

const withPhoto = (d: SiteData, id: string, patch: Partial<PhotoView>): SiteData => ({
  ...d,
  photos: (d.photos ?? []).map(p => (p.id === id ? { ...p, ...patch } : p)),
})

/** Change a view as one undo step. */
export function updatePhoto(id: string, patch: Partial<PhotoView>) {
  useSiteStore.getState().commit(d => withPhoto(d, id, patch))
}

/** The data before a drag or a pinch began, so its end makes the whole of it one step. */
let dragFrom: SiteData | null = null

/** Change a view while dragging: shown at once, one undo step when `endDrag` is called. */
export function dragPhoto(id: string, patch: Partial<PhotoView>) {
  const s = useSiteStore.getState()
  dragFrom ??= s.data
  s.preview(d => withPhoto(d, id, patch))
}

export function endDrag() {
  if (!dragFrom) return
  useSiteStore.getState().settle(dragFrom)
  dragFrom = null
}

export function addPhoto(p: PhotoView) {
  useSiteStore.getState().commit(d => ({ ...d, photos: [...(d.photos ?? []), p] }))
}

/** Take a photo off the project (Undo brings it back while the undo history lasts). */
export function removePhoto(id: string) {
  useSiteStore.getState().commit(d => ({ ...d, photos: (d.photos ?? []).filter(p => p.id !== id) }))
  const st = usePhotoView.getState()
  if (st.id === id) {
    if (st.active) leavePhotoView()
    st.set({ id: photosNow()[0]?.id ?? null })
  }
}
