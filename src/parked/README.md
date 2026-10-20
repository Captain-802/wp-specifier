# Parked code — switched off, kept for later

Everything in this folder is finished-but-unreleased work: base plate design,
production drawings, DXF export, the cavity-wall assembly page, the folded
L-section and tie prototypes, and print calibration. It is **not** loaded by
the calculator and **not** inlined into `Windpost-Selector-Full.html`, so the
single-file copy carries none of it.

The release ships windpost selection and tie selection only.

## Why it is here and not deleted

The engines are tested and correct; what is missing is the detailing
information needed to release them. Parking keeps them out of the shipped file
without losing the work, and the suites under `parked/tests/` still run.

## What is parked

| | |
|---|---|
| `js/engines/baseplate-*`, `js/engines/simply-[ul]-baseplate-*`, `js/engines/selector/*` | base plate design, checks and routing |
| `js/services/*baseplate*`, `js/services/*orthographic*`, `js/services/drawing-*`, `js/services/cad-layer-standard.js`, `js/services/engineering-canvas-renderer.js` | drawing generation |
| `js/services/dxf-r2000-writer.js`, `js/services/sheet-export-service.js` | DXF and sheet export |
| `js/services/du-slab-face-drawing-service.js`, `js/data/du-slab-face-plates.js` | DU slab-face connection drawings |
| `js/services/cavity-wall-3d-engine.js`, `js/services/windpost-scene-mesh-engine.js`, `js/services/tie-wall-*` | 3D cavity-wall assembly |
| `js/ui/*-page.js` | the parked pages' own UI |
| `cavity-wall-assembly.html`, `l-section-prototype.html`, `print-calibration.html`, `tie-prototype.html` | the parked pages |
| `OPEN-*.cmd`, `RUN-VISUAL-REGRESSION.cmd`, `tools/run-visual-regression.ps1` | their launchers |
| `tests/` | their test suites |

Two engines look like base plate code but **stayed live**, because the weight
figures in the design report need them:
`js/data/standard-base-plate-types.js` and `js/engines/fold-width-engine.js`.

## Running the parked tests

```bash
node parked/tests/baseplate-tests.js
```

Each suite loads `parked/tests/_parked-paths.js` first. The parked engines sit
under `parked/js/` while the ones they share with the Selector stayed in
`js/`; that shim makes a file that is not in one tree fall through to the
other, so no suite has to know which half of the split a file landed in.

Several suites assert the *parked* state — that the Selector does **not** load
a script, or that `js/ui/app.js` no longer carries a method. Each one names
what to restore. When a feature is switched back on, those assertions flip
back.

## Switching a feature back on

1. Move its files back:
   ```bash
   git mv parked/js/engines/baseplate-design-engine.js js/engines/
   ```
   or, for the whole folder, `cp -r parked/js parked/tests . && cp parked/*.html .`
2. Put the `<script>` tags back into `index.html` ahead of `js/ui/app.js`, in
   the order the suites name.
3. Restore the methods in `js/ui/app.js`. They were removed whole in the
   commit that created this folder, so `git show <that commit>^:js/ui/app.js`
   has them intact.
4. Add the page back to `PAGES` in `build-standalone.js` if it is a page.
5. Flip the parked assertions back and run every suite.

---

# Reference: the parked features as built

Kept from the main README so the detail is not lost while the work is parked.

## L-post cavity-wall assembly

- The L long leg is embedded `90 mm` into the inner leaf.
- One `10 × 50 mm` R5 slot on each leg at every tie level.
- The first paired inner shear tie and outer EDC tie is `225 mm` above the
  base plate; further pairs repeat at `225 mm c/c`.
- The two-way shear tie is `168 × 10 × 1.5 mm`, projects `84 mm` each side and
  has four `6 × 10 mm` R3 holes.
- Inner masonry `440 × 100 × 215 mm` blocks, outer `215 × 102.5 × 65 mm`
  bricks, both with `10 mm` mortar joints.
- The embedded post leg occupies a real central blockwork joint; the masonry
  solids do not overlap the steel.
