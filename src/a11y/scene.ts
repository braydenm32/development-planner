// The 3D view's keys and what its box carries for screen readers (see ./SceneKeys.tsx).

import type { CameraStep } from '../phone/camera'

export const SCENE_HELP_ID = 'scene-help'

/** What the 3D view's box carries: a picture, named by `label`, that Tab stops on. */
export const sceneProps = (label: string) => ({ className: 'scene-keys', role: 'img', 'aria-label': label, 'aria-describedby': SCENE_HELP_ID, tabIndex: 0 }) as const

/** The step a key asks for in the 3D view, or null for a key that isn't one of its. */
export function sceneKeyStep(key: string): CameraStep | null {
  if (key === 'ArrowLeft') return { turn: -1 }
  if (key === 'ArrowRight') return { turn: 1 }
  if (key === 'ArrowUp') return { tilt: 1 }
  if (key === 'ArrowDown') return { tilt: -1 }
  if (key === '+' || key === '=') return { zoom: 1 }
  if (key === '-' || key === '_') return { zoom: -1 }
  return null
}
