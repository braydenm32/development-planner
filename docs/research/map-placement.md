# Placing the survey on the map

Research notes (8 November 2026) for a planned feature: show the survey on a satellite image of the block, so the app knows where the block really is and can look up the planning rules that apply to it (zone, height, floor space ratio, hazards, and which council's LEP and DCP to use). Checked on 8 November 2026. Marks (**read**, **secondary**, **unverified**) mean the same as in [compliance-and-swept-path-sources.md](compliance-and-swept-path-sources.md).

## Why it's needed

The survey DXF is in local coordinates (eastings and northings around 1000), so nothing ties it to the state's maps. Once the app has the survey's real position and rotation, it can:

- put NSW aerial imagery and the cadastre under the plan and the 3D model;
- query the ePlanning layers at the block for zone, height, FSR, lot size, heritage and hazards, and pick the council rule set automatically;
- later, pull neighbouring ground from LiDAR for overshadowing and the street level for the driveway crossing.

## Services

| Service | Endpoint | What it gives | Notes |
| --- | --- | --- | --- |
| NSW aerial imagery | `https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer` | Statewide imagery tiles, Web Mercator (wkid 102100/3857). WMTS tile template `.../NSW_Imagery/MapServer/WMTS/tile/1.0.0/public_NSW_Imagery/default/GoogleMapsCompatible/{z}/{y}/{x}` (levels 0 to 18 in that set, about 0.6 m per pixel at 18; the service's own set lists resolutions down to about 0.02 m at level 23, availability untested). Capabilities say `exportTilesAllowed: false`. | **read**, service metadata and [WMTS capabilities](https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer/WMTS/1.0.0/WMTSCapabilities.xml). The capabilities advertise http; test https. Attribution "© Department of Customer Service 2020" plus image vendors (AAM, Jacobs/Ausimage, Landsat). Data.NSW lists the licence as "cc-at-3", probably CC BY 3.0 AU (**unverified**). Fine for viewing; don't bulk-download or cache tiles. |
| NSW cadastre | `https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer/9` | Lot polygons with `lotnumber`, `sectionnumber`, `plannumber`, `planlabel`, `lotidstring`, `planlotarea`. Query by point (click on the map) or by Lot/DP. Web Mercator. | **read**, layer metadata. Value formats (for example whether `lotidstring` reads `1//DP12345`) untested. |
| NSW property | `https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Property/MapServer` | Property extents from the Valuer General, with a property-to-lot table. | **read**, metadata only; not tried as a lookup. |
| Planning Portal address search | `https://api.apps1.nsw.gov.au/planning/viewersf/V1/ePlanningApi/address?a=<address>` | A list of `{address, propId, GURASID}`. An address can return more than one `propId`, and there are no coordinates. | **read**, tried with the council's own office address. **Undocumented** (it's the Spatial Viewer's backend), so it can change without notice. |
| Planning Portal controls for a property | `https://api.apps1.nsw.gov.au/planning/viewersf/V1/ePlanningApi/layerintersect?type=property&id=<propId>&layers=epi` | An array of `{id, layerName, results}` covering land zoning (layer 19), height of buildings (14), floor space ratio (11), acid sulfate soils (234), local provisions (223), land application (8) and more. Each result names the EPI, LGA and dates and links to the legislation. Lot size wasn't in the reply for the test address. | **read**, same test. **Undocumented.** This is the quickest way to get "what applies to my block", including the LGA name to pick a council rule set. |
| ePlanning ArcGIS layers | `https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/ePlanning/...` | The same layers, queried by point. Layer ids in the main research doc. | **read**, metadata. The documented-ish route; no propId needed once the block's coordinates are known. |
| Elevation | [ELVIS](https://elevation.fsdf.org.au/) | LiDAR and DEMs. | Licence not confirmed. Later work. |

**Checked live on 9 November 2026** (`scripts/probe-nsw-maps.mjs`, run from GitHub's runners): every service above answers with `Access-Control-Allow-Origin: *`, preflights included, so the browser calls them directly. Findings:

- Address search works as you type ("41 Burelli" finds the address) but doesn't understand "Lot 401 DP 715513"; the app reads Lot/DP itself and asks the cadastre.
- `ePlanningApi/lot?propId=` returns each lot's polygon (Web Mercator) with `LotDescription` like `401/-/DP715513`; the cadastre's `lotidstring` is `401//DP715513`.
- Cadastre queries by `lotidstring` and by envelope work, `outSR=4326` returns lon/lat. `planlotarea` was empty for the test lot.
- Imagery tiles answer at `.../NSW_Imagery/MapServer/tile/{z}/{y}/{x}` to zoom 21.
- ePlanning layer queries work by point, multipoint and polygon (POST as a form). A polygon query of a lot catches the neighbouring zones it touches (the council office lot returned E2, MU1 and SP2 Road), so the app asks with points inside the lot instead.
- Values seen: zoning `SYM_CODE` "R2", `LAY_CLASS` "Low Density Residential"; height `MAX_B_H_M` 9; FSR `FSR` 0.5; lot size `LOT_SIZE` 449 with `UNITS` "m²"; heritage `LAY_CLASS` "Item - General", `H_NAME`, `H_ID`, `SIG`; bushfire `d_Category` "Vegetation Category 1", "Vegetation Category 2", "Vegetation Buffer". The flood planning layer had nothing around Wollongong, which fits LEP cl 5.21 (no fixed map).
- The `+towgs84` string under Coordinates below has its translations in millimetres where proj expects metres: they are 0.06155, -0.01087 and -0.04019 m. The app uses the ICSM parameters directly (`src/map/geo.ts`): the shift comes out at about 1.5 to 1.9 m in Wollongong.

No NSW geocoder was found on the public SIX Maps services (the old `NSW_Geocoded_Addressing_Theme` service no longer exists). The browser's CORS access to all of these is **untested**: a quick check from the deployed site is the first job when building.

Esri World Imagery is a possible fallback, but its terms limit programmatic tile use and need attribution from the item page ([Esri product-specific terms E300](https://www.esri.com/content/dam/esrisites/en-us/media/legal/product-specific-terms-of-use/e300.pdf), 13 Nov 2025, **read**). NSW imagery should be the default.

## Coordinates

- Wollongong is in **MGA zone 56**. Use GDA2020 / MGA zone 56 ([EPSG:7856](https://epsg.io/7856)) as the app's real-world frame: `+proj=utm +zone=56 +south +ellps=GRS80 +units=m +no_defs`.
- The ePlanning layers are in GDA94 geographic (wkid 4283). GDA94 to GDA2020 is a 7-parameter Helmert transform ([EPSG:8048](https://epsg.io/28356-to-7844), 0.01 m accuracy): `+towgs84=61.55,-10.87,-40.19,-39.4924,-32.7221,-32.8979,-9.994`. The shift is commonly quoted as about 1.5 to 1.8 m in NSW (**unverified**); compute it rather than assuming.
- Imagery and cadastre come in Web Mercator (WGS84 based). Treating WGS84 as GDA2020 is fine at this scale.
- [proj4js](https://github.com/proj4js/proj4js) (MIT) handles all of this in the browser.

## How to fit the survey

1. **Find the lot.** Either type the address (Planning Portal search, then pick the property), type the Lot and DP, or pan the imagery and click the block. Any of these ends with the cadastre lot polygon.
2. **Fit automatically.** The survey's `LOT_BOUNDARY` polygon and the cadastre polygon describe the same lot. Convert the cadastre polygon to MGA 56, then find the rotation and translation (scale fixed at 1) that best match the two outlines: try each pairing of starting vertices in both directions, solve each with the least-squares rigid fit (Kabsch/Procrustes), and keep the one with the smallest RMS error. Show the residual: a few decimetres is normal for the cadastre; metres means the wrong lot or a bad pairing. Compare areas first: if the survey boundary leaves out part of the lot, the two outlines won't match. A battle-axe survey often leaves out the access handle that the title includes, so the fit should use only the edges the two outlines share, or fall back to the manual step.
3. **Adjust by hand.** Drag and rotate the survey outline over the imagery, or pin two boundary corners to points on the image. This covers lots whose cadastre is poor or a survey without a closed boundary.
4. **Check against the survey.** If the surveyor's plan states "bearings are MGA" or gives an MGA coordinate for a corner, use that instead and show the difference.
5. **Save** the survey origin in MGA 56 (easting, northing), the rotation and the fit residual with the project. That's all the other features need.

The app already has a "Top of view" bearing and north arrow; once placed, north comes from the fit instead of the survey's own grid.

## Showing it

- A 2D map view under the plan, using MapLibre GL JS or Leaflet (both BSD licensed), with the cadastre as lines and the survey boundary on top.
- In 3D, draw the imagery tiles that cover the block into one canvas and use it as a texture on the terrain, so the model sits on the real photo. Tiles at level 19 or 20 cover a lot of about 700 m² in a handful of requests.
- On the PDF site plan, an optional faint aerial under the contours.

## Privacy

Placing the block sends its location (and any typed address) to NSW Government servers. The app otherwise keeps everything in the browser, so say so before the first lookup, and keep the address out of shared project files unless the owner wants it there.
