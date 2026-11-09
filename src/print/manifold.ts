import Module, { type ManifoldToplevel } from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'

let loading: Promise<ManifoldToplevel> | null = null

/** The geometry engine, loaded the first time a print model is wanted. */
export function loadManifold(): Promise<ManifoldToplevel> {
  if (!loading) {
    loading = Module({ locateFile: () => wasmUrl }).then(m => {
      m.setup()
      return m
    })
    loading.catch(() => {
      loading = null
    })
  }
  return loading
}
