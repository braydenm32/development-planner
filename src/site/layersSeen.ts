// Whether the survey's layers have been looked at since the import guessed what each holds. Until
// they have, Site › Block keeps a small "Survey layers: 5 guesses" badge, so the import's toast
// isn't the only pointer to them. Kept on this device, by project and survey file: a new survey
// brings new guesses.

import { create } from 'zustand'
import type { SavedProject } from '../lib/storage'
import type { LayerInfo } from '../lib/survey'

const KEY = 'layers-seen-v1'
/** Enough projects to remember; the oldest drop off. */
const KEEP = 200

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export const useLayersSeen = create<{ seen: string[] }>(() => ({ seen: read() }))

/** The key for one survey in one project. */
export const layersKey = (project: string | null, fileName: string) => `${project ?? ''}|${fileName}`

export function markLayersSeen(key: string) {
  const { seen } = useLayersSeen.getState()
  if (seen.includes(key)) return
  const next = [...seen, key].slice(-KEEP)
  useLayersSeen.setState({ seen: next })
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private windows can refuse storage; the badge then goes for this visit only.
  }
}

/** A sketch block, or one made from the state's elevation model: the app wrote its layers itself, so there is no survey file to check. */
export const madeBlock = (p: Pick<SavedProject, 'sketch' | 'dem'>): boolean => !!p.sketch || !!p.dem

/**
 * How many layers the import gave a use to by guessing from their names: every one not ignored.
 * None on a block the app made, where nothing was guessed.
 */
export function guessCount(layers: LayerInfo[], project: Pick<SavedProject, 'roles' | 'sketch' | 'dem'>): number {
  return madeBlock(project) ? 0 : layers.filter(l => (project.roles[l.name] ?? 'ignore') !== 'ignore').length
}
