// The browser's side of a passkey (Face ID, Touch ID, Windows Hello, a phone nearby), through
// @simplewebauthn/browser, with what went wrong said in plain words.

import { browserSupportsWebAuthn, startAuthentication, startRegistration, WebAuthnError, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'

export const passkeysWork = () => browserSupportsWebAuthn()

/** Make a passkey from the server's options; resolves with the answer to send back. */
export const makePasskey = (options: unknown) => startRegistration({ optionsJSON: options as PublicKeyCredentialCreationOptionsJSON })

/** Use a passkey this site knows (the browser offers them; no name to type). */
export const getPasskey = (options: unknown) => startAuthentication({ optionsJSON: options as PublicKeyCredentialRequestOptionsJSON })

/** Why a passkey step didn't finish, for people; null when they simply closed the prompt. */
export function passkeyTrouble(e: unknown): string | null {
  const err = e as Error & { code?: string; cause?: Error }
  const name = err?.cause?.name ?? err?.name
  if (e instanceof WebAuthnError) {
    if (err.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return 'This device already has a passkey for this account. Use Sign in with a passkey instead.'
    if (err.code === 'ERROR_CEREMONY_ABORTED') return null
    if (err.code === 'ERROR_INVALID_DOMAIN' || err.code === 'ERROR_INVALID_RP_ID') return 'Passkeys need the app’s own address (https). Open it from its usual link and try again.'
    if (err.code === 'ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT') return 'This device can’t check it’s you (no Face ID, fingerprint, PIN or Windows Hello). Try on a phone or a computer that can.'
  }
  // Closed, timed out, or no passkey picked.
  if (name === 'NotAllowedError' || name === 'AbortError') return null
  return err?.message || 'The passkey didn’t work. Try again.'
}
