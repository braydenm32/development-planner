// The desktop app's file handling with its commands stood in for: files go straight into the
// right folder with no download, Open uses the computer's own picker, and a print goes to the slicer.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: { cmd: string; args: unknown[] }[] = []
const slicers = [{ name: 'OrcaSlicer', path: 'C:\\Program Files\\OrcaSlicer\\orca-slicer.exe' }]
vi.mock('../bridge', () => ({
  isDesktop: () => true,
  baseName: (p: string) => p.split(/[\\/]/).pop(),
  desktopInfo: async () => ({ version: '0.1.0', os: 'windows', projectsDir: 'C:\\Docs\\Contour and Gable\\Projects', exportsDir: 'C:\\Docs\\Contour and Gable\\Exports' }),
  writeFile: async (dir: string, name: string, data: unknown) => {
    calls.push({ cmd: 'write', args: [dir, name, data] })
    return `${dir}\\${name}`
  },
  readFile: async (path: string) => {
    calls.push({ cmd: 'read', args: [path] })
    return new TextEncoder().encode('0\nEOF\n')
  },
  pickFile: async (...args: unknown[]) => {
    calls.push({ cmd: 'pick', args })
    return 'C:\\Docs\\Contour and Gable\\Projects\\My house.project.json'
  },
  findSlicers: async () => slicers,
  openWith: async (app: string, file: string) => void calls.push({ cmd: 'openWith', args: [app, file] }),
  openDefault: async (file: string) => void calls.push({ cmd: 'openDefault', args: [file] }),
  reveal: async () => undefined,
}))

const { startDesktop, folderFor, sendToSlicer } = await import('../files')
const { saveFile, savesElsewhere } = await import('../../lib/download')
const { pickFile, registerPicked, useSafety } = await import('../../safety/store')
const { setDesktop, setInfo, useDesktop } = await import('../settings')
const { desktopInfo } = await import('../bridge')

const tick = () => new Promise(r => setTimeout(r, 0))

beforeEach(async () => {
  calls.length = 0
  ;(globalThis as { document?: unknown }).document ??= { documentElement: { dataset: {} } }
  setInfo(await desktopInfo())
  setDesktop({ slicer: null })
})

describe('the desktop app', () => {
  it('saves straight into the folders: project files in Projects, the rest in Exports', async () => {
    startDesktop()
    expect(savesElsewhere()).toBe(true)
    saveFile('My house.project.json', '{}', 'application/json')
    saveFile('My house-3d-model.ifc', 'ISO', 'application/x-step')
    await tick()
    expect(calls.filter(c => c.cmd === 'write').map(c => c.args.slice(0, 2))).toEqual([
      ['C:\\Docs\\Contour and Gable\\Projects', 'My house.project.json'],
      ['C:\\Docs\\Contour and Gable\\Exports', 'My house-3d-model.ifc'],
    ])
    expect(useSafety.getState().toast?.text).toBe('Saved My house-3d-model.ifc in Exports.')
    expect(folderFor('x.PROJECT.JSON')).toBe(useDesktop.getState().projectsDir)
  })

  it('opens with its own picker, in the projects folder, and hands the file on as if picked', async () => {
    startDesktop()
    const got: { name: string; mode: string }[] = []
    registerPicked((f, mode) => got.push({ name: f.name, mode }))
    expect(pickFile('any')).toBe(true)
    await tick()
    await tick()
    const pick = calls.find(c => c.cmd === 'pick')!
    expect(pick.args[2]).toBe('C:\\Docs\\Contour and Gable\\Projects')
    expect(got).toEqual([{ name: 'My house.project.json', mode: 'any' }])
  })

  it('sends a print to the slicer found, or the one chosen, or the computer’s own app', async () => {
    await sendToSlicer({ name: 'house-1-100.3mf', data: new Uint8Array([1]) })
    expect(calls.find(c => c.cmd === 'openWith')?.args).toEqual([slicers[0].path, 'C:\\Docs\\Contour and Gable\\Exports\\house-1-100.3mf'])
    expect(useSafety.getState().toast?.text).toMatch(/^Sent house-1-100\.3mf to OrcaSlicer\./)

    calls.length = 0
    setDesktop({ slicer: { name: 'ElegooSlicer', path: 'C:\\Program Files\\ElegooSlicer\\elegoo-slicer.exe' } })
    await sendToSlicer({ name: 'b.3mf', data: new Uint8Array([1]) })
    expect(calls.find(c => c.cmd === 'openWith')?.args[0]).toBe('C:\\Program Files\\ElegooSlicer\\elegoo-slicer.exe')

    calls.length = 0
    setDesktop({ slicer: 'default' })
    await sendToSlicer({ name: 'c.3mf', data: new Uint8Array([1]) })
    expect(calls.find(c => c.cmd === 'openDefault')?.args[0]).toBe('C:\\Docs\\Contour and Gable\\Exports\\c.3mf')
  })
})
