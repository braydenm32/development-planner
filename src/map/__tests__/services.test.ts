import { afterEach, describe, expect, it } from 'vitest'
import { toMga } from '../geo'
import { layerAt, lotById, lotLabel, lotsOfProperty, parseLotDp, searchAddress, setFetch } from '../services'
import { ADDRESS_REPLY, LOT_REPLY } from './replies'

const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

afterEach(() => setFetch(null))

describe('Lot and DP', () => {
  it('reads the ways people write it', () => {
    expect(parseLotDp('Lot 4 DP 12345')).toBe('4//DP12345')
    expect(parseLotDp('lot 4 dp12345')).toBe('4//DP12345')
    expect(parseLotDp('4/12345')).toBe('4//DP12345')
    expect(parseLotDp('4//DP12345')).toBe('4//DP12345')
    expect(parseLotDp('1/2/DP1234')).toBe('1/2/DP1234')
    expect(parseLotDp('Lot 1 Sec 2 DP 1234')).toBe('1/2/DP1234')
    expect(parseLotDp('Lot 7, Section 3, DP 758000')).toBe('7/3/DP758000')
    expect(parseLotDp('41 Burelli Street Wollongong')).toBeNull()
  })

  it('labels it plainly', () => {
    expect(lotLabel('4//DP12345')).toBe('Lot 4 DP12345')
    expect(lotLabel('1/2/DP1234')).toBe('Lot 1 Section 2 DP1234')
  })
})

describe('finding a lot', () => {
  it('lists each address once, in plain case', async () => {
    setFetch(() => reply(ADDRESS_REPLY))
    const hits = await searchAddress('41 Burelli')
    expect(hits).toEqual([
      { address: '41 Burelli Street Wollongong 2500', propId: 3204805 },
      { address: '41 Burelli Street Wollongong 2500', propId: 3204804 },
    ])
  })

  it('turns the portal’s lot into the cadastre’s id and lon/lat', async () => {
    setFetch(() => reply(LOT_REPLY))
    const [lot] = await lotsOfProperty(3204805)
    expect(lot.id).toBe('401//DP715513')
    expect(lot.label).toBe('Lot 401 DP715513')
    expect(lot.ring).toHaveLength(10) // closing point dropped
    // Matches the cadastre's own first corner (recorded) to a few centimetres.
    const b = toMga([150.89888135083896, -34.426957414198725], 56)
    const nearest = Math.min(...lot.ring.map(p => toMga(p, 56)).map(a => Math.hypot(a[0] - b[0], a[1] - b[1])))
    expect(nearest).toBeLessThan(0.1)
  })

  it('asks the cadastre for the lot by its id, quoting it safely', async () => {
    let url = ''
    setFetch(u => {
      url = String(u)
      return reply({ features: [{ attributes: { lotidstring: "4//DP1'2" }, geometry: { rings: [[[150, -34], [150.001, -34], [150.001, -34.001], [150, -34]]] } }] })
    })
    const lot = await lotById("4//DP1'2")
    expect(decodeURIComponent(url)).toContain("lotidstring='4//DP1''2'")
    expect(lot?.ring).toHaveLength(3)
  })

  it('says plainly when a service fails', async () => {
    setFetch(() => reply({}, 500))
    await expect(searchAddress('x')).rejects.toThrow(/error \(500\)/)
    setFetch(() => Promise.reject(new TypeError('offline')))
    await expect(searchAddress('x')).rejects.toThrow(/didn’t answer/)
    setFetch(() => reply({ error: { code: 400, message: 'Invalid query' } }))
    await expect(lotById('1//DP1')).rejects.toThrow(/Invalid query/)
  })
})

describe('planning layers', () => {
  it('posts points in GDA94 as a form, so there is no preflight', async () => {
    let init: RequestInit | undefined
    let url = ''
    setFetch((u, i) => {
      url = String(u)
      init = i
      return reply({ features: [{ attributes: { SYM_CODE: 'R2' } }] })
    })
    const rows = await layerAt('zone', [
      [150.875, -34.435],
      [150.8751, -34.4351],
    ])
    expect(url).toMatch(/Planning_Portal_Principal_Planning\/MapServer\/19\/query$/)
    expect(init?.method).toBe('POST')
    const body = new URLSearchParams(String(init?.body))
    expect(body.get('geometryType')).toBe('esriGeometryMultipoint')
    expect(body.get('inSR')).toBe('4283')
    const g = JSON.parse(body.get('geometry')!)
    // GDA94 sits a little south-west of GDA2020: about 1.5 to 1.9 m.
    const shift = Math.hypot(...(toMga(g.points[0], 56).map((v, i) => v - toMga([150.875, -34.435], 56)[i]) as [number, number]))
    expect(shift).toBeGreaterThan(1.4)
    expect(shift).toBeLessThan(1.95)
    expect(rows).toEqual([{ SYM_CODE: 'R2' }])
  })
})
