# Central Coast Council

First pass, checked 9 November 2026. Marks (**read**, **secondary**, **unverified**) mean the same as in [../compliance-and-swept-path-sources.md](../compliance-and-swept-path-sources.md). Section numbers are the DCP's or LEP's own. Every value below was read from the council's or NSW legislation's own PDF through the research session's web reader, which quotes the text; nothing was filled in from memory. Nothing here is legal advice; confirm with council before relying on it.

The app's table is [src/checks/councils/centralCoast.ts](../../../src/checks/councils/centralCoast.ts).

## Instruments

| Instrument | Where | Version read | Notes |
| --- | --- | --- | --- |
| Central Coast Local Environmental Plan 2022 | [PDF as made](https://legislation.nsw.gov.au/view/pdf/asmade/epi-2022-308) | As made: "Published LW 24 June 2022 (2022 No 308)", commenced 1 Aug 2022 (cl 1.1AA) (**read**: cl 4.3, 4.3A in part, 4.4, 4.4A, 4.4B, 4.5(3)(a)) | The consolidated versions (for example [26 Sep 2025](https://legislation.nsw.gov.au/view/whole/pdf/inforce/2025-09-26/epi-2022-0308)) failed to open for the research session, so later amendments weren't read. The clauses the app uses send height and FSR to the maps. |
| Central Coast Development Control Plan 2022 | [DCP 2022 page](https://cdn.centralcoast.nsw.gov.au/plan-and-build/planning-controls/central-coast-development-control-plan-2022) ("Last updated: 18/02/2026") | Chapters below (**read**) | [Chapter 1.0 Preliminary](https://www.centralcoast.nsw.gov.au/sites/default/files/2025-05/1.0-preliminary-9.5.2025.pdf) says "Effective: 9 May 2025" and "Amended as per Council Resolution on: 28 May 2024". Its schedule of amendments wasn't in the text read, so which amendment last changed Chapter 2.1 isn't known. |

### DCP chapters that apply to a new house on a sloping lot

| Chapter | Date | When it matters |
| --- | --- | --- |
| [2.1 Dwelling Houses, Secondary Dwellings and Ancillary Development](https://www.centralcoast.nsw.gov.au/sites/default/files/2025-05/2.1-dwelling-houses-secondary-dwellings-and-ancillary-development.pdf) | Council's copy of May 2025 (the PDF itself shows no date) | Always: the dwelling house controls |
| [3.7 Geotechnical Requirements](https://cdn.centralcoast.nsw.gov.au/sites/default/files/Plan_and_build/DCP2022/3.7_Geotechnical_Requirements.pdf) | none shown | **Sloping land**: landslip hazard |
| 3.2 Coastal Management | not read | Coastal hazard areas (2.1.3.1(3) points to it) |
| 3.5 Tree and Vegetation Management | not read | Trees |

The DCP page lists no earthworks or erosion and sediment control chapter (**read**).

## Battle-axe lots

Chapter 2.1 says only that parking on a battle-axe lot should let cars enter and leave forwards (2.1.5(d), **read**). It has no front setback of its own for a battle-axe lot, and doesn't mention hatchet lots, so the app doesn't check the front setback on a battle-axe lot and asks you to check with council which boundary it treats as the front. The Housing Code's battle-axe rules are state-wide (see [wollongong.md](wollongong.md#battle-axe-lots)).

## LEP rules (as made)

All **read** from the as-made PDF.

### Part 4: development standards

| Clause | Rule | Mark |
| --- | --- | --- |
| 4.3(2) | "The height of a building on any land is not to exceed the maximum height shown for the land on the Height of Buildings Map." | read |
| 4.3A | Exceptions for The Entrance, Wyong Local Centre and Kanwal Enterprise Zone (not a house rule). | read in part |
| 4.4(2), (2A) | FSR must not exceed the Floor Space Ratio Map; a heritage item's area is left out of the GFA. | read |
| 4.4A | 0.1:1 bonus for affordable housing; Kanwal 2:1; Areas 1 and 2 for flats and multi dwelling housing (not a house rule). | read |
| 4.4B | Bonuses in town and village centres (not a house rule). | read |
| 4.5(3)(a) | For one lot, the site area is "the area of that lot". | read |

The zone tables, Part 5 and the local provisions weren't read.

## DCP Chapter 2.1: dwelling houses

All **read** from council's May 2025 copy. The residential setbacks (2.1.3.1) apply in zones **R1, R2, R3 and RU5**; large-lot setbacks (2.1.3.2) in RU1, RU2, RU6, C2, C3, C4 and R5. The app's table covers the residential zones.

### Height and form

| Section | Rule | Mark |
| --- | --- | --- |
| 2.1.2.1(1) | "The maximum building height for dwellings in areas not specifically mapped by the Central Coast LEP 2022 is **10m**." Measured from existing ground, before excavation or fill. | read |
| 2.1.2.1(1) | "Building Height shall **generally not exceed two storeys**." Three storeys generally only on steep sites, for a small part of the house, or where the lowest storey is mostly a basement. Basements, garages included, count as storeys. | read |
| 2.1.2.1 | Outbuildings: 4.8 m in R1, R2, R3 and RU5. No wall height limit. | read |

### Setbacks

| Section | Rule | Mark |
| --- | --- | --- |
| 2.1.3.1(7) a(i) | Front, local road, site over 300 m²: the average of the nearest 2 dwelling houses with the same primary road boundary within 40 m; if there aren't 2, **4.5 m**. | read |
| 2.1.3.1(7) a(iii) | Front, local road, site up to 300 m²: **3.0 m**. | read |
| 2.1.3.1(7) | Classified road: **7.5 m**. | read |
| 2.1.3.1(7) a(iv) | Garages and carports: "A minimum of **1m behind the front boundary setback**". | read |
| 2.1.3.1 | Secondary frontage (corner lots): 2 m. | read |
| 2.1.3.1(2) c(i) | Side, lots over 12.5 m wide at the building line: **0.9 m** up to 4.5 m high; above 4.5 m, 0.9 m plus **one-quarter of the height above 4.5 m**. | read |
| 2.1.3.1(2) | Lots up to 12.5 m wide: zero to one side for up to 10 m; under 8 m wide: zero for 20 m or half the depth. | read |
| 2.1.3.1(3) b(i) | Rear, private lot: **3 m** for parts up to 4.5 m high, **6 m** for parts over 4.5 m; single-storey parts may come to 0.9 m for up to half the rear boundary's length. | read |
| 2.1.3.1(3) b(ii) | Rear to a parallel road or public reserve: 3.0 m. | read |

The app measures side and rear setbacks against the house's tallest point, so a lower wall may need less than it says.

### Site coverage, landscaping, open space

| Section | Rule | Mark |
| --- | --- | --- |
| 2.1.2.2 | Site coverage: **60%** under 450 m²; **50%** from 450 to under 900 m²; **40%** from 900 to under 1,500 m²; **30%** at 1,500 m² or more. Basements, eaves, unenclosed balconies, decks and pergolas, and pools aren't counted. | read |
| — | **No landscaped area figure**: only an objective to provide "an appropriate area on site for landscaping". | read |
| 2.1.4 (subsection not noted) | Private open space **24 m²** (16 m² on lots under 10 m wide at the building line), at least **3 m** wide, off a living room, behind the building line, generally level. | read |

### Sun and privacy

| Section | Rule | Mark |
| --- | --- | --- |
| 2.1.4.4 | Half of the required private open space gets at least **3 hours** of sun between 9 am and 3 pm on 21 June. | read |

Privacy controls weren't read.

### Cut and fill, retaining walls

| Section | Rule | Mark |
| --- | --- | --- |
| 2.1.6.1 | Excavation no deeper than **1 m** within 1 m of any boundary, or **3 m** more than 1 m from any boundary. | read |
| 2.1.6.1 | Fill for a dwelling no more than **1 m** above existing ground. No fill retaining wall within 1 m of a side or rear boundary unless within 1.5 m of the house's wall. | read |
| 2.1.6.2 | Retaining walls more than **600 mm** above or below existing ground **within 1 m of any boundary**, or more than **1 m** elsewhere, "must be designed by a professional engineer". | read |
| 2.1.6.2 b | Unsupported embankments: no steeper than the BCA allows for the soil, generally no more than 3 m from the house, toe at least 1 m from side and rear boundaries. | read |

Chapter 2.1 sets no batter slope of its own (the BCA's, by soil type). The app reads the retaining wall rule as when an engineer is needed (a warning), not as a height limit.

From [Chapter 3.7 Geotechnical Requirements](https://cdn.centralcoast.nsw.gov.au/sites/default/files/Plan_and_build/DCP2022/3.7_Geotechnical_Requirements.pdf) (**read**):

| Section | Rule | Mark |
| --- | --- | --- |
| 3.7.1.2.1(a) | Council considers slip potential from its own historic information and Tables M1 and M2 (landslip matrices). | read |
| 3.7.1.2.2(a) to (c) | What a geotechnical report must cover rises with the lot's **Hazard Category** (2 or above, 3 or above, 4). | read |
| — | **No slope, cut or fill trigger** for a house. | read |

The tables' contents weren't in the text read. For the checker, 3.7 is a question for council (the lot's hazard category), not a calculation.

### Parking, garages and driveways

| Section | Rule | Mark |
| --- | --- | --- |
| 2.1.5 (subsection not noted) | 1 space for 3 bedrooms or fewer, 2 for 4 or more; behind the road setbacks; open hardstand 2.6 × 5.4 m. | read |
| 2.1.5 (subsection not noted) | Driveway at most **4 m** wide at the crossover. | read |
| 2.1.5 (subsection not noted) | Garage doors within 7.5 m of the road: **6 m** on lots 12 m wide or less at the building line; otherwise the greater of 6 m or 60% of the building's width. | read |

### Fences and pools

Not read.

### Trees

Chapter 3.5 Tree and Vegetation Management wasn't read, so the app has no tree checks for Central Coast.

## Housing Code (CDC) or Central Coast DCP (DA)?

The Housing Code column is state-wide (see [wollongong.md](wollongong.md#housing-code-cdc-or-wollongong-dcp-da)).

| Control | Housing Code (CDC) | Central Coast DCP 2022 (DA) |
| --- | --- | --- |
| Height | 8.5 m, 2 storeys | LEP map, else 10 m; generally 2 storeys |
| Front setback | Average of the two nearest houses within 40 m, else 4.5 m (lot size bands) | The same on a local road over 300 m²; 3 m up to 300 m²; 7.5 m to a classified road |
| Side setback | By lot width, plus a quarter of the height over 4.5 m | 0.9 m plus a quarter of the height over 4.5 m (lots over 12.5 m wide) |
| Rear setback | 3 m up to 4.5 m high, more above | 3 m, 6 m over 4.5 m high |
| Site coverage | None | 60 / 50 / 40 / 30% by lot size |
| Landscaped area | By lot size | None |
| Cut and fill | By distance to the boundary; fill 1 m | Cut 1 m near a boundary, 3 m elsewhere; fill 1 m |

## Gaps for Central Coast

1. The **current LEP** (consolidated versions after 1 Aug 2022) and the zone tables.
2. The **LEP map values** for the lot, and the lot's **landslip hazard category** under Chapter 3.7 (council's records).
3. **Trees** (Chapter 3.5) and **erosion and sediment control** (no chapter found).
4. Which amendment last changed Chapter 2.1, and the date of council's May 2025 copy.
5. The narrow-lot side setbacks, the single-storey rear concession, and the large-lot setbacks (not in the app's table).
6. Privacy, fences and pools.
