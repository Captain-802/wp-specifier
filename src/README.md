# Windpost Select — Automatic Selector

This is a separate standalone application built from copies of the established windpost calculation and section-data engines. It does not modify or replace `Windpost-Calculator-Local` or `WINDPOST DESIGN 17 JULY V.01`.

## Open the application

Double-click:

```text
OPEN-WINDPOST-SELECTOR.cmd
```

or open `Windpost-Selector-Full.html` directly in Chrome or Edge.

The full HTML file contains all styles, section data and calculation scripts. It does not require an internet connection.

## User workflow

1. Choose a U or L windpost.
2. Choose simply supported or cantilever behaviour.
3. Choose total ULS UDL, or a top point load for a cantilever.
4. Enter any exact windpost height.
5. Either enter the required load for automatic selection or choose a catalogue section to calculate its capacity.
6. Enter inner-leaf thickness, cavity width and outer-leaf thickness.
7. Run the selection and view the recommended post, final governing capacity and tie schedule.
8. For a cantilever U or L post, view the automatically designed RGM 12
   baseplate, design checks and downloadable SVG plan/section drawing.
9. For a simply-supported U or L post, view the separate fixed-standard RGM 12
   baseplate and downloadable SVG plan/side-view drawing. These standard
   details perform only the confirmed minimum edge-distance check.
10. For an L-post result in the modular `index.html` application, open the
    separate cavity-wall assembly page. It carries the selected section, wall,
    support condition, height, tie schedule and baseplate into a coordinated
    interactive 3D model plus plan, elevation, side and isometric SVG views.

## L-post cavity-wall assembly

Double-click `OPEN-CAVITY-WALL-ASSEMBLY.cmd` to open the page directly, or use
**Open cavity-wall assembly** from an L-post result in the modular application.

- The L long leg is embedded `90 mm` into the inner leaf.
- One `10 × 50 mm` R5 slot is modelled on each leg at every tie level.
- The first paired inner shear tie and outer EDC tie is `225 mm` above the
  baseplate; further pairs repeat at `225 mm c/c`.
- The two-way shear tie is `168 × 10 × 1.5 mm`, projects `84 mm` each side and
  has four `6 × 10 mm` R3 holes.
- Inner masonry uses `440 × 100 × 215 mm` blocks and outer masonry uses
  `215 × 102.5 × 65 mm` bricks, both with `10 mm` mortar joints.
- The embedded post leg occupies a real central blockwork joint; the masonry
  solids do not overlap the steel.
- The outer tie is selected by the same EDC engine as the main selector, and
  its drawn end reaches the calculated outer-leaf embedment.
- The interactive viewer supports orbit, zoom and layer switches. The four
  technical views can be downloaded as SVG.

The cavity-wall page is a separate multi-file output and is intentionally not
inlined into `Windpost-Selector-Full.html`. The current standalone selector
should be rebuilt only at the agreed final release stage; until then use
`index.html` for the integrated result link or the dedicated launcher above.

## Preserved design defaults

- Allowable stress: `127.27 N/mm²`
- Initial elastic modulus: `200 kN/mm²`
- Secant-model proof strength: `210 N/mm²`
- Ramberg–Osgood exponent: `7`
- U-post tie strength: `1.713 kN/tie`
- L-post tie strength: `2.25 kN/tie`
- First tie spacing: `225 mm`
- Standard tie spacing: `225 mm c/c`
- Parapet free-top tie clearance: `50 mm`
- 10 mm deflection cap: not applied
- Connection capacity cap: not applied

## Tie rules

- U-post inner-leaf tie: `84 mm` actual length with `65.23 mm` embedment into
  the inner leaf; the post is held `6 mm` clear of the inner leaf.
- L-post inner-leaf tie: shear tie.
- Outer-leaf tie: selected from `EDC25-100` to `EDC25-375` in 25 mm increments.
- Minimum outer-leaf embedment used by the selector: `55 mm`.
- Tie geometry from the EDC drawings: actual length = nominal + `8 mm`
  (EDC25-125 is 133 mm overall); the windpost-slot connection consumes the
  `7.6 mm` notch plus the `11.17 mm` tail beyond it (`18.77 mm` total), so the
  length available from the post face is `nominal + 8 − 18.77 = nominal − 10.77`.
- U posts are positioned `6 mm` clear of the inner leaf.
- The same workbook-controlled `6 mm` clearance is used by both wall-tie
  placement and both U-post floating-baseplate drawing engines.
