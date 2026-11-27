// What three.js says on the console, with one line left out. @react-three/fiber 9 (its newest
// release) makes a THREE.Clock for every 3D canvas, and three r183 and later warn each time that
// Clock is on its way out. Nothing in this app reads that clock, and nothing here can stop fiber
// making it, so that one warning is dropped until fiber moves to THREE.Timer; then delete this
// file. Everything else three says goes to the console as it always did.

import { setConsoleFunction } from 'three'

type Kind = 'log' | 'warn' | 'error'

/** The warning three prints when a Clock is made. */
const FIBER_CLOCK = 'THREE.Clock: This module has been deprecated'

/** three's own message carrying a stack trace, as it would have printed it. */
const withTrace = (message: string, first: unknown): unknown => {
  const trace = first as { isStackTrace?: boolean; getError?: (m: string) => unknown } | undefined
  return trace?.isStackTrace && trace.getError ? trace.getError(message) : null
}

export function threeConsole(kind: Kind, message: string, ...params: unknown[]) {
  if (kind === 'warn' && typeof message === 'string' && message.startsWith(FIBER_CLOCK)) return
  const traced = kind === 'log' ? null : withTrace(message, params[0])
  if (traced) console[kind](traced)
  else console[kind](message, ...params)
}

setConsoleFunction(threeConsole)
