// Keyboard shortcuts as people read them: ⌘Z on a Mac, Ctrl+Z elsewhere.

export const isMac = (): boolean => {
  try {
    return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  } catch {
    return false
  }
}

/** `mod+shift+Z` → "⌘⇧Z" on a Mac, "Ctrl+Shift+Z" elsewhere. */
export function shortcutText(s: string, mac = isMac()): string {
  // A lone + is the key itself.
  const parts = (s === '+' ? ['+'] : s.split('+')).map(p => {
    if (p === 'mod') return mac ? '⌘' : 'Ctrl'
    if (p === 'shift') return mac ? '⇧' : 'Shift'
    return p
  })
  return mac ? parts.join('') : parts.join('+')
}

/**
 * A button's spoken name with its key: "Search (Ctrl+K)", or "Search (⌘K)" on a Mac, so it
 * matches the hint the button shows. On a phone, with no keyboard, the name alone.
 */
export function nameWithKey(name: string, shortcut: string, phone = false, mac = isMac()): string {
  return phone ? name : `${name} (${shortcutText(shortcut, mac)})`
}

/** Whether a key event is the ⌘ key on a Mac or Ctrl elsewhere, held down. */
export const modKey = (e: { metaKey: boolean; ctrlKey: boolean }, mac = isMac()): boolean => (mac ? e.metaKey : e.ctrlKey)

/** Typing in a field: leave its keys alone. */
export function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

// ---- May a shortcut fire? One rule for every window-level key handler. ----

/** Inputs that aren't typed into: a tick box, a radio, a slider, a button, a file or colour picker. */
const NOT_TEXT = new Set(['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color', 'image'])

/** What the rule reads of the element the key was pressed on. */
export interface KeyTarget {
  tagName?: string
  type?: string
  isContentEditable?: boolean
  dataset?: Record<string, string | undefined>
  closest?: (selector: string) => unknown
}

/** Real text entry (a text or number box, a text area, editable text): its keys, and the browser's own undo, stay with it. */
export function textEntry(target: EventTarget | KeyTarget | null): boolean {
  const el = target as KeyTarget | null
  if (!el || !el.tagName) return false
  if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true
  return el.tagName === 'INPUT' && !NOT_TEXT.has((el.type || 'text').toLowerCase())
}

/** A dropdown, tick box, radio or slider: arrows, letters and Space are its own, but it has no undo of its own. */
const choiceField = (el: KeyTarget): boolean => el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !textEntry(el))

/** A button, link or anything else Tab stops on. */
const BUTTONISH = 'button, a[href], summary, [role="button"], [role="tab"], [role="option"], [tabindex]:not([tabindex="-1"])'

/** Where single keys always belong to the drawing: the plan and the tools beside it. */
const DRAWING = '.plan-editor, .tool-rail'

/** A dialog, sheet, menu or the search palette: while one is open the keyboard is its, not the plan's behind it. */
export const OVERLAY = '[aria-modal="true"], [role="menu"], [data-overlay]'

export const overlayOpen = (): boolean => {
  try {
    return !!document.querySelector(OVERLAY)
  } catch {
    return false
  }
}

// Whether focus is being moved with Tab (true) or the pointer (false). A button that was only
// clicked keeps the plan's keys, so picking a tool or a piece of furniture and then pressing a
// key still works; a button Tab stopped on doesn't, so someone moving through a panel by
// keyboard never changes the drawing by accident.
let tabbing = false
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('keydown', e => e.key === 'Tab' && (tabbing = true), true)
  window.addEventListener('pointerdown', () => (tabbing = false), true)
}

const SINGLE_KEYS = 'single-key-shortcuts-v1'
let singleKeys: boolean | null = null
const singleKeyListeners = new Set<() => void>()

/** Whether single-key shortcuts (W for Wall, ? for the list) are on. Remembered on this device; on unless turned off. */
export function singleKeysOn(): boolean {
  if (singleKeys === null) {
    try {
      singleKeys = localStorage.getItem(SINGLE_KEYS) !== 'off'
    } catch {
      singleKeys = true
    }
  }
  return singleKeys
}

export function setSingleKeys(on: boolean) {
  singleKeys = on
  try {
    if (on) localStorage.removeItem(SINGLE_KEYS)
    else localStorage.setItem(SINGLE_KEYS, 'off')
  } catch {
    // Not kept; it still holds for this visit.
  }
  singleKeyListeners.forEach(l => l())
}

/** For useSyncExternalStore. */
export function onSingleKeys(listener: () => void): () => void {
  singleKeyListeners.add(listener)
  return () => singleKeyListeners.delete(listener)
}

export interface KeyPress {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  target: EventTarget | KeyTarget | null
}

/** What's going on around a key press; read from the page unless a test says. */
export interface KeyScene {
  /** A dialog, sheet, menu or the palette is open. */
  overlay: boolean
  /** Focus was last moved with Tab. */
  tabbing: boolean
  /** The single-key shortcuts setting. */
  singleKeys: boolean
}

const sceneNow = (): KeyScene => ({ overlay: overlayOpen(), tabbing, singleKeys: singleKeysOn() })

/**
 * May a shortcut take this key? Every window-level key handler asks this first, so they agree:
 * - never while a dialog, sheet, menu or the search palette is open (its own keys still work);
 * - never in real text entry, which keeps its typing and the browser's own undo. A number or name
 *   box with nothing typed since its value was kept (data-settled) has nothing of its own to
 *   undo, so Undo and Redo go to the app;
 * - Ctrl/⌘ keys (Undo, Copy, Cut…) work from a dropdown, tick box, radio or button;
 * - plain keys never fire from a dropdown, tick box, radio or slider, nor from a button or link
 *   reached with Tab outside the plan (Esc aside: it always puts down what is in hand);
 * - single characters (W, 0, ?) only while the Single-key shortcuts setting is on (WCAG 2.1.4).
 */
export function shortcutAllowed(e: KeyPress, scene: KeyScene = sceneNow()): boolean {
  if (scene.overlay) return false
  const el = e.target as KeyTarget | null
  const mod = e.ctrlKey || e.metaKey
  if (textEntry(el)) return mod && /^[zy]$/i.test(e.key) && el?.dataset?.settled !== undefined
  if (mod) return true
  if (el && el.tagName && choiceField(el)) return false
  if (e.key === 'Escape') return true
  if (scene.tabbing && el?.closest?.(BUTTONISH) && !el.closest(DRAWING)) return false
  // A digit may be a length typed while drawing, which isn't a shortcut; 0 (fit) asks singleKeysOn itself.
  if (e.key.length === 1 && !scene.singleKeys && !/^[0-9.]$/.test(e.key)) return false
  return true
}
