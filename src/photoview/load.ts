// Adding a photo: read what it says about itself, make it a sensible size (2560 px on its long side)
// and save it again as a JPEG. Saving it again also leaves its location and every other detail
// behind, so a project file or a cloud copy never carries where the phone was: only the plain
// fields the view uses are kept (src/photoview/model.ts).

import type { Vec2 } from '../lib/geom'
import { centroidOf } from '../lib/geom'
import { useMap } from '../map/store'
import { storeOverlayFiles, useSiteStore } from '../site/store'
import { fovFromFocal35, phoneFov } from './camera'
import { pictureKind, readPhotoFacts, type PhotoFacts } from './exif'
import { guessSpot, type SpotGuess } from './facts'
import { EYE_HEIGHT, photoName, type PhotoView } from './model'
import { addPhoto } from './store'

/** The stored photo's long side (px). */
export const LONG_SIDE = 2560
const QUALITY = 0.88

export const PHOTO_ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif'

const HEIC = 'This photo is in HEIC, which this browser can’t open. On an iPhone, set Settings › Camera › Formats to Most Compatible and take it again, or send the photo to yourself by email (it arrives as a JPEG), then add that.'
const NOT_A_PICTURE = 'That file couldn’t be opened as a photo. Use a JPEG, PNG or WebP.'

export interface ReadPhoto {
  blob: Blob
  width: number
  height: number
  facts: PhotoFacts
}

/** Read a photo file, sized and saved again as a JPEG; throws with a plain reason when it can't be. */
export async function readPhotoFile(file: File): Promise<ReadPhoto> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = pictureKind(bytes)
  const facts = readPhotoFacts(bytes)
  let bmp: ImageBitmap
  try {
    // The photo's own turn (a phone held upright) is applied here, so the saved copy needs none.
    bmp = await createImageBitmap(new Blob([bytes], { type: file.type || 'image/jpeg' }), { imageOrientation: 'from-image' })
  } catch {
    throw new Error(kind === 'heic' || /\.hei[cf]$/i.test(file.name) ? HEIC : NOT_A_PICTURE)
  }
  try {
    const scale = Math.min(1, LONG_SIDE / Math.max(bmp.width, bmp.height))
    const width = Math.max(1, Math.round(bmp.width * scale))
    const height = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    // A see-through PNG goes on white, as a JPEG has no see-through.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bmp, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error(NOT_A_PICTURE))), 'image/jpeg', QUALITY))
    return { blob, width, height, facts }
  } finally {
    bmp.close()
  }
}

const newId = () => `ph_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** What adding a photo found out, for the panel to say. */
export interface Added {
  view: PhotoView
  guess: SpotGuess | null
  /** The photo had a position, but the block isn't on the map, or it was nowhere near. */
  gpsUnused: 'not-on-map' | 'far' | null
}

/** Add a photo to the project as a new view: one undo step. */
export async function addPhotoFile(file: File): Promise<Added> {
  const { blob, width, height, facts } = await readPhotoFile(file)
  const s = useSiteStore.getState()
  const origin = s.origin ?? [0, 0]
  const middle: Vec2 = s.boundary?.length ? centroidOf(s.boundary) : [0, 0]
  const place = useMap.getState().place
  const guess = guessSpot(facts, place, [middle[0] + origin[0], middle[1] + origin[1]])
  const view: PhotoView = {
    id: newId(),
    name: photoName(file.name, facts.taken),
    width,
    height,
    at: guess?.at ?? null,
    heading: guess?.heading ?? 0,
    tilt: 0,
    roll: 0,
    fov: facts.focal35 ? fovFromFocal35(facts.focal35, width, height) : phoneFov(width, height),
    eyeHeight: EYE_HEIGHT,
    level: null,
    lens: facts.focal35 ? 'photo' : 'phone',
    taken: facts.taken,
    offset: facts.offset,
    guessed: !!guess,
    include: false,
  }
  await storeOverlayFiles(view.id, blob, null)
  addPhoto(view)
  return { view, guess, gpsUnused: facts.gps && !guess ? (place ? 'far' : 'not-on-map') : null }
}
