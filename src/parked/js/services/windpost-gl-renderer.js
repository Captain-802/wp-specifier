(function initialiseWindpostGlRenderer(global) {
  "use strict";

  // Product-render quality for the 3D viewers without any library: a WebGL 1
  // renderer with a depth buffer (so nothing is ever painted over at a
  // junction), one directional key light with a shadow map, hemisphere
  // ambient, a fill light, and procedural materials computed in the fragment
  // shader — brushed stainless steel, galvanised plate, concrete, brick,
  // mortar, aerated block — plus a white shadow-catching ground. Everything is
  // inline GLSL (no eval, no fetch), so it survives the Google Sites CSP.
  //
  // create(canvas) returns null when WebGL is unavailable; callers fall back
  // to the 2D painter renderer.

  const windpost = global.Windpost = global.Windpost || {};

  const SHADOW_SIZE = 2048;

  const NOISE_GLSL = `
    float hash3(vec3 p) {
      p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float vnoise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
        mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
        f.z);
    }
    float fbm(vec3 p) {
      return 0.55 * vnoise(p) + 0.28 * vnoise(p * 2.1 + 3.7) + 0.17 * vnoise(p * 4.3 + 9.1);
    }
  `;

  const MAIN_VERTEX = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute float aMaterial;
    attribute float aTint;
    uniform mat4 uView;
    uniform mat4 uProjection;
    uniform mat4 uLightMatrix;
    uniform vec2 uPan;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying float vMaterial;
    varying float vTint;
    varying vec4 vLight;
    void main() {
      vWorld = aPosition;
      vNormal = aNormal;
      vMaterial = aMaterial;
      vTint = aTint;
      vLight = uLightMatrix * vec4(aPosition, 1.0);
      vec4 clip = uProjection * uView * vec4(aPosition, 1.0);
      clip.xy += uPan * clip.w;
      gl_Position = clip;
    }
  `;

  const MAIN_FRAGMENT = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
    #else
      precision mediump float;
    #endif
    uniform sampler2D uShadow;
    uniform vec3 uEye;
    uniform vec3 uLightDir;
    uniform vec3 uFillDir;
    uniform float uShadowTexel;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying float vMaterial;
    varying float vTint;
    varying vec4 vLight;
    ${NOISE_GLSL}

    float unpackDepth(vec4 rgba) {
      return dot(rgba, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0));
    }

    // 1 = lit, 0 = fully shadowed; percentage-closer filtered over a small kernel
    float shadowFactor(float spread, float bias) {
      vec3 p = vLight.xyz / vLight.w * 0.5 + 0.5;
      if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
      float lit = 0.0;
      for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
          vec2 offset = vec2(float(x), float(y)) * uShadowTexel * spread;
          float stored = unpackDepth(texture2D(uShadow, p.xy + offset));
          lit += (p.z - bias <= stored) ? 1.0 : 0.0;
        }
      }
      return lit / 25.0;
    }

    void main() {
      vec3 n = normalize(vNormal);
      vec3 v = normalize(uEye - vWorld);
      vec3 l = normalize(uLightDir);
      int material = int(vMaterial + 0.5);
      float ndl = max(dot(n, l), 0.0);
      float ndv = max(dot(n, v), 0.0);
      float slope = 1.0 - ndl;
      float bias = 0.0012 + 0.0025 * slope;

      if (material == 7) {
        // shadow catcher: white paper with the soft shadow of the assembly
        float sh = shadowFactor(2.2, 0.0018);
        gl_FragColor = vec4(vec3(1.0) * (0.76 + 0.24 * sh), 1.0);
        return;
      }

      float sh = shadowFactor(1.0, bias);
      vec3 h = normalize(l + v);
      float ndh = max(dot(n, h), 0.0);
      float hemi = n.z * 0.5 + 0.5;
      vec3 ambient = mix(vec3(0.66, 0.67, 0.70), vec3(1.0, 1.0, 1.0), hemi);
      float fill = max(dot(n, normalize(uFillDir)), 0.0);

      vec3 albedo = vec3(0.8);
      float metal = 0.0;
      float gloss = 24.0;
      float specular = 0.25;

      if (material == 0) {
        // brushed stainless: fine streaks along the post (world z)
        float streak = vnoise(vec3(vWorld.x * 0.9, vWorld.y * 0.9, vWorld.z * 0.035));
        albedo = vec3(0.86, 0.87, 0.89) * (0.95 + 0.10 * streak);
        metal = 1.0; gloss = 70.0; specular = 0.9;
      } else if (material == 1) {
        // galvanised / stainless plate: slightly darker, broader highlight
        float grain = vnoise(vWorld * 0.35);
        albedo = vec3(0.76, 0.78, 0.80) * (0.94 + 0.12 * grain);
        metal = 1.0; gloss = 42.0; specular = 0.7;
      } else if (material == 2) {
        albedo = vec3(0.46, 0.48, 0.52);
        metal = 0.8; gloss = 36.0; specular = 0.6;
      } else if (material == 3) {
        // concrete: speckled, matte, with fine pores
        float speck = fbm(vWorld * 0.09);
        float pores = step(0.965, hash3(floor(vWorld * 0.55)));
        albedo = vec3(0.86, 0.86, 0.84) * (0.92 + 0.14 * speck) * (1.0 - 0.22 * pores);
        gloss = 8.0; specular = 0.04;
      } else if (material == 4) {
        // clay brick: per-unit tint, sanded grain
        float grain = fbm(vWorld * 0.16);
        vec3 tone = mix(vec3(0.72, 0.33, 0.22), vec3(0.84, 0.44, 0.28), vTint);
        albedo = tone * (0.92 + 0.16 * grain);
        gloss = 10.0; specular = 0.06;
      } else if (material == 5) {
        float grain = fbm(vWorld * 0.25);
        albedo = vec3(0.82, 0.79, 0.72) * (0.92 + 0.14 * grain);
        gloss = 6.0; specular = 0.03;
      } else if (material == 6) {
        // aerated block: coarse speckle with darker voids
        float speck = fbm(vWorld * 0.12);
        float voids = step(0.94, hash3(floor(vWorld * 0.35)));
        albedo = vec3(0.80, 0.80, 0.77) * (0.90 + 0.18 * speck) * (1.0 - 0.22 * voids);
        gloss = 6.0; specular = 0.04;
      }

      vec3 colour;
      if (metal > 0.0) {
        vec3 r = reflect(-v, n);
        // studio environment: bright sky, mid ground, and a soft horizon band
        float env = mix(0.48, 1.08, smoothstep(-0.5, 0.75, r.z));
        env += 0.18 * smoothstep(0.05, 0.22, r.z) * (1.0 - smoothstep(0.30, 0.50, r.z));
        float fresnel = pow(1.0 - ndv, 4.0);
        vec3 f0 = albedo;
        vec3 reflectance = mix(f0, vec3(1.0), fresnel * 0.6);
        vec3 lit = albedo * (ambient * 0.32 + env * 0.50 * (0.7 + 0.3 * sh)) * mix(1.0, metal, 0.5);
        lit += albedo * ndl * sh * 0.36;
        lit += albedo * fill * 0.10;
        lit += reflectance * pow(ndh, gloss) * specular * (0.25 + 0.75 * sh);
        colour = lit;
      } else {
        colour = albedo * (ambient * 0.58 + ndl * sh * 0.68 + fill * 0.16);
        colour += vec3(1.0) * pow(ndh, gloss) * specular * sh;
      }
      // gentle contact darkening where faces turn away from the sky
      colour *= 0.93 + 0.07 * hemi;
      gl_FragColor = vec4(clamp(colour, 0.0, 1.0), 1.0);
    }
  `;

  const DEPTH_VERTEX = `
    attribute vec3 aPosition;
    uniform mat4 uLightMatrix;
    varying float vDepth;
    void main() {
      vec4 clip = uLightMatrix * vec4(aPosition, 1.0);
      vDepth = clip.z / clip.w * 0.5 + 0.5;
      gl_Position = clip;
    }
  `;

  const DEPTH_FRAGMENT = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
    #else
      precision mediump float;
    #endif
    varying float vDepth;
    void main() {
      vec4 encoded = fract(vec4(1.0, 255.0, 65025.0, 16581375.0) * vDepth);
      encoded -= encoded.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
      gl_FragColor = encoded;
    }
  `;

  // ------------------------------------------------------------ matrices

  function identity() {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }

  function multiply(a, b) {
    const out = new Array(16);
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        let sum = 0;
        for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[col * 4 + k];
        out[col * 4 + row] = sum;
      }
    }
    return out;
  }

  function normalise(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  function lookAt(eye, target, up) {
    const z = normalise([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
    let x = cross(up, z);
    if (Math.hypot(x[0], x[1], x[2]) < 1e-6) x = cross([0, 1, 0], z);
    x = normalise(x);
    const y = cross(z, x);
    return [
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
      -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
      -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
      1
    ];
  }

  function perspective(fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2);
    const out = identity();
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = 2 * far * near / (near - far);
    out[15] = 0;
    return out;
  }

  function orthographic(left, right, bottom, top, near, far) {
    const out = identity();
    out[0] = 2 / (right - left);
    out[5] = 2 / (top - bottom);
    out[10] = -2 / (far - near);
    out[12] = -(right + left) / (right - left);
    out[13] = -(top + bottom) / (top - bottom);
    out[14] = -(far + near) / (far - near);
    return out;
  }

  // ------------------------------------------------------------- renderer

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader failed to compile: ${log}`);
    }
    return shader;
  }

  function program(gl, vertexSource, fragmentSource, attributes, uniforms) {
    const handle = gl.createProgram();
    gl.attachShader(handle, compile(gl, gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(handle, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(handle);
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
      throw new Error(`Program failed to link: ${gl.getProgramInfoLog(handle)}`);
    }
    const out = { handle, attributes: {}, uniforms: {} };
    attributes.forEach(name => { out.attributes[name] = gl.getAttribLocation(handle, name); });
    uniforms.forEach(name => { out.uniforms[name] = gl.getUniformLocation(handle, name); });
    return out;
  }

  class GlRenderer {
    constructor(canvas, gl) {
      this.canvas = canvas;
      this.gl = gl;
      this.vertexCount = 0;
      this.bounds = null;
      this.main = program(gl, MAIN_VERTEX, MAIN_FRAGMENT,
        ["aPosition", "aNormal", "aMaterial", "aTint"],
        ["uView", "uProjection", "uLightMatrix", "uPan", "uShadow", "uEye", "uLightDir", "uFillDir", "uShadowTexel"]);
      this.depth = program(gl, DEPTH_VERTEX, DEPTH_FRAGMENT, ["aPosition"], ["uLightMatrix"]);
      this.buffers = {
        position: gl.createBuffer(),
        normal: gl.createBuffer(),
        material: gl.createBuffer(),
        tint: gl.createBuffer()
      };
      this.shadowSize = Math.min(SHADOW_SIZE, gl.getParameter(gl.MAX_TEXTURE_SIZE) || SHADOW_SIZE, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || SHADOW_SIZE);
      this.shadow = this.createShadowTarget(this.shadowSize);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
    }

    createShadowTarget(size) {
      const gl = this.gl;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const depthBuffer = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size, size);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
      const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return { texture, depthBuffer, framebuffer, size, complete };
    }

    // Upload a mesh set from the scene-mesh engine.
    setGeometry(geometry) {
      const gl = this.gl;
      const upload = (buffer, data) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      };
      upload(this.buffers.position, geometry.positions);
      upload(this.buffers.normal, geometry.normals);
      upload(this.buffers.material, geometry.materials);
      upload(this.buffers.tint, geometry.tints);
      this.vertexCount = geometry.vertexCount;
      this.bounds = geometry.bounds;
    }

    bindAttribute(location, buffer, size) {
      const gl = this.gl;
      if (location < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    }

    // Light-space orthographic projection enclosing the scene's bounding sphere.
    lightMatrix(lightDir) {
      const bounds = this.bounds;
      const centre = bounds.centre;
      const radius = bounds.radius * 1.05;
      const eye = [centre[0] + lightDir[0] * radius * 2, centre[1] + lightDir[1] * radius * 2, centre[2] + lightDir[2] * radius * 2];
      const view = lookAt(eye, centre, [0, 0, 1]);
      const projection = orthographic(-radius, radius, -radius, radius, radius * 0.5, radius * 3.5);
      return multiply(projection, view);
    }

    // camera: { eye, target, fovY, near, far, pan: [ndcX, ndcY], lightDir, fillDir }
    render(camera) {
      const gl = this.gl;
      if (!this.vertexCount || !this.bounds) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        return;
      }
      const lightDir = normalise(camera.lightDir);
      const light = this.lightMatrix(lightDir);

      // pass 1: depth from the light
      if (this.shadow.complete) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadow.framebuffer);
        gl.viewport(0, 0, this.shadow.size, this.shadow.size);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.depth.handle);
        gl.uniformMatrix4fv(this.depth.uniforms.uLightMatrix, false, light);
        this.bindAttribute(this.depth.attributes.aPosition, this.buffers.position, 3);
        gl.cullFace(gl.FRONT);            // back faces into the map: no acne on lit faces
        gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
        gl.cullFace(gl.BACK);
      }

      // pass 2: the picture
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(1, 1, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.main.handle);
      const aspect = this.canvas.width / Math.max(1, this.canvas.height);
      const view = lookAt(camera.eye, camera.target, [0, 0, 1]);
      const projection = perspective(camera.fovY, aspect, camera.near, camera.far);
      gl.uniformMatrix4fv(this.main.uniforms.uView, false, view);
      gl.uniformMatrix4fv(this.main.uniforms.uProjection, false, projection);
      gl.uniformMatrix4fv(this.main.uniforms.uLightMatrix, false, light);
      gl.uniform2f(this.main.uniforms.uPan, camera.pan ? camera.pan[0] : 0, camera.pan ? camera.pan[1] : 0);
      gl.uniform3f(this.main.uniforms.uEye, camera.eye[0], camera.eye[1], camera.eye[2]);
      gl.uniform3f(this.main.uniforms.uLightDir, lightDir[0], lightDir[1], lightDir[2]);
      const fill = normalise(camera.fillDir || [-lightDir[0], -lightDir[1], 0.4]);
      gl.uniform3f(this.main.uniforms.uFillDir, fill[0], fill[1], fill[2]);
      gl.uniform1f(this.main.uniforms.uShadowTexel, this.shadow.complete ? 1 / this.shadow.size : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.shadow.texture);
      gl.uniform1i(this.main.uniforms.uShadow, 0);
      this.bindAttribute(this.main.attributes.aPosition, this.buffers.position, 3);
      this.bindAttribute(this.main.attributes.aNormal, this.buffers.normal, 3);
      this.bindAttribute(this.main.attributes.aMaterial, this.buffers.material, 1);
      this.bindAttribute(this.main.attributes.aTint, this.buffers.tint, 1);
      gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    }

    destroy() {
      const gl = this.gl;
      Object.values(this.buffers).forEach(buffer => gl.deleteBuffer(buffer));
      gl.deleteTexture(this.shadow.texture);
      gl.deleteRenderbuffer(this.shadow.depthBuffer);
      gl.deleteFramebuffer(this.shadow.framebuffer);
      gl.deleteProgram(this.main.handle);
      gl.deleteProgram(this.depth.handle);
    }
  }

  const CONTEXT_OPTIONS = Object.freeze({ antialias: true, alpha: false, preserveDrawingBuffer: true, depth: true });

  function contextOf(canvas) {
    if (!canvas || typeof canvas.getContext !== "function") return null;
    let gl = null;
    try {
      gl = canvas.getContext("webgl", CONTEXT_OPTIONS) || canvas.getContext("experimental-webgl", CONTEXT_OPTIONS);
    } catch (error) {
      gl = null;
    }
    if (!gl || typeof gl.createShader !== "function" || typeof gl.drawArrays !== "function") return null;
    return gl;
  }

  // A canvas can hold only one kind of context, so the shaders are proven on
  // a throwaway canvas first: if they fail there, the real canvas is left
  // untouched for the 2D fallback.
  let probed = null;
  function shadersWork() {
    if (probed !== null) return probed;
    if (typeof document === "undefined" || !document.createElement) return true;
    try {
      const gl = contextOf(document.createElement("canvas"));
      if (!gl) { probed = false; return probed; }
      const renderer = new GlRenderer({ width: 4, height: 4 }, gl);
      renderer.destroy();
      probed = true;
    } catch (error) {
      if (global.console && console.warn) console.warn("WebGL renderer unavailable:", error.message);
      probed = false;
    }
    return probed;
  }

  // Null when the browser (or a test double) cannot give a real WebGL context.
  function create(canvas) {
    if (!canvas || typeof canvas.getContext !== "function") return null;
    if (!shadersWork()) return null;
    const gl = contextOf(canvas);
    if (!gl) return null;
    try {
      return new GlRenderer(canvas, gl);
    } catch (error) {
      if (global.console && console.warn) console.warn("WebGL renderer unavailable:", error.message);
      return null;
    }
  }

  windpost.windpostGlRenderer = Object.freeze({
    create,
    lookAt,
    perspective,
    orthographic,
    multiply
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = windpost.windpostGlRenderer;
  }
})(typeof window !== "undefined" ? window : globalThis);
