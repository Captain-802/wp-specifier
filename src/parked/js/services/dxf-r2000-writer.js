(function initialiseDxfR2000Writer(global) {
  "use strict";

  // AutoCAD 2000 (AC1015) ASCII DXF writer for the flattened A4 sheet.
  //
  // Written the way the office detailer's ezdxf documents are laid out:
  // HEADER, CLASSES, the nine symbol tables (with handles and owners), the
  // *Model_Space / *Paper_Space blocks, the entities, and the OBJECTS section
  // with the root dictionary, layouts, plot-style placeholder and the
  // Standard multiline style. That structure is what lets the file carry
  // per-layer LINEWEIGHTS (code 370), LWPOLYLINE outlines, HATCH fills and a
  // named dimension style — none of which R12 can hold — and it is the
  // structure AutoCAD opens without repair prompts.
  //
  // Sheet items come from sheet-export-service.flatten(): millimetres on an
  // A4 sheet, y down. The DXF is y up, millimetres ($INSUNITS 4).
  const windpost = global.Windpost = global.Windpost || {};

  // DXF TEXT height is cap height; SVG font-size is the em box.
  const CAP_RATIO = 0.72;

  // The typographic characters the sheet uses are folded to plain ASCII or to
  // DXF's own control codes (%%c = Ø, %%d = °, %%p = ±).
  const TEXT_FOLD = [
    [/[×✕]/g, "x"], [/[—–]/g, "-"], [/·/g, "-"],
    [/Ø/g, "%%c"], [/°/g, "%%d"], [/±/g, "%%p"],
    [/[“”]/g, '"'], [/[‘’]/g, "'"]
  ];

  function foldText(text) {
    let out = String(text);
    TEXT_FOLD.forEach(([pattern, replacement]) => {
      out = out.replace(pattern, replacement);
    });
    return out.replace(/[^\x20-\x7E]/g, "");
  }

  class Writer {
    constructor() {
      this.lines = [];
      this.handle = 0x20;
    }

    pair(code, value) {
      this.lines.push(String(code));
      this.lines.push(String(value));
    }

    next() {
      this.handle += 1;
      return this.handle.toString(16).toUpperCase();
    }

    text() {
      return this.lines.join("\r\n") + "\r\n";
    }
  }

  const n = value => {
    const number = Number(value);
    return (Number.isFinite(number) ? number : 0).toFixed(4);
  };

  // Hatch pattern definition lines for ANSI31 at a given spacing: one family
  // of lines at `angle` degrees, offset perpendicular to the lines by the
  // spacing. ANSI31 itself is 45 degree lines 3.175 mm apart, so the entity's
  // rotation (52) and scale (41) are written relative to that base: AutoCAD
  // regenerates exactly the stored lines when the hatch is edited.
  const ANSI31_BASE_ANGLE = 45;
  const ANSI31_BASE_SPACING = 3.175;
  function ansi31(spacing, angle) {
    const rad = (angle - 90) * Math.PI / 180;
    return [{ angle, base: [0, 0], offset: [spacing * Math.cos(rad), spacing * Math.sin(rad)], dashes: [] }];
  }

  // sheet: { width_mm, height_mm, items } from flatten(); standard: cadLayers
  function write(sheet, standard) {
    const w = new Writer();
    const flipY = y => sheet.height_mm - y;
    const layers = standard.LAYER_TABLE;
    const linetypes = standard.LINETYPES;
    const textStyles = standard.TEXT_STYLES;
    const dim = standard.DIMSTYLE;
    const hatch = standard.HATCH;
    const layerName = role => standard.layerFor(role).name;

    // handles that are referenced before they are written
    const h = {
      modelRecord: w.next(), paperRecord: w.next(), obliqueRecord: w.next(),
      rootDict: w.next(), groupDict: w.next(), plotDict: w.next(), placeholder: w.next(),
      mlineDict: w.next(), mlineStyle: w.next(), layoutDict: w.next(),
      modelLayout: w.next(), paperLayout: w.next(),
      standardStyle: w.next()
    };

    standard.penTableLines().forEach(line => w.pair(999, line));

    // ---- HEADER ---------------------------------------------------------
    w.pair(0, "SECTION"); w.pair(2, "HEADER");
    const header = (name, code, value) => { w.pair(9, name); w.pair(code, value); };
    header("$ACADVER", 1, "AC1015");
    header("$DWGCODEPAGE", 3, "ANSI_1252");
    w.pair(9, "$INSBASE"); w.pair(10, "0.0"); w.pair(20, "0.0"); w.pair(30, "0.0");
    w.pair(9, "$EXTMIN"); w.pair(10, "0.0"); w.pair(20, "0.0"); w.pair(30, "0.0");
    w.pair(9, "$EXTMAX"); w.pair(10, n(sheet.width_mm)); w.pair(20, n(sheet.height_mm)); w.pair(30, "0.0");
    w.pair(9, "$LIMMIN"); w.pair(10, "0.0"); w.pair(20, "0.0");
    w.pair(9, "$LIMMAX"); w.pair(10, n(sheet.width_mm)); w.pair(20, n(sheet.height_mm));
    header("$ORTHOMODE", 70, 0);
    header("$LTSCALE", 40, "1.0");
    header("$TEXTSIZE", 40, n(dim.dimtxt));
    header("$TEXTSTYLE", 7, dim.textStyle);
    header("$CLAYER", 8, "0");
    header("$CELTYPE", 6, "ByLayer");
    header("$CECOLOR", 62, 256);
    header("$CELTSCALE", 40, "1.0");
    header("$LUNITS", 70, 2);
    header("$LUPREC", 70, 1);
    header("$AUNITS", 70, 0);
    header("$AUPREC", 70, 2);
    header("$DIMSTYLE", 2, dim.name);
    header("$DIMSCALE", 40, "1.0");
    header("$DIMASZ", 40, n(dim.dimasz));
    header("$DIMEXO", 40, n(dim.dimexo));
    header("$DIMEXE", 40, n(dim.dimexe));
    header("$DIMTXT", 40, n(dim.dimtxt));
    header("$DIMGAP", 40, n(dim.dimgap));
    header("$DIMTAD", 70, dim.dimtad);
    header("$DIMTIH", 70, dim.dimtih);
    header("$DIMTOH", 70, dim.dimtoh);
    header("$DIMBLK", 1, dim.arrow);
    header("$DIMCLRD", 70, dim.dimclrd);
    header("$DIMCLRE", 70, dim.dimclre);
    header("$DIMCLRT", 70, dim.dimclrt);
    header("$DIMDEC", 70, dim.dimdec);
    header("$DIMLUNIT", 70, dim.dimlunit);
    header("$DIMLFAC", 40, "1.0");
    header("$DIMTXSTY", 7, dim.textStyle);
    header("$CMLSTYLE", 2, "Standard");
    header("$MEASUREMENT", 70, 1);
    header("$INSUNITS", 70, 4);
    header("$PSLTSCALE", 70, 1);
    header("$TILEMODE", 70, 1);
    header("$PDMODE", 70, 0);
    header("$PDSIZE", 40, "0.0");
    header("$CELWEIGHT", 370, -1);
    header("$LWDISPLAY", 290, 1);
    const handseedAt = w.lines.length;
    w.pair(9, "$HANDSEED"); w.pair(5, "FFFF");        // patched at the end
    w.pair(0, "ENDSEC");

    // ---- CLASSES ----------------------------------------------------------
    w.pair(0, "SECTION"); w.pair(2, "CLASSES"); w.pair(0, "ENDSEC");

    // ---- TABLES -----------------------------------------------------------
    w.pair(0, "SECTION"); w.pair(2, "TABLES");
    const table = (name, count, extra) => {
      const handle = w.next();
      w.pair(0, "TABLE"); w.pair(2, name); w.pair(5, handle); w.pair(330, "0");
      w.pair(100, "AcDbSymbolTable"); w.pair(70, count);
      if (extra) extra();
      return handle;
    };
    const record = (type, ownerHandle, subclass, handleCode) => {
      const handle = w.next();
      w.pair(0, type); w.pair(handleCode || 5, handle); w.pair(330, ownerHandle);
      w.pair(100, "AcDbSymbolTableRecord"); w.pair(100, subclass);
      return handle;
    };

    // VPORT
    let owner = table("VPORT", 1);
    record("VPORT", owner, "AcDbViewportTableRecord");
    w.pair(2, "*Active"); w.pair(70, 0);
    w.pair(10, "0.0"); w.pair(20, "0.0"); w.pair(11, "1.0"); w.pair(21, "1.0");
    w.pair(12, n(sheet.width_mm / 2)); w.pair(22, n(sheet.height_mm / 2));
    w.pair(13, "0.0"); w.pair(23, "0.0"); w.pair(14, "10.0"); w.pair(24, "10.0");
    w.pair(15, "10.0"); w.pair(25, "10.0");
    w.pair(16, "0.0"); w.pair(26, "0.0"); w.pair(36, "1.0");
    w.pair(17, "0.0"); w.pair(27, "0.0"); w.pair(37, "0.0");
    w.pair(40, n(sheet.height_mm * 1.1)); w.pair(41, n(sheet.width_mm / sheet.height_mm));
    w.pair(42, "50.0"); w.pair(43, "0.0"); w.pair(44, "0.0"); w.pair(50, "0.0"); w.pair(51, "0.0");
    w.pair(71, 0); w.pair(72, 1000); w.pair(73, 1); w.pair(74, 3); w.pair(75, 0); w.pair(76, 1);
    w.pair(77, 0); w.pair(78, 0); w.pair(281, 0); w.pair(65, 1);
    w.pair(110, "0.0"); w.pair(120, "0.0"); w.pair(130, "0.0");
    w.pair(111, "1.0"); w.pair(121, "0.0"); w.pair(131, "0.0");
    w.pair(112, "0.0"); w.pair(122, "1.0"); w.pair(132, "0.0");
    w.pair(79, 0); w.pair(146, "0.0");
    w.pair(0, "ENDTAB");

    // LTYPE
    owner = table("LTYPE", linetypes.length + 2);
    ["ByBlock", "ByLayer"].forEach(name => {
      record("LTYPE", owner, "AcDbLinetypeTableRecord");
      w.pair(2, name); w.pair(70, 0); w.pair(3, ""); w.pair(72, 65); w.pair(73, 0); w.pair(40, "0.0");
    });
    linetypes.forEach(linetype => {
      record("LTYPE", owner, "AcDbLinetypeTableRecord");
      const total = linetype.pattern.reduce((sum, d) => sum + Math.abs(d), 0);
      w.pair(2, linetype.name); w.pair(70, 0); w.pair(3, linetype.description);
      w.pair(72, 65); w.pair(73, linetype.pattern.length); w.pair(40, n(total));
      linetype.pattern.forEach(dash => { w.pair(49, n(dash)); w.pair(74, 0); });
    });
    w.pair(0, "ENDTAB");

    // LAYER — colour, linetype and lineweight on every layer, ByLayer entities
    const layerRecords = layers.filter(layer => layer.name !== "0");
    owner = table("LAYER", layerRecords.length + 1);
    const layerRecord = layer => {
      record("LAYER", owner, "AcDbLayerTableRecord");
      w.pair(2, layer.name); w.pair(70, 0); w.pair(62, layer.aci); w.pair(6, layer.linetype);
      w.pair(370, layer.lineweight); w.pair(390, h.placeholder);
    };
    const layerZero = layers.find(layer => layer.name === "0") ||
      { name: "0", aci: 7, linetype: "Continuous", lineweight: -3 };
    layerRecord(layerZero);
    layerRecords.forEach(layerRecord);
    w.pair(0, "ENDTAB");

    // STYLE
    owner = table("STYLE", textStyles.length);
    textStyles.forEach((style, index) => {
      const handle = w.next();
      if (index === 0) h.standardStyle = handle;
      w.pair(0, "STYLE"); w.pair(5, handle); w.pair(330, owner);
      w.pair(100, "AcDbSymbolTableRecord"); w.pair(100, "AcDbTextStyleTableRecord");
      w.pair(2, style.name); w.pair(70, 0); w.pair(40, "0.0"); w.pair(41, "1.0");
      w.pair(50, "0.0"); w.pair(71, 0); w.pair(42, n(dim.dimtxt)); w.pair(3, style.font); w.pair(4, "");
    });
    w.pair(0, "ENDTAB");

    // VIEW, UCS
    table("VIEW", 0); w.pair(0, "ENDTAB");
    table("UCS", 0); w.pair(0, "ENDTAB");

    // APPID
    owner = table("APPID", 1);
    record("APPID", owner, "AcDbRegAppTableRecord");
    w.pair(2, "ACAD"); w.pair(70, 0);
    w.pair(0, "ENDTAB");

    // DIMSTYLE — Standard plus the firm's SALEEM
    owner = table("DIMSTYLE", 2, () => w.pair(100, "AcDbDimStyleTable"));
    const dimRecord = (name, values) => {
      record("DIMSTYLE", owner, "AcDbDimStyleTableRecord", 105);
      w.pair(2, name); w.pair(70, 0);
      w.pair(40, "1.0");
      w.pair(41, n(values.dimasz)); w.pair(42, n(values.dimexo)); w.pair(44, n(values.dimexe));
      w.pair(140, n(values.dimtxt)); w.pair(147, n(values.dimgap));
      w.pair(73, values.dimtih); w.pair(74, values.dimtoh); w.pair(77, values.dimtad);
      w.pair(176, values.dimclrd); w.pair(177, values.dimclre); w.pair(178, values.dimclrt);
      w.pair(271, values.dimdec); w.pair(277, values.dimlunit); w.pair(144, "1.0");
      w.pair(340, h.standardStyle);
      if (values.arrow) { w.pair(342, h.obliqueRecord); w.pair(343, h.obliqueRecord); w.pair(344, h.obliqueRecord); }
    };
    dimRecord("Standard", { dimasz: 2.5, dimexo: 0.625, dimexe: 1.25, dimtxt: 2.5, dimgap: 0.625,
      dimtih: 0, dimtoh: 0, dimtad: 0, dimclrd: 0, dimclre: 0, dimclrt: 0, dimdec: 2, dimlunit: 2 });
    dimRecord(dim.name, dim);
    w.pair(0, "ENDTAB");

    // BLOCK_RECORD
    owner = table("BLOCK_RECORD", 3);
    const blockRecord = (handle, name, layout) => {
      w.pair(0, "BLOCK_RECORD"); w.pair(5, handle); w.pair(330, owner);
      w.pair(100, "AcDbSymbolTableRecord"); w.pair(100, "AcDbBlockTableRecord");
      w.pair(2, name);
      if (layout) w.pair(340, layout);
    };
    blockRecord(h.modelRecord, "*Model_Space", h.modelLayout);
    blockRecord(h.paperRecord, "*Paper_Space", h.paperLayout);
    blockRecord(h.obliqueRecord, dim.arrow, null);
    w.pair(0, "ENDTAB");
    w.pair(0, "ENDSEC");

    // ---- BLOCKS -----------------------------------------------------------
    w.pair(0, "SECTION"); w.pair(2, "BLOCKS");
    const block = (recordHandle, name, paperSpace, body) => {
      w.pair(0, "BLOCK"); w.pair(5, w.next()); w.pair(330, recordHandle);
      w.pair(100, "AcDbEntity");
      if (paperSpace) w.pair(67, 1);
      w.pair(8, "0"); w.pair(100, "AcDbBlockBegin"); w.pair(2, name); w.pair(70, 0);
      w.pair(10, "0.0"); w.pair(20, "0.0"); w.pair(30, "0.0"); w.pair(3, name); w.pair(1, "");
      if (body) body();
      w.pair(0, "ENDBLK"); w.pair(5, w.next()); w.pair(330, recordHandle);
      w.pair(100, "AcDbEntity");
      if (paperSpace) w.pair(67, 1);
      w.pair(8, "0"); w.pair(100, "AcDbBlockEnd");
    };
    block(h.modelRecord, "*Model_Space", false, null);
    block(h.paperRecord, "*Paper_Space", true, null);
    // the oblique tick: a unit-size 45 degree stroke, colour ByBlock
    block(h.obliqueRecord, dim.arrow, false, () => {
      w.pair(0, "LINE"); w.pair(5, w.next()); w.pair(330, h.obliqueRecord);
      w.pair(100, "AcDbEntity"); w.pair(8, "0"); w.pair(62, 0); w.pair(100, "AcDbLine");
      w.pair(10, "-0.5"); w.pair(20, "-0.5"); w.pair(30, "0.0");
      w.pair(11, "0.5"); w.pair(21, "0.5"); w.pair(31, "0.0");
    });
    w.pair(0, "ENDSEC");

    // ---- ENTITIES ---------------------------------------------------------
    w.pair(0, "SECTION"); w.pair(2, "ENTITIES");
    const entity = (type, layer, subclass, colour) => {
      w.pair(0, type); w.pair(5, w.next()); w.pair(330, h.modelRecord);
      w.pair(100, "AcDbEntity"); w.pair(8, layer);
      if (colour != null) w.pair(62, colour);
      w.pair(100, subclass);
    };
    const lineEntity = (layer, a, b) => {
      entity("LINE", layer, "AcDbLine");
      w.pair(10, n(a[0])); w.pair(20, n(flipY(a[1]))); w.pair(30, "0.0");
      w.pair(11, n(b[0])); w.pair(21, n(flipY(b[1]))); w.pair(31, "0.0");
    };
    const hatchRoles = new Set(hatch.roles);
    const hatchAngle = Number.isFinite(Number(hatch.angle)) ? Number(hatch.angle) : ANSI31_BASE_ANGLE;
    const patternLines = ansi31(hatch.spacing_mm, hatchAngle);
    const hatchRotation = hatchAngle - ANSI31_BASE_ANGLE;
    const hatchScale = hatch.spacing_mm / ANSI31_BASE_SPACING;
    let counts = { line: 0, polyline: 0, circle: 0, text: 0, hatch: 0 };

    sheet.items.forEach(item => {
      const layer = layerName(item.role);
      if (item.kind === "poly") {
        if (!item.stroke || item.points.length < 2) return;
        if (item.points.length === 2 && !item.closed) {
          lineEntity(layer, item.points[0], item.points[1]);
          counts.line += 1;
          return;
        }
        // One LWPOLYLINE per outline: a single object CAD can offset or trim.
        entity("LWPOLYLINE", layer, "AcDbPolyline");
        w.pair(90, item.points.length); w.pair(70, item.closed ? 1 : 0); w.pair(43, "0.0");
        item.points.forEach(([x, y]) => { w.pair(10, n(x)); w.pair(20, n(flipY(y))); });
        counts.polyline += 1;
        // cut steel is hatched ANSI31 inside its outline, as the column sections
        if (item.closed && hatchRoles.has(item.role) && item.points.length >= 3) {
          entity("HATCH", layerName("steelHatch"), "AcDbHatch");
          w.pair(10, "0.0"); w.pair(20, "0.0"); w.pair(30, "0.0");
          w.pair(210, "0.0"); w.pair(220, "0.0"); w.pair(230, "1.0");
          w.pair(2, hatch.pattern); w.pair(70, 0); w.pair(71, 0);
          w.pair(91, 1);
          w.pair(92, 3); w.pair(72, 0); w.pair(73, 1); w.pair(93, item.points.length);
          item.points.forEach(([x, y]) => { w.pair(10, n(x)); w.pair(20, n(flipY(y))); });
          w.pair(97, 0);
          w.pair(75, 0); w.pair(76, 1); w.pair(52, n(hatchRotation)); w.pair(41, n(hatchScale)); w.pair(77, 0);
          w.pair(78, patternLines.length);
          patternLines.forEach(line => {
            w.pair(53, n(line.angle)); w.pair(43, n(line.base[0])); w.pair(44, n(line.base[1]));
            w.pair(45, n(line.offset[0])); w.pair(46, n(line.offset[1])); w.pair(79, line.dashes.length);
            line.dashes.forEach(dash => w.pair(49, n(dash)));
          });
          w.pair(47, "1.0"); w.pair(98, 0);
          counts.hatch += 1;
        }
      } else if (item.kind === "circle") {
        if (!item.stroke || !(item.r > 0)) return;
        entity("CIRCLE", layer, "AcDbCircle");
        w.pair(10, n(item.cx)); w.pair(20, n(flipY(item.cy))); w.pair(30, "0.0"); w.pair(40, n(item.r));
        counts.circle += 1;
      } else if (item.kind === "text") {
        const content = foldText(item.text);
        if (!content) return;
        // dimension text is white (7) on the grey dimension layer, as SALEEM
        entity("TEXT", layer, "AcDbText", item.role === "dim" ? dim.dimclrt : null);
        w.pair(10, n(item.x)); w.pair(20, n(flipY(item.y))); w.pair(30, "0.0");
        w.pair(40, n(item.size * CAP_RATIO)); w.pair(1, content);
        if (Math.abs(item.rotation) > 0.01) w.pair(50, n(item.rotation));
        w.pair(7, dim.textStyle);
        w.pair(100, "AcDbText");
        counts.text += 1;
      }
    });
    w.pair(0, "ENDSEC");

    // ---- OBJECTS ----------------------------------------------------------
    w.pair(0, "SECTION"); w.pair(2, "OBJECTS");
    w.pair(0, "DICTIONARY"); w.pair(5, h.rootDict); w.pair(330, "0");
    w.pair(100, "AcDbDictionary"); w.pair(281, 1);
    w.pair(3, "ACAD_GROUP"); w.pair(350, h.groupDict);
    w.pair(3, "ACAD_LAYOUT"); w.pair(350, h.layoutDict);
    w.pair(3, "ACAD_MLINESTYLE"); w.pair(350, h.mlineDict);
    w.pair(3, "ACAD_PLOTSTYLENAME"); w.pair(350, h.plotDict);

    w.pair(0, "DICTIONARY"); w.pair(5, h.groupDict); w.pair(330, h.rootDict);
    w.pair(100, "AcDbDictionary"); w.pair(281, 1);

    w.pair(0, "ACDBDICTIONARYWDFLT"); w.pair(5, h.plotDict); w.pair(330, h.rootDict);
    w.pair(100, "AcDbDictionary"); w.pair(281, 1); w.pair(3, "Normal"); w.pair(350, h.placeholder);
    w.pair(100, "AcDbDictionaryWithDefault"); w.pair(340, h.placeholder);
    w.pair(0, "ACDBPLACEHOLDER"); w.pair(5, h.placeholder); w.pair(330, h.plotDict);

    w.pair(0, "DICTIONARY"); w.pair(5, h.mlineDict); w.pair(330, h.rootDict);
    w.pair(100, "AcDbDictionary"); w.pair(281, 1); w.pair(3, "Standard"); w.pair(350, h.mlineStyle);
    w.pair(0, "MLINESTYLE"); w.pair(5, h.mlineStyle); w.pair(330, h.mlineDict);
    w.pair(100, "AcDbMlineStyle"); w.pair(2, "Standard"); w.pair(70, 0); w.pair(3, "");
    w.pair(62, 256); w.pair(51, "90.0"); w.pair(52, "90.0"); w.pair(71, 2);
    w.pair(49, "0.5"); w.pair(62, 256); w.pair(6, "BYLAYER");
    w.pair(49, "-0.5"); w.pair(62, 256); w.pair(6, "BYLAYER");

    w.pair(0, "DICTIONARY"); w.pair(5, h.layoutDict); w.pair(330, h.rootDict);
    w.pair(100, "AcDbDictionary"); w.pair(281, 1);
    w.pair(3, "Layout1"); w.pair(350, h.paperLayout);
    w.pair(3, "Model"); w.pair(350, h.modelLayout);
    const layout = (handle, name, tab, blockHandle) => {
      w.pair(0, "LAYOUT"); w.pair(5, handle); w.pair(330, h.layoutDict);
      w.pair(100, "AcDbPlotSettings");
      w.pair(1, ""); w.pair(2, "none_device"); w.pair(4, ""); w.pair(6, "");
      w.pair(40, "0.0"); w.pair(41, "0.0"); w.pair(42, "0.0"); w.pair(43, "0.0");
      w.pair(44, n(sheet.width_mm)); w.pair(45, n(sheet.height_mm)); w.pair(46, "0.0"); w.pair(47, "0.0");
      w.pair(48, "0.0"); w.pair(49, "0.0"); w.pair(140, "0.0"); w.pair(141, "0.0");
      w.pair(142, "1.0"); w.pair(143, "1.0"); w.pair(70, 688); w.pair(72, 0); w.pair(73, 0);
      w.pair(74, 5); w.pair(7, ""); w.pair(75, 16); w.pair(147, "1.0"); w.pair(148, "0.0"); w.pair(149, "0.0");
      w.pair(100, "AcDbLayout"); w.pair(1, name); w.pair(70, 1); w.pair(71, tab);
      w.pair(10, "0.0"); w.pair(20, "0.0"); w.pair(11, n(sheet.width_mm)); w.pair(21, n(sheet.height_mm));
      w.pair(12, "0.0"); w.pair(22, "0.0"); w.pair(32, "0.0");
      w.pair(14, "0.0"); w.pair(24, "0.0"); w.pair(34, "0.0");
      w.pair(15, n(sheet.width_mm)); w.pair(25, n(sheet.height_mm)); w.pair(35, "0.0");
      w.pair(146, "0.0"); w.pair(13, "0.0"); w.pair(23, "0.0"); w.pair(33, "0.0");
      w.pair(16, "1.0"); w.pair(26, "0.0"); w.pair(36, "0.0");
      w.pair(17, "0.0"); w.pair(27, "1.0"); w.pair(37, "0.0");
      w.pair(76, 0); w.pair(330, blockHandle);
    };
    layout(h.modelLayout, "Model", 0, h.modelRecord);
    layout(h.paperLayout, "Layout1", 1, h.paperRecord);
    w.pair(0, "ENDSEC");
    w.pair(0, "EOF");

    // the next free handle, now that every object has one
    w.lines[handseedAt + 3] = (w.handle + 1).toString(16).toUpperCase();
    const text = w.text();
    return { text, counts };
  }

  windpost.dxfR2000Writer = Object.freeze({ write, foldText, ansi31 });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.dxfR2000Writer;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
