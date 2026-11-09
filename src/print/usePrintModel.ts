import { useEffect, useState } from 'react'
import { buildPrintModel, type PrintInput, type PrintModel, type PrintSettings } from './build'

interface Built {
  input: PrintInput | null
  settings: PrintSettings | null
  model: PrintModel | null
  error: string | null
}

/**
 * The print parts for the plan, rebuilt shortly after the plan or settings change.
 * The geometry engine is only downloaded once this is first used.
 */
export function usePrintModel(input: PrintInput | null, settings: PrintSettings, enabled: boolean) {
  const [built, setBuilt] = useState<Built>({ input: null, settings: null, model: null, error: null })
  useEffect(() => {
    if (!enabled || !input) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { loadManifold } = await import('./manifold')
        const wasm = await loadManifold()
        if (cancelled) return
        const model = buildPrintModel(wasm, input, settings)
        if (!cancelled) setBuilt({ input, settings, model, error: null })
      } catch (e) {
        if (!cancelled) setBuilt({ input, settings, model: null, error: (e as Error).message || 'The print model could not be made.' })
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [input, settings, enabled])
  const busy = enabled && !!input && (built.input !== input || built.settings !== settings)
  return { model: built.model, error: built.error, busy }
}