- L posts use the existing `90 mm` inner-leaf embedment placement assumption.

## Tie quantity rules

- Simply supported post with a top connection: `floor((L - 225) / 225)`.
- Cantilever/parapet post with no top connection: `floor((L - 50) / 225)`.
- Tie quantities are whole numbers and are never less than zero.

## Source layout

```text
css/app.css                         presentation
js/data/                            copied U/L catalogue data
js/engines/                         copied design engines plus new selectors
js/engines/baseplate-*.js           shared U/L baseplate sizing and checks
js/services/baseplate-*.js          L-post baseplate drawing services
js/services/u-baseplate-*.js        U-post floating-baseplate drawing services
js/engines/simply-u-baseplate-*     simply-supported U fixed standard/check
js/services/simply-u-baseplate-*    simply-supported U plan/side drawing
js/engines/simply-l-baseplate-*     simply-supported L fixed standard/check
js/services/simply-l-baseplate-*    simply-supported L plan/side drawing
js/services/cavity-wall-*           L-post masonry, tie, drawing and 3D engines
js/services/design-report-service  detailed printable calculation
js/ui/app.js                        guided interface
js/ui/cavity-wall-page.js           separate assembly-page controller
cavity-wall-assembly.html           separate assembly page
css/cavity-wall.css                 assembly-page styling
tests/run-tests.js                  local regression checks
tests/baseplate-tests.js            U/L baseplate geometry and routing checks
tests/cavity-wall-assembly-tests.js assembly geometry and drawing checks
```

## Simply-supported U-post standard baseplate

- This is a separate fixed-standard engine; it does not use cantilever
  baseplate analysis or sizing.
- The plate is `150 mm` wide and `6 mm` thick.
- Two RGM 12 anchors use `14 mm` holes on one longitudinal row.
- The anchor line is `90 mm` from the concrete edge; the plate ends `125 mm`
  from the concrete edge, providing a `35 mm` longitudinal end distance.
- Across the width the anchors are `90 mm c/c`, providing `30 mm` edge
  distances at both sides.
- The minimum permitted edge distance is `25 mm`; the fixed arrangement
  therefore passes with a minimum provided distance of `30 mm`.
- Left of the concrete edge the generated length is
  `6 mm clearance + selected U-post depth + 6 mm fabrication projection`.
- The U-post is centred across the plate, opens downward in plan and uses its
  actual thickness and bend radius.
- The drawing includes plan and side views and no stiffener.

## Simply-supported L-post standard baseplate

- This is a separate fixed-standard engine with no structural baseplate
  analysis, moment design or stiffener.
- The established L placement is retained: the long leg is embedded `90 mm`
  into the inner leaf and its centreline is aligned with the plate-width
  centreline.
- The left plate portion is
  `6 mm fabrication projection + (selected L-post depth − 90 mm)`.
- Sections with a `70 mm` short leg use a `150 mm`-wide plate and provide
  `30 mm` transverse anchor edge distances.
- Sections with an `80 mm` short leg use the confirmed `160 mm`-wide plate and
  provide `35 mm` transverse anchor edge distances.
- Plate thickness, right portion and anchors match the U standard: `6 mm`
  plate, anchor line at `90 mm`, plate end at `125 mm`, two RGM 12 anchors in
  `14 mm` holes at `90 mm c/c`.
- The minimum permitted edge distance is `25 mm`; every catalogue arrangement
  passes.
- The drawing includes plan and side views and no stiffener.

## Baseplate drawing conventions

These drafting rules apply to cantilever L, cantilever U, simply-supported U
and simply-supported L drawings:

- Dimension objects contain numbers only; words such as `design`, `overall`,
  `left portion`, `right portion`, `flange`, `c/c` and `overhang` are not
  appended to dimension values.
- The baseplate annotation states the complete
  `length × width × thickness` and identifies the plate.
- Hole information uses one two-line `14 mm dia hole / to suit RGM 12`
  callout whose leader terminates at the centre of a hole.
- Redundant row/column and projected-anchor notes are not drawn.
- Plan section arrows and `A` labels are omitted; side-view titles do not use
  an `A–A` suffix.
- Every side view terminates the windpost with one centred continuation-break
  symbol; repeated saw-tooth cuts and separate U-flange breaks are not used.
- Standard edge-check text is shown in the application result, not repeated on
  the fabrication drawing.

Rebuild the single-file edition with:

```text
node build-standalone.js
```
