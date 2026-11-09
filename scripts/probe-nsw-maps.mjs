// Checks that the NSW map and planning services the map placement uses (src/map/services.ts)
// still answer the way the app expects, and still let a browser call them (CORS). Run by hand
// or from the "Probe NSW map services" workflow:
//
//   node scripts/probe-nsw-maps.mjs
//
// It looks up public places only (Wollongong's council offices and the land around the city),
// never a user's block. `node scripts/probe-nsw-maps.mjs elevation` checks only the elevation
// services (src/map/elevation.ts); `maps` only the rest.

const ORIGIN = 'https://contourandgable.com'
const SIX = 'https://maps.six.nsw.gov.au/arcgis/rest/services/public'
const PORTAL = 'https://api.apps1.nsw.gov.au/planning/viewersf/V1/ePlanningApi'
const EPLAN = 'https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/ePlanning'

const ONLY = process.argv[2] ?? process.env.PROBE ?? 'all'
let failures = 0
const cut = (s, n = 900) => (s.length > n ? `${s.slice(0, n)}… (${s.length} chars)` : s)

async function get(name, url, init) {
  console.log(`\n=== ${name}`)
  try {
    const r = await fetch(url, { ...init, headers: { Origin: ORIGIN, ...(init?.headers ?? {}) } })
    const acao = r.headers.get('access-control-allow-origin')
    const text = await r.text()
    console.log(`status ${r.status} · CORS ${acao}`)
    if (!r.ok || !acao) failures++
    try {
      return JSON.parse(text)
    } catch {
      console.log(cut(text))
      return null
    }
  } catch (e) {
    failures++
    console.log(`failed: ${e}`)
    return null
  }
}

const show = (label, j) => {
  if (j?.error) {
    failures++
    console.log(`${label}: error ${JSON.stringify(j.error)}`)
    return
  }
  const feats = j?.features ?? []
  console.log(`${label}: ${feats.length} feature(s)`)
  for (const f of feats.slice(0, 3)) console.log(cut(JSON.stringify(f.attributes)))
}

