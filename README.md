# WP Specifier

Windpost selection and tie schedule for cavity-wall masonry support, by
[CED Engineers](https://www.cedengineers.com).

Live:
- **https://ced-windpost-specifier.vercel.app** — embedded on the CED Google Site
- https://captain-802.github.io/wp-specifier/ — same build on GitHub Pages

---

## Use it on another computer: one file, nothing to install

**[`index.html`](index.html)** is the whole application in a single file —
345 KB, no server, no build step, no internet. Open it and it works.

**To copy it:**

1. Open the raw file:
   **https://raw.githubusercontent.com/Captain-802/wp-specifier/main/index.html**
2. `Ctrl+A`, `Ctrl+C`
3. On the other machine: paste into Notepad, save as `Windpost.html`
   (in Notepad set *Save as type* to **All Files**, or it becomes `.html.txt`)
4. Double-click it

Or skip the copying: on that raw page use `Ctrl+S` to save it straight to disk,
or download the repository as a ZIP from the green **Code** button and take
`index.html` out of it.

It runs entirely in the browser, so it works offline, on a locked-down machine,
from a USB stick or a network drive. Nothing is uploaded anywhere.

---

## What it does

Pick a windpost and its ties:

- **Post families** — U, L, DU (two channels welded web to web) and I (flat
  plate in the inner leaf). DU and I are simply supported only.
- **Three ways to design** — enter the required ULS load and let it choose the
  first section that carries it; calculate a catalogue section you choose; or
  enter a **custom section** by its geometry (a, b, t and the inner fold
  radius) and have the properties worked out.
- **Exact heights** — any project height, no table rounding.
- **Wall build-up** — inner leaf, cavity and outer leaf verify the post fits
  and select the outer-leaf tie.
- **Ties** — inner-leaf tie by family (`EDC25-U tie` for U/DU, shear tie for
  L/I) and the shortest outer tie that reaches without burying itself past the
  back of the outer leaf. The `EDC25-U tie` is one product that can serve
  either leaf, so the tie table lists it once, under **Either leaf**.
- **Output** — section, final ULS capacity, governing check, utilisation, the
  next suitable sections, the tie schedule, post weights and a printable
  calculation record.

Detailing, base-plate design, bolts and connection details are not in this
release, and none of that code is in the file: it is parked in the working
repository until those details are settled.

## Editable design data

Step 6 opens the workbook's editable figures in the page:

- **Design constants** — allowable stress, E, secant fy and exponent, tie
  spacings, the 10 mm deflection cap, and the wall geometry: clear gap to the
  inner leaf, L-post embedment, minimum gap to the outer leaf (**15 mm**),
  minimum outer embedment, the tie slot lengths and the `EDC25-U tie`'s length
  and embedment. The U tie's length is this one figure: edit it here or in the
  tie table, it is the same value.
- **Ties** — a capacity for every tie, and the outer tie sizes themselves can
  be added, removed or re-measured. Actual length drives selection.

A tie level is as strong as its weaker tie, except a DU, which carries two
inner and two outer ties and adds them. The minimum outer tie embedment is
50 mm, so the `EDC25-U tie` serves the outer leaf where the clear gap is
15.23 mm or less and the EDC that would reach is too long for the leaf. Edits are highlighted, kept in the
browser, saved inside the project JSON and printed on the calculation record;
*Reset* returns to the catalogue.

## Repository

| Path | What it is |
|---|---|
| `index.html` | The application — one self-contained file. This is what the site serves and what you copy. |
| `src/` | Modular source: engines, section data, tests |
| `dist/` | The same build under its original name |
| `site-build/` | Build and deploy for Vercel and GitHub Pages |

## Working on it

    cd src
    node tests/run-tests.js      # 484 checks
    node build-standalone.js     # rebuild index.html

`src/js/engines/` holds one engine per file, each an IIFE registering on
`window.Windpost`. Edit `src/`, run the tests, rebuild, then copy
`src/Windpost-Selector-Full.html` to `index.html`.

The switched-off work — base plates, production drawings, DXF export and the
3D cavity-wall assembly — sits under `src/parked/`. Nothing loads it and
nothing builds it into `index.html`; `src/parked/README.md` says how to switch
a feature back on.

Publish to both hosts with one command:

    pwsh site-build/deploy.ps1

It builds the obfuscated page, deploys it to Vercel and commits it to the
`gh-pages` branch, so the two hosts cannot drift. `-NoVercel` / `-NoPages`
publish to one only.

## Notes

The final design value is rounded **down** to 2 dp, so a displayed figure is
never more capacity than the post has.

Design output is subject to the engineer's own checking. Published section and
tie data belongs to the respective manufacturers.
