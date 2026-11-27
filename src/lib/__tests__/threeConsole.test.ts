// The console stays clean when a 3D view opens: the one warning that comes from the 3D library's
// own clock is dropped, and nothing else three.js says is lost.

import { Clock, getConsoleFunction, warn } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { threeConsole } from '../threeConsole'

afterEach(() => vi.restoreAllMocks())

describe('what three.js says on the console', () => {
  it('is handled by the app’s filter once it is loaded', () => {
    expect(getConsoleFunction()).toBe(threeConsole)
  })

  it('making a Clock, as every 3D canvas does, logs nothing', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    new Clock()
    expect(spy).not.toHaveBeenCalled()
  })

  it('any other warning, error or log from three still shows', () => {
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const e = vi.spyOn(console, 'error').mockImplementation(() => {})
    const l = vi.spyOn(console, 'log').mockImplementation(() => {})
    warn('WebGLRenderer: something else is deprecated.')
    expect(w).toHaveBeenCalledWith('THREE.WebGLRenderer: something else is deprecated.')
    threeConsole('error', 'THREE.Material: broken', 7)
    expect(e).toHaveBeenCalledWith('THREE.Material: broken', 7)
    threeConsole('log', 'THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.')
    expect(l).toHaveBeenCalledTimes(1)
  })
})
