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
    anchor: "#4f5b66",
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
    const mapRawPoint = settings.transform ? settings.transform : ([rawX, rawY]) => {
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

  // Regular prism (cylinder / hex) standing on z0, radius r, height h.
  function prismFaces(cx, cy, z0, h, r, segments, pointsOut, facesOut, shadeTop) {
    const base = pointsOut.length;
    for (let ring = 0; ring < 2; ring += 1) {
      for (let index = 0; index < segments; index += 1) {
        const angle = (index / segments) * Math.PI * 2;
        pointsOut.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle), z0 + ring * h]);
      }
    }
    facesOut.push({ indexes: [...Array(segments).keys()].reverse().map(i => base + i), shade: -.2 });
    facesOut.push({ indexes: [...Array(segments).keys()].map(i => base + segments + i), shade: shadeTop == null ? .25 : shadeTop });
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      facesOut.push({
        indexes: [base + index, base + next, base + segments + next, base + segments + index],
        shade: .18 * Math.cos((index / segments) * Math.PI * 2 - .7) - .02
      });
    }
  }

  // RGM anchors in every plate hole: washer, hexagon head and the exposed
  // shank above the head. One scene item so the scene structure stays
  // post / baseplate / stiffener / anchors.
  function anchorBolts(geometry) {
    const points = [];
    const faces = [];
    const shank = geometry.holeDiameter_mm - 2;            // 12 for a 14 hole
    geometry.anchorCentres_mm.forEach(anchor => {
      prismFaces(anchor.x, anchor.y, 0, 3, shank, 16, points, faces, .3);        // washer
      prismFaces(anchor.x, anchor.y, 3, 0.65 * shank, shank * 0.95, 6, points, faces, .22); // nut / head
      prismFaces(anchor.x, anchor.y, 3 + 0.65 * shank, 0.35 * shank, shank / 2, 12, points, faces, .3); // shank end
    });
    return {
      type: "mesh",
      points,
      faces,
      color: PALETTE.anchor,
      alpha: 1,
      group: "anchors"
    };
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

  // DU on the slab faces: the two plates (DU-B2 at the foot, DU-T2 at the
  // head) stand on the inner-leaf face (y = 0), 6 thick towards the cavity;
  // the post's near flange face bears on them. The post end sits 8 mm inside
  // the plate edge, so the plates run from z = -8 to 142 and from
  // length - 142 to length + 8. Two M12 anchors per plate at the slot centres.
  const DU_FACE = Object.freeze({ clearance_mm: 6, inset_mm: 8 });
  function prototypeDuFacePlates(section, design, length_mm) {
    const plates = windpost.duSlabFacePlates;
    if (!plates) return null;
    const fromDesign = design && design.facePlates;
    const bottom = (fromDesign && fromDesign.bottom) || plates.geometryFor("DU-B2", section);
    const top = (fromDesign && fromDesign.top) || plates.geometryFor("DU-T2", section);
    if (!bottom || !top) return null;
    const plate = (g, z0) => Object.freeze({
      code: g.code,
      length_mm: g.plateLength_mm,
      height_mm: g.plateHeight_mm,
      thickness_mm: g.plateThickness_mm,
      z0_mm: z0,
      z1_mm: z0 + g.plateHeight_mm,
      anchorX_mm: Object.freeze(g.slotCentres_mm.map(x => x - g.plateLength_mm / 2)),
      anchorZ_mm: z0 + g.plateHeight_mm / 2,
      slotWidth_mm: g.slotWidth_mm,
      slotLength_mm: g.slotLength_mm
    });
    const foot = plate(bottom, -DU_FACE.inset_mm);
    const head = plate(top, length_mm + DU_FACE.inset_mm - top.plateHeight_mm);
    return Object.freeze({
      datum: "inner-leaf-concrete-edge",
      facePlate: true,
      clearance_mm: DU_FACE.clearance_mm,
      bottom: foot,
      top: head,
      startY_mm: -DU_FACE.clearance_mm,
      endY_mm: 0,
      overallLength_mm: foot.length_mm,
      width_mm: foot.height_mm,
      thickness_mm: foot.thickness_mm,
      holeDiameter_mm: foot.slotWidth_mm,
      rowCentres_mm: Object.freeze([foot.anchorZ_mm]),
      columnCentres_mm: foot.anchorX_mm,
      anchorCentres_mm: Object.freeze(foot.anchorX_mm.map(x => Object.freeze({ x, y: foot.anchorZ_mm }))),
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
    const isDU = section && section.type === "DU";
    const profile = isU || isDU ? foldedUProfile(section) : foldedLProfile(section);
    const isStandard = Boolean(baseplateDesign) &&
      baseplateDesign.anchorFromConcreteEdge != null;
    const baseplate = isDU
      ? (baseplateDesign ? prototypeDuFacePlates(section, baseplateDesign, length) : null)
      : isStandard
        ? prototypeSimpleBaseplateGeometry(section, baseplateDesign, isU)
        : isU
          ? prototypeUBaseplateGeometry(section, baseplateDesign)
          : prototypeBaseplateGeometry(section, baseplateDesign);
    if (isDU) {
      return {
        prototypeOnly: true,
        type: "DU",
        section,
        length_mm: length,
        wallLength_mm: 2 * profile.b_mm,
        totalWallDepth_mm: profile.a_mm,
        profile,
        slotPlacement: normalisePrototypeUSlot(profile, length, requestedSlotPlacement),
        baseplate,
        viewCentre: Object.freeze({ x: 0, y: -(DU_FACE.clearance_mm + profile.a_mm / 2), z: length / 2 }),
        viewWidth_mm: (baseplate ? baseplate.overallLength_mm : 2 * profile.b_mm) + profile.a_mm + 60,
        tieSchedule: { count: 0 }
      };
    }
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

  // A horizontal M12 anchor showing on the plate face: washer, hex head and
  // shank end built as a vertical prism and turned to point into the slab (+y).
  function facePlateAnchors(plate, clearance) {
    const points = [];
    const faces = [];
    const shank = 12;
    // built upright in one local array (prismFaces indexes from its length),
    // then every point is turned so the prism axis runs into the slab (+y)
    const local = [];
    plate.anchorX_mm.forEach(x => {
      prismFaces(x, plate.anchorZ_mm, 0, 3, shank, 16, local, faces, .3);
      prismFaces(x, plate.anchorZ_mm, 3, 0.65 * shank, shank * 0.95, 6, local, faces, .22);
      prismFaces(x, plate.anchorZ_mm, 3 + 0.65 * shank, 0.35 * shank, shank / 2, 12, local, faces, .3);
    });
    local.forEach(([px, py, pz]) => points.push([px, -clearance - pz, py]));
    return { type: "mesh", points, faces, color: PALETTE.anchor, alpha: 1, group: "anchors" };
  }

  function buildDuScene(model) {
    const clearance = DU_FACE.clearance_mm;
    // channel 1 to -x, channel 2 to +x; webs back to back at x = 0; the near
    // flanges at y = -clearance bear on the plate face
    const left = ([rawX, rawY]) => [-rawX, -clearance - rawY];
    const right = ([rawX, rawY]) => [rawX, -clearance - rawY];
    const posts = [left, right].map(transform => foldedUMesh(model.section, model.length_mm, {
      transform, arcSegments: 32, group: "post", slotCuts: model.slotPlacement
    }));
    const scene = posts.slice();
    const plates = model.baseplate;
    if (!plates || !plates.facePlate) return scene;
    [plates.bottom, plates.top].forEach(plate => {
      const box = cuboid(-plate.length_mm / 2, -clearance, plate.z0_mm, plate.length_mm, clearance, plate.height_mm, PALETTE.plate, .98, "baseplate");
      box.planeSides = { plate: -1 };
      scene.unshift(box);
      const anchors = facePlateAnchors(plate, clearance);
      anchors.planeSides = { plate: 1 };
      scene.push(anchors);
    });
    posts.forEach(post => { post.planeSides = { plate: 1 }; });
    model.sortPlanes = [{ id: "plate", normal: [0, -1, 0] }];
    return scene;
  }

  function buildSectionScene(model) {
    if (model.type === "DU") return buildDuScene(model);
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

    // Draw-order planes (see Viewer.draw): the plate top separates the plate
    // from everything mounted on it; the post face the stiffener bears on
    // separates the post from the stiffener. Each item records which side
    // of each plane it lies on, so the painter's sort never has to guess at
    // the junctions.
    const postPlane = model.type === "U"
      ? { id: "post", normal: [0, 1, 0] }        // U: stiffener in front of the flange face (y = -clearance)
      : { id: "post", normal: [1, 0, 0] };       // L: stiffener beside the long leg (x = t/2)
    scene[0].planeSides = { plate: 1, post: -1 };
    const plate = plateWithCircularHoles(model.baseplate);
    plate.planeSides = { plate: -1 };
    scene.unshift(plate);
    const anchors = anchorBolts(model.baseplate);
    anchors.planeSides = { plate: 1 };
    scene.push(anchors);
    model.sortPlanes = [{ id: "plate", normal: [0, 0, 1] }, postPlane];
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
    const stiffenerMesh = extrudedSidePlate(
      stiffenerProfile,
      stiffener.x0_mm,
      stiffener.thickness_mm,
      PALETTE.stiffener,
      "stiffener"
    );
    stiffenerMesh.planeSides = { plate: 1, post: 1 };
    scene.push(stiffenerMesh);
    return scene;
  }

  // Painter's-algorithm helper: a tall extrusion face (one quad the full post
  // height) has its centroid far from anything near the base, so the sort
  // misjudges it against the base plate, stiffener and anchors. Cut such
  // faces into short slices along the extrusion axis (z) so each slice sorts
  // on its own local depth. Slot holes stay whole inside one slice.
  const SLICE_LENGTH_MM = 150;
  function sliceFace(points3d, holes3d, sliceLength) {
    const step = sliceLength || SLICE_LENGTH_MM;
    if (points3d.length !== 4) return null;
    let order = [0, 1, 2, 3];
    const z = index => points3d[index][2];
    if (!(Math.abs(z(0) - z(1)) < 1e-6 && Math.abs(z(2) - z(3)) < 1e-6)) {
      if (Math.abs(z(1) - z(2)) < 1e-6 && Math.abs(z(3) - z(0)) < 1e-6) order = [1, 2, 3, 0];
      else return null;
    }
    const [a, b, c, d] = order.map(index => points3d[index]);   // a,b at z0; c,d at z1 (d above a, c above b)
    const z0 = a[2], z1 = c[2];
    const span = z1 - z0;
    if (Math.abs(span) <= step * 1.5) return null;
    const direction = span > 0 ? 1 : -1;
    const count = Math.ceil(Math.abs(span) / step);
    let bounds = [];
    for (let index = 1; index < count; index += 1) bounds.push(z0 + direction * index * step);
    const holeRanges = (holes3d || []).map(hole => {
      const zs = hole.map(point => point[2]);
      return [Math.min(...zs), Math.max(...zs)];
    });
    bounds = bounds.map(bound => {
      const hit = holeRanges.find(([lo, hi]) => bound > lo && bound < hi);
      return hit ? hit[1] + 0.5 * direction : bound;
    }).filter(bound => direction > 0 ? bound > z0 && bound < z1 : bound < z0 && bound > z1);
    bounds = [...new Set(bounds)].sort((p, q) => direction * (p - q));
    const stops = [z0, ...bounds, z1];
    const lerp = (from, to, zz) => {
      const ratio = (zz - from[2]) / (to[2] - from[2]);
      return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio, zz];
    };
    const slices = [];
    for (let index = 0; index < stops.length - 1; index += 1) {
      const za = stops[index], zb = stops[index + 1];
      const quad = [lerp(a, d, za), lerp(b, c, za), lerp(b, c, zb), lerp(a, d, zb)];
      const inside = (holes3d || []).filter(hole => {
        const mid = hole.reduce((sum, point) => sum + point[2], 0) / hole.length;
        return direction > 0 ? mid >= za && mid < zb : mid <= za && mid > zb;
      });
      slices.push({ points: quad, holes: inside });
    }
    return slices;
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

  // The camera starts on the cavity side, front-left and above, the way the
  // product renders show a windpost: outer leaf cut away in front, post in the
  // cavity, inner leaf and slab behind.
  const DEFAULT_VIEW = Object.freeze({ azimuth: Math.PI + 0.62, elevation: 0.42 });

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  class CavityRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      // WebGL (depth buffer, shadows, materials) when the browser has it; the
      // 2D painter otherwise. A canvas can hold only one kind of context, so
      // the 2D context is created only when WebGL is refused.
      const glFactory = windpost.windpostGlRenderer;
      this.gl = glFactory && windpost.sceneMesh ? glFactory.create(canvas) : null;
      this.ctx = this.gl ? null : canvas.getContext("2d");
      this.azimuth = DEFAULT_VIEW.azimuth;
      this.elevation = DEFAULT_VIEW.elevation;
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this.interactionMode = "orbit";
      this.dragAction = null;
      this.dragging = false;
      this.lastPoint = null;
      this.options = { inner: true, outer: true, ties: true, concrete: true };
      // Cavity-wall context drawn around a prototype post in the WebGL path.
      this.context = { showWall: true, wall: null, supportCondition: "cantilever" };
      this.sceneVersion = 0;
      this.geometryKey = null;
      this.geometry = null;
      this.badge = null;
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
      this.sceneVersion += 1;
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
      this.sceneVersion += 1;
      this.draw();
    }

    // Wall context for the WebGL picture: { showWall, wall: { innerLeaf-
    // Thickness_mm, cavityWidth_mm, outerLeafThickness_mm }, supportCondition }.
    setContext(partial) {
      this.context = Object.assign({}, this.context, partial || {});
      this.draw();
    }

    setVisibility(name, visible) {
      if (Object.prototype.hasOwnProperty.call(this.options, name)) {
        this.options[name] = Boolean(visible);
        this.draw();
      }
    }

    reset() {
      this.azimuth = DEFAULT_VIEW.azimuth;
      this.elevation = DEFAULT_VIEW.elevation;
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this.draw();
    }

    // The section badge is painted on the canvas in the 2D path; WebGL has no
    // text, so it is an HTML overlay laid over the canvas instead.
    ensureBadge() {
      if (this.badge || typeof document === "undefined") return null;
      const parent = this.canvas.parentNode;
      if (!parent || !parent.insertBefore) return null;
      const badge = document.createElement("div");
      badge.className = "viewer-badge";
      badge.setAttribute("aria-hidden", "true");
      parent.insertBefore(badge, this.canvas.nextSibling);
      this.badge = badge;
      return badge;
    }

    badgeText() {
      const model = this.model;
      const subtitle = model.prototypeOnly
        ? model.baseplate && model.baseplate.facePlate
          ? `${model.baseplate.bottom.code} ${model.baseplate.bottom.length_mm} × ${model.baseplate.bottom.height_mm} × ${model.baseplate.bottom.thickness_mm} · ${model.baseplate.top.code} ${model.baseplate.top.length_mm} × ${model.baseplate.top.height_mm} × ${model.baseplate.top.thickness_mm} mm`
        : model.baseplate
          ? `${Math.round(model.baseplate.overallLength_mm)} × ${model.baseplate.width_mm} × ${model.baseplate.thickness_mm} mm baseplate · ${model.baseplate.anchorCentres_mm.length} × Ø${model.baseplate.holeDiameter_mm}`
          : `${model.profile.a_mm} × ${model.profile.b_mm} × ${model.profile.t_mm} mm · Ri ${model.profile.innerRadius_mm} mm`
        : `${model.tieSchedule.count} paired tie levels · drag to orbit`;
      return { title: model.section.name, subtitle };
    }

    updateBadge() {
      const badge = this.ensureBadge();
      if (!badge) return;
      const text = this.badgeText();
      badge.innerHTML = `<strong>${escapeHtml(text.title)}</strong><span>${escapeHtml(text.subtitle)}</span>`;
      badge.style.top = `${(this.canvas.offsetTop || 0) + 18}px`;
    }

    // Camera direction in model space, shared by both renderers.
    viewDirection() {
      return [
        Math.sin(this.azimuth) * Math.cos(this.elevation),
        Math.cos(this.azimuth) * Math.cos(this.elevation),
        Math.sin(this.elevation)
      ];
    }

    drawGl() {
      const meshEngine = windpost.sceneMesh;
      const key = [
        this.sceneVersion,
        JSON.stringify(this.context),
        JSON.stringify(this.options)
      ].join("|");
      if (this.geometryKey !== key) {
        const visibleScene = this.scene.filter(item => this.visible(item));
        this.geometry = meshEngine.build(visibleScene, this.model, this.context);
        this.gl.setGeometry(this.geometry);
        this.geometryKey = key;
      }
      const bounds = this.geometry.bounds;
      const width = this.canvas.width;
      const height = this.canvas.height;
      const aspect = width / Math.max(1, height);
      const fovY = 24 * Math.PI / 180;
      const halfTan = Math.tan(fovY / 2);
      const extentZ = bounds.max[2] - bounds.min[2];
      const extentXY = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1]);
      const distance = Math.max(
        extentZ * 1.12 / (2 * halfTan),
        extentXY * 0.62 / (2 * halfTan * aspect),
        bounds.radius * 1.2
      ) / this.zoom;
      const target = bounds.centre;
      const direction = this.viewDirection();
      const eye = [
        target[0] + direction[0] * distance,
        target[1] + direction[1] * distance,
        target[2] + direction[2] * distance
      ];
      // Studio light fixed to the camera: upper-left-front, so every orbit is lit.
      const forward = [-direction[0], -direction[1], -direction[2]];
      let right = [forward[1], -forward[0], 0];
      const rightLength = Math.hypot(right[0], right[1]) || 1;
      right = [right[0] / rightLength, right[1] / rightLength, 0];
      const up = [
        right[1] * forward[2] - right[2] * forward[1],
        right[2] * forward[0] - right[0] * forward[2],
        right[0] * forward[1] - right[1] * forward[0]
      ];
      const mix = (a, b, c) => [
        right[0] * a + up[0] * b + direction[0] * c,
        right[1] * a + up[1] * b + direction[1] * c,
        right[2] * a + up[2] * b + direction[2] * c
      ];
      const ratio = Math.min(2, global.devicePixelRatio || 1);
      this.gl.render({
        eye,
        target,
        fovY,
        near: Math.max(1, distance * 0.04),
        far: distance * 6 + bounds.radius * 4,
        pan: [2 * this.panX * ratio / Math.max(1, width), -2 * this.panY * ratio / Math.max(1, height)],
        lightDir: mix(-0.42, 0.72, 0.55),
        fillDir: mix(0.75, 0.15, 0.35)
      });
      this.updateBadge();
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
      if (this.gl) {
        this.drawGl();
        return;
      }
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
      // Camera direction in model space = gradient of the depth term.
      const viewDir = [
        Math.sin(this.azimuth) * Math.cos(this.elevation),
        Math.cos(this.azimuth) * Math.cos(this.elevation),
        Math.sin(this.elevation)
      ];
      const planes = this.model.sortPlanes || [{ id: "plate", normal: [0, 0, 1] }];
      const planeSign = planes.map(plane => {
        const dot = plane.normal[0] * viewDir[0] + plane.normal[1] * viewDir[1] + plane.normal[2] * viewDir[2];
        return dot >= 0 ? 1 : -1;
      });
      const bandsFor = item => planes.map((plane, index) => {
        const side = item.planeSides && item.planeSides[plane.id] != null
          ? item.planeSides[plane.id]
          : (plane.id === "plate" ? (item.group === "baseplate" ? -1 : 1) : 0);
        return side * planeSign[index];
      });
      const compareBands = (a, b) => {
        for (let index = 0; index < a.length; index += 1) {
          if (a[index] !== b[index]) return a[index] - b[index];
        }
        return 0;
      };
      void above;
      this.scene.filter(item => this.visible(item)).forEach(item => {
        if (item.type === "slot") {
          slots.push(item);
          return;
        }
        const bands = bandsFor(item);
        const pushFace = (points3d, holes3d, face) => {
          const points = points3d.map(point => this.project(point, scale, width, height));
          const holes = (holes3d || []).map(hole =>
            hole.map(point => this.project(point, scale, width, height))
          );
          faces.push({
            points,
            holes,
            bands,
            depth: points.reduce((sum, point) => sum + point.depth, 0) / points.length,
            color: shade(item.color, face.shade, item.alpha),
            outline: shade(item.color, -.34, Math.min(1, item.alpha + .08)),
            group: item.group
          });
        };
        item.faces.forEach(face => {
          const points3d = face.indexes.map(index => item.points[index]);
          const slices = item.group === "post" ? sliceFace(points3d, face.holes) : null;
          if (slices) slices.forEach(slice => pushFace(slice.points, slice.holes, face));
          else pushFace(points3d, face.holes, face);
        });
      });
      faces.sort((a, b) => compareBands(a.bands, b.bands) || (a.depth - b.depth));

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
      if (this.gl) this.gl.destroy();
      if (this.badge && this.badge.parentNode) this.badge.parentNode.removeChild(this.badge);
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
