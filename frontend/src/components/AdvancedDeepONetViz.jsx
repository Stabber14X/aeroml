'use client';
import React, {
  useRef, useEffect, useState, useCallback,
  useImperativeHandle, forwardRef, useMemo
} from 'react';
import * as d3 from 'd3';

// ═══════════════════════════════════════════════════════════════
// DOMAIN & PHYSICS CONSTANTS
// ═══════════════════════════════════════════════════════════════
const DOMAIN = { x0: -0.5, x1: 1.5, y0: -0.5, y1: 0.5 };
const GAMMA = 1.4;
const R_GAS = 287;
const T_REF = 288.15;
const RHO_REF = 1.225;

const safe = (v, fallback = 0) =>
  Number.isFinite(v) && !Number.isNaN(v) ? v : fallback;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const lerp = (a, b, t) => a + (b - a) * t;

const airfoilNormal = (p1, p2) => {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy);
  return len < 1e-9 ? [0, 1] : [-dy / len, dx / len];
};

const computeLocalMach = (velocity, T = T_REF) => {
  const a = Math.sqrt(GAMMA * R_GAS * T);
  return velocity / a;
};

const computeVorticity = (dudx, dudy, dvdx, dvdy) => {
  return dvdx - dudy;
};

const computeQCriterion = (dudx, dudy, dvdx, dvdy) => {
  const omega = 0.5 * (dvdx - dudy);
  const S11 = dudx;
  const S22 = dvdy;
  const S12 = 0.5 * (dudy + dvdx);
  return 0.5 * (omega * omega - (S11 * S11 + S22 * S22 + 2 * S12 * S12));
};

// ═══════════════════════════════════════════════════════════════
// COLORMAP TEXTURES
// ═══════════════════════════════════════════════════════════════
const COLORMAPS = {
  Turbo: d3.interpolateTurbo,
  Magma: d3.interpolateMagma,
  Viridis: d3.interpolateViridis,
  Plasma: d3.interpolatePlasma,
  Inferno: d3.interpolateInferno,
  Cividis: d3.interpolateCividis,
};

function buildColormapTexture(name) {
  const interpolate = COLORMAPS[name] ?? COLORMAPS.Turbo;
  const data = new Uint8Array(256 * 4);
  
  for (let i = 0; i < 256; i++) {
    const color = d3.rgb(interpolate(i / 255));
    data[i * 4] = color.r;
    data[i * 4 + 1] = color.g;
    data[i * 4 + 2] = color.b;
    data[i * 4 + 3] = 255;
  }
  
  return data;
}

// ═══════════════════════════════════════════════════════════════
// WEBGL UTILITIES
// ═══════════════════════════════════════════════════════════════
function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  
  return shader;
}

function linkProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    return null;
  }
  
  return program;
}

function createProgram(gl, vsSource, fsSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;
  return linkProgram(gl, vs, fs);
}

// ═══════════════════════════════════════════════════════════════
// GLSL SHADERS
// ═══════════════════════════════════════════════════════════════
const FIELD_VS = `
attribute vec2 a_position;
attribute float a_value;
varying float v_value;

void main() {
  v_value = a_value;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FIELD_FS = `
precision highp float;
varying float v_value;
uniform sampler2D u_colormap;
uniform float u_minValue;
uniform float u_maxValue;
uniform bool u_showContours;
uniform float u_contourCount;

void main() {
  float range = u_maxValue - u_minValue;
  float t = clamp((v_value - u_minValue) / (range + 1e-9), 0.0, 1.0);
  
  if (u_showContours) {
    float bands = u_contourCount;
    float contourT = floor(t * bands) / bands;
    
    // Add contour lines
    float lineWidth = 0.015;
    float diff = abs(fract(t * bands) - 0.5);
    if (diff > 0.5 - lineWidth) {
      t = contourT;
      // Darken contour lines slightly
      vec4 baseColor = texture2D(u_colormap, vec2(t, 0.5));
      gl_FragColor = vec4(baseColor.rgb * 0.7, 1.0);
      return;
    }
    t = contourT;
  }
  
  gl_FragColor = texture2D(u_colormap, vec2(t, 0.5));
}
`;

const PARTICLE_VS = `
attribute vec2 a_position;
attribute float a_age;
attribute float a_speed;
varying float v_age;
varying float v_speed;

