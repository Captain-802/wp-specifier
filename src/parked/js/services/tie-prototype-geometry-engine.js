(function initialiseTiePrototypeGeometry(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  const round = value => Math.round(Number(value) * 1000) / 1000;

  function obroundPoints(cx, cy, length, width) {
    const points = [];
    const radius = width / 2;
    const straightHalf = (length - width) / 2;
    const segments = 10;
    for (let index = 0; index <= segments; index += 1) {
      const angle = -Math.PI / 2 + Math.PI * index / segments;
      points.push([
        round(cx + straightHalf + radius * Math.cos(angle)),
        round(cy + radius * Math.sin(angle))
      ]);
    }
    for (let index = 0; index <= segments; index += 1) {
      const angle = Math.PI / 2 + Math.PI * index / segments;
      points.push([
        round(cx - straightHalf + radius * Math.cos(angle)),
        round(cy + radius * Math.sin(angle))
      ]);
    }
    return Object.freeze(points.map(point => Object.freeze(point)));
  }

  function buildShear(profile) {
    const length = Number(profile.overallLength_mm);
    const width = Number(profile.width_mm);
    const thickness = Number(profile.thickness_mm);
    const radius = Number(profile.endRadius_mm);
    const centre = length / 2;
    const notchLength = Number(profile.engagementNotchLength_mm);
    const mirrored = Number(profile.mirroredEngagement_mm);
    const notchDepth = Number(profile.assumedSideNotchDepth_mm);
    // Each opposing notch is 7.6 mm long. Together they occupy the confirmed
    // 11.17 mm mirrored centre zone, so they overlap by 4.03 mm and leave the
    // S-shaped central web visible in the supplied shear-tie photograph.
    const leftNotchStart = centre - mirrored / 2;
    const leftNotchEnd = leftNotchStart + notchLength;
    const rightNotchEnd = centre + mirrored / 2;
    const rightNotchStart = rightNotchEnd - notchLength;

    const outline = [
      [radius, 0],
      [leftNotchStart, 0],
      [leftNotchStart, notchDepth],
      [leftNotchEnd, notchDepth],
      [leftNotchEnd, 0],
      [length - radius, 0],
      [length - radius, width],
      [rightNotchEnd, width],
      [rightNotchEnd, width - notchDepth],
      [rightNotchStart, width - notchDepth],
      [rightNotchStart, width],
      [radius, width]
    ].map(point => point.map(round));

    const rightArc = [];
    const leftArc = [];
    const arcSegments = 18;
    for (let index = 1; index < arcSegments; index += 1) {
      let angle = -Math.PI / 2 + Math.PI * index / arcSegments;
      rightArc.push([
        round(length - radius + radius * Math.cos(angle)),
        round(radius + radius * Math.sin(angle))
      ]);
      angle = Math.PI / 2 + Math.PI * index / arcSegments;
      leftArc.push([
        round(radius + radius * Math.cos(angle)),
        round(radius + radius * Math.sin(angle))
      ]);
    }
    const meshOutline = [
      ...outline.slice(0, 6),
      ...rightArc,
      ...outline.slice(6),
      ...leftArc
    ];
    const centres = [
      ...profile.slotCentresFromEnd_mm,
      ...[...profile.slotCentresFromEnd_mm]
        .reverse()
        .map(fromEnd => length - fromEnd)
    ];
    const slots = centres.map(cx => Object.freeze({
      centreX_mm: round(cx),
      centreY_mm: round(width / 2),
      length_mm: Number(profile.slotLength_mm),
      width_mm: Number(profile.slotWidth_mm),
      radius_mm: Number(profile.slotRadius_mm),
      outline: obroundPoints(
        cx,
        width / 2,
        Number(profile.slotLength_mm),
        Number(profile.slotWidth_mm)
      )
    }));

    return Object.freeze({
      profile,
      kind: "shear",
      length_mm: length,
      width_mm: width,
      thickness_mm: thickness,
      leadingRadius_mm: radius,
      trailingRadius_mm: radius,
      halfLength_mm: centre,
      notchLength_mm: notchLength,
      mirroredEngagement_mm: mirrored,
      notchDepth_mm: notchDepth,
      leftNotchStart_mm: round(leftNotchStart),
      leftNotchEnd_mm: round(leftNotchEnd),
      rightNotchStart_mm: round(rightNotchStart),
      rightNotchEnd_mm: round(rightNotchEnd),
      outline: Object.freeze(outline.map(point => Object.freeze(point))),
      meshOutline: Object.freeze(
        meshOutline.map(point => Object.freeze(point))
      ),
      slots: Object.freeze(slots)
    });
  }

  function build(profile) {
    if (profile && profile.family === "SHEAR") return buildShear(profile);
    const length = Number(profile.overallLength_mm);
    const width = Number(profile.width_mm);
    const thickness = Number(profile.thickness_mm);
    const notchLength = Number(profile.engagementNotchLength_mm);
    const tailLength = Number(profile.tailBeyondNotch_mm);
    const connectionLength = notchLength + tailLength;
    const notchStart = length - connectionLength;
    const tailStart = length - tailLength;

    // The supplied detail shows two equal drops inside the 7.6 mm engagement
    // zone. The user authorised assumed drops; the prototype uses 1 + 1 mm.
    const dropEach = Number(profile.assumedNotchDropEach_mm) || 1;
    const totalDrop = dropEach * 2;
    const stepAt = notchStart + notchLength / 2;
    const reliefDepth =
      Number(profile.referenceEndReliefDepth_mm) || width / 8;
    const reliefHalfHeight =
      Number(profile.referenceEndReliefHalfHeight_mm) || width / 4;
    const centreY = width / 2;
    const relief = [];
    const reliefSegments = 12;
    for (let index = 0; index <= reliefSegments; index += 1) {
      const angle = -Math.PI / 2 + Math.PI * index / reliefSegments;
      relief.push([
        round(length - reliefDepth * Math.cos(angle)),
        round(centreY + reliefHalfHeight * Math.sin(angle))
      ]);
    }

    const outline = [
      [width / 2, 0],
      [notchStart, 0],
      [notchStart, dropEach],
      [stepAt, dropEach],
      [stepAt, totalDrop],
      [tailStart, totalDrop],
      [tailStart, 0],
      [length, 0],
      ...relief,
      [length, width],
      [tailStart, width],
      [tailStart, width - totalDrop],
      [stepAt, width - totalDrop],
      [stepAt, width - dropEach],
      [notchStart, width - dropEach],
      [notchStart, width],
      [width / 2, width]
    ].map(point => point.map(round));
    const leadingArc = [];
    const arcSegments = 18;
    for (let index = 1; index < arcSegments; index += 1) {
      const angle = Math.PI / 2 + Math.PI * index / arcSegments;
      leadingArc.push([
        round(width / 2 + width / 2 * Math.cos(angle)),
        round(width / 2 + width / 2 * Math.sin(angle))
      ]);
    }
    const meshOutline = outline.concat(leadingArc);

    return Object.freeze({
      profile,
      kind: "edc",
      length_mm: length,
      width_mm: width,
      thickness_mm: thickness,
      leadingRadius_mm: width / 2,
      notchLength_mm: notchLength,
      tailLength_mm: tailLength,
      connectionLength_mm: connectionLength,
      notchStart_mm: round(notchStart),
      tailStart_mm: round(tailStart),
      stepAt_mm: round(stepAt),
      notchDropEach_mm: round(dropEach),
      notchTotalDrop_mm: round(totalDrop),
      endReliefDepth_mm: round(reliefDepth),
      endReliefHalfHeight_mm: round(reliefHalfHeight),
      outline: Object.freeze(outline.map(point => Object.freeze(point))),
      meshOutline: Object.freeze(
        meshOutline.map(point => Object.freeze(point))
      )
    });
  }

  function svgPath(geometry, transform) {
    const map = transform || ((x, y) => [x, y]);
    const p = geometry.outline.map(point => map(point[0], point[1]));
    const radius = geometry.leadingRadius_mm;
    const scaleRadius = transform
      ? Math.hypot(
          map(radius, 0)[0] - map(0, 0)[0],
          map(radius, 0)[1] - map(0, 0)[1]
        )
      : radius;
    const parts = [`M ${p[0][0]} ${p[0][1]}`];
    if (geometry.kind === "shear") {
      for (let index = 1; index <= 5; index += 1) {
        parts.push(`L ${p[index][0]} ${p[index][1]}`);
      }
      parts.push(
        `A ${scaleRadius} ${scaleRadius} 0 0 1 ${p[6][0]} ${p[6][1]}`
      );
      for (let index = 7; index < p.length; index += 1) {
        parts.push(`L ${p[index][0]} ${p[index][1]}`);
      }
      parts.push(
        `A ${scaleRadius} ${scaleRadius} 0 0 1 ${p[0][0]} ${p[0][1]}`,
        "Z"
      );
      return parts.join(" ");
    }
    for (let index = 1; index < p.length; index += 1) {
      parts.push(`L ${p[index][0]} ${p[index][1]}`);
    }
    parts.push(
      `A ${scaleRadius} ${scaleRadius} 0 0 1 ${p[0][0]} ${p[0][1]}`,
      "Z"
    );
    return parts.join(" ");
  }

  windpost.tiePrototypeGeometry = Object.freeze({ build, svgPath });
})(typeof window !== "undefined" ? window : globalThis);
