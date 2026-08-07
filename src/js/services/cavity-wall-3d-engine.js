(function initialiseCavityWall3dEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  const PALETTE = Object.freeze({
    background: "#f4f7fa",
    grid: "#d8e0e7",
    brick: "#a94d32",
    block: "#bbbdb7",
    steel: "#aeb9c2",
    // The stiffener is a thin plate edge-on to most viewpoints and shares a
    // face with both the base plate and the post, so in steel grey it reads as
    // part of them. Red separates it from every angle.
    stiffener: "#c0392b",
    plate: "#75838f",
    tie: "#2e8393",
    shear: "#145d75",
    concrete: "#d4d5d2",
    ink: "#122235",
    slot: "#263746"
  });

  function hexToRgb(hex) {
    const value = hex.replace("#", "");
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function shade(hex, amount, alpha) {
    const rgb = hexToRgb(hex);
    const scale = amount >= 0 ? 255 : 0;
    const ratio = Math.abs(amount);
    const r = Math.round(rgb.r + (scale - rgb.r) * ratio);
    const g = Math.round(rgb.g + (scale - rgb.g) * ratio);
    const b = Math.round(rgb.b + (scale - rgb.b) * ratio);
    return `rgba(${r},${g},${b},${alpha == null ? 1 : alpha})`;
  }

  function cuboid(x, y, z, dx, dy, dz, color, alpha, group) {
    const p = [
      [x, y, z], [x + dx, y, z], [x + dx, y + dy, z], [x, y + dy, z],
      [x, y, z + dz], [x + dx, y, z + dz], [x + dx, y + dy, z + dz], [x, y + dy, z + dz]
    ];
    return {
      type: "cuboid",
      points: p,
      faces: [
        { indexes: [0, 1, 5, 4], shade: .15 },
        { indexes: [1, 2, 6, 5], shade: -.08 },
        { indexes: [2, 3, 7, 6], shade: -.16 },
        { indexes: [3, 0, 4, 7], shade: .04 },
        { indexes: [4, 5, 6, 7], shade: .23 },
        { indexes: [0, 3, 2, 1], shade: -.22 }
      ],
      color,
      alpha: alpha == null ? 1 : alpha,
      group: group || ""
    };
  }

  function foldedLProfile(section, arcSegments) {
    const a = Number(section && section.a_mm);
    const b = Number(section && section.b_mm);
    const t = Number(section && section.t_mm);
    const innerRadius = Number(section && section.innerRadius_mm);
    const ri = Number.isFinite(innerRadius) ? innerRadius : 1.5 * t;
    const ro = ri + t;
    const segments = Math.max(8, Math.round(Number(arcSegments) || 24));
    if (
      ![a, b, t, ri].every(Number.isFinite) ||
      a <= ro || b <= ro || t <= 0 || ri < 0
    ) {
      throw new Error("The selected L section has invalid fold geometry.");
    }

    const points = [[0, a], [0, ro]];
    for (let index = 1; index <= segments; index += 1) {
      const theta = Math.PI + Math.PI * index / (2 * segments);
      points.push([
        ro + ro * Math.cos(theta),
        ro + ro * Math.sin(theta)
      ]);
    }
    points.push([b, 0], [b, t], [ro, t]);
    for (let index = 1; index <= segments; index += 1) {
      const theta = 1.5 * Math.PI - Math.PI * index / (2 * segments);
      points.push([
        ro + ri * Math.cos(theta),
        ro + ri * Math.sin(theta)
      ]);
    }
    points.push([t, a]);
    return {
      points,
      a_mm: a,
      b_mm: b,
      t_mm: t,
      innerRadius_mm: ri,
      outerRadius_mm: ro
    };
  }

  // Rounded folded U (channel): a web of outside length a with a flange of
  // outside length b folded from each end, both to the same side. The
  // coordinate convention matches foldedLProfile — x runs along the flange,
  // y along the web — so plan views can map either profile the same way.
  function foldedUProfile(section, arcSegments) {
    const a = Number(section && section.a_mm);
    const b = Number(section && section.b_mm);
    const t = Number(section && section.t_mm);
    const innerRadius = Number(section && section.innerRadius_mm);
    const ri = Number.isFinite(innerRadius) ? innerRadius : 1.5 * t;
    const ro = ri + t;
    const segments = Math.max(8, Math.round(Number(arcSegments) || 24));
    if (
      ![a, b, t, ri].every(Number.isFinite) ||
      a <= 2 * ro || b <= ro || t <= 0 || ri < 0
    ) {
      throw new Error("The selected U section has invalid fold geometry.");
    }

    const points = [[b, 0], [ro, 0]];
    for (let index = 1; index <= segments; index += 1) {     // outer fold, flange 1
      const theta = 1.5 * Math.PI - Math.PI * index / (2 * segments);
      points.push([ro + ro * Math.cos(theta), ro + ro * Math.sin(theta)]);
    }
    points.push([0, a - ro]);
    for (let index = 1; index <= segments; index += 1) {     // outer fold, flange 2
      const theta = Math.PI - Math.PI * index / (2 * segments);
      points.push([ro + ro * Math.cos(theta), (a - ro) + ro * Math.sin(theta)]);
    }
    points.push([b, a], [b, a - t], [ro, a - t]);
    for (let index = 1; index <= segments; index += 1) {     // inner fold, flange 2
      const theta = 0.5 * Math.PI + Math.PI * index / (2 * segments);
      points.push([ro + ri * Math.cos(theta), (a - ro) + ri * Math.sin(theta)]);
    }
    points.push([t, ro]);
    for (let index = 1; index <= segments; index += 1) {     // inner fold, flange 1
      const theta = Math.PI + Math.PI * index / (2 * segments);
      points.push([ro + ri * Math.cos(theta), ro + ri * Math.sin(theta)]);
    }
    points.push([b, t]);
    return {
      points,
      a_mm: a,
      b_mm: b,
      t_mm: t,
      innerRadius_mm: ri,
      outerRadius_mm: ro
    };
  }

  function extrudedProfile(profilePoints, length, color, alpha, group) {
    const count = profilePoints.length;
    const points = [
      ...profilePoints.map(([x, y]) => [x, y, 0]),
      ...profilePoints.map(([x, y]) => [x, y, length])
    ];
    const faces = [
      {
        indexes: [...Array(count).keys()].reverse(),
        shade: -.18
      },
      {
        indexes: [...Array(count).keys()].map(index => index + count),
        shade: .28
      }
    ];
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      const [x1, y1] = profilePoints[index];
      const [x2, y2] = profilePoints[next];
      const angle = Math.atan2(y2 - y1, x2 - x1);
      faces.push({
        indexes: [index, next, next + count, index + count],
        shade: .12 * Math.cos(angle - .7) - .03,
        edgeIndex: index
      });
    }
    return {
      type: "mesh",
      points,
      faces,
      color,
      alpha: alpha == null ? 1 : alpha,
      group: group || ""
    };
  }

  function attachFoldedLSlotHoles(mesh, profile, mapRawPoint, placement) {
    if (!placement || !Array.isArray(placement.levels_mm)) return;
    const tolerance = 1e-6;
    const halfWidth = placement.width_mm / 2;
    const longCentre = placement.centreFromFold_mm;
    const shortCentre = placement.shortLegCentreFromFold_mm;

    profile.points.forEach((point, edgeIndex) => {
      const next = profile.points[(edgeIndex + 1) % profile.points.length];
      const isLongFace =
        Math.abs(point[0] - next[0]) < tolerance &&
        (
          Math.abs(point[0]) < tolerance ||
          Math.abs(point[0] - profile.t_mm) < tolerance
        ) &&
        Math.min(point[1], next[1]) <= longCentre - halfWidth &&
        Math.max(point[1], next[1]) >= longCentre + halfWidth;
      const isShortFace =
        Math.abs(point[1] - next[1]) < tolerance &&
        (
          Math.abs(point[1]) < tolerance ||
          Math.abs(point[1] - profile.t_mm) < tolerance
        ) &&
        Math.min(point[0], next[0]) <= shortCentre - halfWidth &&
        Math.max(point[0], next[0]) >= shortCentre + halfWidth;

      if (!isLongFace && !isShortFace) return;
      const face = mesh.faces[2 + edgeIndex];
      face.holes = placement.levels_mm.map(level =>
        roundedRectanglePoints(
          placement.width_mm,
          placement.depth_mm,
          placement.cornerRadius_mm,
          10
        ).map(([acrossLeg, vertical]) => {
          const raw = isLongFace
            ? [point[0], longCentre + acrossLeg]
            : [shortCentre + acrossLeg, point[1]];
          const mapped = mapRawPoint(raw);
          return [mapped[0], mapped[1], level + vertical];
        })
      );
      face.slotLeg = isLongFace ? "long" : "short";
    });
  }

  // A U is tied through BOTH flanges, so every face at a constant profile-y
  // that spans the slot centre gets cut — the two faces of each flange.
  function attachFoldedUSlotHoles(mesh, profile, mapRawPoint, placement) {
    if (!placement || !Array.isArray(placement.levels_mm)) return;
    const tolerance = 1e-6;
    const halfWidth = placement.width_mm / 2;
    const centre = placement.flangeCentreFromFold_mm;
    const flangeFaces = [
      0, profile.t_mm, profile.a_mm - profile.t_mm, profile.a_mm
    ];

    profile.points.forEach((point, edgeIndex) => {
      const next = profile.points[(edgeIndex + 1) % profile.points.length];
      const isFlangeFace =
        Math.abs(point[1] - next[1]) < tolerance &&
        flangeFaces.some(y => Math.abs(point[1] - y) < tolerance) &&
        Math.min(point[0], next[0]) <= centre - halfWidth &&
        Math.max(point[0], next[0]) >= centre + halfWidth;
      if (!isFlangeFace) return;
      const face = mesh.faces[2 + edgeIndex];
      face.holes = placement.levels_mm.map(level =>
        roundedRectanglePoints(
          placement.width_mm,
          placement.depth_mm,
          placement.cornerRadius_mm,
          10
        ).map(([alongFlange, vertical]) => {
          const mapped = mapRawPoint([centre + alongFlange, point[1]]);
          return [mapped[0], mapped[1], level + vertical];
        })
      );
      face.slotLeg = point[1] < profile.a_mm / 2 ? "flange-rear" : "flange-front";
    });
  }

  // Read at call time: the geometry engine may load either side of this one.
  function uClearance() {
    const geom = windpost.uBaseplateGeom;
    return Number(geom && geom.CLEAR) || 6;
  }

  function uRearProjection() {
    const geom = windpost.uBaseplateGeom;
    return Number(geom && geom.REAR_PROJECTION) || 6;
  }

  function foldedUMesh(section, length, options) {
    const settings = options || {};
    const profile = foldedUProfile(section, settings.arcSegments);
    const originX = Number(settings.originX) || 0;
    const originY = Number(settings.originY) || 0;
    const centred = Boolean(settings.centred);
    const baseplateAligned = Boolean(settings.baseplateAligned);
    // On the plate the U stands wholly in the cavity: its flanges are centred
    // across the plate width and its front face sits the wall clearance back
    // from the inner-leaf datum at y = 0.
    const mapRawPoint = ([rawX, rawY]) => {
      if (baseplateAligned) {
        return [
          rawX - profile.b_mm / 2 + originX,
          rawY - (profile.a_mm + uClearance()) + originY
        ];
      }
      let x = rawX, y = rawY;
      if (centred) {
        x -= profile.b_mm / 2;
        y -= profile.a_mm / 2;
      }
      return [x + originX, y + originY];
    };
    const mesh = extrudedProfile(
      profile.points.map(mapRawPoint),
      Number(length),
      settings.color || PALETTE.steel,
      settings.alpha == null ? 1 : settings.alpha,
      settings.group || "post"
    );
    mesh.profile = profile;
    attachFoldedUSlotHoles(mesh, profile, mapRawPoint, settings.slotCuts);
    return mesh;
  }

  function foldedLMesh(section, length, options) {
    const settings = options || {};
    const profile = foldedLProfile(section, settings.arcSegments);
    const originX = Number(settings.originX) || 0;
    const originY = Number(settings.originY) || 0;
    const centred = Boolean(settings.centred);
    const baseplateAligned = Boolean(settings.baseplateAligned);
    const flipY = Boolean(settings.flipY);
    const mapRawPoint = ([rawX, rawY]) => {
      if (baseplateAligned) {
        return [
          profile.t_mm / 2 - rawX + originX,
          rawY - (profile.a_mm - 90) + originY
        ];
      }
      let x = rawX;
      let y = flipY ? -rawY : rawY;
      if (centred) {
        x -= profile.b_mm / 2;
        y += flipY ? profile.a_mm / 2 : -profile.a_mm / 2;
      }
      return [x + originX, y + originY];
    };
    const mapped = profile.points.map(mapRawPoint);
    const mesh = extrudedProfile(
      mapped,
      Number(length),
      settings.color || PALETTE.steel,
      settings.alpha == null ? 1 : settings.alpha,
      settings.group || "post"
    );
    mesh.profile = profile;
    attachFoldedLSlotHoles(
      mesh,
      profile,
      mapRawPoint,
      settings.slotCuts
    );
    return mesh;
  }

  function normalisePrototypeSlot(profile, length_mm, requestedPlacement) {
    const requested = requestedPlacement || {};
    const width = Number(requested.width_mm) || 18;
    const depth = Number(requested.depth_mm) || 50;
    const radius = Number(requested.cornerRadius_mm) || 5;
    const halfWidth = width / 2;
    const maximumOffset = profile.a_mm - profile.outerRadius_mm - halfWidth;
    const requestedOffset = Number(requested.offsetFromOuterEdge_mm);
    const offset = Math.max(
      halfWidth,
      Math.min(
        maximumOffset,
        Number.isFinite(requestedOffset) ? requestedOffset : 40
      )
    );
    const shortLegMaximumOffset =
      profile.b_mm - profile.outerRadius_mm - halfWidth;
    const shortLegOffset = Math.max(
      halfWidth,
      Math.min(shortLegMaximumOffset, 25)
    );
    const requestedLevels = Array.isArray(requested.levels_mm)
      ? requested.levels_mm.map(Number).filter(Number.isFinite)
      : null;
    const levels = requestedLevels || [];
    if (!requestedLevels) {
      for (
        let centre = 225;
        centre + depth / 2 <= length_mm;
        centre += 225
      ) {
        levels.push(centre);
      }
    }
    return {
      width_mm: width,
      depth_mm: depth,
      cornerRadius_mm: radius,
      offsetFromOuterEdge_mm: offset,
      centreFromFold_mm: profile.a_mm - offset,
      shortLegOffsetFromTip_mm: shortLegOffset,
      shortLegCentreFromFold_mm: profile.b_mm - shortLegOffset,
      levels_mm: levels
    };
  }

  // Both flanges carry the same slot column, so one offset from the flange tip
  // places them all.
  function normalisePrototypeUSlot(profile, length_mm, requestedPlacement) {
    const requested = requestedPlacement || {};
    const width = Number(requested.width_mm) || 18;
    const depth = Number(requested.depth_mm) || 50;
    const radius = Number(requested.cornerRadius_mm) || 5;
    const halfWidth = width / 2;
    const maximumOffset = profile.b_mm - profile.outerRadius_mm - halfWidth;
    const requestedOffset = Number(requested.offsetFromOuterEdge_mm);
    const offset = Math.max(
      halfWidth,
      Math.min(maximumOffset, Number.isFinite(requestedOffset) ? requestedOffset : 25)
    );
    const requestedLevels = Array.isArray(requested.levels_mm)
      ? requested.levels_mm.map(Number).filter(Number.isFinite)
      : null;
    const levels = requestedLevels || [];
    if (!requestedLevels) {
      for (let centre = 225; centre + depth / 2 <= length_mm; centre += 225) {
        levels.push(centre);
      }
    }
    return {
      width_mm: width,
      depth_mm: depth,
      cornerRadius_mm: radius,
      offsetFromOuterEdge_mm: offset,
      flangeOffsetFromTip_mm: offset,
      flangeCentreFromFold_mm: profile.b_mm - offset,
      levels_mm: levels
    };
  }

  function circlePoints3d(cx, cy, z, radius, segments, reverse) {
    const count = Math.max(16, Math.round(Number(segments) || 32));
    const points = [];
    for (let index = 0; index < count; index += 1) {
      const direction = reverse ? -1 : 1;
      const angle = direction * 2 * Math.PI * index / count;
      points.push([
        cx + radius * Math.cos(angle),
        cy + radius * Math.sin(angle),
        z
      ]);
    }
    return points;
  }

  function plateWithCircularHoles(geometry) {
    const plate = cuboid(
      -geometry.width_mm / 2,
      geometry.startY_mm,
      -geometry.thickness_mm,
      geometry.width_mm,
      geometry.overallLength_mm,
      geometry.thickness_mm,
      PALETTE.plate,
      .98,
      "baseplate"
    );
    plate.faces[4].holes = geometry.anchorCentres_mm.map(anchor =>
      circlePoints3d(
        anchor.x,
        anchor.y,
        0,
        geometry.holeDiameter_mm / 2,
        36,
        false
      )
    );
    plate.faces[5].holes = geometry.anchorCentres_mm.map(anchor =>
      circlePoints3d(
        anchor.x,
        anchor.y,
        -geometry.thickness_mm,
        geometry.holeDiameter_mm / 2,
        36,
        true
      )
    );
    return plate;
  }

  function extrudedSidePlate(profileYZ, x0, thickness, color, group) {
    const count = profileYZ.length;
    const points = [
      ...profileYZ.map(([y, z]) => [x0, y, z]),
      ...profileYZ.map(([y, z]) => [x0 + thickness, y, z])
    ];
    const faces = [
      {
        indexes: [...Array(count).keys()].reverse(),
        shade: -.12
      },
      {
        indexes: [...Array(count).keys()].map(index => index + count),
        shade: .2
      }
    ];
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      faces.push({
        indexes: [index, next, next + count, index + count],
        shade: index === 1 ? .28 : -.03
      });
    }
    return {
      type: "mesh",
      points,
      faces,
      color,
      alpha: 1,
      group: group || "stiffener"
    };
  }

  function prototypeBaseplateGeometry(section, design) {
    if (!design) return null;
    const a = Number(section && section.a_mm);
    const t = Number(section && section.t_mm);
    const width = Number(design.B);
    const plateLength = Number(design.plateLen);
    const thickness = Number(design.tp);
    const edge = Number(design.edge);
    const pitch = Number(design.pitch);
    const rowCount = Number(design.nRow);
    const columnCount = Number(design.nCol);
    const gauge = Number(design.w);
    const boltOffset = Number(design.m);
    const stiffenerThickness = Number(design.tw);
    const stiffenerHeight = Number(design.hUp);
    const holeDiameter = Number(design.holeDia) ||
      Number(windpost.baseplateConfig && windpost.baseplateConfig.holeDia) ||
      14;
    const values = [
      a, t, width, plateLength, thickness, edge, pitch, rowCount,
      columnCount, gauge, boltOffset, stiffenerThickness, stiffenerHeight
    ];
    if (!values.every(Number.isFinite)) {
      throw new Error("The calculated baseplate geometry is incomplete.");
    }
    if (rowCount < 1 || columnCount !== 2) {
      throw new Error(
        "The calculated cantilever baseplate anchor layout is invalid."
      );
    }

    const embedment_mm = 90;
    const weldProjection_mm = 6;
    const startY_mm = -(a - embedment_mm) - weldProjection_mm;
    const endY_mm = plateLength;
    const rowCentres_mm = Array.from(
      { length: rowCount },
      (_, index) => edge + index * pitch
    );
    const columnCentres_mm = [
      t / 2 - boltOffset,
      t / 2 + gauge - boltOffset
    ];
    const anchorCentres_mm = rowCentres_mm.flatMap(y =>
      columnCentres_mm.map(x => Object.freeze({ x, y }))
    );
    const stiffenerFlatEndY_mm = Math.max(edge, embedment_mm);

    return Object.freeze({
      datum: "inner-leaf-concrete-edge",
      embedment_mm,
      weldProjection_mm,
      startY_mm,
      endY_mm,
      overallLength_mm: endY_mm - startY_mm,
      width_mm: width,
      thickness_mm: thickness,
      holeDiameter_mm: holeDiameter,
      rowCentres_mm: Object.freeze(rowCentres_mm),
      columnCentres_mm: Object.freeze(columnCentres_mm),
      anchorCentres_mm: Object.freeze(anchorCentres_mm),
      stiffener: Object.freeze({
        x0_mm: t / 2,
        x1_mm: t / 2 + stiffenerThickness,
        startY_mm: edge,
        flatEndY_mm: stiffenerFlatEndY_mm,
        endY_mm: plateLength,
        thickness_mm: stiffenerThickness,
        height_mm: stiffenerHeight
      })
    });
  }

  // U on the plate: the post stands wholly in the cavity, so the plate runs
  // from a rear fabrication projection behind the U to the design length ahead
  // of the datum, the anchors straddle the plate centre-line, and the stiffener
  // is centred on the width and tapers straight from the front flange face.
  function prototypeUBaseplateGeometry(section, design) {
    if (!design) return null;
    const a = Number(section && section.a_mm);
    const width = Number(design.B);
    const plateLength = Number(design.plateLen);
    const thickness = Number(design.tp);
    const edge = Number(design.edge);
    const pitch = Number(design.pitch);
    const rowCount = Number(design.nRow);
    const columnCount = Number(design.nCol);
    const gauge = Number(design.w);
    const stiffenerThickness = Number(design.tw);
    const stiffenerHeight = Number(design.hUp);
    const holeDiameter = Number(design.holeDia) ||
      Number(windpost.baseplateConfig && windpost.baseplateConfig.holeDia) ||
      14;
    const values = [
      a, width, plateLength, thickness, edge, pitch, rowCount,
      columnCount, gauge, stiffenerThickness, stiffenerHeight
    ];
    if (!values.every(Number.isFinite)) {
      throw new Error("The calculated baseplate geometry is incomplete.");
    }
    if (rowCount < 1 || columnCount !== 2) {
      throw new Error(
        "The calculated cantilever baseplate anchor layout is invalid."
      );
    }

    const clearance = uClearance();
    const rearProjection = uRearProjection();
    const frontFaceY_mm = -clearance;
    const startY_mm = -(rearProjection + a + clearance);
    const endY_mm = plateLength;
    const rowCentres_mm = Array.from(
      { length: rowCount },
      (_, index) => edge + index * pitch
    );
    const columnCentres_mm = [-gauge / 2, gauge / 2];
    const anchorCentres_mm = rowCentres_mm.flatMap(y =>
      columnCentres_mm.map(x => Object.freeze({ x, y }))
    );

    return Object.freeze({
      datum: "inner-leaf-concrete-edge",
      postType: "U",
      clearance_mm: clearance,
      rearProjection_mm: rearProjection,
      startY_mm,
      endY_mm,
      overallLength_mm: endY_mm - startY_mm,
      width_mm: width,
      thickness_mm: thickness,
      holeDiameter_mm: holeDiameter,
      rowCentres_mm: Object.freeze(rowCentres_mm),
      columnCentres_mm: Object.freeze(columnCentres_mm),
      anchorCentres_mm: Object.freeze(anchorCentres_mm),
      stiffener: Object.freeze({
        x0_mm: -stiffenerThickness / 2,
        x1_mm: stiffenerThickness / 2,
        startY_mm: frontFaceY_mm,
        flatEndY_mm: frontFaceY_mm,       // no flat top: straight taper
        endY_mm: plateLength,
        thickness_mm: stiffenerThickness,
        height_mm: stiffenerHeight
      })
    });
  }

  // The simply-supported base is the fixed standard detail: a plain plate with
  // ONE anchor row and no stiffener, so it is recognised by the absence of the
  // stiffener/pitch fields the designed cantilever base carries.
  function prototypeSimpleBaseplateGeometry(section, design, isU) {
    if (!design) return null;
    const a = Number(section && section.a_mm);
    const width = Number(design.B);
    const plateLength = Number(design.plateLen);
    const thickness = Number(design.tp);
    const anchorFromEdge = Number(design.anchorFromConcreteEdge);
    const gauge = Number(design.w);
    const holeDiameter = Number(design.holeDia) || 14;
    if (![a, width, plateLength, thickness, anchorFromEdge, gauge].every(Number.isFinite)) {
      throw new Error("The standard baseplate geometry is incomplete.");
    }
    const clearance = isU ? uClearance() : 0;
    const rear = isU ? uRearProjection() : 6;
    const startY_mm = isU ? -(rear + a + clearance) : -(rear + (a - 90));
    const anchorCentres_mm = [-gauge / 2, gauge / 2].map(x =>
      Object.freeze({ x, y: anchorFromEdge }));

    return Object.freeze({
      datum: "inner-leaf-concrete-edge",
      standard: true,
      startY_mm,
      endY_mm: plateLength,
      overallLength_mm: plateLength - startY_mm,
      width_mm: width,
      thickness_mm: thickness,
      holeDiameter_mm: holeDiameter,
      rowCentres_mm: Object.freeze([anchorFromEdge]),
      columnCentres_mm: Object.freeze([-gauge / 2, gauge / 2]),
      anchorCentres_mm: Object.freeze(anchorCentres_mm),
      stiffener: null
    });
  }

  function sectionPrototypeModel(
    section,
    length_mm,
    requestedSlotPlacement,
    baseplateDesign
  ) {
    const length = Math.max(300, Math.min(12000, Number(length_mm) || 1200));
    const isU = section && section.type === "U";
    const profile = isU ? foldedUProfile(section) : foldedLProfile(section);
    const isStandard = Boolean(baseplateDesign) &&
      baseplateDesign.anchorFromConcreteEdge != null;
    const baseplate = isStandard
      ? prototypeSimpleBaseplateGeometry(section, baseplateDesign, isU)
      : isU
        ? prototypeUBaseplateGeometry(section, baseplateDesign)
        : prototypeBaseplateGeometry(section, baseplateDesign);
    return {
      prototypeOnly: true,
      type: isU ? "U" : "L",
      section,
      length_mm: length,
      wallLength_mm: profile.b_mm,
      totalWallDepth_mm: profile.a_mm,
      profile,
      slotPlacement: (isU ? normalisePrototypeUSlot : normalisePrototypeSlot)(
        profile,
        length,
        requestedSlotPlacement
      ),
      baseplate,
      viewCentre: baseplate
        ? Object.freeze({
            x: 0,
            y: (baseplate.startY_mm + baseplate.endY_mm) / 2,
            z: (length - baseplate.thickness_mm) / 2
          })
        : Object.freeze({ x: 0, y: 0, z: length / 2 }),
      viewWidth_mm: baseplate
        ? baseplate.width_mm + baseplate.overallLength_mm
        : (profile.a_mm + profile.b_mm) * 1.2,
      tieSchedule: { count: 0 }
    };
  }

  function roundedRectanglePoints(width, depth, radius, arcSegments) {
    const halfWidth = width / 2;
    const halfDepth = depth / 2;
    const segments = Math.max(3, Math.round(Number(arcSegments) || 8));
    const centres = [
      [halfWidth - radius, -halfDepth + radius, -Math.PI / 2, 0],
      [halfWidth - radius, halfDepth - radius, 0, Math.PI / 2],
      [-halfWidth + radius, halfDepth - radius, Math.PI / 2, Math.PI],
      [-halfWidth + radius, -halfDepth + radius, Math.PI, 1.5 * Math.PI]
    ];
    const points = [];
    centres.forEach(([cx, cy, start, end]) => {
      for (let index = 0; index <= segments; index += 1) {
        if (points.length && index === 0) continue;
        const angle = start + (end - start) * index / segments;
        points.push([
          cx + radius * Math.cos(angle),
          cy + radius * Math.sin(angle)
        ]);
      }
    });
    return points;
  }

  function buildSectionScene(model) {
    const postMesh = model.type === "U" ? foldedUMesh : foldedLMesh;
    const scene = [
      postMesh(model.section, model.length_mm, {
        centred: !model.baseplate,
        baseplateAligned: Boolean(model.baseplate),
        arcSegments: 32,
        group: "post",
        slotCuts: model.slotPlacement
      })
    ];
    if (!model.baseplate) return scene;

    scene.unshift(plateWithCircularHoles(model.baseplate));
    const stiffener = model.baseplate.stiffener;
    if (!stiffener) return scene;          // standard simply-supported base
    // A flat top only exists where the taper starts behind the post face; with
    // no flat run the profile is the plain triangle.
    const hasFlatTop = stiffener.flatEndY_mm > stiffener.startY_mm;
    const stiffenerProfile = [
      [stiffener.startY_mm, 0],
      [stiffener.startY_mm, stiffener.height_mm],
      ...(hasFlatTop ? [[stiffener.flatEndY_mm, stiffener.height_mm]] : []),
      [stiffener.endY_mm, 0]
    ];
    scene.push(extrudedSidePlate(
      stiffenerProfile,
      stiffener.x0_mm,
      stiffener.thickness_mm,
      PALETTE.stiffener,
      "stiffener"
    ));
    return scene;
  }

  function slot(pointA, pointB, width, plane, group) {
    return {
      type: "slot",
      pointA,
      pointB,
      width,
      plane,
      group: group || "post"
    };
  }

  function masonryUnits(model, layer) {
    const items = [];
    const isBlock = layer === "inner";
    const unit = isBlock ? model.masonry.block : model.masonry.brick;
    const wallLength = model.wallLength_mm;
    const heightLimit = isBlock
      ? Math.min(model.length_mm, 1350)
      : Math.min(model.length_mm, 900);
    const y = isBlock
      ? 0
      : model.wall.innerLeafThickness_mm + model.wall.cavityWidth_mm;
    const depth = isBlock
      ? model.wall.innerLeafThickness_mm
      : model.wall.outerLeafThickness_mm;
    const color = isBlock ? PALETTE.block : PALETTE.brick;
    const courses = Math.ceil(heightLimit / unit.course_mm);
    const nominal = unit.length_mm + unit.mortar_mm;

    for (let course = 0; course < courses; course += 1) {
      const z = course * unit.course_mm + unit.mortar_mm / 2;
      const height = Math.min(unit.height_mm, heightLimit - z);
      if (height <= 0) continue;
      const offset = course % 2 ? nominal / 2 : 0;
      let x = -wallLength / 2 - offset;
      while (x < wallLength / 2) {
        const start = Math.max(x + unit.mortar_mm / 2, -wallLength / 2);
        const end = Math.min(x + unit.length_mm, wallLength / 2);
        const segments = isBlock
          ? [
              [start, Math.min(end, -5)],
              [Math.max(start, 5), end]
            ]
          : [[start, end]];
        segments.forEach(([segmentStart, segmentEnd]) => {
          if (segmentEnd - segmentStart <= 8) return;
          items.push(cuboid(
            segmentStart, y, z,
            segmentEnd - segmentStart, depth, height,
            color, isBlock ? .72 : .92, layer
          ));
        });
        x += nominal;
      }
    }
    return items;
  }

  function buildScene(model) {
    const scene = [];
    const post = model.post;
    const wall = model.wall;
    const plate = model.baseplate && model.baseplate.design
      ? model.baseplate.design : {};
    const plateWidth = Number(plate.B) || 220;
    const plateLeft = Number(plate.leftPortion) || 6 + post.cavityProjection_mm;
    const plateRight = Number(plate.plateLen) || 125;
    const plateThickness = Number(plate.tp) || 8;
    const postY0 = post.longLegY0_mm;
    const postY1 = post.longLegY1_mm;

    scene.push(...masonryUnits(model, "inner"));
    scene.push(...masonryUnits(model, "outer"));
    scene.push(cuboid(
      -model.wallLength_mm / 2 - 80,
      wall.innerLeafThickness_mm - plateLeft,
      -105,
      model.wallLength_mm + 160,
      plateLeft + plateRight + 90,
      96,
      PALETTE.concrete,
      .8,
      "concrete"
    ));
    scene.push(cuboid(
      -plateWidth / 2,
      wall.innerLeafThickness_mm - plateLeft,
      -plateThickness,
      plateWidth,
      plateLeft + plateRight,
      plateThickness,
      PALETTE.plate,
      .98,
      "baseplate"
    ));
    scene.push(cuboid(
      -post.t_mm / 2,
      postY0,
      0,
      post.t_mm,
      postY1 - postY0,
      model.length_mm,
      PALETTE.steel,
      1,
      "post"
    ));
    scene.push(cuboid(
      -post.t_mm / 2,
      postY1 - post.t_mm,
      0,
      post.b_mm,
      post.t_mm,
      model.length_mm,
      PALETTE.steel,
      1,
      "post"
    ));

    model.tieSchedule.levels_mm.forEach((level) => {
      scene.push(cuboid(
        -model.shearTie.halfLength_mm,
        wall.innerLeafThickness_mm / 2 - model.shearTie.width_mm / 2,
        level - model.shearTie.thickness_mm / 2,
        model.shearTie.overallLength_mm,
        model.shearTie.width_mm,
        model.shearTie.thickness_mm,
        PALETTE.shear,
        1,
        "ties"
      ));
      model.shearTie.holeCentresFromEnd_mm.forEach((fromEnd) => {
        [-1, 1].forEach((direction) => {
          const centreX = direction *
            (model.shearTie.halfLength_mm - fromEnd);
          const halfStraight = (
            model.shearTie.holeLength_mm -
            model.shearTie.holeWidth_mm
          ) / 2;
          scene.push(slot(
            [centreX - halfStraight, wall.innerLeafThickness_mm / 2, level + .9],
            [centreX + halfStraight, wall.innerLeafThickness_mm / 2, level + .9],
            model.shearTie.holeWidth_mm,
            "horizontal",
            "slots"
          ));
        });
      });
      const usable = Number(model.wallTie.actualTieLength_mm) -
        Number(model.wallTie.tieConnectionLength_mm);
      const tieX = post.b_mm / 2 - 12.5;
      scene.push(cuboid(
        tieX,
        postY1,
        level - .75,
        25,
        usable,
        1.5,
        PALETTE.tie,
        1,
        "ties"
      ));
      scene.push(slot(
        [post.t_mm / 2 + .3, wall.innerLeafThickness_mm / 2, level - 25],
        [post.t_mm / 2 + .3, wall.innerLeafThickness_mm / 2, level + 25],
        model.slot.width_mm,
        "long",
        "slots"
      ));
      scene.push(slot(
        [post.b_mm / 2, postY1 + .3, level - 25],
        [post.b_mm / 2, postY1 + .3, level + 25],
        model.slot.width_mm,
        "flange",
        "slots"
      ));
    });

    return scene;
  }

  class CavityRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.azimuth = -0.82;
      this.elevation = 0.48;
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this.interactionMode = "orbit";
      this.dragAction = null;
      this.dragging = false;
      this.lastPoint = null;
      this.options = { inner: true, outer: true, ties: true, concrete: true };
      this.setInteractionMode("orbit");
      this.installInteraction();
      this.resizeObserver = typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => this.resize())
        : null;
      if (this.resizeObserver) this.resizeObserver.observe(canvas);
    }

    installInteraction() {
      const position = event => {
        if (event.touches && event.touches.length) {
          return { x: event.touches[0].clientX, y: event.touches[0].clientY };
        }
        return { x: event.clientX, y: event.clientY };
      };
      const start = event => {
        const button = event.button == null ? 0 : Number(event.button);
        this.dragAction =
          this.interactionMode === "pan" ||
          event.shiftKey ||
          button === 1 ||
          button === 2
            ? "pan"
            : "orbit";
        this.dragging = true;
        this.lastPoint = position(event);
        this.canvas.classList && this.canvas.classList.add("is-dragging");
        if (this.dragAction === "pan") {
          this.canvas.classList && this.canvas.classList.add("is-panning");
          event.preventDefault && event.preventDefault();
        }
        this.canvas.setPointerCapture && event.pointerId != null &&
          this.canvas.setPointerCapture(event.pointerId);
      };
      const move = event => {
        if (!this.dragging) return;
        const next = position(event);
        const dx = next.x - this.lastPoint.x;
        const dy = next.y - this.lastPoint.y;
        if (this.dragAction === "pan") {
          this.panX += dx;
          this.panY += dy;
        } else {
          this.azimuth += dx * .009;
          this.elevation = Math.max(
            .08,
            Math.min(1.35, this.elevation + dy * .007)
          );
        }
        this.lastPoint = next;
        this.draw();
        event.preventDefault();
      };
      const end = () => {
        this.dragging = false;
        this.dragAction = null;
        this.lastPoint = null;
        this.canvas.classList && this.canvas.classList.remove("is-dragging");
        this.canvas.classList && this.canvas.classList.remove("is-panning");
      };
      this.canvas.addEventListener("pointerdown", start);
      this.canvas.addEventListener("pointermove", move);
      this.canvas.addEventListener("pointerup", end);
      this.canvas.addEventListener("pointercancel", end);
      this.canvas.addEventListener("contextmenu", event =>
        event.preventDefault()
      );
      this.canvas.addEventListener("wheel", event => {
        const maxZoom = this.model && this.model.prototypeOnly ? 8 : 2.4;
        this.zoom = Math.max(.55, Math.min(maxZoom, this.zoom * (event.deltaY > 0 ? .92 : 1.08)));
        this.draw();
        event.preventDefault();
      }, { passive: false });
      this.canvas.addEventListener("keydown", event => {
        const panWithKeys =
          this.interactionMode === "pan" || event.shiftKey;
        if (panWithKeys && event.key === "ArrowLeft") this.panX -= 18;
        else if (panWithKeys && event.key === "ArrowRight") this.panX += 18;
        else if (panWithKeys && event.key === "ArrowUp") this.panY -= 18;
        else if (panWithKeys && event.key === "ArrowDown") this.panY += 18;
        else if (event.key === "ArrowLeft") this.azimuth -= .08;
        else if (event.key === "ArrowRight") this.azimuth += .08;
        else if (event.key === "ArrowUp") {
          this.elevation = Math.max(.08, this.elevation - .06);
        }
        else if (event.key === "ArrowDown") {
          this.elevation = Math.min(1.35, this.elevation + .06);
        }
        else if (event.key === "+" || event.key === "=") {
          const maxZoom = this.model && this.model.prototypeOnly ? 8 : 2.4;
          this.zoom = Math.min(maxZoom, this.zoom * 1.08);
        }
        else if (event.key === "-") this.zoom = Math.max(.55, this.zoom * .92);
        else return;
        event.preventDefault();
        this.draw();
      });
    }

    setInteractionMode(mode) {
      this.interactionMode = mode === "pan" ? "pan" : "orbit";
      if (this.canvas.dataset) {
        this.canvas.dataset.interactionMode = this.interactionMode;
      }
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const ratio = Math.min(2, global.devicePixelRatio || 1);
      const width = Math.max(320, Math.round(rect.width * ratio));
      const height = Math.max(320, Math.round(rect.height * ratio));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.draw();
    }

    setModel(model) {
      this.model = model;
      this.scene = buildScene(model);
      this.draw();
    }

    setSection(section, length_mm, slotPlacement, baseplateDesign) {
      this.model = sectionPrototypeModel(
        section,
        length_mm,
        slotPlacement,
        baseplateDesign
      );
      this.scene = buildSectionScene(this.model);
      this.draw();
    }

    setVisibility(name, visible) {
      if (Object.prototype.hasOwnProperty.call(this.options, name)) {
        this.options[name] = Boolean(visible);
        this.draw();
      }
    }

    reset() {
      this.azimuth = -0.82;
      this.elevation = 0.48;
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this.draw();
    }

    visible(item) {
      if (item.group === "inner") return this.options.inner;
      if (item.group === "outer") return this.options.outer;
      if (item.group === "ties" || item.group === "slots") return this.options.ties;
      if (item.group === "concrete") return this.options.concrete;
      return true;
    }

    transform(point) {
      const model = this.model;
      const prototypeCentre = model.prototypeOnly && model.viewCentre
        ? model.viewCentre
        : null;
      const cx = prototypeCentre ? prototypeCentre.x : 0;
      const cy = prototypeCentre
        ? prototypeCentre.y
        : model.prototypeOnly ? 0 : model.totalWallDepth_mm / 2;
      const cz = model.prototypeOnly
        ? prototypeCentre ? prototypeCentre.z : model.length_mm / 2
        : Math.min(model.length_mm, 1600) / 2;
      const dx = point[0] - cx;
      const dy = point[1] - cy;
      const dz = point[2] - cz;
      const ca = Math.cos(this.azimuth);
      const sa = Math.sin(this.azimuth);
      const ce = Math.cos(this.elevation);
      const se = Math.sin(this.elevation);
      const rx = ca * dx - sa * dy;
      const ry = sa * dx + ca * dy;
      return {
        x: rx,
        y: ry * se - dz * ce,
        depth: ry * ce + dz * se
      };
    }

    project(point, scale, width, height) {
      const transformed = this.transform(point);
      const ratio = Math.min(2, global.devicePixelRatio || 1);
      return {
        x: width / 2 + transformed.x * scale + this.panX * ratio,
        y: height / 2 + transformed.y * scale + this.panY * ratio,
        depth: transformed.depth
      };
    }

    drawGrid(ctx, width, height) {
      ctx.save();
      ctx.strokeStyle = PALETTE.grid;
      ctx.lineWidth = 1;
      const spacing = 32;
      for (let x = width / 2 % spacing; x < width; x += spacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = height / 2 % spacing; y < height; y += spacing) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
      ctx.restore();
    }

    draw() {
      if (!this.model || !this.scene) return;
      const ctx = this.ctx;
      const width = this.canvas.width;
      const height = this.canvas.height;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = PALETTE.background;
      ctx.fillRect(0, 0, width, height);
      this.drawGrid(ctx, width, height);

      const ratio = Math.min(2, global.devicePixelRatio || 1);
      const physicalWidth = this.model.prototypeOnly
        ? this.model.viewWidth_mm
        : this.model.wallLength_mm + this.model.totalWallDepth_mm;
      const physicalHeight = this.model.prototypeOnly
        ? this.model.length_mm + 100
        : Math.min(this.model.length_mm, 1800) + 180;
      const scale = Math.min(
        width / (physicalWidth * 1.15),
        height / (physicalHeight * .9)
      ) * this.zoom;

      const faces = [];
      const slots = [];
      // Painter's algorithm sorts on the average depth of a face's corners,
      // which misjudges a large flat face: the base plate is far wider than the
      // post standing on it, so whenever the plate's centre falls nearer the
      // eye than the post, the whole plate paints over the post's foot and it
      // vanishes as the model turns.
      //
      // The plate and everything mounted on it never interpenetrate — they are
      // separated by the plane of the plate top — so which side of that plane
      // the camera sits on settles their order outright, whatever the depths
      // say. sin(elevation) carries the z term of the depth, so its sign is
      // that side. Faces still sort on depth WITHIN each band.
      const above = Math.sin(this.elevation) >= 0 ? 1 : -1;
      this.scene.filter(item => this.visible(item)).forEach(item => {
        if (item.type === "slot") {
          slots.push(item);
          return;
        }
        const band = (item.group === "baseplate" ? 0 : 1) * above;
        item.faces.forEach(face => {
          const points = face.indexes.map(index =>
            this.project(item.points[index], scale, width, height)
          );
          const holes = (face.holes || []).map(hole =>
            hole.map(point => this.project(point, scale, width, height))
          );
          faces.push({
            points,
            holes,
            band,
            depth: points.reduce((sum, point) => sum + point.depth, 0) / points.length,
            color: shade(item.color, face.shade, item.alpha),
            outline: shade(item.color, -.34, Math.min(1, item.alpha + .08)),
            group: item.group
          });
        });
      });
      faces.sort((a, b) => (a.band - b.band) || (a.depth - b.depth));

      faces.forEach(face => {
        ctx.beginPath();
        face.points.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.closePath();
        face.holes.forEach(hole => {
          hole.forEach((point, index) => {
            if (index === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
          });
          ctx.closePath();
        });
        ctx.fillStyle = face.color;
        ctx.fill("evenodd");
        ctx.strokeStyle = face.outline;
        ctx.lineWidth = Math.max(1, ratio * .55);
        ctx.stroke();
      });

      slots.forEach(item => {
        const a = this.project(item.pointA, scale, width, height);
        const b = this.project(item.pointB, scale, width, height);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = PALETTE.slot;
        ctx.lineWidth = Math.max(3, item.width * scale);
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();
      });

      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,.88)";
      ctx.strokeStyle = "rgba(18,34,53,.18)";
      ctx.lineWidth = ratio;
      ctx.beginPath();
      ctx.roundRect(18 * ratio, 18 * ratio, 246 * ratio, 58 * ratio, 8 * ratio);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.ink;
      ctx.font = `700 ${12 * ratio}px Arial`;
      ctx.fillText(this.model.section.name, 31 * ratio, 43 * ratio);
      ctx.font = `${10 * ratio}px Arial`;
      ctx.fillStyle = "#536478";
      const subtitle = this.model.prototypeOnly
        ? this.model.baseplate
          ? `${Math.round(this.model.baseplate.overallLength_mm)} × ${this.model.baseplate.width_mm} × ${this.model.baseplate.thickness_mm} mm baseplate · ${this.model.baseplate.anchorCentres_mm.length} × Ø${this.model.baseplate.holeDiameter_mm}`
          : `${this.model.profile.a_mm} × ${this.model.profile.b_mm} × ${this.model.profile.t_mm} mm · Ri ${this.model.profile.innerRadius_mm} mm`
        : `${this.model.tieSchedule.count} paired tie levels · drag to orbit`;
      ctx.fillText(subtitle, 31 * ratio, 62 * ratio);
      ctx.restore();
    }

    destroy() {
      if (this.resizeObserver) this.resizeObserver.disconnect();
    }
  }

  function create(canvas) {
    return new CavityRenderer(canvas);
  }

  windpost.cavityWall3d = Object.freeze({
    create,
    buildScene,
    foldedLProfile,
    foldedUProfile,
    foldedLMesh,
    foldedUMesh,
    sectionPrototypeModel,
    buildSectionScene,
    prototypeBaseplateGeometry
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.cavityWall3d;
  }
})(typeof window !== "undefined" ? window : globalThis);
