# Ground levels without a survey

Research notes (9 November 2026) for "start from an address": the lot's outline from the NSW cadastre (see [map-placement.md](map-placement.md)) and the ground from the state's elevation model, for a first look before buying. Also the source for `groundAt(points)` in `src/map/elevation.ts`, which later features (the driveway crossing's kerb level) can call. Marks (**read**, **secondary**, **unverified**) mean the same as in [compliance-and-swept-path-sources.md](compliance-and-swept-path-sources.md).

## What the app uses

**NSW 5 m elevation model**, `https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_5M_Elevation/ImageServer` (ArcGIS ImageServer, Web Mercator, 5 m pixels, F32, AHD).

- **What it is.** A statewide 5 m DEM. The service says "derived from stereo imagery" ([service metadata](https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_5M_Elevation/ImageServer?f=pjson), **read**); Spatial Services describe it as made from "category 1 LiDAR, category 3 LiDAR, 10 cm ground resolution imagery and 50 cm ground resolution imagery" ([Coordinates, "DEM delivers better approximate AHD heights on public record"](https://mycoordinates.org/dem-delivers-better-approximate-ahd-heights-on-public-record/), **secondary**). Around Wollongong the pixel's catalogue item is `Wollongong-DEM-AHD_56_5m` (the identify reply below), so where a LiDAR survey has been flown it's the LiDAR model resampled to 5 m. The app says "LiDAR and aerial photos", not "LiDAR", because it can't tell which a given lot has.
- **Accuracy.** Vertical **±0.9 m at 95% confidence**, horizontal ±1.25 m at 95% ([NSW Elevation Data Service on Data.NSW](https://uatdatansw.dac.nsw.gov.au/data/dataset/1-437c0697e6524d8ebf10ad0d915bc219), **read**; the Coordinates article gives the same ±0.9 m). Where it's from LiDAR it will usually be much better (the ICSM LiDAR specification asks for ±0.30 m at 95%), but the app shows the stated ±0.9 m. Photogrammetric areas "caused by steep slopes, shadow and vegetation have been interpolated or filled-in with another data source and will not be as accurate as the bare open ground areas" (NSW FSDF Digital Elevation Model, Data.NSW, **read** through the CKAN API). It's bare earth (buildings and trees removed), 5 m apart: a retaining wall, a cutting or a house pad between posts doesn't show.
- **Licence.** Creative Commons Attribution. Data.NSW lists the NSW FSDF DEM as "Creative Commons Attribution" and the Elevation Data Service as CC BY, without a version (**read**); NSW Government content defaults to **CC BY 4.0** with "© State of New South Wales" ([nsw.gov.au copyright](https://www.nsw.gov.au/nsw-government/about-website/copyright), **read**). The Spatial Web Services terms ask for "© Department of Customer Service [date of extraction]" and reserve the right to cap heavy use and bar robots and bulk retrieval ([terms and conditions](https://www.spatial.nsw.gov.au/products_and_services/web_services/terms_and_conditions), **read**). The service's own `copyrightText` is "DFSI 2019". **The exact CC BY version for this layer is unverified**: the app assumes 4.0 (the NSW default) and the owner should confirm with Spatial Services.
- **Attribution the app shows** (`DEM.credit`): "Ground levels © State of New South Wales (Spatial Services, Department of Customer Service), CC BY 4.0". It's on the start card and Site › Map before reading, in Site › Block once the block is made, and in the canvas chip's tooltip.
- **Use.** One person, one lot, on demand: about a thousand to three thousand points once, then cached in the browser for the visit. That's within "legal, proper or personal use"; the app never crawls or pre-fetches.

## How it answers (checked 9 November 2026)

`scripts/probe-nsw-maps.mjs elevation`, run from GitHub's runners (the "Probe NSW map services" workflow, with `only: elevation`), runs 3 and 4 on branch `claude/elevation`:

- **CORS:** `Access-Control-Allow-Origin: *` on GET, POST and the OPTIONS preflight. The browser calls it directly; no Worker proxy needed.
- **getSamples** with a multipoint in `wkid 4326`, `returnFirstValueOnly=true`, `interpolation=RSP_BilinearInterpolation`, posted as a form (a simple request). Each sample has `locationId` (the point's index), `value` as a string ("13.050188065"), `rasterId` and `resolution: 5`. Bilinear works: the nearest-neighbour value at the council offices was 13.128, bilinear 13.050.
- **NoData:** a point at sea gets no sample at all (4 samples for 5 points, `locationId` 4 missing). The app also treats non-numbers and values outside −100 to 2300 m as no level.
- **Limit:** at most **1000 samples a request** (`maxRecordCount` 1000: 1024, 1600 and 2500 points each came back with 1000). The app sends batches of 1000.
- **Slow:** every request took **24 to 26 s**, and one 74 s, whatever its size (5, 100 or 1000 points); two of five-point requests passed a 30 s timeout on the second run. The app sends up to three batches at once, waits up to 120 s for each, and says the state's service can take a minute.
- Values seen (public places): council offices, 41 Burelli St, 13.05 m; Crown St mall 15.61 m; foot of Mount Keira 52.12 m; Mount Keira lookout 241.54 m. Recorded in `src/map/__tests__/replies.ts`.
- `identify` also answers (one point, with the catalogue item: `Wollongong-DEM-AHD_56_5m`, Category 1).

## Looked at and not used

| Service | Why not |
| --- | --- |
| Geoscience Australia, national 5 m DEM from LiDAR, `services.ga.gov.au/gis/rest/services/DEM_LiDAR_5m_2025/MapServer` | CC BY 4.0, ±0.30 m (95%) LiDAR ([eCat record](https://ecat.ga.gov.au/geonetwork/srv/api/records/22be4b55-2467-4320-e053-10a3070a5236), **read**), but only where LiDAR was flown (coastal towns and floodplains), a MapServer with no ImageServer (no `getSamples`: one point per `identify`, so thousands of requests a lot), and the REST directory answered GitHub's runners with a CloudFront "Request blocked" 403. The WCS (`/gis/services/.../WCSServer`) answered GetCapabilities with CORS, so a WCS GetCoverage of the lot's box (one request, a GeoTIFF) is the way to try it later. |
| ELVIS ([elevation.fsdf.org.au](https://elevation.fsdf.org.au/)): the NSW 1 m and 2 m LiDAR DEMs and point clouds | Download only (zipped 2 km tiles, by email or S3 link). Not something to fetch in a browser for one lot. |
| NSW 1 m / 2 m elevation on `portal.spatial.nsw.gov.au` | The ImageServers there need a token (499 "Token Required"). |
| NSW Elevation and Depth Theme (`portal.spatial.nsw.gov.au/.../NSW_Elevation_and_Depth_Theme/MapServer`) | Contours, spot heights and relative heights as features: 2 m contours at best, too coarse for a block. |
| NSW `Hosted/Elevation_Index_Public` | An index of where elevation data exists. Could later say whether a lot has LiDAR. |

## What the app does with it

- **The grid** (`gridOverLot`): points every half pixel (2.5 m), never closer than 1 m, over the lot and 5 m past it, spread further on a big lot so there are never more than 3000 (three requests).
- **The block** (`demSurvey`): a small DXF like a CSV of spot levels (`STATE_DEM_LEVELS`), the cadastre lot as the boundary (`STATE_DEM_BOUNDARY`), and contours traced through the levels every 0.5 m (1 m where the ground falls more than 15 m) on `STATE_DEM_CONTOURS`, so the plan has contours as it would from a surveyor. Gaps (NoData) are left out; a lot with no levels, or levels for less than half of it, is refused with a plain message.
- **Where it came from** (`survey.dem`): the service, what the model is made from, the date read, the spacing, the pixel size, the stated accuracy and the attribution. The survey is written in a local frame (near 1000, 1000), so it never carries the block's position; that goes in the map record, which share links never carry.
- **Labels:** a chip on the plan and 3D ("Rough ground · state elevation data, about ±0.9 m"), a note in Site › Block, and a line beside cut and fill, retaining walls, the house's ground levels, the driveway and the checks ("From state elevation data (about ±0.9 m): get a survey before relying on these"). The accuracy page and the privacy page say what it is and what is sent.

## Privacy

Reading the levels sends points over the lot (as longitude and latitude) to the NSW Spatial Services server. It's the same kind of request the map placement already makes, and nothing is sent until someone asks for the levels.