- The outer tie is selected by the same EDC engine as the selector, and its
  drawn end reaches the calculated outer-leaf embedment.
- Orbit, zoom and layer switches; the four technical views download as SVG.

## Simply-supported U-post standard base plate

A fixed-standard engine: no cantilever analysis or sizing.

- Plate `150 mm` wide, `6 mm` thick.
- Two RGM 12 anchors in `14 mm` holes on one longitudinal row.
- Anchor line `90 mm` from the concrete edge; the plate ends `125 mm` from it,
  giving a `35 mm` longitudinal end distance.
- Across the width the anchors are `90 mm c/c`, giving `30 mm` edge distances
  both sides. The minimum permitted is `25 mm`, so it passes.
- Left of the concrete edge the generated length is
  `6 mm clearance + U-post depth + 6 mm fabrication projection`.
- The U-post is centred across the plate, opens downward in plan and uses its
  actual thickness and bend radius. Plan and side views, no stiffener.

## Simply-supported L-post standard base plate

A fixed-standard engine: no analysis, moment design or stiffener.

- The long leg is embedded `90 mm` into the inner leaf and its centreline is
  aligned with the plate-width centreline.
- The left plate portion is
  `6 mm fabrication projection + (L-post depth − 90 mm)`.
- A `70 mm` short leg uses a `150 mm` plate (`30 mm` transverse edge
  distances); an `80 mm` short leg uses the confirmed `160 mm` plate (`35 mm`).
- Plate thickness, right portion and anchors match the U standard: `6 mm`
  plate, anchor line at `90 mm`, plate end at `125 mm`, two RGM 12 anchors in
  `14 mm` holes at `90 mm c/c`. Every catalogue arrangement passes.

## Cantilever base plates

For a cantilever U or L post the standard plate type for the base moment is
verified by the full check set and adopted, with the stiffener raised where
the check needs it; beyond the standard range the plate is auto-sized to the
same practice. Base plate type `U-A..U-G` / `L-A..L-G` by base moment
(`W·H` for a top point load, `W·H/2` for a UDL); plate and stiffener weight
varies with the section depth; beyond `G` is a special design.

## Base plate drawing conventions

These apply to cantilever L, cantilever U, simply-supported U and
simply-supported L drawings:

- Dimension objects contain numbers only; words such as `design`, `overall`,
  `left portion`, `right portion`, `flange`, `c/c` and `overhang` are not
  appended to dimension values.
- The base plate annotation states the complete `length × width × thickness`
  and identifies the plate.
- Hole information uses one two-line `14 mm dia hole / to suit RGM 12` callout
  whose leader terminates at the centre of a hole.
- Redundant row/column and projected-anchor notes are not drawn.
- Plan section arrows and `A` labels are omitted; side-view titles do not use
  an `A–A` suffix.
- Every side view terminates the windpost with one centred continuation-break
  symbol; repeated saw-tooth cuts and separate U-flange breaks are not used.
- Standard edge-check text belongs in the application result, not on the
  fabrication drawing.

## Connections and bolts

Still computed by the live `connection-selection-engine` (the design report
needs its weights), but the fixing and bolt schedule is not shown:

- The connection library, cantilever plate types, anchor capacities and bolt
  quantities are generated from `WINDPOST_CALCULATOR_V2.xlsx` into
  `js/data/connections-database.js` (see `ENGINE-RESPONSIBILITIES.txt`).
- Simply supported: head/base fixing → connection code, post bolt, bolt SKU
  per family (Stainless, RGM, FAZ II, FAZ II PLUS). Load-dependent anchors use
  `final capacity / 2 ≤ 2 × anchor capacity` (tension or shear).
- Cantilever U/L: no head connection.
- Post weight = blank width × thickness × length × `8185.9 kg/m³`.
- FAZ II M16 / FAZ II Plus M16 shear = M12 values, pending the datasheet.
- The bolt-quantity matrix inherited from the workbook has no `KM12/100` count
  under `U-B1A` / `U-B1B` (0); `L-B1` has 2. A data gap for the owner to fill.
