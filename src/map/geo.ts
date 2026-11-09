// The real-world frames the map placement works in, without a projection library:
//
//   lon/lat     GDA2020 geographic (WGS84 is treated as the same at a block's scale). The cadastre
//               and the imagery tiles come in this, through Web Mercator.
//   MGA         GDA2020 / Map Grid of Australia, metres, one zone per 6° of longitude (Wollongong
//               is zone 56). The placement keeps the survey's position in it.
//   GDA94       The older datum, about 1.5 to 1.8 m away in NSW. The ePlanning layers are in it.
//
// Transverse Mercator uses the Krüger series to n⁴ (as the ICSM GDA2020 technical manual does),
// good to well under a millimetre within a zone.

export type LonLat = [number, number]
export type EN = [number, number]

const A_AXIS = 6378137
const FLAT = 1 / 298.257222101
const K0 = 0.9996
const FALSE_E = 500000
const FALSE_N = 10000000
const n = FLAT / (2 - FLAT)
const e = Math.sqrt(FLAT * (2 - FLAT))
const n2 = n * n
const n3 = n2 * n
const n4 = n3 * n
const RECT = (A_AXIS / (1 + n)) * (1 + n2 / 4 + n4 / 64)
const ALPHA = [n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180, (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440, (61 * n3) / 240 - (103 * n4) / 140, (49561 * n4) / 161280]
const BETA = [n / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360, n2 / 48 + n3 / 15 - (437 * n4) / 1440, (17 * n3) / 480 - (37 * n4) / 840, (4397 * n4) / 161280]
const RAD = Math.PI / 180

/** The MGA zone a longitude falls in (NSW spans 54 to 56). */
export const zoneOf = (lon: number): number => Math.floor((lon + 180) / 6) + 1
const centralMeridian = (zone: number) => zone * 6 - 183

/** GDA2020 lon/lat to MGA easting and northing in the given zone (southern hemisphere). */
export function toMga([lon, lat]: LonLat, zone: number): EN {
  const phi = lat * RAD
  const omega = (lon - centralMeridian(zone)) * RAD
  const t = Math.tan(phi)
  const sigma = Math.sinh(e * Math.atanh((e * t) / Math.sqrt(1 + t * t)))
  const tc = t * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + t * t)
  const xiP = Math.atan2(tc, Math.cos(omega))
  const etaP = Math.asinh(Math.sin(omega) / Math.sqrt(tc * tc + Math.cos(omega) ** 2))
  let xi = xiP
  let eta = etaP
  for (let j = 1; j <= 4; j++) {
    xi += ALPHA[j - 1] * Math.sin(2 * j * xiP) * Math.cosh(2 * j * etaP)
    eta += ALPHA[j - 1] * Math.cos(2 * j * xiP) * Math.sinh(2 * j * etaP)
  }
  return [FALSE_E + K0 * RECT * eta, FALSE_N + K0 * RECT * xi]
}

/** MGA easting and northing in the given zone back to GDA2020 lon/lat. */
export function fromMga([E, N]: EN, zone: number): LonLat {
  const xi = (N - FALSE_N) / (K0 * RECT)
  const eta = (E - FALSE_E) / (K0 * RECT)
  let xiP = xi
  let etaP = eta
  for (let j = 1; j <= 4; j++) {
    xiP -= BETA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta)
    etaP -= BETA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta)
  }
  const tc = Math.sin(xiP) / Math.sqrt(Math.sinh(etaP) ** 2 + Math.cos(xiP) ** 2)
  // Newton's method for the conformal latitude's tangent (Karney 2011, eq. 19 to 21).
  let tau = tc
  for (let i = 0; i < 6; i++) {
    const s = Math.sinh(e * Math.atanh((e * tau) / Math.sqrt(1 + tau * tau)))
    const ti = tau * Math.sqrt(1 + s * s) - s * Math.sqrt(1 + tau * tau)
    const d = ((tc - ti) / Math.sqrt(1 + ti * ti)) * ((1 + (1 - e * e) * tau * tau) / ((1 - e * e) * Math.sqrt(1 + tau * tau)))
    tau += d
    if (Math.abs(d) < 1e-14) break
  }
  return [centralMeridian(zone) + Math.atan2(Math.sinh(etaP), Math.cos(xiP)) / RAD, Math.atan(tau) / RAD]
}

// ---- GDA94 ↔ GDA2020 (ICSM conformal 7-parameter transformation, coordinate frame rotations) ----

const ARCSEC = RAD / 3600
const H = { tx: 0.06155, ty: -0.01087, tz: -0.04019, s: -0.009994e-6, rx: -0.0394924 * ARCSEC, ry: -0.0327221 * ARCSEC, rz: -0.0328979 * ARCSEC }

function toXyz([lon, lat]: LonLat): [number, number, number] {
  const p = lat * RAD
  const l = lon * RAD
  const e2 = FLAT * (2 - FLAT)
  const nu = A_AXIS / Math.sqrt(1 - e2 * Math.sin(p) ** 2)
  return [nu * Math.cos(p) * Math.cos(l), nu * Math.cos(p) * Math.sin(l), nu * (1 - e2) * Math.sin(p)]
}

function fromXyz([X, Y, Z]: [number, number, number]): LonLat {
  const e2 = FLAT * (2 - FLAT)
  const p = Math.hypot(X, Y)
  let lat = Math.atan2(Z, p * (1 - e2))
  for (let i = 0; i < 6; i++) {
    const nu = A_AXIS / Math.sqrt(1 - e2 * Math.sin(lat) ** 2)
    lat = Math.atan2(Z + e2 * nu * Math.sin(lat), p)
  }
  return [Math.atan2(Y, X) / RAD, lat / RAD]
}

function helmert(ll: LonLat, sign: 1 | -1): LonLat {
  const [X, Y, Z] = toXyz(ll)
  const k = 1 + sign * H.s
  const rx = sign * H.rx
  const ry = sign * H.ry
  const rz = sign * H.rz
  return fromXyz([sign * H.tx + k * (X + rz * Y - ry * Z), sign * H.ty + k * (-rz * X + Y + rx * Z), sign * H.tz + k * (ry * X - rx * Y + Z)])
}

/** A GDA94 lon/lat in GDA2020. */
export const gda94To2020 = (ll: LonLat): LonLat => helmert(ll, 1)
/** A GDA2020 lon/lat in GDA94 (the reverse to well under a millimetre). */
export const gda2020To94 = (ll: LonLat): LonLat => helmert(ll, -1)

// ---- Web Mercator tiles (the imagery) ----

/** Which tile (fractional) a lon/lat falls in at zoom z. */
export function tileXY([lon, lat]: LonLat, z: number): [number, number] {
  const s = 2 ** z
  const r = lat * RAD
  return [((lon + 180) / 360) * s, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s]
}

/** The lon/lat of a tile corner (fractional tile coordinates allowed). */
export function tileLonLat(x: number, y: number, z: number): LonLat {
  const s = 2 ** z
  const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / s))) / RAD
  return [(x / s) * 360 - 180, lat]
}

/** The middle of a ring's corners, to centre the map on. */
export const middleOf = (ring: LonLat[]): LonLat => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length]