void main() {
  v_age = a_age;
  v_speed = a_speed;
  gl_PointSize = mix(1.5, 2.5, v_speed);
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const PARTICLE_FS = `
precision mediump float;
varying float v_age;
varying float v_speed;
uniform vec3 u_color;

void main() {
  float alpha = (1.0 - v_age) * 0.7 * (0.5 + 0.5 * v_speed);
  
  // Circular point
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);
  if (dist > 0.5) discard;
  
  alpha *= smoothstep(0.5, 0.3, dist);
  gl_FragColor = vec4(u_color, alpha);
}
`;

const SOLID_VS = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const SOLID_FS = `
precision mediump float;
uniform vec4 u_color;
void main() {
  gl_FragColor = u_color;
}
`;

const LINE_VS = `
attribute vec2 a_position;
attribute float a_t;
varying float v_t;

void main() {
  v_t = a_t;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const LINE_FS = `
precision mediump float;
varying float v_t;
uniform vec4 u_color;

void main() {
  float alpha = u_color.a * (0.2 + 0.8 * v_t);
  gl_FragColor = vec4(u_color.rgb, alpha);
}
`;

const VECTOR_VS = `
attribute vec2 a_position;
attribute vec2 a_direction;
attribute float a_magnitude;
varying float v_magnitude;

void main() {
  v_magnitude = a_magnitude;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const VECTOR_FS = `
precision mediump float;
varying float v_magnitude;
uniform vec4 u_color;

void main() {
  gl_FragColor = vec4(u_color.rgb, u_color.a * v_magnitude);
}
`;

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
const AdvancedDeepONetViz = forwardRef(({
  fieldData,
  coordinates,
  activeLayer = 'velocity',
  colormapName = 'Turbo',
  interactionMode = 'PROBE',
  machMode = false,
  freestreamMach = 0.0,
  showAPG = false,
  showContours = false,
  showQCriterion = false,
  showControlVolume = false,
  showStreamlines = true,
  showTransition = false,
  sliceX = null,
  probes = [],
  tracers = [],
  onProbeAdd,
  onTracerAdd,
  onSliceMove,
  onDataExtract,
  onTripAdd,
  setActiveLayer,
  setShowQCriterion,
  setInteractionMode,
  clearProbes,
}, ref) => {
  // ── Refs ─────────────────────────────────────────────────────
  const containerRef = useRef(null);
  const glCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  
  const gl = useRef(null);
  const programs = useRef({});
  const buffers = useRef({});
  const textures = useRef({});
  const animationId = useRef(null);
  
  const fieldState = useRef({
    values: null,
    target: null,
    rx: 0,
    ry: 0,
    minV: 0,
    maxV: 1,
  });
  
  const particles = useRef([]);
  const streamlines = useRef([]);
  
  // ── State ────────────────────────────────────────────────────
  const [dimensions, setDimensions] = useState({ w: 800, h: 500 });
  const [hoverData, setHoverData] = useState(null);
  const [blNormalData, setBlNormalData] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // ═══════════════════════════════════════════════════════════
  // COORDINATE TRANSFORMS
  // ═══════════════════════════════════════════════════════════
  const transforms = useMemo(() => {
    const { w, h } = dimensions;
    const DW = DOMAIN.x1 - DOMAIN.x0;
    const DH = DOMAIN.y1 - DOMAIN.y0;
    
    // Margins for axes
    const marginLeft = 60;
    const marginRight = 50;
    const marginTop = 20;
    const marginBottom = 35;
    
    const availableWidth = w - marginLeft - marginRight;
    const availableHeight = h - marginTop - marginBottom;
    const scale = Math.min(availableWidth / DW, availableHeight / DH);
    
    // Origin in screen coordinates
    const originX = marginLeft + (availableWidth - DW * scale) / 2 + Math.abs(DOMAIN.x0) * scale;
    const originY = marginTop + (availableHeight - DH * scale) / 2 + DH * scale / 2 + (DOMAIN.y0 + DOMAIN.y1) / 2 * scale;
    
    // Domain to screen
    const toScreenX = (x) => originX + x * scale;
    const toScreenY = (y) => originY - y * scale;
    
    // Screen to domain
    const toDomainX = (px) => (px - originX) / scale;
    const toDomainY = (py) => (originY - py) / scale;
    
    // Domain to NDC [-1, 1]
    const toNdcX = (x) => (toScreenX(x) / w) * 2 - 1;
    const toNdcY = (y) => 1 - (toScreenY(y) / h) * 2;
    
    return {
      scale,
      originX,
      originY,
      toScreenX,
      toScreenY,
      toDomainX,
      toDomainY,
      toNdcX,
      toNdcY,
      w,
      h,
      marginLeft,
      marginRight,
      marginTop,
      marginBottom,
    };
  }, [dimensions]);

  // ═══════════════════════════════════════════════════════════
  // FIELD SAMPLING
  // ═══════════════════════════════════════════════════════════
  const sampleField = useCallback((fx, fy) => {
    if (!fieldData) return null;
    if (fx < DOMAIN.x0 || fx > DOMAIN.x1 || fy < DOMAIN.y0 || fy > DOMAIN.y1) return null;
    
    const { rx, ry } = fieldState.current;
    if (rx === 0 || ry === 0) return null;
    
    const DW = DOMAIN.x1 - DOMAIN.x0;
    const DH = DOMAIN.y1 - DOMAIN.y0;
    
    // Grid coordinates
    const gx = ((fx - DOMAIN.x0) / DW) * (rx - 1);
    const gy = ((fy - DOMAIN.y0) / DH) * (ry - 1);
    
    const x0 = Math.floor(gx);
    const x1 = Math.min(x0 + 1, rx - 1);
    const y0 = Math.floor(gy);
    const y1 = Math.min(y0 + 1, ry - 1);
    
    const tx = gx - x0;
    const ty = gy - y0;
    
    const idx = (x, y) => y * rx + x;
    
    const bilinear = (arr) => {
      const v00 = arr[idx(x0, y0)];
      const v10 = arr[idx(x1, y0)];
      const v01 = arr[idx(x0, y1)];
      const v11 = arr[idx(x1, y1)];
      return v00 * (1 - tx) * (1 - ty) +
             v10 * tx * (1 - ty) +
             v01 * (1 - tx) * ty +
             v11 * tx * ty;
    };
    
    return {
      cp: bilinear(fieldData.cp_values),
      u: bilinear(fieldData.u_values),
      v: bilinear(fieldData.v_values),
      nut: Math.max(0, bilinear(fieldData.nut_values)),
    };
  }, [fieldData]);

  const sampleGradient = useCallback((fx, fy) => {
    const h = 0.005;
    const fp = sampleField(fx + h, fy);
    const fm = sampleField(fx - h, fy);
    const up = sampleField(fx, fy + h);
    const um = sampleField(fx, fy - h);
    
    if (!fp || !fm || !up || !um) return null;
    
    return {
      dpdx: (fp.cp - fm.cp) / (2 * h),
      dpdy: (up.cp - um.cp) / (2 * h),
      dudx: (fp.u - fm.u) / (2 * h),
      dudy: (up.u - um.u) / (2 * h),
      dvdx: (fp.v - fm.v) / (2 * h),
      dvdy: (up.v - um.v) / (2 * h),
    };
  }, [sampleField]);

  // ═══════════════════════════════════════════════════════════
  // WEBGL INITIALIZATION
  // ═══════════════════════════════════════════════════════════
  const initWebGL = useCallback(() => {
    const canvas = glCanvasRef.current;
    if (!canvas) return false;
    
    const context = canvas.getContext('webgl', {
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });
    
    if (!context) {
      console.error('WebGL not supported');
      return false;
    }
    
    gl.current = context;
    const G = context;
    
    // Compile shader programs
    programs.current = {
      field: createProgram(G, FIELD_VS, FIELD_FS),
      particle: createProgram(G, PARTICLE_VS, PARTICLE_FS),
      solid: createProgram(G, SOLID_VS, SOLID_FS),
      line: createProgram(G, LINE_VS, LINE_FS),
    };
    
    // Create buffers
    buffers.current = {
      fieldPos: G.createBuffer(),
      fieldVal: G.createBuffer(),
      particlePos: G.createBuffer(),
      particleAge: G.createBuffer(),
      particleSpeed: G.createBuffer(),
      solid: G.createBuffer(),
      linePos: G.createBuffer(),
      lineT: G.createBuffer(),
    };
    
    // Create colormap texture
    const cmapTexture = G.createTexture();
    G.bindTexture(G.TEXTURE_2D, cmapTexture);
    G.texImage2D(G.TEXTURE_2D, 0, G.RGBA, 256, 1, 0, G.RGBA, G.UNSIGNED_BYTE,
      buildColormapTexture(colormapName));
    G.texParameteri(G.TEXTURE_2D, G.TEXTURE_MIN_FILTER, G.LINEAR);
    G.texParameteri(G.TEXTURE_2D, G.TEXTURE_MAG_FILTER, G.LINEAR);
    G.texParameteri(G.TEXTURE_2D, G.TEXTURE_WRAP_S, G.CLAMP_TO_EDGE);
    G.texParameteri(G.TEXTURE_2D, G.TEXTURE_WRAP_T, G.CLAMP_TO_EDGE);
    textures.current.colormap = cmapTexture;
    
    // WebGL settings
    G.enable(G.BLEND);
    G.blendFunc(G.SRC_ALPHA, G.ONE_MINUS_SRC_ALPHA);
    G.clearColor(0.004, 0.008, 0.016, 1.0);
    
    return true;
  }, [colormapName]);

  // ── Update colormap texture ──────────────────────────────────
  useEffect(() => {
    const G = gl.current;
    if (!G || !textures.current.colormap) return;
    
    G.bindTexture(G.TEXTURE_2D, textures.current.colormap);
    G.texImage2D(G.TEXTURE_2D, 0, G.RGBA, 256, 1, 0, G.RGBA, G.UNSIGNED_BYTE,
      buildColormapTexture(colormapName));
  }, [colormapName]);

  // ═══════════════════════════════════════════════════════════
  // FIELD MESH UPLOAD
  // ═══════════════════════════════════════════════════════════
  const uploadFieldMesh = useCallback((values, rx, ry) => {
    const G = gl.current;
    if (!G || !buffers.current.fieldPos) return;
    
    const DW = DOMAIN.x1 - DOMAIN.x0;
    const DH = DOMAIN.y1 - DOMAIN.y0;
    const cellW = DW / (rx - 1);
    const cellH = DH / (ry - 1);
    
    const numCells = (rx - 1) * (ry - 1);
    const posData = new Float32Array(numCells * 6 * 2);
    const valData = new Float32Array(numCells * 6);
    
    const { toNdcX, toNdcY } = transforms;
    
    let posIdx = 0;
    let valIdx = 0;
    
    for (let cy = 0; cy < ry - 1; cy++) {
      for (let cx = 0; cx < rx - 1; cx++) {
        const x0 = DOMAIN.x0 + cx * cellW;
        const y0 = DOMAIN.y0 + cy * cellH;
        const x1 = x0 + cellW;
        const y1 = y0 + cellH;
        
        const v00 = values[cy * rx + cx];
        const v10 = values[cy * rx + cx + 1];
        const v01 = values[(cy + 1) * rx + cx];
        const v11 = values[(cy + 1) * rx + cx + 1];
        
        // Triangle 1: (0,0), (1,0), (0,1)
        posData[posIdx++] = toNdcX(x0); posData[posIdx++] = toNdcY(y0); valData[valIdx++] = v00;
        posData[posIdx++] = toNdcX(x1); posData[posIdx++] = toNdcY(y0); valData[valIdx++] = v10;
        posData[posIdx++] = toNdcX(x0); posData[posIdx++] = toNdcY(y1); valData[valIdx++] = v01;
        
        // Triangle 2: (1,0), (1,1), (0,1)
        posData[posIdx++] = toNdcX(x1); posData[posIdx++] = toNdcY(y0); valData[valIdx++] = v10;
        posData[posIdx++] = toNdcX(x1); posData[posIdx++] = toNdcY(y1); valData[valIdx++] = v11;
        posData[posIdx++] = toNdcX(x0); posData[posIdx++] = toNdcY(y1); valData[valIdx++] = v01;
      }
    }
    
    G.bindBuffer(G.ARRAY_BUFFER, buffers.current.fieldPos);
    G.bufferData(G.ARRAY_BUFFER, posData, G.STATIC_DRAW);
    
    G.bindBuffer(G.ARRAY_BUFFER, buffers.current.fieldVal);
    G.bufferData(G.ARRAY_BUFFER, valData, G.STATIC_DRAW);
    
    buffers.current.fieldVertexCount = numCells * 6;
  }, [transforms]);

  // ═══════════════════════════════════════════════════════════
  // BUILD TARGET FIELD ARRAY
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!fieldData?.cp_values) return;
    
    const aspectRatio = (DOMAIN.x1 - DOMAIN.x0) / (DOMAIN.y1 - DOMAIN.y0);
    const ry = Math.round(Math.sqrt(fieldData.cp_values.length / aspectRatio));
    const rx = Math.round(ry * aspectRatio);
    
    fieldState.current.rx = rx;
    fieldState.current.ry = ry;
    
    let target;
    
    if (showQCriterion) {
      target = new Float32Array(fieldData.cp_values.length).fill(0);
      const dx = (DOMAIN.x1 - DOMAIN.x0) / rx;
      const dy = (DOMAIN.y1 - DOMAIN.y0) / ry;
      
      for (let y = 1; y < ry - 1; y++) {
        for (let x = 1; x < rx - 1; x++) {
          const i = y * rx + x;
          const dudx = (fieldData.u_values[i + 1] - fieldData.u_values[i - 1]) / (2 * dx);
          const dudy = (fieldData.u_values[i + rx] - fieldData.u_values[i - rx]) / (2 * dy);
          const dvdx = (fieldData.v_values[i + 1] - fieldData.v_values[i - 1]) / (2 * dx);
          const dvdy = (fieldData.v_values[i + rx] - fieldData.v_values[i - rx]) / (2 * dy);
          
          target[i] = computeQCriterion(dudx, dudy, dvdx, dvdy);
        }
      }
    } else if (activeLayer === 'pressure') {
      target = new Float32Array(fieldData.cp_values);
    } else if (activeLayer === 'turbulence') {
      target = new Float32Array(fieldData.nut_values.map(v => Math.max(0, v)));
    } else if (activeLayer === 'vorticity') {
      target = new Float32Array(fieldData.cp_values.length).fill(0);
      const dx = (DOMAIN.x1 - DOMAIN.x0) / rx;
      const dy = (DOMAIN.y1 - DOMAIN.y0) / ry;
      
      for (let y = 1; y < ry - 1; y++) {
        for (let x = 1; x < rx - 1; x++) {
          const i = y * rx + x;
          const dudy = (fieldData.u_values[i + rx] - fieldData.u_values[i - rx]) / (2 * dy);
          const dvdx = (fieldData.v_values[i + 1] - fieldData.v_values[i - 1]) / (2 * dx);
          target[i] = dvdx - dudy;
        }
      }
    } else {
      // Velocity magnitude
      target = new Float32Array(fieldData.u_values.map((u, i) =>
        Math.sqrt(u * u + fieldData.v_values[i] * fieldData.v_values[i])
      ));
    }
    
    // Compute range
    let minVal = Infinity;
    let maxVal = -Infinity;
    
    for (let i = 0; i < target.length; i++) {
      if (target[i] < minVal) minVal = target[i];
      if (target[i] > maxVal) maxVal = target[i];
    }
    
    // Symmetric range for signed quantities
    if (activeLayer === 'pressure' && !showQCriterion) {
      const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
      minVal = -absMax;
      maxVal = absMax;
    }
    
    if (showQCriterion || activeLayer === 'vorticity') {
      const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal)) * 0.2;
      minVal = -absMax;
      maxVal = absMax;
    }
    
    fieldState.current.minV = minVal;
    fieldState.current.maxV = maxVal;
    fieldState.current.target = target;
    
    // Initialize current values if needed
    if (!fieldState.current.values || fieldState.current.values.length !== target.length) {
      fieldState.current.values = new Float32Array(target);
    }
  }, [fieldData, activeLayer, showQCriterion]);

  // ═══════════════════════════════════════════════════════════
  // AIRFOIL GEOMETRY
  // ═══════════════════════════════════════════════════════════
  const airfoilNdcVertices = useMemo(() => {
    if (!coordinates?.length) return null;
    
    const { toNdcX, toNdcY } = transforms;
    const vertices = new Float32Array(coordinates.length * 2);
    
    coordinates.forEach((point, i) => {
      vertices[i * 2] = toNdcX(point[0]);
      vertices[i * 2 + 1] = toNdcY(point[1]);
    });
    
    return vertices;
  }, [coordinates, transforms]);

  const airfoilFillVertices = useMemo(() => {
    if (!coordinates?.length) return null;
    
    const { toNdcX, toNdcY } = transforms;
    
    // Compute centroid
    const cx = coordinates.reduce((sum, p) => sum + p[0], 0) / coordinates.length;
    const cy = coordinates.reduce((sum, p) => sum + p[1], 0) / coordinates.length;
    
    // Fan triangulation
    const n = coordinates.length;
    const vertices = new Float32Array(n * 3 * 2);
    let idx = 0;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      vertices[idx++] = toNdcX(cx);
      vertices[idx++] = toNdcY(cy);
      vertices[idx++] = toNdcX(coordinates[i][0]);
      vertices[idx++] = toNdcY(coordinates[i][1]);
      vertices[idx++] = toNdcX(coordinates[j][0]);
      vertices[idx++] = toNdcY(coordinates[j][1]);
    }
    
    return vertices;
  }, [coordinates, transforms]);

  // ═══════════════════════════════════════════════════════════
  // PARTICLE SYSTEM
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!fieldData || !showStreamlines) {
      particles.current = [];
      return;
    }
    
    const particleCount = 4000;
    particles.current = Array.from({ length: particleCount }, () => ({
      x: DOMAIN.x0 + Math.random() * 0.2,
      y: DOMAIN.y0 + Math.random() * (DOMAIN.y1 - DOMAIN.y0),
      age: Math.random(),
      life: 0.3 + Math.random() * 0.7,
      speed: 0.5 + Math.random() * 1.5,
    }));
  }, [fieldData, showStreamlines]);

  // ═══════════════════════════════════════════════════════════
  // STREAMLINE COMPUTATION (RK4)
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!tracers.length || !fieldData) {
      streamlines.current = [];
      return;
    }
    
    const lines = [];
    const isReverse = interactionMode === 'BACKWARD_RK4';
    const dt = isReverse ? -0.004 : 0.004;
    const maxSteps = 1200;
    
    for (const tracer of tracers) {
      const points = [{ x: tracer.x, y: tracer.y }];
      let px = tracer.x;
      let py = tracer.y;
      
      for (let step = 0; step < maxSteps; step++) {
        // RK4 integration
        const k1 = sampleField(px, py);
        if (!k1) break;
        
        const k2 = sampleField(px + 0.5 * dt * safe(k1.u), py + 0.5 * dt * safe(k1.v));
        if (!k2) break;
        
        const k3 = sampleField(px + 0.5 * dt * safe(k2.u), py + 0.5 * dt * safe(k2.v));
        if (!k3) break;
        
        const k4 = sampleField(px + dt * safe(k3.u), py + dt * safe(k3.v));
        if (!k4) break;
        
        px += (dt / 6) * (safe(k1.u) + 2 * safe(k2.u) + 2 * safe(k3.u) + safe(k4.u));
        py += (dt / 6) * (safe(k1.v) + 2 * safe(k2.v) + 2 * safe(k3.v) + safe(k4.v));
        
        points.push({ x: px, y: py });
        
        // Check bounds
        if (px > DOMAIN.x1 + 0.1 || px < DOMAIN.x0 - 0.1 ||
            py > DOMAIN.y1 + 0.1 || py < DOMAIN.y0 - 0.1) {
          break;
        }
        
        // Check velocity magnitude
        const vel = Math.sqrt(k1.u * k1.u + k1.v * k1.v);
        if (vel < 0.001) break;
      }
      
      lines.push({
        points,
        hue: (tracer.id * 137.5) % 360,
        id: tracer.id,
      });
    }
    
    streamlines.current = lines;
  }, [tracers, interactionMode, fieldData, sampleField]);

  // ═══════════════════════════════════════════════════════════
  // WEBGL RENDER
  // ═══════════════════════════════════════════════════════════
  const renderWebGL = useCallback(() => {
    const G = gl.current;
    if (!G) return;
    
    const { w, h } = dimensions;
    const dpr = window.devicePixelRatio || 1;
    
    G.viewport(0, 0, w * dpr, h * dpr);
    G.clear(G.COLOR_BUFFER_BIT);
    
    const fs = fieldState.current;
    
    // ── Lerp field values ────────────────────────────────────
    if (fs.values && fs.target) {
      let hasChanged = false;
      const lerpFactor = 0.15;
      
      for (let i = 0; i < fs.values.length; i++) {
        const diff = fs.target[i] - fs.values[i];
        if (Math.abs(diff) > 1e-6) {
          fs.values[i] += diff * lerpFactor;
          hasChanged = true;
        }
      }
      
      if (hasChanged) {
        uploadFieldMesh(fs.values, fs.rx, fs.ry);
      }
    }
    
    // ── Draw field ───────────────────────────────────────────
    if (buffers.current.fieldVertexCount > 0 && programs.current.field) {
      const prog = programs.current.field;
      G.useProgram(prog);
      
      // Bind colormap texture
      G.activeTexture(G.TEXTURE0);
      G.bindTexture(G.TEXTURE_2D, textures.current.colormap);
      G.uniform1i(G.getUniformLocation(prog, 'u_colormap'), 0);
      
      // Set uniforms
      G.uniform1f(G.getUniformLocation(prog, 'u_minValue'), fs.minV);
      G.uniform1f(G.getUniformLocation(prog, 'u_maxValue'), fs.maxV);
      G.uniform1i(G.getUniformLocation(prog, 'u_showContours'), showContours ? 1 : 0);
      G.uniform1f(G.getUniformLocation(prog, 'u_contourCount'), 20.0);
      
      // Position attribute
      G.bindBuffer(G.ARRAY_BUFFER, buffers.current.fieldPos);
      const posLoc = G.getAttribLocation(prog, 'a_position');
      G.enableVertexAttribArray(posLoc);
      G.vertexAttribPointer(posLoc, 2, G.FLOAT, false, 0, 0);
      
      // Value attribute
      G.bindBuffer(G.ARRAY_BUFFER, buffers.current.fieldVal);
      const valLoc = G.getAttribLocation(prog, 'a_value');
      G.enableVertexAttribArray(valLoc);
      G.vertexAttribPointer(valLoc, 1, G.FLOAT, false, 0, 0);
      
      G.drawArrays(G.TRIANGLES, 0, buffers.current.fieldVertexCount);
    }
    
    // ── Draw airfoil fill ────────────────────────────────────
    if (airfoilFillVertices && programs.current.solid) {
      const prog = programs.current.solid;
      G.useProgram(prog);
      G.uniform4f(G.getUniformLocation(prog, 'u_color'), 0.02, 0.04, 0.08, 1.0);
      
      G.bindBuffer(G.ARRAY_BUFFER, buffers.current.solid);
      G.bufferData(G.ARRAY_BUFFER, airfoilFillVertices, G.DYNAMIC_DRAW);
      
      const loc = G.getAttribLocation(prog, 'a_position');
      G.enableVertexAttribArray(loc);
      G.vertexAttribPointer(loc, 2, G.FLOAT, false, 0, 0);
      
      G.drawArrays(G.TRIANGLES, 0, airfoilFillVertices.length / 2);
    }
    
    // ── Draw airfoil outline ─────────────────────────────────
    if (airfoilNdcVertices && programs.current.solid) {
      const prog = programs.current.solid;
      G.useProgram(prog);
      G.uniform4f(G.getUniformLocation(prog, 'u_color'), 0.2, 0.7, 0.9, 0.85);
      
      G.bindBuffer(G.ARRAY_BUFFER, buffers.current.solid);
      G.bufferData(G.ARRAY_BUFFER, airfoilNdcVertices, G.DYNAMIC_DRAW);
      
      const loc = G.getAttribLocation(prog, 'a_position');
      G.enableVertexAttribArray(loc);
      G.vertexAttribPointer(loc, 2, G.FLOAT, false, 0, 0);
      
      G.lineWidth(1.5);
      G.drawArrays(G.LINE_LOOP, 0, airfoilNdcVertices.length / 2);
    }
    
    // ── Draw particles ───────────────────────────────────────
    if (showStreamlines && particles.current.length > 0 && programs.current.particle && fieldData) {
      const dt = 0.006;
      const { toNdcX, toNdcY } = transforms;
      
      const posArr = new Float32Array(particles.current.length * 2);
      const ageArr = new Float32Array(particles.current.length);
      const speedArr = new Float32Array(particles.current.length);
      
      particles.current.forEach((p, i) => {
        const field = sampleField(p.x, p.y);
        
        if (field) {
          const vel = Math.sqrt(field.u * field.u + field.v * field.v);
          p.x += safe(field.u) * dt * p.speed;
          p.y += safe(field.v) * dt * p.speed;
          speedArr[i] = Math.min(1, vel);
        } else {
          speedArr[i] = 0;
        }
        
        p.age += dt * p.speed * 0.35;
        
        // Reset particle if out of bounds or aged out
        if (p.age > p.life || p.x > DOMAIN.x1 || !field ||
            p.x < DOMAIN.x0 - 0.1 || p.y > DOMAIN.y1 || p.y < DOMAIN.y0) {
          p.x = DOMAIN.x0 + Math.random() * 0.15;
          p.y = DOMAIN.y0 + Math.random() * (DOMAIN.y1 - DOMAIN.y0);
          p.age = 0;
          p.life = 0.3 + Math.random() * 0.7;
        }
        
        posArr[i * 2] = toNdcX(p.x);
        posArr[i * 2 + 1] = toNdcY(p.y);
        ageArr[i] = p.age / p.life;
      });
      
      const prog = programs.current.particle;
      G.useProgram(prog);
      G.uniform3f(G.getUniformLocation(prog, 'u_color'), 0.65, 0.8, 0.9);
      
      // Position
      G.bindBuffer(G.ARRAY_BUFFER, buffers.current.particlePos);
      G.bufferData(G.ARRAY_BUFFER, posArr, G.DYNAMIC_DRAW);
      const posLoc = G.getAttribLocation(prog, 'a_position');
      G.enableVertexAttribArray(posLoc);
      G.vertexAttribPointer(posLoc, 2, G.FLOAT, false, 0, 0);
      
      // Age
      G.bindBuffer(G.ARRAY_BUFFER, buffers.current.particleAge);
      G.bufferData(G.ARRAY_BUFFER, ageArr, G.DYNAMIC_DRAW);
      const ageLoc = G.getAttribLocation(prog, 'a_age');
      G.enableVertexAttribArray(ageLoc);
      G.vertexAttribPointer(ageLoc, 1, G.FLOAT, false, 0, 0);
      
      // Speed
      G.bindBuffer(G.ARRAY_BUFFER, buffers.current.particleSpeed);
      G.bufferData(G.ARRAY_BUFFER, speedArr, G.DYNAMIC_DRAW);
      const speedLoc = G.getAttribLocation(prog, 'a_speed');
      if (speedLoc >= 0) {
        G.enableVertexAttribArray(speedLoc);
        G.vertexAttribPointer(speedLoc, 1, G.FLOAT, false, 0, 0);
      }
      
      G.drawArrays(G.POINTS, 0, particles.current.length);
    }
    
    // ── Draw streamlines ─────────────────────────────────────
    if (streamlines.current.length > 0 && programs.current.line) {
      const prog = programs.current.line;
      G.useProgram(prog);
      const { toNdcX, toNdcY } = transforms;
      
      for (const sl of streamlines.current) {
        if (sl.points.length < 2) continue;
        
        const n = sl.points.length;
        const posData = new Float32Array(n * 2);
        const tData = new Float32Array(n);
        
        sl.points.forEach((pt, i) => {
          posData[i * 2] = toNdcX(pt.x);
          posData[i * 2 + 1] = toNdcY(pt.y);
          tData[i] = i / (n - 1);
        });
        
        // Color based on hue
        const r = (Math.sin(sl.hue * Math.PI / 180) * 0.2 + 0.8);
        const g = (Math.cos(sl.hue * Math.PI / 180) * 0.2 + 0.6);
        const b = (0.8 - sl.hue * 0.002);
        
        G.uniform4f(G.getUniformLocation(prog, 'u_color'), r, g, b, 0.9);
        
        G.bindBuffer(G.ARRAY_BUFFER, buffers.current.linePos);
        G.bufferData(G.ARRAY_BUFFER, posData, G.DYNAMIC_DRAW);
        const posLoc = G.getAttribLocation(prog, 'a_position');
        G.enableVertexAttribArray(posLoc);
        G.vertexAttribPointer(posLoc, 2, G.FLOAT, false, 0, 0);
        
        G.bindBuffer(G.ARRAY_BUFFER, buffers.current.lineT);
        G.bufferData(G.ARRAY_BUFFER, tData, G.DYNAMIC_DRAW);
        const tLoc = G.getAttribLocation(prog, 'a_t');
        G.enableVertexAttribArray(tLoc);
        G.vertexAttribPointer(tLoc, 1, G.FLOAT, false, 0, 0);
        
        G.lineWidth(2);
        G.drawArrays(G.LINE_STRIP, 0, n);
      }
    }
  }, [dimensions, transforms, airfoilFillVertices, airfoilNdcVertices,
      showContours, showStreamlines, fieldData, sampleField, uploadFieldMesh]);

  // ═══════════════════════════════════════════════════════════
  // 2D OVERLAY RENDER
  // ═══════════════════════════════════════════════════════════
  const renderOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const { w, h, toScreenX, toScreenY, marginLeft, marginBottom } = transforms;
    const dpr = window.devicePixelRatio || 1;
    
    // Resize canvas if needed
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }
    
    ctx.clearRect(0, 0, w, h);
    
    // ── Grid lines ───────────────────────────────────────────
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 8]);
    
    // Vertical grid lines
    for (let x = -0.25; x <= 1.5; x += 0.25) {
      ctx.beginPath();
      ctx.moveTo(toScreenX(x), toScreenY(DOMAIN.y0));
      ctx.lineTo(toScreenX(x), toScreenY(DOMAIN.y1));
      ctx.stroke();
    }
    
    // Horizontal grid lines
    for (let y = -0.4; y <= 0.4; y += 0.2) {
      ctx.beginPath();
      ctx.moveTo(toScreenX(DOMAIN.x0), toScreenY(y));
      ctx.lineTo(toScreenX(DOMAIN.x1), toScreenY(y));
      ctx.stroke();
    }
    
    ctx.setLineDash([]);
    ctx.restore();
    
    // ── Axis labels ──────────────────────────────────────────
    ctx.save();
    ctx.font = '11px "Inter", system-ui, sans-serif';
    ctx.fillStyle = '#484f58';
    
    // X-axis ticks
    ctx.textAlign = 'center';
    for (let x = 0; x <= 1.0; x += 0.25) {
      const screenX = toScreenX(x);
      ctx.fillText(x.toFixed(2), screenX, toScreenY(DOMAIN.y0) + 16);
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(screenX, toScreenY(DOMAIN.y0));
      ctx.lineTo(screenX, toScreenY(DOMAIN.y0) + 4);
      ctx.stroke();
    }
    
    // X-axis label
    ctx.fillStyle = '#6b7280';
    ctx.fillText('x/c', toScreenX(1.35), toScreenY(DOMAIN.y0) + 16);
    
    // Y-axis ticks
    ctx.textAlign = 'right';
    ctx.fillStyle = '#484f58';
    for (let y = -0.4; y <= 0.4; y += 0.2) {
      ctx.fillText(y.toFixed(1), toScreenX(DOMAIN.x0) - 8, toScreenY(y) + 4);
    }
    
    // Y-axis label
    ctx.save();
    ctx.fillStyle = '#6b7280';
    ctx.translate(15, toScreenY(0));
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('y/c', 0, 0);
    ctx.restore();
    
    ctx.restore();
    
    // ── Colorbar ─────────────────────────────────────────────
    const { minV, maxV } = fieldState.current;
    const cbWidth = 12;
    const cbHeight = Math.min(h * 0.5, 180);
    const cbX = w - cbWidth - 16;
    const cbY = (h - cbHeight) / 2;
    
    const interpolate = COLORMAPS[colormapName] ?? COLORMAPS.Turbo;
    
    // Draw gradient
    for (let i = 0; i < cbHeight; i++) {
      const t = 1 - i / cbHeight;
      ctx.fillStyle = d3.color(interpolate(t)).formatHex();
      ctx.fillRect(cbX, cbY + i, cbWidth, 1.5);
    }
    
    // Border
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.strokeRect(cbX, cbY, cbWidth, cbHeight);
    
    // Labels
    ctx.font = '10px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6b7280';
    ctx.fillText(maxV.toFixed(2), cbX + cbWidth + 5, cbY + 6);
    ctx.fillText(((minV + maxV) / 2).toFixed(2), cbX + cbWidth + 5, cbY + cbHeight / 2 + 3);
    ctx.fillText(minV.toFixed(2), cbX + cbWidth + 5, cbY + cbHeight);
    
    // Field name
    ctx.save();
    ctx.translate(w - 4, cbY + cbHeight / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#30363d';
    ctx.font = '10px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'center';
    
    const layerName = showQCriterion ? 'Q-criterion'
      : activeLayer === 'pressure' ? 'Cp'
      : activeLayer === 'turbulence' ? 'νt'
      : activeLayer === 'vorticity' ? 'ω'
      : '|V| m/s';
    ctx.fillText(layerName, 0, 0);
    ctx.restore();
    
    // ── Control volume ───────────────────────────────────────
    if (showControlVolume) {
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 255, 194, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      
      const cvX0 = toScreenX(-0.2);
      const cvX1 = toScreenX(1.2);
      const cvY0 = toScreenY(0.3);
      const cvY1 = toScreenY(-0.3);
      
      ctx.strokeRect(cvX0, cvY0, cvX1 - cvX0, cvY1 - cvY0);
      ctx.setLineDash([]);
      
      // Fill
      ctx.fillStyle = 'rgba(0, 255, 194, 0.03)';
      ctx.fillRect(cvX0, cvY0, cvX1 - cvX0, cvY1 - cvY0);
      
      // Corner markers
      [[cvX0, cvY0], [cvX1, cvY0], [cvX0, cvY1], [cvX1, cvY1]].forEach(([cx, cy]) => {
        ctx.strokeStyle = 'rgba(0, 255, 194, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy);
        ctx.lineTo(cx + 5, cy);
        ctx.moveTo(cx, cy - 5);
        ctx.lineTo(cx, cy + 5);
        ctx.stroke();
      });
      
      // Label
      ctx.fillStyle = 'rgba(0, 255, 194, 0.5)';
      ctx.font = 'bold 10px "Inter", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('CONTROL VOLUME', cvX0 + 6, cvY0 + 14);
      
      ctx.restore();
    }
    
    // ── Slice plane ──────────────────────────────────────────
    if (interactionMode === 'SLICE' && sliceX !== null) {
      const sliceScreenX = toScreenX(sliceX);
      
      ctx.save();
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      
      ctx.beginPath();
      ctx.moveTo(sliceScreenX, 0);
      ctx.lineTo(sliceScreenX, h);
      ctx.stroke();
      
      ctx.setLineDash([]);
      
      // Label
      ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
      ctx.font = 'bold 11px "Inter", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`x/c = ${sliceX.toFixed(2)}`, sliceScreenX + 6, 18);
      
      ctx.restore();
    }
    
    // ── APG markers ──────────────────────────────────────────
    if (showAPG && coordinates) {
      ctx.save();
      
      for (let i = 0; i < coordinates.length - 1; i++) {
        const mid = [
          (coordinates[i][0] + coordinates[i + 1][0]) / 2,
          (coordinates[i][1] + coordinates[i + 1][1]) / 2,
        ];
        
        // Only upper surface
        if (mid[1] <= 0) continue;
        
        const grad = sampleGradient(mid[0], mid[1]);
        if (!grad || grad.dpdx <= 3) continue;
        
        const normal = airfoilNormal(coordinates[i], coordinates[i + 1]);
        const len = Math.min(grad.dpdx * 0.015, 0.05);
        const alpha = Math.min(1, grad.dpdx / 15);
        
        ctx.strokeStyle = `rgba(245, 158, 11, ${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(toScreenX(mid[0]), toScreenY(mid[1]));
        ctx.lineTo(
          toScreenX(mid[0] + normal[0] * len),
          toScreenY(mid[1] + normal[1] * len)
        );
        ctx.stroke();
      }
      
      ctx.restore();
    }
    
    // ── BL normal ray ────────────────────────────────────────
    if (blNormalData) {
      ctx.save();
      
      const rootX = toScreenX(blNormalData.root[0]);
      const rootY = toScreenY(blNormalData.root[1]);
      const endX = toScreenX(blNormalData.root[0] + blNormalData.normal[0] * 0.12);
      const endY = toScreenY(blNormalData.root[1] + blNormalData.normal[1] * 0.12);
      
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rootX, rootY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      
      // Root point
      ctx.beginPath();
      ctx.arc(rootX, rootY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#a855f7';
      ctx.fill();
      
      ctx.restore();
    }
    
    // ── Probe markers ────────────────────────────────────────
    probes.forEach((probe, index) => {
      const px = toScreenX(probe.fx);
      const py = toScreenY(probe.fy);
      
      ctx.save();
      
      // Outer glow
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 242, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Main circle
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 242, 255, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      // Center dot
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      
      // Label chip
      ctx.fillStyle = 'rgba(6, 10, 18, 0.95)';
      ctx.strokeStyle = 'rgba(0, 242, 255, 0.3)';
      ctx.lineWidth = 1;
      
      const labelWidth = 28;
      const labelHeight = 16;
      
      ctx.beginPath();
      ctx.roundRect(px + 10, py - 10, labelWidth, labelHeight, 3);
      ctx.fill();
      ctx.stroke();
      
      ctx.fillStyle = '#00F2FF';
      ctx.font = 'bold 10px "Inter", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`S${index + 1}`, px + 10 + labelWidth / 2, py + 2);
      
      ctx.restore();
    });
    
    // ── Hover readout ────────────────────────────────────────
    if (hoverData) {
      const { screenX, screenY, domainX, domainY } = hoverData;
      
      // Crosshair
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 8]);
      
      ctx.beginPath();
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, h);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(0, screenY);
      ctx.lineTo(w, screenY);
      ctx.stroke();
      
      ctx.setLineDash([]);
      ctx.restore();
      
      const field = sampleField(domainX, domainY);
      
      if (field) {
        const cardWidth = 170;
        const cardHeight = 95;
        
        let cardX = screenX + 16;
        let cardY = screenY + 16;
        
        // Keep card in bounds
        if (cardX + cardWidth > w - 10) cardX = screenX - cardWidth - 12;
        if (cardY + cardHeight > h - 10) cardY = screenY - cardHeight - 10;
        
        ctx.save();
        
        // Card background
        ctx.fillStyle = 'rgba(8, 12, 20, 0.97)';
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 6);
        ctx.fill();
        ctx.stroke();
        
        // Accent line
        ctx.fillStyle = '#007AFF';
        ctx.fillRect(cardX, cardY, cardWidth, 2);
        
        // Content
        ctx.font = '10px "Inter", system-ui, sans-serif';
        ctx.textAlign = 'left';
        
        // Coordinates
        ctx.fillStyle = '#484f58';
        ctx.fillText(`x/c ${domainX.toFixed(3)}   y/c ${domainY.toFixed(3)}`, cardX + 10, cardY + 18);
        
        const velocity = Math.sqrt(field.u * field.u + field.v * field.v);
        
        const rows = [
          { label: 'Cp', value: field.cp.toFixed(4), color: '#00F2FF' },
          { label: '|V|', value: velocity.toFixed(4), color: '#f472b6' },
          { label: 'νt', value: field.nut.toFixed(5), color: '#a855f7' },
        ];
        
        rows.forEach((row, i) => {
          const rowY = cardY + 36 + i * 20;
          ctx.fillStyle = '#8b949e';
          ctx.fillText(row.label, cardX + 10, rowY);
          ctx.fillStyle = row.color;
          ctx.font = 'bold 11px "Inter", system-ui, sans-serif';
          ctx.fillText(row.value, cardX + 40, rowY);
          ctx.font = '10px "Inter", system-ui, sans-serif';
        });
        
        ctx.restore();
      }
    }
    
    // ── Mach indicator ───────────────────────────────────────
    if (machMode && freestreamMach > 0.4) {
      ctx.save();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
      ctx.font = 'bold 11px "Inter", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`⚡ TRANSONIC  M∞ = ${freestreamMach.toFixed(2)}`, toScreenX(DOMAIN.x0) + 6, toScreenY(DOMAIN.y1) + 18);
      ctx.restore();
    }
  }, [transforms, colormapName, activeLayer, showQCriterion, showControlVolume,
      showAPG, interactionMode, sliceX, blNormalData, probes, hoverData,
      coordinates, sampleField, sampleGradient, machMode, freestreamMach]);

  // ═══════════════════════════════════════════════════════════
  // ANIMATION LOOP
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const animate = () => {
      renderWebGL();
      renderOverlay();
      animationId.current = requestAnimationFrame(animate);
    };
    
    animationId.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationId.current) {
        cancelAnimationFrame(animationId.current);
      }
    };
  }, [renderWebGL, renderOverlay]);

  // ═══════════════════════════════════════════════════════════
  // RESIZE HANDLING
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 50 && height > 50) {
          const dpr = window.devicePixelRatio || 1;
          
          if (glCanvasRef.current) {
            glCanvasRef.current.width = width * dpr;
            glCanvasRef.current.height = height * dpr;
          }
          
          setDimensions({ w: width, h: height });
        }
      }
    });
    
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    
    return () => observer.disconnect();
  }, []);

  // ═══════════════════════════════════════════════════════════
  // WEBGL INITIALIZATION
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    initWebGL();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════
  // PHYSICS EXTRACTION
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!fieldData || !coordinates || !onDataExtract) return;
    
    let formDrag = 0;
    let lift = 0;
    const surfaceData = [];
    const apgZones = [];
    const lsbZones = [];
    const skinFriction = [];
    
    // Surface integration
    for (let i = 0; i < coordinates.length - 1; i++) {
      const p1 = coordinates[i];
      const p2 = coordinates[i + 1];
      const midX = (p1[0] + p2[0]) / 2;
      const midY = (p1[1] + p2[1]) / 2;
      
      const field = sampleField(midX, midY);
      const grad = sampleGradient(midX, midY);
      
      if (!field) continue;
      
      const normal = airfoilNormal(p1, p2);
      const ds = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      
      formDrag += -field.cp * normal[0] * ds;
      lift += -field.cp * normal[1] * ds;
      
      surfaceData.push({ x: midX, y: midY, cp: field.cp });
      
      // Estimate skin friction from velocity gradient
      if (grad) {
        const tau = 0.001 * (grad.dudy + grad.dvdx); // Simplified
        skinFriction.push({ x: midX, cf: tau });
        
        if (tau < -0.0001 && midY > 0) {
          lsbZones.push([midX, midY]);
        }
      }
      
      if (midY > 0 && grad?.dpdx > 3) {
        apgZones.push([midX, midY]);
      }
    }
    
    // Wake survey at x = 1.4c
    const wakeX = 1.4;
    const dy = 0.005;
    let wakeDrag = 0;
    const wakeProfile = [];
    
    for (let y = -0.4; y <= 0.4; y += dy) {
      const field = sampleField(wakeX, y);
      if (!field) continue;
      
      const velocity = Math.sqrt(field.u * field.u + field.v * field.v);
      wakeDrag += 2 * velocity * (1 - velocity) * dy;
      
      wakeProfile.push({
        y: parseFloat(y.toFixed(3)),
        velocity: parseFloat(velocity.toFixed(4)),
        cp: parseFloat(field.cp.toFixed(4)),
      });
    }
    
    // User slice profile
    let userSliceProfile = [];
    if (sliceX !== null) {
      for (let y = -0.45; y <= 0.45; y += dy) {
        const field = sampleField(sliceX, y);
        if (!field) continue;
        
        userSliceProfile.push({
          y: parseFloat(y.toFixed(3)),
          velocity: parseFloat(Math.sqrt(field.u ** 2 + field.v ** 2).toFixed(4)),
          cp: parseFloat(field.cp.toFixed(4)),
        });
      }
    }
    
    // Control volume momentum analysis
    const box = { x0: -0.2, x1: 1.2, y0: -0.3, y1: 0.3 };
    let momentumIn = 0;
    let momentumOut = 0;
    let momentumTop = 0;
    let momentumBottom = 0;
    let pressureIn = 0;
    let pressureOut = 0;
    
    for (let y = box.y0; y <= box.y1; y += dy) {
      const fieldIn = sampleField(box.x0, y);
      const fieldOut = sampleField(box.x1, y);
      
      if (fieldIn) {
        momentumIn += fieldIn.u * fieldIn.u * dy;
        pressureIn += fieldIn.cp * dy;
      }
      
      if (fieldOut) {
        momentumOut += fieldOut.u * fieldOut.u * dy;
        pressureOut += fieldOut.cp * dy;
      }
    }
    
    for (let x = box.x0; x <= box.x1; x += 0.01) {
      const fieldTop = sampleField(x, box.y1);
      const fieldBottom = sampleField(x, box.y0);
      
      if (fieldTop) momentumTop += fieldTop.u * fieldTop.v * 0.01;
      if (fieldBottom) momentumBottom += fieldBottom.u * fieldBottom.v * 0.01;
    }
    
    const cvDrag = (momentumOut - momentumIn) + (momentumTop - momentumBottom) + (pressureOut - pressureIn);
    
    // Estimate transition point
    let transitionUpper = 1.0;
    let transitionLower = 1.0;
    
    for (let i = 0; i < skinFriction.length; i++) {
      if (skinFriction[i].cf < 0) {
        const surf = coordinates.find(c => Math.abs(c[0] - skinFriction[i].x) < 0.01);
        if (surf && surf[1] > 0 && transitionUpper === 1.0) {
          transitionUpper = skinFriction[i].x;
        } else if (surf && surf[1] < 0 && transitionLower === 1.0) {
          transitionLower = skinFriction[i].x;
        }
      }
    }
    
    onDataExtract({
      formDrag,
      lift,
      wakeDrag,
      cvDrag,
      surfaceData,
      wakeProfile,
      userSliceProfile,
      blNormal: blNormalData,
      apgZones,
      lsbZones,
      skinFriction,
      transitionPoint: { upper: transitionUpper, lower: transitionLower },
    });
  }, [fieldData, coordinates, sliceX, blNormalData, sampleField, sampleGradient, onDataExtract]);

  // ═══════════════════════════════════════════════════════════
  // IMPERATIVE HANDLE (PDF export)
  // ═══════════════════════════════════════════════════════════
  useImperativeHandle(ref, () => ({
    getCanvasDataURL: () => {
      const glCanvas = glCanvasRef.current;
      const overlayCanvas = overlayCanvasRef.current;
      
      if (!glCanvas || !overlayCanvas) return null;
      
      // Composite both canvases
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = glCanvas.width;
      tempCanvas.height = glCanvas.height;
      
      const ctx = tempCanvas.getContext('2d');
      ctx.drawImage(glCanvas, 0, 0);
      ctx.drawImage(overlayCanvas, 0, 0);
      
      return tempCanvas.toDataURL('image/png', 1.0);
    },
  }));

  // ═══════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════
  const getEventPoint = useCallback((e) => {
    const rect = overlayCanvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    return {
      screenX,
      screenY,
      domainX: transforms.toDomainX(screenX),
      domainY: transforms.toDomainY(screenY),
    };
  }, [transforms]);

  const handleMouseMove = useCallback((e) => {
    const point = getEventPoint(e);
    setHoverData(point);
    
    // Handle slice dragging
    if (isDragging && interactionMode === 'SLICE' && onSliceMove) {
      const clampedX = clamp(point.domainX, DOMAIN.x0, DOMAIN.x1);
      onSliceMove(clampedX);
    }
  }, [getEventPoint, isDragging, interactionMode, onSliceMove]);

  const handleMouseDown = useCallback((e) => {
    if (interactionMode === 'SLICE') {
      setIsDragging(true);
      const point = getEventPoint(e);
      if (onSliceMove) {
        onSliceMove(clamp(point.domainX, DOMAIN.x0, DOMAIN.x1));
      }
    }
  }, [getEventPoint, interactionMode, onSliceMove]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = useCallback((e) => {
    if (!fieldData) return;
    
    const point = getEventPoint(e);
    const field = sampleField(point.domainX, point.domainY);
    
    if (!field) return;
    
    switch (interactionMode) {
      case 'PROBE': {
        const isDuplicate = probes.some(p =>
          Math.abs(p.fx - point.domainX) < 0.04 &&
          Math.abs(p.fy - point.domainY) < 0.04
        );
        
        if (!isDuplicate && onProbeAdd) {
          onProbeAdd({
            fx: point.domainX,
            fy: point.domainY,
            ...field,
          });
        }
        break;
      }
      
      case 'FORWARD_RK4':
      case 'BACKWARD_RK4': {
        if (onTracerAdd) {
          onTracerAdd({
            x: point.domainX,
            y: point.domainY,
            id: Date.now(),
          });
        }
        break;
      }
      
      case 'BL_NORMAL': {
        if (!coordinates) break;
        
        // Find closest surface point
        let minDist = Infinity;
        let closestIdx = 0;
        
        for (let i = 0; i < coordinates.length - 1; i++) {
          const dist = Math.hypot(
            coordinates[i][0] - point.domainX,
            coordinates[i][1] - point.domainY
          );
          if (dist < minDist) {
            minDist = dist;
            closestIdx = i;
          }
        }
        
        const p1 = coordinates[closestIdx];
        const p2 = coordinates[closestIdx + 1] ?? coordinates[0];
        const normal = airfoilNormal(p1, p2);
        
        // Sample boundary layer profile
        const blPoints = [];
        for (let d = 0; d <= 0.15; d += 0.002) {
          const sampleX = p1[0] + normal[0] * d;
          const sampleY = p1[1] + normal[1] * d;
          const f = sampleField(sampleX, sampleY);
          
          if (f) {
            // Tangential velocity component
            const uTan = Math.abs(f.u * (-normal[1]) + f.v * normal[0]);
            blPoints.push({
              dist: parseFloat(d.toFixed(3)),
              u: parseFloat(uTan.toFixed(4)),
            });
          }
        }
        
        setBlNormalData({
          root: p1,
          normal,
          points: blPoints,
        });
        break;
      }
      
      case 'STAG_SEEKER': {
        if (onTripAdd) {
          const surface = point.domainY > 0 ? 'upper' : 'lower';
          onTripAdd(point.domainX, surface);
        }
        break;
      }
    }
  }, [fieldData, getEventPoint, sampleField, interactionMode, probes, coordinates,
      onProbeAdd, onTracerAdd, onTripAdd]);

  // ═══════════════════════════════════════════════════════════
  // HUD CONFIGURATION
  // ═══════════════════════════════════════════════════════════
  const LAYER_TABS = [
    { id: 'velocity', label: 'VEL', qCrit: false },
    { id: 'pressure', label: 'Cp', qCrit: false },
    { id: 'turbulence', label: 'νt', qCrit: false },
    { id: 'vorticity', label: 'ω', qCrit: false },
    { id: 'q_criterion', label: 'Q', qCrit: true },
  ];

  const TOOLS = [
    { id: 'PROBE', symbol: '⊕', tip: 'Place sensor probe', color: '#f59e0b' },
    { id: 'SLICE', symbol: '∥', tip: 'Wake cut plane', color: '#f59e0b' },
    { id: 'BL_NORMAL', symbol: '⊥', tip: 'BL normal ray', color: '#f59e0b' },
    { id: 'SEP' },
    { id: 'FORWARD_RK4', symbol: '▶', tip: 'Forward streamline', color: '#a855f7' },
    { id: 'BACKWARD_RK4', symbol: '◀', tip: 'Reverse streamline', color: '#e879f9' },
    { id: 'STAG_SEEKER', symbol: '⚡', tip: 'Trip wire', color: '#00FFC2' },
  ];

  const TOOL_HINTS = {
    PROBE: ['CLICK', 'record Cp, |V|, νt'],
    SLICE: ['DRAG', 'reposition wake plane'],
    BL_NORMAL: ['CLICK', 'cast BL normal ray'],
    FORWARD_RK4: ['CLICK', 'seed tracer downstream'],
    BACKWARD_RK4: ['CLICK', 'trace upstream'],
    STAG_SEEKER: ['CLICK', 'inject trip wire'],
  };

  const CURSOR_MAP = {
    PROBE: 'crosshair',
    SLICE: 'ew-resize',
    BL_NORMAL: 'cell',
    FORWARD_RK4: 'alias',
    BACKWARD_RK4: 'alias',
    STAG_SEEKER: 'crosshair',
  };

  const currentTool = TOOLS.find(t => t.id === interactionMode);
  const hint = TOOL_HINTS[interactionMode];

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        cursor: CURSOR_MAP[interactionMode] ?? 'default',
        userSelect: 'none',
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
    >
      {/* WebGL canvas */}
      <canvas
        ref={glCanvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
      
      {/* 2D overlay canvas */}
      <canvas
        ref={overlayCanvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      
      {/* Event capture layer */}
      <div
        style={{ position: 'absolute', inset: 0, zIndex: 20 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverData(null)}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
      />
      
      {/* Loading state */}
      {!fieldData && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            zIndex: 25,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: '3px solid #21262d',
              borderTopColor: '#007AFF',
              animation: 'spin 1.2s linear infinite',
            }}
          />
          <span
            style={{
              fontSize: 12,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: '#30363d',
              fontWeight: 600,
            }}
          >
            Awaiting inference server
          </span>
        </div>
      )}
      
      {/* Layer tabs - top left */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 30,
          display: 'flex',
          gap: 2,
          padding: 4,
          background: 'rgba(10, 14, 20, 0.95)',
          border: '1px solid #30363d',
          borderRadius: 6,
          backdropFilter: 'blur(8px)',
        }}
      >
        {LAYER_TABS.map(tab => {
          const isActive = tab.qCrit
            ? showQCriterion
            : (activeLayer === tab.id && !showQCriterion);
          
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.qCrit) {
                  setShowQCriterion?.(true);
                } else {
                  setActiveLayer?.(tab.id);
                  setShowQCriterion?.(false);
                }
              }}
              style={{
                padding: '6px 14px',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.5,
                background: isActive ? 'rgba(0, 122, 255, 0.2)' : 'transparent',
                border: isActive ? '1px solid rgba(0, 122, 255, 0.5)' : '1px solid transparent',
                borderRadius: 4,
                color: isActive ? '#4d9fff' : '#6b7280',
                cursor: 'pointer',
                transition: 'all 0.15s',
                fontFamily: 'inherit',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      
      {/* Tool palette - top right */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 30,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          padding: 4,
          background: 'rgba(10, 14, 20, 0.95)',
          border: '1px solid #30363d',
          borderRadius: 6,
          backdropFilter: 'blur(8px)',
        }}
      >
        {TOOLS.map((tool, idx) => {
          if (tool.id === 'SEP') {
            return (
              <div
                key={idx}
                style={{
                  height: 1,
                  background: '#30363d',
                  margin: '2px 0',
                }}
              />
            );
          }
          
          const isActive = interactionMode === tool.id;
          
          return (
            <button
              key={tool.id}
              title={tool.tip}
              onClick={() => setInteractionMode?.(tool.id)}
              style={{
                width: 34,
                height: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 700,
                background: isActive ? `${tool.color}22` : 'transparent',
                border: isActive ? `1px solid ${tool.color}66` : '1px solid transparent',
                borderRadius: 4,
                color: isActive ? tool.color : '#6b7280',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {tool.symbol}
            </button>
          );
        })}
        
        <div style={{ height: 1, background: '#30363d', margin: '2px 0' }} />
        
        {/* Clear button */}
        <button
          title="Clear all probes & tracers"
          onClick={() => {
            clearProbes?.();
            setBlNormalData(null);
          }}
          style={{
            width: 34,
            height: 34,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 700,
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: 4,
            color: '#6b7280',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
            e.currentTarget.style.color = '#ef4444';
            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#6b7280';
            e.currentTarget.style.borderColor = 'transparent';
          }}
        >
          ✕
        </button>
      </div>
      
      {/* Status bar - bottom center */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 16px',
          background: 'rgba(10, 14, 20, 0.95)',
          border: '1px solid #30363d',
          borderRadius: 20,
          backdropFilter: 'blur(8px)',
          fontSize: 11,
          whiteSpace: 'nowrap',
        }}
      >
        {/* Tool indicator */}
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: currentTool?.color ?? '#6b7280',
            boxShadow: `0 0 8px ${currentTool?.color ?? '#6b7280'}`,
          }}
        />
        <span style={{ color: currentTool?.color ?? '#6b7280', fontWeight: 700 }}>
          {interactionMode}
        </span>
        
        {hint && (
          <>
            <span style={{ color: '#30363d' }}>·</span>
            <span style={{ color: '#6b7280', fontWeight: 600 }}>{hint[0]}</span>
            <span style={{ color: '#30363d' }}>·</span>
            <span style={{ color: '#484f58' }}>{hint[1]}</span>
          </>
        )}
        
        {probes.length > 0 && (
          <>
            <span style={{ color: '#30363d' }}>|</span>
            <span style={{ color: '#00F2FF', fontWeight: 700 }}>{probes.length}p</span>
          </>
        )}
        
        {tracers.length > 0 && (
          <>
            <span style={{ color: '#30363d' }}>|</span>
            <span style={{ color: '#a855f7', fontWeight: 700 }}>{tracers.length}t</span>
          </>
        )}
        
        <span style={{ color: '#30363d' }}>|</span>
        <span style={{ color: '#30363d' }}>{dimensions.w}×{dimensions.h}</span>
      </div>
      
      {/* Keyframes animation */}
      <style>{`
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
});

AdvancedDeepONetViz.displayName = 'AdvancedDeepONetViz';
export default AdvancedDeepONetViz;