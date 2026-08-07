(function initialiseTieWall3dEngine(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  function shade(hex, amount) {
    const clean = hex.replace("#", "");
    const rgb = [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16)
    ];
    const target = amount >= 0 ? 255 : 0;
    const ratio = Math.abs(amount);
    return `rgb(${rgb.map(channel =>
      Math.round(channel + (target - channel) * ratio)
    ).join(",")})`;
  }

  function cuboid(unit) {
    const x = unit.x_mm;
    const y = unit.y_mm;
    const z = unit.z_mm;
    const dx = unit.length_mm;
    const dy = unit.depth_mm;
    const dz = unit.height_mm;
    const points = [
      [x, y, z], [x + dx, y, z], [x + dx, y + dy, z], [x, y + dy, z],
      [x, y, z + dz], [x + dx, y, z + dz],
      [x + dx, y + dy, z + dz], [x, y + dy, z + dz]
    ];
    return {
      points,
      color: unit.color,
      layer: unit.layer,
      faces: [
        [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6],
        [3, 0, 4, 7], [4, 5, 6, 7], [0, 3, 2, 1]
      ]
    };
  }

  function create(canvas) {
    const context = canvas.getContext("2d");
    const state = {
      model: null,
      yaw: -0.68,
      pitch: 0.55,
      zoom: 1,
      panX: 0,
      panY: 0,
      dragging: false,
      panning: false,
      lastX: 0,
      lastY: 0
    };

    function rotate(point) {
      const cy = Math.cos(state.yaw);
      const sy = Math.sin(state.yaw);
      const cp = Math.cos(state.pitch);
      const sp = Math.sin(state.pitch);
      const x1 = point[0] * cy - point[1] * sy;
      const y1 = point[0] * sy + point[1] * cy;
      return [
        x1,
        y1 * cp - point[2] * sp,
        y1 * sp + point[2] * cp
      ];
    }

    function render() {
      const rect = canvas.getBoundingClientRect();
      const ratio = global.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      context.fillStyle = "#f7fafc";
      context.fillRect(0, 0, rect.width, rect.height);
      context.strokeStyle = "#dbe3ea";
      context.lineWidth = 1;
      for (let x = 0; x < rect.width; x += 32) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, rect.height);
        context.stroke();
      }
      for (let y = 0; y < rect.height; y += 32) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(rect.width, y);
        context.stroke();
      }
      if (!state.model) return;

      const model = state.model;
      const centre = [
        model.wallLength_mm / 2,
        model.totalThickness_mm / 2,
        model.wallHeight_mm / 2
      ];
      const baseScale = Math.min(
        (rect.width - 130) /
          (model.wallLength_mm + model.totalThickness_mm * .45),
        (rect.height - 125) /
          (model.wallHeight_mm + model.totalThickness_mm * .45)
      );
      const scale = Math.max(.08, baseScale) * state.zoom;
      const project = point => {
        const rotated = rotate([
          point[0] - centre[0],
          point[1] - centre[1],
          point[2] - centre[2]
        ]);
        return {
          x: rect.width / 2 + rotated[0] * scale + state.panX,
          y: rect.height / 2 + rotated[1] * scale + state.panY,
          z: rotated[2]
        };
      };

      const faces = [];
      model.units.map(cuboid).forEach(object => {
        object.faces.forEach((indexes, index) => {
          const points = indexes.map(pointIndex =>
            project(object.points[pointIndex])
          );
          faces.push({
            points,
            depth:
              points.reduce((sum, point) => sum + point.z, 0) /
              points.length,
            fill: shade(
              object.color,
              [.08, -.08, -.15, .03, .2, -.2][index]
            ),
            layer: object.layer
          });
        });
      });
      faces.sort((a, b) => a.depth - b.depth);
      faces.forEach(face => {
        context.beginPath();
        face.points.forEach((point, index) => {
          if (index) context.lineTo(point.x, point.y);
          else context.moveTo(point.x, point.y);
        });
        context.closePath();
        context.fillStyle = face.fill;
        context.fill();
        context.strokeStyle = "#32414b";
        context.lineWidth = .85;
        context.stroke();
      });

      const cavityStart = project([
        0,
        model.cavity.start_mm,
        0
      ]);
      const cavityEnd = project([
        0,
        model.cavity.end_mm,
        0
      ]);
      context.save();
      context.fillStyle = "#0d6f75";
      context.font = "700 12px Arial";
      context.fillText(
        `CLEAR CAVITY ${model.cavity.thickness_mm} mm`,
        20,
        rect.height - 22
      );
      context.strokeStyle = "#0d6f75";
      context.setLineDash([5, 4]);
      context.beginPath();
      context.moveTo(cavityStart.x, cavityStart.y);
      context.lineTo(cavityEnd.x, cavityEnd.y);
      context.stroke();
      context.restore();
    }

    canvas.addEventListener("pointerdown", event => {
      state.dragging = true;
      state.panning = Boolean(
        event.shiftKey || event.button === 1 || event.button === 2
      );
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    canvas.addEventListener("pointermove", event => {
      if (!state.dragging) return;
      const dx = event.clientX - state.lastX;
      const dy = event.clientY - state.lastY;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      if (state.panning) {
        state.panX += dx;
        state.panY += dy;
      } else {
        state.yaw += dx * .01;
        state.pitch += dy * .01;
      }
      render();
      event.preventDefault();
    });
    const release = () => {
      state.dragging = false;
      state.panning = false;
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("contextmenu", event => event.preventDefault());
    canvas.addEventListener("wheel", event => {
      state.zoom = Math.max(
        .45,
        Math.min(4, state.zoom * Math.exp(-event.deltaY * .001))
      );
      render();
      event.preventDefault();
    }, { passive: false });
    global.addEventListener("resize", render);

    return Object.freeze({
      setModel(model) {
        state.model = model;
        render();
      },
      reset() {
        state.yaw = -.68;
        state.pitch = .55;
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        render();
      },
      render
    });
  }

  windpost.tieWall3d = Object.freeze({ create });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.tieWall3d;
  }
})(typeof window !== "undefined" ? window : globalThis);
