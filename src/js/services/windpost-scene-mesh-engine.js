(function initialiseWindpostSceneMeshEngine(global) {
  "use strict";

  // Turns the polygon-face scene of cavity-wall-3d-engine (post, base plate,
  // stiffener, anchors, masonry cuboids) into triangle meshes with smooth
  // vertex normals, and adds the cavity-wall context the product renders show:
  // floor slabs, a stepped cut-away brick outer leaf with perforated bricks, a
  // block inner leaf built around the post, wall ties at every slot level and
  // the head connection. Pure geometry — no DOM, no WebGL — so it is testable
  // in Node and the renderer only ever sees typed arrays.

  const windpost = global.Windpost = global.Windpost || {};

  const MATERIAL = Object.freeze({
    stainless: 0,
    plate: 1,
    anchor: 2,
    concrete: 3,
    brick: 4,
    mortar: 5,
    block: 6,
    ground: 7
  });

  const GROUP_MATERIAL = Object.freeze({
    post: MATERIAL.stainless,
    stiffener: MATERIAL.stainless,
    ties: MATERIAL.stainless,
    baseplate: MATERIAL.plate,
    anchors: MATERIAL.anchor,
    concrete: MATERIAL.concrete,
    inner: MATERIAL.block,
    outer: MATERIAL.brick
  });

  const MASONRY = Object.freeze({
    brick: Object.freeze({ length_mm: 215, depth_mm: 102.5, height_mm: 65, joint_mm: 10, course_mm: 75 }),
    block: Object.freeze({ length_mm: 440, depth_mm: 100, height_mm: 215, joint_mm: 10, course_mm: 225 }),
    wallHalfLength_mm: 500,
    slabDepth_mm: 225,
    slabBack_mm: 360,
    headGap_mm: 15
  });

  const EPS = 1e-9;

  // ---------------------------------------------------------------- vectors

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function length(a) { return Math.sqrt(dot(a, a)); }
  function normalise(a) {
    const l = length(a);
    return l > EPS ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1];
  }

  // Newell's method: the area-weighted normal of a (possibly concave) polygon.
  function polygonNormal(points) {
    const n = [0, 0, 0];
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i], q = points[(i + 1) % points.length];
      n[0] += (p[1] - q[1]) * (p[2] + q[2]);
      n[1] += (p[2] - q[2]) * (p[0] + q[0]);
      n[2] += (p[0] - q[0]) * (p[1] + q[1]);
    }
    return n;
  }

  // ---------------------------------------------------------- triangulation

  function signedArea2(poly) {
    let a = 0;
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }

  function orient(a, b, c) {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  }

  function samePoint(a, b) {
    return Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
  }

  // Proper crossing of two segments; touching at a shared endpoint is not one.
  function segmentsCross(p1, p2, q1, q2) {
    if (samePoint(p1, q1) || samePoint(p1, q2) || samePoint(p2, q1) || samePoint(p2, q2)) return false;
    const d1 = orient(q1, q2, p1), d2 = orient(q1, q2, p2);
    const d3 = orient(p1, p2, q1), d4 = orient(p1, p2, q2);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  function pointInTriangle(p, a, b, c) {
    if (samePoint(p, a) || samePoint(p, b) || samePoint(p, c)) return false;
    const d1 = orient(a, b, p), d2 = orient(b, c, p), d3 = orient(c, a, p);
    const neg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
    const pos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
    return !(neg && pos);
  }

  // Splice every hole into the outer ring with a bridge edge (outer vertex to
  // the hole's right-most vertex) that crosses nothing, giving one simple
  // polygon that ear clipping can consume. Entries are {p:[x,y], i:index}.
  function mergeHoles(outer, holes) {
    let ring = outer.slice();
    const edges = poly => poly.map((v, i) => [v.p, poly[(i + 1) % poly.length].p]);
    const sorted = holes.slice().sort((a, b) =>
      Math.max(...b.map(v => v.p[0])) - Math.max(...a.map(v => v.p[0])));
    sorted.forEach(hole => {
      let start = 0;
      hole.forEach((v, i) => { if (v.p[0] > hole[start].p[0]) start = i; });
      const rotated = hole.slice(start).concat(hole.slice(0, start));
      const h = rotated[0].p;
      const blocking = edges(ring).concat(...sorted.filter(o => o !== hole).map(edges));
      let best = -1, bestDistance = Infinity;
      ring.forEach((v, i) => {
        const d = (v.p[0] - h[0]) ** 2 + (v.p[1] - h[1]) ** 2;
        if (d >= bestDistance) return;
        if (blocking.some(([a, b]) => segmentsCross(h, v.p, a, b))) return;
        best = i;
        bestDistance = d;
      });
      if (best < 0) best = 0;
      ring = ring.slice(0, best + 1).concat(rotated, [rotated[0]], [ring[best]], ring.slice(best + 1));
    });
    return ring;
  }

  // Ear clipping on a simple polygon of {p, i} entries; returns index triples.
  function earClip(ring) {
    const out = [];
    let poly = ring.slice();
    if (signedArea2(poly.map(v => v.p)) < 0) poly.reverse();
    let guard = 0;
    while (poly.length > 3 && guard < 5000) {
      guard += 1;
      let clipped = false;
      let flattest = 0, flattestValue = Infinity;
      for (let i = 0; i < poly.length; i += 1) {
        const prev = poly[(i + poly.length - 1) % poly.length];
        const cur = poly[i];
        const next = poly[(i + 1) % poly.length];
        const turn = orient(prev.p, cur.p, next.p);
        if (Math.abs(turn) < flattestValue) { flattestValue = Math.abs(turn); flattest = i; }
        if (turn <= 1e-9) continue;
        let blocked = false;
        for (let k = 0; k < poly.length && !blocked; k += 1) {
          const v = poly[k];
          if (v === prev || v === cur || v === next) continue;
          if (pointInTriangle(v.p, prev.p, cur.p, next.p)) blocked = true;
        }
        if (blocked) continue;
        out.push([prev.i, cur.i, next.i]);
        poly.splice(i, 1);
        clipped = true;
        break;
      }
      if (!clipped) poly.splice(flattest, 1);      // degenerate corner: drop it
    }
    if (poly.length === 3 && Math.abs(orient(poly[0].p, poly[1].p, poly[2].p)) > 1e-9) {
      out.push([poly[0].i, poly[1].i, poly[2].i]);
    }
    return out;
  }

  // Every holed face in the scenes is a rectangle with convex holes (plate
  // anchor holes, post slots, brick perforations). Cut it into vertical
  // bands between the holes, and split each hole's band into the piece
  // above and the piece below the hole: simple polygons only, which ear
  // clipping handles without bridge edges. Works in 2D (u along one
  // rectangle edge, v along the other); null when the layout does not fit.
  function bandDecompose(outer, holes) {
    const eps = 1e-6;
    const us = outer.map(p => p[0]), vs = outer.map(p => p[1]);
    const umin = Math.min(...us), umax = Math.max(...us);
    const vmin = Math.min(...vs), vmax = Math.max(...vs);
    const aligned = outer.every(p =>
      (Math.abs(p[0] - umin) < eps || Math.abs(p[0] - umax) < eps) &&
      (Math.abs(p[1] - vmin) < eps || Math.abs(p[1] - vmax) < eps));
    if (!aligned || umax - umin < eps || vmax - vmin < eps) return null;
    const spans = holes.map(hole => {
      let left = 0, right = 0;
      hole.forEach((p, i) => {
        if (p[0] < hole[left][0]) left = i;
        if (p[0] > hole[right][0]) right = i;
      });
      return { hole, left, right, u0: hole[left][0], u1: hole[right][0] };
    }).sort((a, b) => a.u0 - b.u0);
    for (let i = 0; i < spans.length; i += 1) {
      const span = spans[i];
      if (span.u0 <= umin + eps || span.u1 >= umax - eps) return null;
      if (Math.min(...span.hole.map(p => p[1])) <= vmin + eps || Math.max(...span.hole.map(p => p[1])) >= vmax - eps) return null;
      if (i > 0 && span.u0 <= spans[i - 1].u1 + eps) return null;
    }
    const chain = (hole, from, to) => {
      const forward = [], backward = [];
      for (let i = from; ; i = (i + 1) % hole.length) { forward.push(hole[i]); if (i === to) break; }
      for (let i = from; ; i = (i + hole.length - 1) % hole.length) { backward.push(hole[i]); if (i === to) break; }
      const mean = pts => pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
      return mean(forward) >= mean(backward) ? { upper: forward, lower: backward } : { upper: backward, lower: forward };
    };
    const pieces = [];
    const rect = (a, b) => {
      if (b - a > eps) pieces.push([[a, vmin], [b, vmin], [b, vmax], [a, vmax]]);
    };
    let cursor = umin;
    spans.forEach(span => {
      rect(cursor, span.u0);
      const chains = chain(span.hole, span.right, span.left);      // rightmost -> leftmost
      pieces.push([[span.u0, vmax], [span.u1, vmax], ...chains.upper]);
      pieces.push([[span.u1, vmin], [span.u0, vmin], ...chains.lower.slice().reverse()]);   // leftmost -> rightmost
      cursor = span.u1;
    });
    rect(cursor, umax);
    return pieces;
  }

  // Triangulate a planar 3D polygon with optional holes. Returns
  // { normal, triangles: [[p,q,r], ...] } with triangle winding following the
  // outer ring's winding (so the normal is the Newell normal of the ring).
  function triangulateFace(points3d, holes3d) {
    const normal = normalise(polygonNormal(points3d));
    const origin = points3d[0];
    const holeRings = (holes3d || []).filter(hole => hole && hole.length >= 3);

    // basis: along the first edge for quads (rectangles come out axis-aligned)
    const bases = [];
    if (points3d.length === 4) {
      const edge = normalise(sub(points3d[1], points3d[0]));
      const perpendicular = cross(normal, edge);
      bases.push([edge, perpendicular], [perpendicular, [-edge[0], -edge[1], -edge[2]]]);
    }
    const axis = Math.abs(normal[0]) < 0.6 ? [1, 0, 0] : Math.abs(normal[1]) < 0.6 ? [0, 1, 0] : [0, 0, 1];
    const u0 = normalise(cross(normal, axis));
    bases.push([u0, cross(normal, u0)]);

    const outer2dIn = (u, v) => points3d.map(p => [dot(sub(p, origin), u), dot(sub(p, origin), v)]);
    const outerCcw = signedArea2(outer2dIn(bases[0][0], bases[0][1])) >= 0;
    const orientTriangles = triangles => outerCcw ? triangles : triangles.map(t => [t[0], t[2], t[1]]);

    if (holeRings.length) {
      for (let b = 0; b < bases.length; b += 1) {
        const [u, v] = bases[b];
        const to2d = p => [dot(sub(p, origin), u), dot(sub(p, origin), v)];
        const from2d = q => [
          origin[0] + q[0] * u[0] + q[1] * v[0],
          origin[1] + q[0] * u[1] + q[1] * v[1],
          origin[2] + q[0] * u[2] + q[1] * v[2]
        ];
        const pieces = bandDecompose(points3d.map(to2d), holeRings.map(hole => hole.map(to2d)));
        if (!pieces) continue;
        const triangles = [];
        pieces.forEach(piece => {
          const ring = piece.map((q, i) => ({ p: q, i }));
          earClip(ring).forEach(t => triangles.push(t.map(i => from2d(piece[i]))));
        });
        // earClip emits counter-clockwise triangles in (u, v); the bases are
        // right-handed with the normal, so that matches the Newell normal
        return { normal, triangles: orientTriangles(triangles.map(t => outerCcw ? t : [t[0], t[2], t[1]])) };
      }
    }

    // general path: bridge holes into the outer ring, then ear clip
    const [u, v] = bases[bases.length - 1];
    const to2d = p => [dot(sub(p, origin), u), dot(sub(p, origin), v)];
    const all = points3d.slice();
    const outer = points3d.map((p, i) => ({ p: to2d(p), i }));
    const ccw = signedArea2(outer.map(e => e.p)) >= 0;
    if (!ccw) outer.reverse();
    const holes = holeRings.map(hole => {
      const base = all.length;
      hole.forEach(p => all.push(p));
      const ring = hole.map((p, i) => ({ p: to2d(p), i: base + i }));
      if (signedArea2(ring.map(e => e.p)) > 0) ring.reverse();      // holes clockwise
      return ring;
    });
    const ring = holes.length ? mergeHoles(outer, holes) : outer;
    let triangles = earClip(ring).map(t => t.map(i => all[i]));
    if (!ccw) triangles = triangles.map(t => [t[0], t[2], t[1]]);
    return { normal, triangles };
  }

  // ---------------------------------------------------------- items -> mesh

  function itemFaces(item) {
    return item.faces.map(face => ({
      points: face.indexes.map(index => item.points[index]),
      holes: face.holes || null
    }));
  }

  // Sum of (centroid . n) * area over the faces: negative means every face
  // winds inward, so the whole item is flipped. Items from the scene engine
  // are self-consistent, either all outward or all inward.
  function signedVolume(faces) {
    let volume = 0;
    faces.forEach(face => {
      const n = polygonNormal(face.points);
      const c = face.points.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0])
        .map(x => x / face.points.length);
      volume += dot(c, n);
    });
    return volume;
  }

  const CREASE_COS = Math.cos(34 * Math.PI / 180);

  function positionKey(p) {
    return `${Math.round(p[0] * 100)}|${Math.round(p[1] * 100)}|${Math.round(p[2] * 100)}`;
  }

  // Triangulate an item and smooth its normals across shallow creases (the
  // fold radii of the post) while keeping sharp edges sharp.
  function itemToMesh(item, options) {
    const settings = options || {};
    const faces = itemFaces(item);
    const flip = settings.oriented ? false : signedVolume(faces) < 0;
    const tris = [];
    const adjacency = new Map();
    faces.forEach(face => {
      const result = triangulateFace(face.points, face.holes);
      let normal = result.normal;
      let triangles = result.triangles;
      if (flip) {
        normal = [-normal[0], -normal[1], -normal[2]];
        triangles = triangles.map(t => [t[0], t[2], t[1]]);
      }
      const area = length(polygonNormal(face.points)) / 2;
      const record = { normal, area };
      face.points.forEach(p => {
        const key = positionKey(p);
        if (!adjacency.has(key)) adjacency.set(key, []);
        adjacency.get(key).push(record);
      });
      triangles.forEach(t => tris.push({ points: t, normal, record }));
    });
    const positions = [];
    const normals = [];
    tris.forEach(tri => {
      tri.points.forEach(p => {
        const shared = adjacency.get(positionKey(p)) || [];
        let n = [0, 0, 0];
        shared.forEach(r => {
          if (dot(r.normal, tri.normal) >= CREASE_COS) {
            n = [n[0] + r.normal[0] * r.area, n[1] + r.normal[1] * r.area, n[2] + r.normal[2] * r.area];
          }
        });
        if (length(n) < EPS) n = tri.normal;
        n = normalise(n);
        positions.push(p[0], p[1], p[2]);
        normals.push(n[0], n[1], n[2]);
      });
    });
    return {
      positions,
      normals,
      material: settings.material != null ? settings.material : MATERIAL.stainless,
      tint: settings.tint != null ? settings.tint : 0.5,
      group: item.group || ""
    };
  }

  // -------------------------------------------------------- box primitives

  // Axis-aligned box with outward faces. Optional vertical through-holes
  // (perforated brick): circles cut in the top and bottom faces with inward-
  // facing hole walls.
  function box(x0, y0, z0, x1, y1, z1, group, holes) {
    const points = [
      [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
      [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]
    ];
    const faces = [
      { indexes: [0, 1, 5, 4] },      // y0
      { indexes: [1, 2, 6, 5] },      // x1
      { indexes: [2, 3, 7, 6] },      // y1
      { indexes: [3, 0, 4, 7] },      // x0
      { indexes: [4, 5, 6, 7] },      // top
      { indexes: [0, 3, 2, 1] }       // bottom
    ];
    const item = { type: "box", points, faces, group: group || "" };
    if (holes && holes.length) {
      const segments = 20;
      faces[4].holes = holes.map(h => ring(h.x, h.y, z1, h.r, segments));
      faces[5].holes = holes.map(h => ring(h.x, h.y, z0, h.r, segments));
      holes.forEach(h => {
        const base = points.length;
        for (let i = 0; i < segments; i += 1) {
          const a = 2 * Math.PI * i / segments;
          points.push([h.x + h.r * Math.cos(a), h.y + h.r * Math.sin(a), z0]);
        }
        for (let i = 0; i < segments; i += 1) {
          const a = 2 * Math.PI * i / segments;
          points.push([h.x + h.r * Math.cos(a), h.y + h.r * Math.sin(a), z1]);
        }
        for (let i = 0; i < segments; i += 1) {
          const next = (i + 1) % segments;
          // wall faces wind so their normal points into the hole (out of the solid)
          faces.push({ indexes: [base + i, base + segments + i, base + segments + next, base + next] });
        }
      });
    }
    return item;
  }

  function ring(cx, cy, z, r, segments) {
    const out = [];
    for (let i = 0; i < segments; i += 1) {
      const a = 2 * Math.PI * i / segments;
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z]);
    }
    return out;
  }

  // Regular prism standing on z0 (bolt washers, heads and shanks).
  function prism(cx, cy, z0, h, r, segments, group) {
    const points = [];
    for (let k = 0; k < 2; k += 1) {
      for (let i = 0; i < segments; i += 1) {
        const a = 2 * Math.PI * i / segments;
        points.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z0 + k * h]);
      }
    }
    const faces = [
      { indexes: [...Array(segments).keys()].reverse() },
      { indexes: [...Array(segments).keys()].map(i => segments + i) }
    ];
    for (let i = 0; i < segments; i += 1) {
      const next = (i + 1) % segments;
      faces.push({ indexes: [i, next, segments + next, segments + i] });
    }
    return { type: "prism", points, faces, group: group || "" };
  }

  // A bolt standing on a surface at z (direction +1 up, -1 hanging down).
  function bolt(cx, cy, z, shank, direction, group) {
    const d = direction < 0 ? -1 : 1;
    const parts = [];
    const stack = (height, radius, segments) => {
      const z0 = d > 0 ? stack.z : stack.z - height;
      parts.push(prism(cx, cy, z0, height, radius, segments, group));
      stack.z += d * height;
    };
    stack.z = z;
    stack(3, shank, 20);                       // washer
    stack(0.65 * shank, 0.95 * shank, 6);      // hexagon head
    stack(0.35 * shank, shank / 2, 14);        // shank end
    return parts;
  }

  // ---------------------------------------------------------- wall context

  function hash01(seed) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  // Where the post stands relative to the wall datum (y = 0 is the cavity
  // face of the inner leaf; +y into the inner leaf; z up the post).
  function postPlacement(model) {
    const profile = model.profile;
    const a = profile.a_mm, b = profile.b_mm, t = profile.t_mm;
    if (model.type === "DU") {
      // two channels, webs at x = 0, flanges out to +-b; one U tie per channel
      // through its flange slots, 25 mm from each outer tip
      const offset = Number(model.slotPlacement.flangeOffsetFromTip_mm || 25);
      return {
        type: "DU",
        faceMounted: true,
        tieXs: [-(b - offset), b - offset],
        embedded: false,
        legHalfWidth: 0
      };
    }
    if (model.type === "U") {
      const clearance = (windpost.uBaseplateGeom && Number(windpost.uBaseplateGeom.CLEAR)) || 6;
      const slotX = b / 2 - Number(model.slotPlacement.flangeOffsetFromTip_mm || 25);
      return {
        type: "U",
        webX: -b / 2,
        frontFlangeY: -clearance,
        rearFlangeY: -clearance - a,
        tieX: slotX,
        embedded: false,
        legHalfWidth: 0
      };
    }
    const embed = 90;
    return {
      type: "L",
      longLegX0: -t / 2,
      longLegX1: t / 2,
      longLegY0: -(a - embed),
      longLegY1: embed,
      shortLegX0: t / 2 - b,
      longSlotY: embed - Number(model.slotPlacement.offsetFromOuterEdge_mm || 40),
      shortSlotX: t / 2 - b + Number(model.slotPlacement.shortLegOffsetFromTip_mm || 25),
      embedded: true,
      legHalfWidth: t / 2
    };
  }

  function wallOf(context) {
    const wall = (context && context.wall) || {};
    return {
      inner: Number(wall.innerLeafThickness_mm) || 100,
      cavity: Number(wall.cavityWidth_mm) || 100,
      outer: Number(wall.outerLeafThickness_mm) || 102.5
    };
  }

  function contextItems(model, context) {
    const items = [];
    if (!model || !model.baseplate || !model.profile) return items;
    const wall = wallOf(context);
    const simplySupported = (context && context.supportCondition === "simplySupported") || model.type === "DU";
    const L = model.length_mm;
    const tp = model.baseplate.thickness_mm || 0;
    const post = postPlacement(model);
    const Wx = MASONRY.wallHalfLength_mm;
    const brick = MASONRY.brick, block = MASONRY.block;
    // A face-mounted post (DU) hangs on the slab faces: the slabs stop at the
    // inner-leaf line, the foot plate sits 150 mm below the slab top and the
    // head plate 150 mm above the soffit, so the post overlaps both slabs.
    const faceMounted = Boolean(post.faceMounted);
    const zSlabTop = faceMounted ? 150 : -tp;
    const zSlabBottom = zSlabTop - MASONRY.slabDepth_mm;
    const yInner0 = 0, yInner1 = wall.inner;
    const yOuter1 = -wall.cavity, yOuter0 = -wall.cavity - wall.outer;
    const yBack = wall.inner + MASONRY.slabBack_mm;
    const slabFront = faceMounted ? 0 : -wall.cavity + 4;
    const zSoffit = faceMounted ? L - 150 : L + MASONRY.headGap_mm;
    const zInnerTop = simplySupported ? zSoffit : L + 75;
    const zInnerBase = faceMounted ? zSlabTop : 0;
    const push = (item, material, tint) => items.push({ item, material, tint });

    // floor slabs (the post spans between them; a cantilever has only the base)
    push(box(-Wx - 60, slabFront, zSlabBottom, Wx + 60, yBack, zSlabTop, "concrete"), MATERIAL.concrete);
    if (simplySupported) {
      push(box(-Wx - 60, slabFront, zSoffit, Wx + 60, yBack, zSoffit + MASONRY.slabDepth_mm, "concrete"), MATERIAL.concrete);
    }

    // Both leaves are cut away in steps so the post stays in view from the
    // cavity side: the block inner leaf recedes to +x, the brick outer leaf
    // to -x, the way the product renders show a windpost.
    const gap = post.embedded ? post.legHalfWidth + 8 : 0;
    const blockCourses = Math.max(2, Math.min(5, Math.round(0.45 * L / block.course_mm)));
    const blockStep = (2 * Wx - 300) / blockCourses;
    // Mortar bodies sit 6-8 mm behind the unit faces so the joints read as
    // recessed; a body only rises to the unit top where nothing sits above.
    const mortarBody = (x0, x1, y0, y1, z0, zUnitTop, zCourseTop, coveredFrom, coveredTo) => {
      if (x1 - x0 < 4) return;
      const clampX = v => Math.min(x1, Math.max(x0, v));
      const c0 = clampX(coveredFrom), c1 = clampX(coveredTo);
      if (c1 - c0 > 4) push(box(c0, y0, z0, c1, y1, zCourseTop, "mortar"), MATERIAL.mortar);
      if (c0 - x0 > 4) push(box(x0, y0, z0, c0, y1, zUnitTop, "mortar"), MATERIAL.mortar);
      if (x1 - c1 > 4) push(box(c1, y0, z0, x1, y1, zUnitTop, "mortar"), MATERIAL.mortar);
    };
    const blockCourse = (z0, zTop, xStart, xEnd, course, coveredFrom, coveredTo) => {
      if (xEnd - xStart < 60 || zTop - z0 < 40) return;
      const unitTop = Math.min(z0 + block.joint_mm / 2 + block.height_mm, zTop - block.joint_mm / 2);
      mortarBody(xStart, xEnd, yInner0 + 6, yInner1 - 6, z0, unitTop, zTop, coveredFrom, coveredTo);
      const offset = course % 2 ? (block.length_mm + block.joint_mm) / 2 : 0;
      for (let x = -Wx - offset; x < xEnd; x += block.length_mm + block.joint_mm) {
        const start = Math.max(x + block.joint_mm / 2, xStart);
        const end = Math.min(x + block.joint_mm / 2 + block.length_mm, xEnd);
        const segments = post.embedded
          ? [[start, Math.min(end, -gap)], [Math.max(start, gap), end]]
          : [[start, end]];
        segments.forEach(([s, e], k) => {
          if (e - s < 20) return;
          push(box(s, yInner0, z0 + block.joint_mm / 2, e, yInner1, unitTop, "inner"),
            MATERIAL.block, hash01(course * 31 + x * 0.01 + k));
        });
      }
    };
    for (let course = 0; course < blockCourses; course += 1) {
      const z0 = zInnerBase + course * block.course_mm;
      const zTop = Math.min(z0 + block.course_mm, zInnerTop);
      const coveredFrom = course + 1 < blockCourses ? -Wx + (course + 1) * blockStep : Infinity;
      blockCourse(z0, zTop, -Wx + course * blockStep, Wx, course, coveredFrom, Wx);
    }
    if (simplySupported) {
      // one block beside the head connection, under the floor above
      blockCourse(zSoffit - block.course_mm, zSoffit, Wx - 450, Wx, 1, -Infinity, Infinity);
    }

    // outer leaf: full courses below the floor, then a stepped cut-away so the
    // post stays in view; bricks whose top is exposed are perforated
    const zOuterBase = Math.floor(zSlabBottom / brick.course_mm) * brick.course_mm;
    const belowSlab = Math.round((zSlabTop - zOuterBase) / brick.course_mm);
    const wedgeCourses = Math.max(5, Math.min(14, Math.round(0.6 * L / brick.course_mm)));
    const step = (2 * Wx - 215) / wedgeCourses;
    const xEndOf = course => course < belowSlab
      ? Wx
      : Math.max(-Wx + 215, Wx - (course - belowSlab + 1) * step);
    const totalCourses = belowSlab + wedgeCourses;
    for (let course = 0; course < totalCourses; course += 1) {
      const z0 = zOuterBase + course * brick.course_mm;
      const xEnd = xEndOf(course);
      const xEndAbove = course + 1 < totalCourses ? xEndOf(course + 1) : -Infinity;
      mortarBody(-Wx, xEnd - 8, yOuter0 + 8, yOuter1 - 8, z0, z0 + brick.joint_mm / 2 + brick.height_mm, z0 + brick.course_mm, -Infinity, xEndAbove - 8);
      const offset = course % 2 ? (brick.length_mm + brick.joint_mm) / 2 : 0;
      for (let x = -Wx - offset; x < xEnd; x += brick.length_mm + brick.joint_mm) {
        const start = Math.max(x + brick.joint_mm / 2, -Wx);
        const end = Math.min(x + brick.joint_mm / 2 + brick.length_mm, xEnd);
        if (end - start < 30) continue;
        const exposed = (start + end) / 2 > xEndAbove;
        const holes = [];
        if (exposed) {
          const yc = (yOuter0 + yOuter1) / 2;
          [0.25, 0.5, 0.75].forEach(f => {
            const hx = x + brick.joint_mm / 2 + f * brick.length_mm;
            if (hx - 14 > start + 6 && hx + 14 < end - 6) holes.push({ x: hx, y: yc, r: 14 });
          });
        }
        push(box(start, yOuter0, z0 + brick.joint_mm / 2, end, yOuter1, z0 + brick.joint_mm / 2 + brick.height_mm, "outer", holes),
          MATERIAL.brick, hash01(course * 17 + x * 0.013));
      }
    }

    // ties at every slot level, lying in the bed joints
    const levels = (model.slotPlacement && model.slotPlacement.levels_mm) || [];
    levels.forEach(level => {
      if (level > zInnerTop - 30) return;
      if (faceMounted && level < zSlabTop + 30) return;
      if (post.type === "DU") {
        post.tieXs.forEach(x => push(box(x - 9, yOuter1 - 55, level - 0.75, x + 9, 55, level + 0.75, "ties"), MATERIAL.stainless));
      } else if (post.type === "U") {
        push(box(post.tieX - 9, yOuter1 - 55, level - 0.75, post.tieX + 9, 55, level + 0.75, "ties"), MATERIAL.stainless);
      } else {
        // shear tie through the long-leg slot, across the inner leaf bed joint
        push(box(-84, post.longSlotY - 5, level - 0.75, 84, post.longSlotY + 5, level + 0.75, "ties"), MATERIAL.stainless);
        // L tie through the short-leg slot, straight across the cavity
        push(box(post.shortSlotX - 9, yOuter1 - 60, level + 1.5, post.shortSlotX + 9, post.longLegY0 + 18, level + 3, "ties"), MATERIAL.stainless);
      }
    });

    // head connection to the soffit for a post spanning between floors (a
    // face-mounted post brings its own DU-T2 plate in the scene)
    if (simplySupported && !faceMounted) {
      const plateZ0 = zSoffit - 8;
      if (post.type === "U") {
        const x0 = post.webX - 30, x1 = -post.webX + 30;
        push(box(x0, post.rearFlangeY - 40, plateZ0, x1, 60, zSoffit, "headplate"), MATERIAL.plate);
        push(box(post.webX - 8, post.rearFlangeY, L - 70, post.webX, post.frontFlangeY, plateZ0, "headplate"), MATERIAL.plate);
        bolt(post.webX + 20, 35, plateZ0, 12, -1, "anchors").forEach(p => push(p, MATERIAL.anchor));
        bolt(-post.webX - 20, 35, plateZ0, 12, -1, "anchors").forEach(p => push(p, MATERIAL.anchor));
      } else {
        push(box(-50, -20, plateZ0, 50, 130, zSoffit, "headplate"), MATERIAL.plate);
        push(box(post.longLegX1, -20, L - 70, post.longLegX1 + 8, 90, plateZ0, "headplate"), MATERIAL.plate);
        bolt(-30, 110, plateZ0, 12, -1, "anchors").forEach(p => push(p, MATERIAL.anchor));
        bolt(30, 110, plateZ0, 12, -1, "anchors").forEach(p => push(p, MATERIAL.anchor));
      }
    }

    return items;
  }

  // ------------------------------------------------------------- assembly

  function bounds(meshes) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    meshes.forEach(mesh => {
      if (mesh.material === MATERIAL.ground) return;
      for (let i = 0; i < mesh.positions.length; i += 3) {
        for (let k = 0; k < 3; k += 1) {
          const v = mesh.positions[i + k];
          if (v < min[k]) min[k] = v;
          if (v > max[k]) max[k] = v;
        }
      }
    });
    if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0], centre: [0, 0, 0], radius: 1 };
    const centre = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const radius = Math.max(1, length(sub(max, centre)));
    return { min, max, centre, radius };
  }

  function groundMesh(z, radius) {
    const r = radius * 6;
    const item = {
      points: [[-r, -r, z], [r, -r, z], [r, r, z], [-r, r, z]],
      faces: [{ indexes: [0, 1, 2, 3] }],
      group: "ground"
    };
    return itemToMesh(item, { material: MATERIAL.ground, oriented: true });
  }

  // Build every mesh for a scene: the scene items themselves (materials by
  // group) plus, when asked, the cavity-wall context and a shadow-catching
  // ground under everything. Returns typed arrays ready for the renderer.
  function build(scene, model, context) {
    const settings = context || {};
    const meshes = [];
    (scene || []).forEach(item => {
      if (!item || item.type === "slot" || !item.faces) return;
      const material = GROUP_MATERIAL[item.group] != null ? GROUP_MATERIAL[item.group] : MATERIAL.stainless;
      meshes.push(itemToMesh(item, { material, tint: 0.5 }));
    });
    let contextCount = 0;
    if (settings.showWall !== false && model && model.prototypeOnly) {
      contextItems(model, settings).forEach(entry => {
        meshes.push(itemToMesh(entry.item, { material: entry.material, tint: entry.tint, oriented: true }));
        contextCount += 1;
      });
    }
    const box3 = bounds(meshes);
    const groundZ = box3.min[2] - 0.5;
    meshes.push(groundMesh(groundZ, box3.radius));

    let count = 0;
    meshes.forEach(mesh => { count += mesh.positions.length / 3; });
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const materials = new Float32Array(count);
    const tints = new Float32Array(count);
    let offset = 0;
    meshes.forEach(mesh => {
      const n = mesh.positions.length / 3;
      positions.set(mesh.positions, offset * 3);
      normals.set(mesh.normals, offset * 3);
      for (let i = 0; i < n; i += 1) {
        materials[offset + i] = mesh.material;
        tints[offset + i] = mesh.tint;
      }
      offset += n;
    });
    return {
      positions,
      normals,
      materials,
      tints,
      vertexCount: count,
      bounds: box3,
      groundZ,
      contextCount,
      meshCount: meshes.length
    };
  }

  windpost.sceneMesh = Object.freeze({
    MATERIAL,
    MASONRY,
    triangulateFace,
    itemToMesh,
    box,
    prism,
    contextItems,
    build
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.sceneMesh;
  }
})(typeof window !== "undefined" ? window : globalThis);
