// Working offline, as the page sees it: whether there's a connection, whether a new version is
// waiting, whether a part of the app couldn't load, and whether the browser offers to install the
// app. ./register.ts and the browser's events fill it; ./OfflineLayer.tsx shows it, and anything
// that needs the internet asks useOnline() (./NeedsConnection.tsx says so plainly).

import { create } from 'zustand'

interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface OfflineState {
  online: boolean
  /** A new version is ready: Reload gets it. */
  update: boolean
  /** A part of the app couldn't be fetched (offline, or this version is gone from the server). */
  missingPart: boolean
  /** The browser's own install offer, kept for the Install item; null where it offers none. */
  install: InstallPrompt | null
}

const now = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)

export const useOffline = create<OfflineState>(() => ({ online: now(), update: false, missingPart: false, install: null }))

export const useOnline = () => useOffline(s => s.online)

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useOffline.setState({ online: true }))
  window.addEventListener('offline', () => useOffline.setState({ online: false }))
  // Chrome and Edge offer to install it: the offer is kept for the project menu's Install item.
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    useOffline.setState({ install: e as InstallPrompt })
  })
  window.addEventListener('appinstalled', () => useOffline.setState({ install: null }))
  // A lazy part (the PDF reader, the 3D print maths, search) failed to load: offer a reload.
  window.addEventListener('vite:preloadError', () => useOffline.setState({ missingPart: true }))
}

/** Show the browser's install offer. True if the person said yes. */
export async function installApp(): Promise<boolean> {
  const p = useOffline.getState().install
  if (!p) return false
  await p.prompt()
  const { outcome } = await p.userChoice
  // The offer can be used once.
  useOffline.setState({ install: null })
  return outcome === 'accepted'
}
