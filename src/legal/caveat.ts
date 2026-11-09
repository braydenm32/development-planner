// The one caveat, and the facts every legal page and footer shares. Anything that leaves the
// app (PDF plans, the costs CSV, 3D print files) or shows results to someone else (the shared
// view, the earthworks panel) uses these words, so the message never drifts between places.

export const CONTACT_EMAIL = 'hello@contourandgable.com'
/** The date on the privacy policy, the terms and How accurate is this? Change it when they change. */
export const LAST_UPDATED = '9 November 2026'
/** The most one account may keep in the cloud (worker/src/projects.ts QUOTA_MB_DEFAULT). */
export const STORAGE_LIMIT_MB = 50

/** The app's public address, for text in files where a hash link would not be clickable. */
export const APP_HOST = 'contourandgable.com'
export const ACCURACY_URL = `https://${APP_HOST}/#/accuracy`

export const CAVEAT = 'Concept planning aid only. Checks, volumes and costs are estimates: confirm with your council, certifier, engineer and builder.'
export const ACCURACY_TITLE = 'How accurate is this?'

/** The caveat for a file: the words and where to read more, as one line of plain text. */
export const CAVEAT_LINE = `${CAVEAT} ${ACCURACY_TITLE} ${APP_HOST}/#/accuracy`
