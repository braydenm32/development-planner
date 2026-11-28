// Where the cloud is, and how a request says who it's from.
//
// On the website the API is at the app's own address and the session is an HttpOnly cookie the
// app never sees. The desktop app has no address of its own on the web, so it talks to the
// website's API and sends a session token it was given when it was signed in from a browser
// (worker/src/appLink.ts); the token is kept in the app's own storage on this computer.

import { isDesktop } from '../desktop/bridge'

/** The website the desktop app saves to. */
export const CLOUD_ORIGIN = 'https://contourandgable.com'

const TOKEN = 'cloud-app-token-v1'

export function appToken(): string | null {
  try {
    return localStorage.getItem(TOKEN)
  } catch {
    return null
  }
}

export function setAppToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN, token)
    else localStorage.removeItem(TOKEN)
  } catch {
    // Nowhere to keep it: signed in until the app closes.
  }
}

/** The website's address for links people open: this page's, or the cloud's from the desktop app. */
export const webOrigin = (): { origin: string } => (isDesktop() ? { origin: CLOUD_ORIGIN } : location)

/** The API's address: the app's own base + api/ on the web (so a build for a sub-path finds it too). */
export const apiBase = (): string => (isDesktop() ? `${CLOUD_ORIGIN}/api/` : `${import.meta.env?.BASE_URL ?? '/'}api/`)

/** What a signed-in request carries besides its own headers, and whether the cookie goes with it. */
export function signedInWith(): { headers: Record<string, string>; credentials: RequestCredentials } {
  if (!isDesktop()) return { headers: {}, credentials: 'same-origin' }
  const token = appToken()
  return { headers: token ? { authorization: `Bearer ${token}` } : {}, credentials: 'omit' }
}
