// CB-26: search for "obj" said "Nothing matches". The words people bring for a model file find
// Save the 3D model, which lives in Share › Export.

import { describe, expect, it } from 'vitest'
import features from '../../nav/features.json'
import { allPlaces } from '../../nav/menu'
import { buildIndex, search } from '../../nav/search'

describe('finding the 3D model download', () => {
  const index = buildIndex(features)
  const top = (q: string) => search(index, q).slice(0, 5).map(r => r.key)

  it('comes up for obj, gltf, glb, sketchup, blender, model export and render', () => {
    for (const q of ['obj', 'gltf', 'glb', 'sketchup', 'blender', 'model export', 'render']) expect(top(q).some(k => k.startsWith('command:cmd-model')), q).toBe(true)
    expect(top('obj')).toContain('command:cmd-model-obj')
  })

  it('lives in Share › Export', () => {
    const home = allPlaces().find(p => p.entry.id === 'export')!
    expect(home.entry.features).toEqual(expect.arrayContaining(['download-3d-model-glb', 'download-3d-model-obj']))
  })
})
