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

/** Whether a key event is the ⌘ key on a Mac or Ctrl elsewhere, held down. */
export const modKey = (e: { metaKey: boolean; ctrlKey: boolean }, mac = isMac()): boolean => (mac ? e.metaKey : e.ctrlKey)

/** Typing in a field: leave its keys alone. */
export function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}