/** ArcGIS layer query, posted as a form so polygons fit. */
const query = (service, layer, params) =>
  get(`${service}/${layer}`, `${EPLAN}/${service}/MapServer/${layer}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ f: 'json', outFields: '*', returnGeometry: 'false', spatialRel: 'esriSpatialRelIntersects', ...params }),
  })
const box = (lon, lat, d) => ({ geometry: `${lon - d},${lat - d},${lon + d},${lat + d}`, geometryType: 'esriGeometryEnvelope', inSR: '4283', resultRecordCount: '3' })

if (ONLY === 'all' || ONLY === 'maps') {
// Address search as you type.
for (const a of ['41 Burelli St Wollongong', '41 Burelli', 'Lot 401 DP 715513']) {
  const j = await get(`address "${a}"`, `${PORTAL}/address?a=${encodeURIComponent(a)}&noOfRecords=5`)
  console.log(cut(JSON.stringify(j)))
}
const lot = await get('lot of the council offices', `${PORTAL}/lot?propId=3204805`)
console.log(cut(JSON.stringify(lot?.[0]?.attributes)), 'wkid', lot?.[0]?.geometry?.spatialReference?.wkid)

// Cadastre: by Lot/DP, then a polygon query around it.
const byLot = await get(
  'cadastre by lotidstring',
  `${SIX}/NSW_Cadastre/MapServer/9/query?where=${encodeURIComponent("lotidstring='401//DP715513'")}&outFields=lotidstring,planlabel,lotnumber,sectionnumber,plannumber,planlotarea,planlotareaunits&returnGeometry=true&outSR=4326&f=json`,
)
show('cadastre by lotidstring', byLot)
const ring = byLot?.features?.[0]?.geometry?.rings?.[0]
console.log('ring vertices', ring?.length, JSON.stringify(ring?.slice(0, 2)))
const byLike = await get(
  'cadastre by lot number and plan',
  `${SIX}/NSW_Cadastre/MapServer/9/query?where=${encodeURIComponent("lotnumber='401' AND plannumber=715513")}&outFields=lotidstring,planlabel&returnGeometry=false&f=json`,
)
show('cadastre by lot number and plan', byLike)

// Planning layers over the lot polygon (GDA2020 sent as 4326; the server shifts it to GDA94 or not).
if (ring) {
  const poly = { geometry: JSON.stringify({ rings: [ring], spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPolygon', inSR: '4326' }
  for (const [s, l] of [
    ['Planning_Portal_Principal_Planning', 19],
    ['Planning_Portal_Principal_Planning', 14],
    ['Planning_Portal_Principal_Planning', 11],
    ['Planning_Portal_Principal_Planning', 22],
    ['Planning_Portal_Principal_Planning', 16],
    ['Planning_Portal_Principal_Planning', 8],
    ['Planning_Portal_Hazard', 229],
    ['Planning_Portal_Hazard', 230],
    ['Planning_Portal_Hazard', 232],
  ])
    show(`council offices lot · ${s} ${l}`, await query(s, l, poly))
}

// Examples with something in them, to see the values.
show('bushfire prone, Mount Keira', await query('Planning_Portal_Hazard', 229, box(150.855, -34.405, 0.004)))
show('bushfire prone, Mount Ousley', await query('Planning_Portal_Hazard', 229, box(150.88, -34.38, 0.01)))
show('flood planning, Wollongong', await query('Planning_Portal_Hazard', 230, box(150.89, -34.42, 0.02)))
show('landslide, Wollongong', await query('Planning_Portal_Hazard', 232, box(150.88, -34.40, 0.03)))
show('heritage, city centre', await query('Planning_Portal_Principal_Planning', 16, box(150.895, -34.425, 0.004)))
show('zoning, Mangerton', await query('Planning_Portal_Principal_Planning', 19, box(150.875, -34.435, 0.001)))
show('min lot size, Mangerton', await query('Planning_Portal_Principal_Planning', 22, box(150.875, -34.435, 0.001)))
show('height, Mangerton', await query('Planning_Portal_Principal_Planning', 14, box(150.875, -34.435, 0.001)))
show('FSR, Mangerton', await query('Planning_Portal_Principal_Planning', 11, box(150.875, -34.435, 0.001)))
const info = await get('layer 22 info', `${EPLAN}/Planning_Portal_Principal_Planning/MapServer/22?f=json`)
console.log('layer 22:', info?.name, (info?.fields ?? []).map(f => f.name).join(', '))

// Imagery tiles answer to z 21 (checked once already); keep one as a canary.
await get('imagery tile', `${SIX}/NSW_Imagery/MapServer/tile/20/631199/963796`)

}

if (ONLY === 'all' || ONLY === 'elevation') await probeElevation()

console.log(`\n${failures} failure(s)`)
process.exitCode = failures ? 1 : 0

// ---- Elevation (src/map/elevation.ts) ----
//
// Finds the elevation services on the NSW and Geoscience Australia servers, then asks each for the
// ground level at a few public places: Wollongong's council offices, the city centre, Mount Keira's
// lookout, and a point out at sea (which should come back as NoData).

async function probeElevation() {
  const ELEV = /elev|dem|dtm|lidar|terrain|height|contour|depth/i
  const roots = [
    'https://maps.six.nsw.gov.au/arcgis/rest/services',
    'https://portal.spatial.nsw.gov.au/server/rest/services',
    'https://services.ga.gov.au/gis/rest/services',
    'https://services.ga.gov.au/site_9/rest/services',
    'https://elevation.ga.gov.au/arcgis/rest/services',
  ]
  const found = []
  for (const root of roots) {
    const top = await get(`directory ${root}`, `${root}?f=json`)
    const folders = top?.folders ?? []
    const services = [...(top?.services ?? [])]
    for (const f of folders) {
      const sub = await get(`directory ${root}/${f}`, `${root}/${f}?f=json`)
      if (sub?.error) console.log(`  ${f}: ${JSON.stringify(sub.error)}`)
      services.push(...(sub?.services ?? []))
    }
    const hits = services.filter(s => ELEV.test(s.name))
    console.log(`${root}: ${services.length} service(s); elevation-like: ${hits.map(s => `${s.name} (${s.type})`).join(', ') || 'none'}`)
    for (const s of hits) found.push({ root, ...s })
  }
  // Candidates by name too, in case a folder is hidden from the listing.
  for (const url of [
    'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_5M_Elevation/ImageServer',
    'https://portal.spatial.nsw.gov.au/server/rest/services/sixmaps/NSW_5M_Elevation/ImageServer',
    'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_1M_Elevation/ImageServer',
    'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_2M_Elevation/ImageServer',
    'https://portal.spatial.nsw.gov.au/server/rest/services/Hosted/NSW_Elevation/ImageServer',
    'https://services.ga.gov.au/gis/rest/services/DEM_LiDAR_5m_2025/ImageServer',
    'https://services.ga.gov.au/gis/rest/services/DEM_LiDAR_5m/ImageServer',
  ]) {
    const [, root, name, type] = url.match(/^(.*\/rest\/services)\/(.*)\/(ImageServer|MapServer)$/)
    if (!found.some(f => f.root === root && f.name === name && f.type === type)) found.push({ root, name, type, guessed: true })
  }

  // Public places, GDA2020 lon/lat.
  const places = [
    [150.8936, -34.4259], // council offices, 41 Burelli St
    [150.8975, -34.4245], // Crown St mall
    [150.8710, -34.4100], // Mount Keira Rd, foothills
    [150.8470, -34.4040], // Mount Keira lookout
    [150.9500, -34.4300], // at sea
  ]
  const multipoint = pts => JSON.stringify({ points: pts, spatialReference: { wkid: 4326 } })
  const grid = (n, step) => {
    // n × n points, `step` degrees apart, around the council offices.
    const out = []
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push([Number((150.8936 + (i - n / 2) * step).toFixed(7)), Number((-34.4259 + (j - n / 2) * step).toFixed(7))])
    return out
  }

  for (const s of found) {
    const base = `${s.root}/${s.name}/${s.type}`
    const info = await get(`${s.guessed ? 'guess ' : ''}${s.name} ${s.type} info`, `${base}?f=json`)
    if (!info || info.error) {
      console.log(cut(JSON.stringify(info?.error ?? null), 300))
      continue
    }
    const keep = {}
    for (const k of ['serviceDescription', 'description', 'copyrightText', 'pixelSizeX', 'pixelSizeY', 'pixelType', 'noDataValue', 'noDataValues', 'bandCount', 'capabilities', 'maxRecordCount', 'maxImageWidth', 'maxImageHeight', 'maxDownloadImageCount', 'allowedMosaicMethods', 'defaultResamplingMethod', 'spatialReference', 'extent', 'units', 'layers', 'supportedExtensions', 'minValues', 'maxValues'])
      if (info[k] !== undefined) keep[k] = info[k]
    console.log(cut(JSON.stringify(keep), 2500))
    const item = await get(`${s.name} iteminfo`, `${base}/info/iteminfo?f=json`)
    if (item) console.log(cut(JSON.stringify({ title: item.title, snippet: item.snippet, description: item.description, accessInformation: item.accessInformation, licenseInfo: item.licenseInfo }), 1500))

    if (s.type === 'ImageServer') {
      const samples = async (label, pts, method) => {
        const params = {
          geometry: multipoint(pts),
          geometryType: 'esriGeometryMultipoint',
          returnFirstValueOnly: 'true',
          interpolation: 'RSP_BilinearInterpolation',
          f: 'json',
        }
        const t0 = Date.now()
        const j =
          method === 'GET'
            ? await get(`${s.name} getSamples ${label} (GET)`, `${base}/getSamples?${new URLSearchParams(params)}`)
            : await get(`${s.name} getSamples ${label} (POST)`, `${base}/getSamples`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(params),
              })
        const got = j?.samples ?? []
        console.log(`${Date.now() - t0} ms · ${got.length} sample(s) for ${pts.length} point(s)${j?.error ? ` · error ${JSON.stringify(j.error)}` : ''}`)
        for (const x of got.slice(0, 6)) console.log(cut(JSON.stringify(x), 400))
        return got
      }
      await samples('places', places, 'GET')
      await samples('places', places, 'POST')
      for (const n of [10, 32, 40, 50]) await samples(`grid ${n * n}`, grid(n, 0.00001), 'POST')
      // Interpolation names the server takes.
      const nearest = await get(`${s.name} getSamples nearest`, `${base}/getSamples?${new URLSearchParams({ geometry: multipoint(places.slice(0, 2)), geometryType: 'esriGeometryMultipoint', returnFirstValueOnly: 'true', interpolation: 'RSP_NearestNeighbor', f: 'json' })}`)
      console.log(cut(JSON.stringify(nearest?.samples ?? nearest), 600))
      const ident = await get(`${s.name} identify`, `${base}/identify?${new URLSearchParams({ geometry: JSON.stringify({ x: places[0][0], y: places[0][1], spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPoint', returnGeometry: 'false', returnCatalogItems: 'true', f: 'json' })}`)
      console.log(cut(JSON.stringify(ident), 1500))
      // A preflighted call, in case the app ever needs one.
      try {
        const r = await fetch(`${base}/getSamples`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } })
        console.log(`preflight ${r.status} · allow-origin ${r.headers.get('access-control-allow-origin')} · allow-methods ${r.headers.get('access-control-allow-methods')}`)
      } catch (e) {
        console.log(`preflight failed: ${e}`)
      }
    } else if (s.type === 'MapServer') {
      // Raster layers answer identify with a "Pixel Value".
      for (const [i, p] of places.entries()) {
        const j = await get(`${s.name} identify place ${i}`, `${base}/identify?${new URLSearchParams({ geometry: `${p[0]},${p[1]}`, geometryType: 'esriGeometryPoint', sr: '4326', layers: 'all', tolerance: '0', mapExtent: `${p[0] - 0.001},${p[1] - 0.001},${p[0] + 0.001},${p[1] + 0.001}`, imageDisplay: '400,400,96', returnGeometry: 'false', f: 'json' })}`)
        console.log(cut(JSON.stringify(j?.results?.map(r => ({ layer: r.layerName, attrs: r.attributes })) ?? j), 600))
        if (i > 1 && !/LiDAR|DEM/i.test(s.name)) break
      }
      const mj = await get(`${s.name} identify multipoint`, `${base}/identify?${new URLSearchParams({ geometry: multipoint(places), geometryType: 'esriGeometryMultipoint', layers: 'all', tolerance: '0', mapExtent: '150.84,-34.44,150.96,-34.40', imageDisplay: '400,400,96', returnGeometry: 'false', f: 'json' })}`)
      console.log(cut(JSON.stringify(mj?.results?.map(r => ({ layer: r.layerName, attrs: r.attributes })) ?? mj), 900))
    }
  }

  // Geoscience Australia's WCS for the 5 m LiDAR DEM: one request could return the whole lot's grid.
  for (const svc of ['DEM_LiDAR_5m_2025', 'DEM_LiDAR_5m']) {
    const wcs = `https://services.ga.gov.au/gis/services/${svc}/MapServer/WCSServer`
    const caps = await get(`${svc} WCS capabilities`, `${wcs}?service=WCS&request=GetCapabilities&version=1.0.0`)
    if (caps) console.log(cut(JSON.stringify(caps), 300))
    try {
      const r = await fetch(`${wcs}?service=WCS&version=1.0.0&request=GetCoverage&coverage=1&crs=EPSG:4326&bbox=150.8930,-34.4265,150.8942,-34.4253&width=20&height=20&format=GeoTIFF`, { headers: { Origin: ORIGIN } })
      const buf = new Uint8Array(await r.arrayBuffer())
      console.log(`${svc} WCS GetCoverage: status ${r.status} · CORS ${r.headers.get('access-control-allow-origin')} · ${r.headers.get('content-type')} · ${buf.length} bytes · ${new TextDecoder().decode(buf.slice(0, 200)).replace(/[^\x20-\x7e]/g, '.')}`)
    } catch (e) {
      console.log(`${svc} WCS GetCoverage failed: ${e}`)
    }
  }

  // The licences, from the data catalogues.
  for (const [label, url] of [
    ['data.nsw elevation', 'https://data.nsw.gov.au/data/api/3/action/package_search?q=elevation%20DEM&rows=12'],
    ['data.nsw 5m', 'https://data.nsw.gov.au/data/api/3/action/package_search?q=%225%20metre%22%20elevation&rows=6'],
    ['data.gov.au GA 5m LiDAR', 'https://data.gov.au/data/api/3/action/package_search?q=%22derived%20from%20LiDAR%205%20Metre%22&rows=6'],
  ]) {
    const j = await get(label, url, { headers: { Accept: 'application/json' } })
    for (const p of j?.result?.results ?? [])
      console.log(
        cut(
          JSON.stringify({
            title: p.title,
            license: p.license_title ?? p.license_id,
            url: p.url,
            notes: (p.notes ?? '').slice(0, 700),
            resources: (p.resources ?? []).slice(0, 6).map(r => r.url),
          }),
          1600,
        ),
      )
  }
}
