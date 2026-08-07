(function initialiseTiePrototype3d(global) {
  "use strict";

  const windpost = global.Windpost = global.Windpost || {};

  function create(canvas) {
    const context = canvas.getContext("2d");
    const state = {
      geometry: null,
      yaw: -0.55,
      pitch: 0.72,
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
      if (!state.geometry) return;

      context.fillStyle = "#f7fafc";
      context.fillRect(0, 0, rect.width, rect.height);
      context.strokeStyle = "#d9e2ea";
      context.lineWidth = 1;
      for (let gx = 0; gx < rect.width; gx += 32) {
        context.beginPath();
        context.moveTo(gx, 0);
        context.lineTo(gx, rect.height);
        context.stroke();
      }
      for (let gy = 0; gy < rect.height; gy += 32) {
        context.beginPath();
        context.moveTo(0, gy);
        context.lineTo(rect.width, gy);
        context.stroke();
      }

      const g = state.geometry;
      const outline = g.meshOutline || g.outline;
      const cx = g.length_mm / 2;
      const cy = g.width_mm / 2;
      const cz = g.thickness_mm / 2;
      const scale = Math.min(
        (rect.width - 130) / g.length_mm,
        (rect.height - 130) / Math.max(g.width_mm, 30)
      ) * state.zoom;
      const project = point => {
        const rotated = rotate([point[0] - cx, point[1] - cy, point[2] - cz]);
        return {
          x: rect.width / 2 + rotated[0] * scale + state.panX,
          y: rect.height / 2 + rotated[1] * scale + state.panY,
          z: rotated[2]
        };
      };

      const bottom = outline.map(point => project([point[0], point[1], 0]));
      const top = outline.map(point => project([point[0], point[1], g.thickness_mm]));
      const bottomHoles = (g.slots || []).map(slot =>
        slot.outline.map(point => project([point[0], point[1], 0]))
      );
      const topHoles = (g.slots || []).map(slot =>
        slot.outline.map(point => project([
          point[0],
          point[1],
          g.thickness_mm
        ]))
      );
      const faces = outline.map((point, index) => {
        const next = (index + 1) % outline.length;
        const points = [bottom[index], bottom[next], top[next], top[index]];
        return {
          points,
          depth: points.reduce((sum, item) => sum + item.z, 0) / points.length,
          fill: index % 2 ? "#aeb9c2" : "#98a6b1"
        };
      });
      faces.push({
        points: bottom,
        holes: bottomHoles,
        depth: bottom.reduce((sum, item) => sum + item.z, 0) / bottom.length,
        fill: "#8f9ca7"
      });
      faces.push({
        points: top,
        holes: topHoles,
        depth: top.reduce((sum, item) => sum + item.z, 0) / top.length,
        fill: "#d7dde2"
      });
      faces.sort((a, b) => a.depth - b.depth);
      faces.forEach(face => {
        context.beginPath();
        face.points.forEach((point, index) => {
          if (index) context.lineTo(point.x, point.y);
          else context.moveTo(point.x, point.y);
        });
        context.closePath();
        (face.holes || []).forEach(hole => {
          hole.forEach((point, index) => {
            if (index) context.lineTo(point.x, point.y);
            else context.moveTo(point.x, point.y);
          });
          context.closePath();
        });
        context.fillStyle = face.fill;
        context.fill("evenodd");
        context.strokeStyle = "#263746";
        context.lineWidth = 1.2;
        context.stroke();
      });
    }

    canvas.addEventListener("pointerdown", event => {
      state.dragging = true;
      state.panning = Boolean(event.shiftKey || event.button === 1 || event.button === 2);
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
        state.yaw += dx * 0.01;
        state.pitch += dy * 0.01;
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
      state.zoom = Math.max(0.45, Math.min(5, state.zoom * Math.exp(-event.deltaY * 0.001)));
      render();
      event.preventDefault();
    }, { passive: false });
    global.addEventListener("resize", render);

    return Object.freeze({
      setGeometry(geometry) {
        state.geometry = geometry;
        render();
      },
      reset() {
        state.yaw = -0.55;
        state.pitch = 0.72;
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        render();
      },
      render
    });
  }

  windpost.tiePrototype3d = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
