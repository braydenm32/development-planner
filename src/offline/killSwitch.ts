// The kill switch for working offline. If the service worker ever misbehaves on the live site,
// set this to true and push to main: the next build ships a service worker that deletes this
// app's caches and unregisters itself, and the app stops registering one. Open pages carry on
// as they are (nothing reloads under anyone); from the next visit the app is plain online-only.
// Set it back to false to turn working offline on again. README.md, "Working offline".
export const SERVICE_WORKER_OFF = false
