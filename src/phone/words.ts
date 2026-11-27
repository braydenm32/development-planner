// The app's hints were written for a mouse and a keyboard. On a touch screen the same lines say
// Tap for Click and leave out the keys there is no keyboard to press (PH-13). One place, so the
// strings themselves stay as they are for a computer.

const RULES: [RegExp, string][] = [
  [/\bDouble-click/g, 'Double-tap'],
  [/\bdouble-click/g, 'double-tap'],
  [/\bClicking/g, 'Tapping'],
  [/\bclicking/g, 'tapping'],
  [/\bClick/g, 'Tap'],
  [/\bclick/g, 'tap'],
  // "the Garage door tool (G)", "Pick the Roof tool (F)": the key in brackets after a tool's name.
  [/\b(tool) \([A-Z]\)/g, '$1'],
  [/ ?\(Esc\)/g, ''],
  [/ \(or press Enter\)/g, ''],
  // Whole sentences that are only about keys.
  [/\s*Press [A-Z] to [^.]*\./g, ''],
  [/\s*\[ and \] change the brush size; Esc stops\./g, ''],
  [/\s*With the plan in focus, the arrow keys [^.]*\./g, ''],
  // Walk-through's keys and wheel (src/walk): the pad and a drag do it there.
  [/\s*Arrow keys or W A S D walk[^.]*\./g, ''],
  // The plan's Select hint: no Delete key or right button under a finger; the selection's panel deletes.
  [/ Delete removes; right-tap for more\./g, ' Its panel has Delete.'],
  [/[;,] or double-tap or press Esc to stop\b/g, ''],
  [/ Esc stops\./g, ''],
  [/ Esc finishes\./g, ''],
  // Site features: on a phone the panel is the sheet underneath, and Done ends tracing.
  [/, on the left; Esc stops tracing\./g, '; Done stops tracing.'],
  [/, on the left\b/g, ''],
  // "Press W, then tap each corner" / "Press R and tap inside": the tool is on the rail.
  [/\bPress ([A-Z]), then tap/g, 'Pick the tool, then tap'],
  [/\bPress ([A-Z]) and tap/g, 'Pick the tool and tap'],
]

/** A hint reworded for a finger: Tap for Click, and no keyboard keys. */
export function touchWords(text: string): string {
  return RULES.reduce((t, [from, to]) => t.replace(from, to), text)
}

/** Whether the main pointer is a finger (a phone or a tablet at any width). */
export const isTouch = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

/** A control's spoken name with its key ("Zoom out (−)"), or the name alone where there is no keyboard to press. */
export const withKey = (name: string, key: string, touch = isTouch()): string => (touch ? name : `${name} (${key})`)

/** The hint as written for a mouse, or reworded where the screen is touched. */
export const forTouch = (text: string, touch = isTouch()): string => (touch ? touchWords(text) : text)
