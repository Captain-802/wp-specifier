(function initialiseConnectionSelectionEngine(global) {
  "use strict";

  // Head / base connection, bolt SKU, bolt count and weight selection.
  // Pure engine: inputs in, results object out, no DOM access.
  //
  // Rules reproduce the approved workbook (WINDPOST_CALCULATOR_V2.xlsx):
  //  - simply supported: the fixing description chosen by the user maps to a
  //    connection code; the bolt SKU comes from the chosen bolt family;
  //    load-dependent anchors are picked from the anchor table using
  //    (final ULS capacity / 2) <= 2 x anchor capacity (tension or shear);
  //  - cantilever U / L: no head connection; the base is a standard plate
  //    type chosen by base moment M = W·H (top point load) or W·H/2 (UDL);
  //    plate + stiffener weight varies with the selected section depth;
  //  - weights: post = blank x t x length x density; brackets from the
  //    library; the concrete-top plates (U-B3, L-B2, DU-B3, I-B3) use the
  //    standard plate of the selected section;
  //  - special connections: the entered weight and bolt count replace the
  //    library values.

  const windpost = global.Windpost = global.Windpost || {};
  const DB = windpost.connectionsDatabase || { connections: [], basePlates: [], anchors: [], boltSkus: [] };
  const CONFIG = windpost.config || {};
  const PLATE_DENSITY = CONFIG.PLATE_DENSITY_KG_PER_MM3 ?? 8.185e-6;
  const POST_DENSITY = CONFIG.POST_DENSITY_KG_PER_M3 ?? 80.2984 / 0.00981;
  const TIES_PER_LEVEL = CONFIG.TIES_PER_LEVEL || { U: 1, L: 1, DU: 2, I: 1 };

  const BOLT_FAMILIES = Object.freeze({
    STAINLESS: "Stainless Steel Bolts",
    RGM: "RGM BOLTS",
    FAZ2: "FAZ II BOLTS",
    FAZ2P: "FAZ II PLUS BOLTS"
  });
  const ANCHOR_FAMILY_BY_BOLT_FAMILY = Object.freeze({
    "RGM BOLTS": "RGM",
    "FAZ II BOLTS": "FAZ II",
    "FAZ II PLUS BOLTS": "FAZ II PLUS"
  });
  const NOT_APPLICABLE = "NOT APPLICABLE";
  const CANTILEVER_BASE_AUTO = "Standard plate type selected by base moment";

  const roundUp = (value, decimals) => {
    const factor = Math.pow(10, decimals);
    return Math.ceil(value * factor - 1e-9) / factor;
  };
  const round = (value, decimals) => {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  };

  function boltFamiliesFor(materialClass) {
    return materialClass === "CONCRETE"
      ? [BOLT_FAMILIES.RGM, BOLT_FAMILIES.FAZ2, BOLT_FAMILIES.FAZ2P]
      : [BOLT_FAMILIES.STAINLESS];
  }

  function listFixings(type, supportCondition, position) {
    return DB.connections
      .filter((c) => c.family === type && c.support === supportCondition && c.position === position)
      .map((c) => ({ code: c.code, description: c.description, materialClass: c.materialClass }));
  }

  function findConnection(type, supportCondition, position, description) {
    return DB.connections.find((c) =>
      c.family === type && c.support === supportCondition && c.position === position &&
      c.description === description) || null;
  }

  function findByCode(code) {
    return DB.connections.find((c) => c.code === code) || null;
  }

  // Anchor chosen by load: smallest size whose (2 x capacity) covers
  // capacity / 2, as in the workbook; role = "tens" or "shear".
  function anchorSize_mm(anchor) {
    const match = /(\d+)\s*$/.exec(String(anchor.name || anchor.sku || ""));
    return match ? Number(match[1]) : 0;
  }

  // minimumSize_mm: a detail whose slots suit M12 never gets an M10 anchor.
  function selectAnchor(anchorFamily, role, finalCapacity_kN, minimumSize_mm) {
    const load = Number(finalCapacity_kN) / 2;
    const minimum = Number(minimumSize_mm) || 0;
    const candidates = DB.anchors.filter((a) => a.family === anchorFamily && anchorSize_mm(a) >= minimum);
    if (!candidates.length || !Number.isFinite(load)) return null;
    const key = role === "shear" ? "shear" : "tension";
    const found = candidates.find((a) => load <= 2 * Number(a[key]));
    return found ? found.sku : "N/A - special";
  }

  function boltCount(sku, code, isAnchor) {
    const row = DB.boltSkus.find((r) => r.sku === sku);
    const count = row && row.counts ? Number(row.counts[code]) || 0 : 0;
    if (count > 0) return count;
    return isAnchor ? 2 : 0;
  }

  // Blank (developed) width per the workbook section formulas.
  // Fold (blank) width from the shared engine — the same number the
  // production drawing, the DXF sheet and the Selector show.
  function blankWidth_mm(section) {
    const engine = windpost.foldWidth;
    if (!engine) throw new Error("The fold-width engine must be loaded before the connection engine.");
    return engine.compute(section);
  }

  function postWeight(section, length_mm) {
    const kgPerM = blankWidth_mm(section) * Number(section.t_mm) * 1e-6 * POST_DENSITY;
    return {
      blankWidth_mm: blankWidth_mm(section),
      kgPerMetre: kgPerM,
      weight_kg: roundUp(kgPerM * Number(length_mm) / 1000, 2)
    };
  }

  // Simply-supported standard base plate (205 or 240 x 150 x 6) weight of the
  // selected section, from the connection library (per-section table).
  function standardPlateWeight(section) {
    const plate = section && section.standardBasePlate;
    if (plate && Number.isFinite(plate.weight_kg)) return plate.weight_kg;
    const table = DB.standardPlates || {};
    const value = section && table[section.name];
    return Number.isFinite(value) ? value : 0;
  }

  function basePlateWeight(plate, section) {
    const a = Number(section && section.a_mm) || 0;
    const volume = plate.family === "U"
      ? (plate.plateLen_mm + 6 + 6 + a) * plate.plateThk_mm * plate.plateWid_mm
      : plate.plateWid_mm * plate.plateThk_mm * ((a - 84) + plate.plateLen_mm);
    const plateKg = roundUp(volume * PLATE_DENSITY, 2);
    const l2 = plate.family === "L" ? plate.plateLen_mm - 90 : plate.stiffL2_mm;
    const stiffArea = plate.stiffH1_mm * plate.stiffL1_mm + 0.5 * plate.stiffH2_mm * l2;
    const stiffKg = roundUp(stiffArea * plate.stiffThk_mm * PLATE_DENSITY, 2);
    return { plateKg, stiffKg, totalKg: round(plateKg + stiffKg, 2), volume_mm3: volume, plateLength_mm: plate.family === "U" ? plate.plateLen_mm + 12 + a : (a - 84) + plate.plateLen_mm };
  }

  function selectBasePlateType(type, moment_kNm) {
    const plates = DB.basePlates.filter((p) => p.family === type);
    if (!plates.length) return null;
    const found = plates.find((p) => Number.isFinite(p.capacity_kNm) && moment_kNm <= p.capacity_kNm + 1e-9);
    return found || plates.find((p) => !Number.isFinite(p.capacity_kNm)) || null;
  }

  function connectionWeight(connection, section, plate) {
    if (!connection) return 0;
    if (connection.weightRule === "perSection") return standardPlateWeight(section);
    if (connection.weightRule === "basePlate") return plate ? basePlateWeight(plate, section).totalKg : 0;
    return Number(connection.weight_kg) || 0;
  }

  function resolveBolt(connection, boltFamily, finalCapacity_kN) {
    if (!connection) return { sku: "", isAnchor: false };
    const family = boltFamily || boltFamiliesFor(connection.materialClass)[0];
    const anchorFamily = ANCHOR_FAMILY_BY_BOLT_FAMILY[family];
    if (connection.anchorRole && anchorFamily) {
      return { sku: selectAnchor(anchorFamily, connection.anchorRole, finalCapacity_kN, connection.minimumAnchorSize_mm) || "", isAnchor: true, family };
    }
    const sku = (connection.bolts && connection.bolts[family]) || "";
    return { sku, isAnchor: Boolean(anchorFamily) && sku !== "N/A", family };
  }

  function select(options) {
    const type = options.type;
    const support = options.supportCondition;
    const isCantilever = support === "cantilever";
    const section = options.section || {};
    const W = Number(options.finalCapacity_kN);
    const H = Number(options.length_mm);
    const warnings = [];
    // Notes do not invalidate the result: they flag data the workbook does
    // not carry so a zero is never printed silently.
    const notes = [];
    const noteMissingCount = (bolt, code, count) => {
      if (bolt && bolt.sku && bolt.sku !== "N/A" && !bolt.isAnchor && !(count > 0)) {
        notes.push(`No bolt quantity is listed for ${bolt.sku} under ${code} in the bolt matrix - confirm the number of bolts.`);
      }
    };
    const special = options.special || {};
    const specialHead = special.head && special.head.enabled;
    const specialBase = special.base && special.base.enabled;

    // ---- head ------------------------------------------------------------
    let head = { applicable: !isCantilever, code: "", description: NOT_APPLICABLE, materialClass: "", postBolt: "", boltSku: "", boltFamily: "", boltCount: 0, weight_kg: 0, special: false };
    if (!isCantilever) {
      const connection = findConnection(type, support, "top", options.headFixing);
      if (!connection) warnings.push("Choose a head fixing.");
      else {
        const bolt = resolveBolt(connection, options.headBoltFamily, W);
        head = {
          applicable: true,
          code: connection.code,
          description: connection.description,
          materialClass: connection.materialClass,
          postBolt: connection.postBolt,
          boltSku: bolt.sku,
          boltFamily: bolt.family,
          boltCount: boltCount(bolt.sku, connection.code, bolt.isAnchor),
          weight_kg: connectionWeight(connection, section, null),
          special: false
        };
        noteMissingCount(bolt, connection.code, head.boltCount);
      }
    }
    if (specialHead && !isCantilever) {
      head = {
        ...head,
        special: true,
        boltSku: special.head.sku || head.boltSku,
        boltCount: Number(special.head.bolts) || 0,
        weight_kg: Number(special.head.weight_kg) || 0,
        materialClass: special.head.material || head.materialClass
      };
    }

    // ---- base ------------------------------------------------------------
    let base = { applicable: true, code: "", description: "", materialClass: "", postBolt: "", boltSku: "", boltFamily: "", boltCount: 0, weight_kg: 0, special: false, plate: null, moment_kNm: null };
    if (isCantilever) {
      const isPoint = options.loadType === "tipPointLoad";
      const moment = Number.isFinite(W) && Number.isFinite(H) ? W * H / 1000 * (isPoint ? 1 : 0.5) : null;
      const plate = moment === null ? null : selectBasePlateType(type, moment);
      const connection = plate ? findByCode(plate.code) : null;
      if (!plate) warnings.push("No standard cantilever base plate type is defined for this post.");
      const weights = plate && Number.isFinite(plate.capacity_kNm) ? basePlateWeight(plate, section) : null;
      base = {
        applicable: true,
        code: plate ? plate.code : "",
        description: plate ? (Number.isFinite(plate.capacity_kNm) ? `${type} post on concrete - base plate type ${plate.code}` : "Special design base plate") : CANTILEVER_BASE_AUTO,
        materialClass: "CONCRETE",
        postBolt: "WELD",
        boltSku: plate && Number.isFinite(plate.capacity_kNm) ? plate.anchor : "Special Design",
        boltFamily: BOLT_FAMILIES.RGM,
        boltCount: plate ? Number(plate.bolts) || 0 : 0,
        weight_kg: weights ? weights.totalKg : 0,
        special: false,
        plate: plate ? { ...plate, ...(weights || {}), loadModel: isPoint ? "W·H (top point load)" : "W·H/2 (UDL)" } : null,
        moment_kNm: moment,
        connection: connection
      };
    } else {
      const connection = findConnection(type, support, "bottom", options.baseFixing);
      if (!connection) warnings.push("Choose a base fixing.");
      else {
        const bolt = resolveBolt(connection, options.baseBoltFamily, W);
        // The concrete-top plate (U-B3 / L-B2) is one of four hard-coded
        // types by post depth (U-B3A/B, L-B2A/B): same bolts and weight as
        // the library row, only the plate geometry differs.
        const types = windpost.standardBasePlateTypes;
        const standardPlate = types ? types.geometryFor(section) : null;
        const subType = standardPlate && standardPlate.parent === connection.code ? standardPlate : null;
        base = {
          ...base,
          code: subType ? subType.code : connection.code,
          libraryCode: connection.code,
          description: connection.description,
          materialClass: connection.materialClass,
          postBolt: connection.postBolt,
          boltSku: bolt.sku,
          boltFamily: bolt.family,
          boltCount: boltCount(bolt.sku, connection.code, bolt.isAnchor),
          weight_kg: connectionWeight(connection, section, null),
          standardPlate: subType
        };
        noteMissingCount(bolt, connection.code, base.boltCount);
      }
    }
    if (specialBase) {
      base = {
        ...base,
        special: true,
        boltSku: special.base.sku || base.boltSku,
        boltCount: Number(special.base.bolts) || 0,
        weight_kg: Number(special.base.weight_kg) || 0,
        materialClass: special.base.material || base.materialClass
      };
    }

    // ---- ties and sleeves ----------------------------------------------
    const perLevel = TIES_PER_LEVEL[type] || 1;
    const levels = Number(options.numberOfTies) || 0;
    const ties = {
      levels,
      perLevel,
      innerCount: levels * perLevel,
      outerCount: type === "I" ? 0 : levels * perLevel,
      debondingSleeves: options.debondingSleeve && (type === "L" || type === "I") ? levels * perLevel : 0
    };

    // ---- weights -----------------------------------------------------------
    const post = postWeight(section, H);
    const posts = Math.max(1, Number(options.postsCount) || 1);
    const totalPerPost = round(post.weight_kg + head.weight_kg + base.weight_kg, 3);

    return {
      valid: warnings.length === 0,
      warnings,
      notes,
      type,
      supportCondition: support,
      head,
      base,
      ties,
      post,
      totalWeightPerPost_kg: totalPerPost,
      postsCount: posts,
      deliveries: Math.max(1, Number(options.deliveries) || 1),
      totalWeightAllPosts_kg: round(totalPerPost * posts, 3)
    };
  }

  windpost.connectionSelectionEngine = Object.freeze({
    BOLT_FAMILIES,
    NOT_APPLICABLE,
    CANTILEVER_BASE_AUTO,
    boltFamiliesFor,
    listFixings,
    findConnection,
    findByCode,
    selectAnchor,
    boltCount,
    blankWidth_mm,
    postWeight,
    standardPlateWeight,
    basePlateWeight,
    selectBasePlateType,
    select
  });
})(typeof window !== "undefined" ? window : globalThis);
