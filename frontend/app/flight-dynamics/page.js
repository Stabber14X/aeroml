'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, ReferenceLine, AreaChart, Area,
  Legend, ComposedChart, Scatter,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import {
  FiWind, FiDatabase, FiUploadCloud, FiFileText, FiTarget,
  FiDownload, FiSearch, FiX, FiCpu, FiSliders, FiActivity,
  FiTrendingUp, FiAlertTriangle, FiCheckCircle, FiShield,
  FiCompass, FiChevronDown, FiZap, FiAnchor, FiBox
} from 'react-icons/fi';
import SubscriptionGuard from '@/components/SubscriptionGuard';
import styles from './flight-dynamics.module.css';

const API = 'http://127.0.0.1:8000';

/* ============================================================================
 * PHYSICS ENGINES
 * ============================================================================ */

const NACA4412_CST = {
  a_upper: [ 0.1818,  0.2238,  0.1578,  0.1802,  0.2014,  0.1554,  0.1706,  0.1895],
  a_lower: [-0.1068, -0.1384, -0.0526, -0.0244,  0.0162, -0.0634,  0.0388, -0.0456],
};

const fmt = (v, d = 2, u = '') => {
  if (v == null) return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  if (Math.abs(n) >= 1e6 && ['N', 'W', 'Nm'].includes(u)) return `${(n / 1e6).toFixed(d)}M ${u}`.trim();
  if (Math.abs(n) >= 1e3 && ['N', 'W', 'Nm'].includes(u)) return `${(n / 1e3).toFixed(d)}k ${u}`.trim();
  return `${n.toFixed(d)} ${u}`.trim();
};

const Atmo = {
  get(alt = 0) {
    const h = Math.max(0, Math.min(alt, 20000));
    const T0 = 288.15, P0 = 101325, L = 0.0065, R = 287.05, g = 9.80665;
    const T = h < 11000 ? T0 - L * h : 216.65;
    const P = h < 11000
      ? P0 * Math.pow(1 - L * h / T0, g / (R * L))
      : P0 * Math.pow(1 - L * 11000 / T0, g / (R * L)) * Math.exp(-g * (h - 11000) / (R * T));
    return { T, P, rho: P / (R * T), a: Math.sqrt(1.4 * R * T) };
  },
};

const CST = {
  fact: n => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; },
  bern: (n, i, x) => CST.fact(n) / (CST.fact(i) * CST.fact(n - i)) * x ** i * (1 - x) ** (n - i),
  C: x => Math.sqrt(x) * (1 - x),
  gen(upper, lower, N = 200) {
    const pts = [];
    const nU = upper.length - 1, nL = lower.length - 1;
    for (let i = 0; i <= N; i++) {
      const x = 0.5 * (1 - Math.cos(Math.PI * i / N));
      let S = 0; for (let j = 0; j <= nL; j++) S += (lower[j] || 0) * CST.bern(nL, j, x);
      pts.push([x, CST.C(x) * S]);
    }
    for (let i = 1; i <= N; i++) {
      const x = 0.5 * (1 - Math.cos(Math.PI * i / N));
      let S = 0; for (let j = 0; j <= nU; j++) S += (upper[j] || 0) * CST.bern(nU, j, x);
      pts.unshift([x, CST.C(x) * S]);
    }
    return pts;
  },
  iY(curve, xT) {
    for (let i = 0; i < curve.length - 1; i++) {
      const [x1, y1] = curve[i], [x2, y2] = curve[i + 1];
      if ((x1 <= xT && x2 >= xT) || (x1 >= xT && x2 <= xT)) {
        const dx = x2 - x1;
        return Math.abs(dx) < 1e-9 ? y1 : y1 + (xT - x1) / dx * (y2 - y1);
      }
    }
    return 0;
  },
};

/* ============================================================================
 * SUB-COMPONENTS
 * ============================================================================ */

// Custom Recharts tooltip
function CustomTooltip({ active, payload, label, xLabel = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.chartTooltip}>
      <div className={styles.tooltipLabel}>{xLabel}{typeof label === 'number' ? label.toFixed(3) : label}</div>
      {payload.map((p, i) => (
        <div key={i} className={styles.tooltipRow}>
          <span className={styles.tooltipKey}>{p.name}</span>
          <span className={styles.tooltipVal} style={{ color: p.color }}>{Number(p.value || 0).toFixed(4)}</span>
        </div>
      ))}
    </div>
  );
}

// ParameterSlider
function ParameterSlider({ label, value, min, max, step, unit = '', color = '#007AFF', onChange, description }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={styles.sliderContainer}>
      <div className={styles.sliderHeader}>
        <span className={styles.sliderLabel}>{label}</span>
        <span className={styles.sliderValue} style={{ color }}>
          {typeof value === 'number' ? value.toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0) : value}{unit}
        </span>
      </div>
      {description && <div className={styles.sliderDesc}>{description}</div>}
      <div className={styles.sliderTrack}>
        <div className={styles.sliderFill} style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}40, ${color})` }} />
        <input
          type="range" className={styles.sliderInput}
          min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ '--accent': color }}
        />
      </div>
      <div className={styles.sliderRange}>
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

// MetricCard
function MetricCard({ label, value, unit = '', color = '#00FFC2', subtitle, icon: Icon }) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricAccent} style={{ background: color }} />
      <div className={styles.metricHeader}>
        {Icon && <Icon size={11} style={{ color: '#4b5563' }} />}
        <span className={styles.metricLabel}>{label}</span>
      </div>
      <div className={styles.metricValue} style={{ color }}>
        {value}{unit && <span className={styles.metricUnit}>{unit}</span>}
      </div>
      {subtitle && <div className={styles.metricSubtitle}>{subtitle}</div>}
    </div>
  );
}

// TabButton
function TabButton({ active, onClick, children, badge }) {
  return (
    <button className={`${styles.tabButton} ${active ? styles.tabButtonActive : ''}`} onClick={onClick}>
      {children}
      {badge && <span className={styles.tabBadge}>{badge}</span>}
    </button>
  );
}

// Toast system
function Toasts({ list }) {
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {list.map(t => (
        <div key={t.id} style={{
          background: '#161b22', padding: '12px 16px', borderRadius: 4,
          fontSize: '0.82rem', fontFamily: "'Consolas', monospace", fontWeight: 600,
          color: t.type === 'error' ? '#ff7b72' : '#7ee787',
          border: `1px solid ${t.type === 'error' ? 'rgba(255,123,114,.4)' : '#30363d'}`,
          borderLeft: `4px solid ${t.type === 'error' ? '#ff7b72' : '#00FFC2'}`,
          boxShadow: '0 8px 24px rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', gap: 10,
          animation: 'fadeIn .2s ease-out',
        }}>
          {t.type === 'error' ? <FiAlertTriangle size={13} /> : <FiCheckCircle size={13} />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

/* ============================================================================
 * FLIGHT SIMULATOR VISUALIZER - IMPROVED VERSION
 * ============================================================================ */

function FlightSimulatorViz({ cst, aero, sRes, cgPos = 0.28 }) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const particles = useRef([]);
    const timeRef = useRef(0);
    const [dim, setDim] = useState({ w: 1000, h: 600 });
    const [isHovering, setIsHovering] = useState(false);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    // Geometry computation
    const geo = useMemo(() => {
        if (!cst?.a_upper || cst.a_upper.length < 8) return null;
        const coords = CST.gen(cst.a_upper, cst.a_lower, 200);
        let leIdx = 0, minX = Infinity;
        coords.forEach((p, i) => { if (p[0] < minX) { minX = p[0]; leIdx = i; } });
        const upper = coords.slice(0, leIdx + 1).sort((a, b) => a[0] - b[0]);
        const lower = coords.slice(leIdx).sort((a, b) => a[0] - b[0]);
        const cam = [];
        let maxT = 0;
        for (let i = 0; i <= 100; i++) {
            const x = i / 100, yu = CST.iY(upper, x), yl = CST.iY(lower, x);
            cam.push([x, (yu + yl) / 2]);
            if (yu - yl > maxT) maxT = yu - yl;
        }
        const tipD = (sRes?.loads?.tip_deflection_z_m || 0) * 2;
        const def = tipD
            ? coords.map(p => [p[0], p[1] + tipD * Math.pow(Math.max(0, p[0] - 0.25) / 0.75, 2)])
            : coords;
        return { def, cam, maxT, tipD };
    }, [cst, sRes]);

    // Initialize particles
    useEffect(() => {
        if (!particles.current.length) {
            for (let i = 0; i < 300; i++) {
                particles.current.push({
                    x: Math.random() * 3 - 0.5,
                    y: (Math.random() - 0.5) * 2,
                    history: [],
                    speed: 0.5 + Math.random() * 1.2
                });
            }
        }
    }, []);

    // Resize observer
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            for (const e of entries) {
                if (e.contentRect.width > 50) {
                    setDim({ w: e.contentRect.width, h: e.contentRect.height });
                }
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Mouse events for hover
    const handleMouseMove = useCallback((e) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setIsHovering(true);
        setMousePos({
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height
        });
    }, []);

    const handleMouseLeave = useCallback(() => {
        setIsHovering(false);
    }, []);

    // Render loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !geo) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        let frameId;

        const render = () => {
            const dpr = window.devicePixelRatio || 1;
            const { w, h } = dim;
            if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
                canvas.width = w * dpr;
                canvas.height = h * dpr;
                ctx.scale(dpr, dpr);
            }

            timeRef.current += 0.016;
            const t = timeRef.current;

            // ── Clear ──
            ctx.fillStyle = '#010409';
            ctx.fillRect(0, 0, w, h);

            // ── Drawing parameters ──
            const PAD = { top: 30, bottom: 30, left: 60, right: 30 };
            const drawW = w - PAD.left - PAD.right;
            const drawH = h - PAD.top - PAD.bottom;
            const scale = Math.min(drawW / 1.4, drawH / 0.8);
            const cx = PAD.left + drawW / 2 - 0.5 * scale;
            const cy = PAD.top + drawH / 2;

            const toCanvas = (x, y) => [cx + x * scale, cy - y * scale];

            // ── Grid ──
            ctx.strokeStyle = 'rgba(48,54,61,0.06)';
            ctx.lineWidth = 0.5;
            const gs = 0.1 * scale;
            for (let x = -0.6 * scale; x < 1.2 * scale; x += gs) {
                const sx = cx + x;
                ctx.beginPath();
                ctx.moveTo(sx, cy - 0.4 * scale);
                ctx.lineTo(sx, cy + 0.4 * scale);
                ctx.stroke();
            }
            for (let y = -0.4 * scale; y < 0.4 * scale; y += gs) {
                const sy = cy - y;
                ctx.beginPath();
                ctx.moveTo(cx - 0.6 * scale, sy);
                ctx.lineTo(cx + 1.2 * scale, sy);
                ctx.stroke();
            }

            ctx.strokeStyle = 'rgba(48,54,61,0.15)';
            ctx.lineWidth = 0.8;
            const gs2 = 0.25 * scale;
            for (let x = -0.6 * scale; x < 1.2 * scale; x += gs2) {
                const sx = cx + x;
                ctx.beginPath();
                ctx.moveTo(sx, cy - 0.4 * scale);
                ctx.lineTo(sx, cy + 0.4 * scale);
                ctx.stroke();
            }
            for (let y = -0.4 * scale; y < 0.4 * scale; y += gs2) {
                const sy = cy - y;
                ctx.beginPath();
                ctx.moveTo(cx - 0.6 * scale, sy);
                ctx.lineTo(cx + 1.2 * scale, sy);
                ctx.stroke();
            }

            // ── Chord line ──
            const [leX, leY] = toCanvas(0, 0);
            const [teX, teY] = toCanvas(1, 0);
            ctx.save();
            ctx.strokeStyle = 'rgba(75,85,99,0.2)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(leX - 20, leY);
            ctx.lineTo(teX + 20, teY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();

            // ── Streamlines ──
            const alpha = aero?.alpha ?? 0;
            const alphaRad = alpha * Math.PI / 180;
            const cl = aero?.cl ?? 0.5;
            const Gamma = Math.PI * cl * 0.5;

            ctx.save();
            ctx.strokeStyle = 'rgba(0,242,255,0.08)';
            ctx.lineWidth = 1;

            const getVel = (px, py) => {
                let u = Math.cos(alphaRad);
                let v = Math.sin(alphaRad);
                const dx = px - 0.25, dy = py;
                const r2 = dx * dx + dy * dy + 0.01;
                u += Gamma * dy / (2 * Math.PI * r2);
                v -= Gamma * dx / (2 * Math.PI * r2);
                const vol = (geo.maxT || 0) * 0.3;
                const r4 = r2 * r2;
                u += vol * (dy * dy - dx * dx) / r4;
                v -= vol * 2 * dx * dy / r4;
                return { u, v };
            };

            const dt = 0.01;
            particles.current.forEach(p => {
                const f = getVel(p.x, p.y);
                p.x += f.u * dt * p.speed;
                p.y += f.v * dt * p.speed;
                p.history.push({ x: p.x, y: p.y });
                if (p.history.length > 25) p.history.shift();

                if (p.x > 1.2 || p.x < -0.6 || Math.abs(p.y) > 0.5) {
                    p.x = -0.5 - Math.random() * 0.2;
                    p.y = (Math.random() - 0.5) * 1.2;
                    p.history = [];
                }

                if (p.history.length > 1) {
                    for (let i = 1; i < p.history.length; i++) {
                        const [sx1, sy1] = toCanvas(p.history[i].x, p.history[i].y);
                        const [sx2, sy2] = toCanvas(p.history[i - 1].x, p.history[i - 1].y);
                        ctx.moveTo(sx1, sy1);
                        ctx.lineTo(sx2, sy2);
                    }
                }
            });
            ctx.stroke();
            ctx.restore();

            // ── Airfoil ──
            ctx.save();

            // Boundary layer
            const reynolds = aero?.reynolds ?? 1e6;
            ctx.beginPath();
            if (geo.def?.length) {
                const [startX, startY] = toCanvas(geo.def[0][0], geo.def[0][1]);
                ctx.moveTo(startX, startY);
                for (let i = 0; i < geo.def.length; i++) {
                    const p = geo.def[i];
                    const delta = 0.005 * Math.pow(p[0], 0.2);
                    const [sx, sy] = toCanvas(p[0], p[1] + delta);
                    ctx.lineTo(sx, sy);
                }
                for (let i = geo.def.length - 1; i >= 0; i--) {
                    const p = geo.def[i];
                    const delta = 0.005 * Math.pow(p[0], 0.2);
                    const [sx, sy] = toCanvas(p[0], p[1] - delta);
                    ctx.lineTo(sx, sy);
                }
                ctx.closePath();
                ctx.fillStyle = 'rgba(0,122,255,0.06)';
                ctx.fill();
            }

            // Solid body
            if (geo.def?.length) {
                ctx.beginPath();
                geo.def.forEach((p, i) => {
                    const [sx, sy] = toCanvas(p[0], p[1]);
                    i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
                });
                ctx.closePath();
                const grad = ctx.createLinearGradient(cx, cy - 0.3 * scale, cx, cy + 0.3 * scale);
                grad.addColorStop(0, 'rgba(22,27,34,0.95)');
                grad.addColorStop(1, 'rgba(10,15,25,0.9)');
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.strokeStyle = geo.tipD > 0.01 ? '#00FFC2' : '#c9d1d9';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // Camber line
            if (geo.cam?.length) {
                ctx.beginPath();
                geo.cam.forEach(([x, y], i) => {
                    const [sx, sy] = toCanvas(x, y);
                    i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
                });
                ctx.strokeStyle = '#007AFF';
                ctx.lineWidth = 1.2;
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            ctx.restore();

            // ── LE/TE markers ──
            ctx.save();
            ctx.shadowColor = 'rgba(0,255,194,0.2)';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(leX, leY, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#00FFC2';
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#00FFC2';
            ctx.font = 'bold 8px Consolas, monospace';
            ctx.textAlign = 'right';
            ctx.fillText('LE', leX - 10, leY - 6);

            ctx.beginPath();
            ctx.arc(teX, teY, 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.textAlign = 'left';
            ctx.fillText('TE', teX + 8, teY - 4);
            ctx.restore();

            // ── CG marker ──
            const [cgX, cgY] = toCanvas(cgPos || 0.28, 0);
            ctx.save();
            ctx.shadowColor = 'rgba(245,158,11,0.3)';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(cgX, cgY, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#f59e0b';
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#010409';
            ctx.font = 'bold 8px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.fillText('CG', cgX, cgY + 22);
            ctx.restore();

            // ── Aerodynamic Center ──
            const [acX, acY] = toCanvas(0.25, 0);
            ctx.save();
            ctx.beginPath();
            ctx.arc(acX, acY, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#00FFC2';
            ctx.fill();
            ctx.fillStyle = '#010409';
            ctx.font = 'bold 8px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.fillText('AC', acX, acY + 20);
            ctx.restore();

            // ── Force vectors ──
            if (aero) {
                ctx.save();
                const vScale = Math.min(scale * 0.3, 130);
                const ox = cx + 0.5 * scale;
                const oy = cy + 0.3 * scale;

                const drawVec = (dx, dy, color, label, val) => {
                    const ex = ox + dx;
                    const ey = oy - dy;
                    ctx.shadowColor = color + '30';
                    ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.moveTo(ox, oy);
                    ctx.lineTo(ex, ey);
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2.5;
                    ctx.stroke();

                    const ang = Math.atan2(-dy, dx);
                    const hl = 10;
                    ctx.beginPath();
                    ctx.moveTo(ex, ey);
                    ctx.lineTo(ex - hl * Math.cos(ang - 0.4), ey + hl * Math.sin(ang - 0.4));
                    ctx.lineTo(ex - hl * Math.cos(ang + 0.4), ey + hl * Math.sin(ang + 0.4));
                    ctx.closePath();
                    ctx.fillStyle = color;
                    ctx.fill();

                    ctx.shadowBlur = 0;
                    const lx = ex + (dx >= 0 ? 10 : -10 - 65);
                    const ly = ey + (dy >= 0 ? 10 : -10 - 18);
                    ctx.fillStyle = 'rgba(11,15,20,0.9)';
                    ctx.strokeStyle = 'rgba(48,54,61,0.3)';
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.roundRect(lx, ly, 65, 18, 4);
                    ctx.fill();
                    ctx.stroke();
                    ctx.fillStyle = '#8b949e';
                    ctx.font = '8px Consolas, monospace';
                    ctx.textAlign = 'left';
                    ctx.fillText(label + ':', lx + 5, ly + 13);
                    ctx.fillStyle = color;
                    ctx.font = 'bold 9px Consolas, monospace';
                    ctx.fillText(val, lx + 25, ly + 13);
                };

                const cl = aero.cl || 0;
                const cd = aero.cd || 0;
                drawVec(0, vScale * Math.min(Math.abs(cl), 1.8), '#38bdf8', 'L', cl.toFixed(3));
                drawVec(vScale * Math.max(0.3, Math.abs(cd) * 12), 0, '#ef4444', 'D', cd.toFixed(4));

                // Pitching moment
                const cm = aero.cm || 0;
                if (Math.abs(cm) > 0.001) {
                    const mr = 30;
                    ctx.beginPath();
                    ctx.arc(cx + 0.5 * scale, cy + 0.3 * scale, mr, -0.2 * Math.PI, 0.8 * Math.PI * (cm < 0 ? 1 : -1), cm < 0);
                    ctx.strokeStyle = '#a855f7';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    ctx.fillStyle = '#a855f7';
                    ctx.font = 'bold 8px Consolas, monospace';
                    ctx.textAlign = 'left';
                    ctx.fillText('Cm', cx + 0.5 * scale + mr + 5, cy + 0.3 * scale - mr - 5);
                }

                ctx.restore();
            }

            // ── HUD ──
            ctx.save();

            // Top-left panel
            const panelX = 14, panelY = 14, panelW = 200, panelH = 64;
            ctx.fillStyle = 'rgba(11,15,20,0.92)';
            ctx.strokeStyle = 'rgba(48,54,61,0.4)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.roundRect(panelX, panelY, panelW, panelH, 6);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#e2e8f0';
            ctx.font = 'bold 10px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('AEROELASTIC SIMULATOR', panelX + 12, panelY + 18);

            ctx.fillStyle = '#8b949e';
            ctx.font = '8px Consolas, monospace';
            const alphaDeg = aero?.alpha ?? 0;
            const mach = aero?.mach ?? 0;
            const re = ((aero?.reynolds ?? 1e6) / 1e6);
            ctx.fillText(`α ${alphaDeg.toFixed(1)}°  ·  M ${mach.toFixed(3)}  ·  Re ${re.toFixed(2)}M`, panelX + 12, panelY + 34);

            const tipDef = geo?.tipD ?? 0;
            ctx.fillStyle = tipDef > 0.01 ? '#00FFC2' : '#8b949e';
            ctx.fillText(`Tip Deflection: ${(tipDef * 100).toFixed(2)} cm`, panelX + 12, panelY + 52);

            // Bottom-right info
            ctx.fillStyle = '#30363d';
            ctx.font = '7px Consolas, monospace';
            ctx.textAlign = 'right';
            ctx.fillText('PAN · ZOOM · DRAG', w - 14, h - 10);

            // Hover tooltip
            if (isHovering && aero) {
                const hx = mousePos.x * w;
                const hy = mousePos.y * h;
                const tw = 155, th = 56;
                const tx = Math.min(hx + 14, w - tw - 14);
                const ty = Math.min(hy + 14, h - th - 14);

                ctx.fillStyle = 'rgba(11,15,20,0.95)';
                ctx.strokeStyle = 'rgba(48,54,61,0.5)';
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.roundRect(tx, ty, tw, th, 6);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#8b949e';
                ctx.font = '7px Consolas, monospace';
                ctx.textAlign = 'left';
                ctx.fillText('FLIGHT STATE', tx + 12, ty + 14);

                ctx.fillStyle = '#e2e8f0';
                ctx.font = '8px Consolas, monospace';
                ctx.fillText(`CL ${(aero.cl || 0).toFixed(4)}  CD ${(aero.cd || 0).toFixed(5)}`, tx + 12, ty + 30);
                const ld = aero.cd > 0 ? (aero.cl / aero.cd) : 0;
                ctx.fillText(`L/D ${ld.toFixed(2)}`, tx + 12, ty + 46);
            }

            ctx.restore();

            frameId = requestAnimationFrame(render);
        };

        frameId = requestAnimationFrame(render);
        return () => cancelAnimationFrame(frameId);
    }, [dim, geo, aero, cgPos, isHovering, mousePos]);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                overflow: 'hidden',
                borderRadius: '6px',
                background: '#010409',
                cursor: 'crosshair'
            }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            <canvas
                ref={canvasRef}
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    borderRadius: '6px'
                }}
            />
        </div>
    );
}

/* ============================================================================
 * MAIN PAGE COMPONENT
 * ============================================================================ */
function FlightDynamicsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const geomRef = useRef(null);
  const logRef = useRef(null);
  const pipelineToken = useRef(0);

  /* ── State ──────────────────────────────────────────────────────────── */
  const [cst, setCst] = useState({ ...NACA4412_CST });
  const [name, setName] = useState('NACA 4412');

  const [cond, setCond] = useState({ alpha: 3.0, reynolds: 1.5e6, mach: 0.1 });

  const [struct, setStruct] = useState({
    span_m: 2.0, chord_m: 0.25,
    material: 'Carbon_Fiber_Epoxy_Iso',
    skin_thickness_m: 0.002, load_factor: 4.4,
  });
  const [miss, setMiss] = useState({
    mtow_kg: 5.0, empty_weight_kg: 2.5, fuel_weight_kg: 1.5,
    wing_area_m2: 0.5, thrust_N: 45.0, sfc_kg_Ns: 1.2e-5, altitude_m: 150,
  });
  const [stab, setStab] = useState({ cg_position: 0.28, tail_volume: 0.45 });
  const [stoch, setStoch] = useState({ noise_percent: 1.0, iterations: 100 });

  // Results
  const [aero, setAero] = useState({ cl: 0, cd: 0, cm: 0 });
  const [sRes, setSRes] = useState(null);
  const [mRes, setMRes] = useState(null);
  const [stRes, setStRes] = useState(null);
  const [twin, setTwin] = useState(null);

  // UI
  const [fetching, setFetching] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [mainTab, setMainTab] = useState('SIMULATOR');
  const [rightTab, setRightTab] = useState('MISSION');
  const [libOpen, setLibOpen] = useState(false);
  const [libQ, setLibQ] = useState('');
  const [libRes, setLibRes] = useState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((msg, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  /* ── URL Hydration ──────────────────────────────────────────────────── */
  useEffect(() => {
    const s = searchParams.get('cst');
    if (s) try { const d = JSON.parse(decodeURIComponent(s)); setCst({ a_upper: d.slice(0, 8), a_lower: d.slice(8, 16) }); } catch (_) { }
    const n = searchParams.get('name'); if (n) setName(n);
    const a = searchParams.get('alpha'); if (a) setCond(p => ({ ...p, alpha: parseFloat(a) }));
  }, [searchParams]);

  /* ── Open in Workbench ─────────────────────────────────────────────────── */
  const openInWorkbench = () => {
    const cstArray = [...cst.a_upper, ...cst.a_lower];
    const cstString = encodeURIComponent(JSON.stringify(cstArray));
    router.push(`/workbench?importedCST=${cstString}&name=${encodeURIComponent(name)}&re=${cond.reynolds}&alpha=${cond.alpha}&mach=${cond.mach}`);
  };

  /* ── Library Search ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (libQ.length < 3) { setLibRes([]); return; }
    const t = setTimeout(async () => {
      const tok = localStorage.getItem('token');
      try { const r = await fetch(`${API}/airfoils/search?q=${libQ}`, { headers: { Authorization: `Bearer ${tok}` } }); if (r.ok) setLibRes(await r.json()); } catch (_) { }
    }, 300);
    return () => clearTimeout(t);
  }, [libQ]);

  const loadLibraryAirfoil = async (af) => {
    setLibOpen(false); setLibQ(''); setLibRes([]);
    const tok = localStorage.getItem('token');
    try {
      const r = await fetch(`${API}/airfoils/${af.name}`, { headers: { Authorization: `Bearer ${tok}` } });
      if (r.ok) { const d = await r.json(); setCst({ a_upper: d.cst_coefficients.slice(0, 8), a_lower: d.cst_coefficients.slice(8, 16) }); setName(d.name); toast(`Loaded: ${d.name}`); }
    } catch (_) { toast('Load failed', 'error'); }
  };

  /* ── Physics Pipeline ───────────────────────────────────────────────── */
  const runPipeline = useCallback(async () => {
    const tok = localStorage.getItem('token');
    if (!tok) return;
    const tick = ++pipelineToken.current;
    setFetching(true);
    try {
      const flat = [...cst.a_upper, ...cst.a_lower];
      // 1. Aerodynamics
      const pR = await fetch(`${API}/predict`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify({ cst_coefficients: flat, reynolds: cond.reynolds, alpha: cond.alpha, mach: cond.mach }) });
      if (!pR.ok || tick !== pipelineToken.current) return;
      const pD = await pR.json();
      setAero({ cl: pD.cl, cd: pD.cd, cm: pD.cm });
      // 2. Mission
      const mR = await fetch(`${API}/analysis/mission`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify({ cl_2d: pD.cl, cd_2d: pD.cd, aspect_ratio: struct.span_m / struct.chord_m, ...miss }) });
      let mD = null;
      if (mR.ok && tick === pipelineToken.current) { mD = await mR.json(); setMRes(mD); }
      // 3. Structure
      const v = mD?.performance?.v_cruise_optimal_mps ?? 25;
      const sR = await fetch(`${API}/analysis/structure`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify({ cst_coefficients: flat, cl: pD.cl, cd: pD.cd, cm: pD.cm, v_inf: v, ...struct }) });
      if (sR.ok && tick === pipelineToken.current) setSRes(await sR.json());
      // 4. Stochastic
      const stR = await fetch(`${API}/analysis/stochastic`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify({ cst_coefficients: flat, reynolds: cond.reynolds, alpha: cond.alpha, mach: cond.mach, noise_level_percent: stoch.noise_percent, iterations: stoch.iterations }) });
      if (stR.ok && tick === pipelineToken.current) setStRes(await stR.json());
    } catch (_) {
      if (tick === pipelineToken.current) toast('Pipeline error', 'error');
    } finally {
      if (tick === pipelineToken.current) setFetching(false);
    }
  }, [cst, cond, struct, miss, stoch, toast]);

  useEffect(() => { const t = setTimeout(runPipeline, 500); return () => clearTimeout(t); }, [runPipeline]);

  /* ── File Handlers ──────────────────────────────────────────────────── */
  const handleGeomFile = async e => {
    const file = e.target.files[0]; if (!file) return; setImportOpen(false);
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await fetch(`${API}/airfoils/import`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, body: fd });
      if (r.ok) { const d = await r.json(); setCst({ a_upper: d.cst_coefficients.slice(0, 8), a_lower: d.cst_coefficients.slice(8, 16) }); setName(d.filename); toast(`Geometry: ${d.filename}`); }
    } catch (_) { toast('Upload failed', 'error'); }
    e.target.value = null;
  };

  const handleLogFile = async e => {
    const file = e.target.files[0]; if (!file || !mRes) return;
    setMainTab('REALITY'); setFetching(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('simulated_cd', mRes.aerodynamics.cd_3d_total);
    fd.append('simulated_cl', mRes.aerodynamics.cl_3d);
    fd.append('wing_area', miss.wing_area_m2);
    fd.append('mtow_kg', miss.mtow_kg);
    try {
      const r = await fetch(`${API}/analysis/reality-sync`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, body: fd });
      if (r.ok) { const d = await r.json(); if (d.status === 'success') { setTwin(d); toast(`Twin synced — ${d.telemetry_samples} frames`); } else toast(`Sync failed: ${d.message}`, 'error'); }
    } catch (_) { toast('Sync error', 'error'); }
    finally { setFetching(false); e.target.value = null; }
  };

  /* ── Chart Data ─────────────────────────────────────────────────────── */
  const atmo = useMemo(() => Atmo.get(miss.altitude_m), [miss.altitude_m]);

  const airfoilMetrics = useMemo(() => {
    if (!cst?.a_upper) return { thickness: 0, camber: 0 };
    const coords = CST.gen(cst.a_upper, cst.a_lower, 100);
    const upper = coords.filter(p => p[1] >= 0).sort((a, b) => a[0] - b[0]);
    const lower = coords.filter(p => p[1] < 0).sort((a, b) => a[0] - b[0]);
    let maxT = 0, maxC = 0;
    upper.forEach(([x, yu]) => {
      const yl = CST.iY(lower, x);
      const t = yu - yl, c = (yu + yl) / 2;
      if (t > maxT) maxT = t;
      if (Math.abs(c) > Math.abs(maxC)) maxC = c;
    });
    return { thickness: maxT, camber: maxC };
  }, [cst]);

  const AR = struct.span_m / struct.chord_m;
  const mos = sRes?.loads?.margin_of_safety_yield;
  const mosDanger = (mos ?? 1) < 0;
  const ld = aero.cd > 0 ? (mRes?.aerodynamics?.ld_ratio_3d ?? (aero.cl / aero.cd)) : null;

  const structDist = useMemo(() => {
    if (!sRes?.loads?.root_bending_moment_Nm) return [];
    const L = struct.span_m / 2, M0 = sRes.loads.root_bending_moment_Nm, dT = sRes.loads.tip_deflection_z_m || 0;
    const q = 2 * M0 / L ** 2;
    return Array.from({ length: 26 }, (_, i) => {
      const y = i / 25 * L;
      const sf = y ** 2 * (6 * L ** 2 - 4 * L * y + y ** 2) / (3 * L ** 4);
      return { y: +y.toFixed(2), M: +(q / 2 * (L - y) ** 2).toFixed(1), V: +(q * (L - y)).toFixed(1), D: +(dT * sf * 100).toFixed(3) };
    });
  }, [sRes, struct.span_m]);

  const stabData = useMemo(() => {
    const ba = cond.alpha, bcl = aero.cl, bcm = aero.cm;
    const cg = stab.cg_position, vh = stab.tail_volume;
    return Array.from({ length: 21 }, (_, i) => {
      const a = -5 + i;
      const cl_a = bcl + 0.09 * (a - ba), cmW = bcm + cl_a * (cg - 0.25), cmT = -(vh * 0.06 * a);
      return { alpha: a, Cm: +(cmW + cmT).toFixed(4), Cm_Wing: +cmW.toFixed(4), Cm_Tail: +cmT.toFixed(4) };
    });
  }, [cond.alpha, aero, stab]);

  const vnData = useMemo(() => {
    if (!mRes?.performance?.v_max_mps) return [];
    const W = miss.mtow_kg * 9.81, S = miss.wing_area_m2, { rho } = atmo;
    const clMax = Math.max((aero.cl || 0) * 1.5, 1.2), clMin = -Math.max(Math.abs(aero.cl || 0), 0.6);
    const nMax = struct.load_factor, nMin = -nMax * 0.4, vD = mRes.performance.v_max_mps * 1.3;
    const mu = 2 * W / (rho * S * 5 * 9.81), kg = 0.88 * mu / (5.3 + mu), aS = 0.1 * (180 / Math.PI);
    return Array.from({ length: 61 }, (_, i) => {
      const v = i * vD / 60, q = 0.5 * rho * v ** 2, dn = kg * rho * 15.24 * v * aS / (2 * W / S);
      return { v: +v.toFixed(0), pos: Math.min(q * S * clMax / W, nMax), neg: Math.max(q * S * clMin / W, nMin), gp: 1 + dn, gn: 1 - dn };
    });
  }, [mRes, miss, atmo, aero, struct]);

  const perfData = useMemo(() => {
    if (!mRes?.performance?.v_max_mps) return [];
    const W = miss.mtow_kg * 9.81, { rho } = atmo, S = miss.wing_area_m2;
    const cd0 = mRes.aerodynamics?.cd0 || 0.015, K = 1 / (Math.PI * AR * 0.85);
    const T = miss.thrust_N * Math.pow(rho / 1.225, 0.7), vMax = mRes.performance.v_max_mps;
    return Array.from({ length: 40 }, (_, i) => {
      const v = 5 + i * (vMax * 1.2 - 5) / 39, q = 0.5 * rho * v ** 2, cl = W / (q * S), D = q * S * (cd0 + K * cl ** 2);
      return { v: +v.toFixed(1), D: +D.toFixed(1), T: +T.toFixed(1), RoC: +Math.max(0, (T * v * 0.75 - D * v) / W).toFixed(2) };
    });
  }, [mRes, miss, atmo, AR]);

  const payloadData = useMemo(() => {
    if (!mRes?.performance?.v_cruise_optimal_mps) return [];
    const we = miss.empty_weight_kg, wf = miss.fuel_weight_kg;
    const LD = mRes.aerodynamics.ld_ratio_3d || 1, sfc = miss.sfc_kg_Ns || 1e-5, v = mRes.performance.v_cruise_optimal_mps;
    const br = (wi, wf2) => v / sfc * LD * Math.log(wi / wf2) / 1000;
    return [
      { range: 0, payload: miss.mtow_kg - we },
      { range: +br(miss.mtow_kg, miss.mtow_kg - wf).toFixed(0), payload: Math.max(0, miss.mtow_kg - we - wf) },
      { range: +br(we + wf, we).toFixed(0), payload: 0 },
    ];
  }, [mRes, miss]);

  const radarData = useMemo(() => {
    if (!mRes || !sRes || !stRes) return [];
    return [
      { s: 'Range',      A: Math.min(100, (mRes.performance?.breguet_range_km || 0) / 5) },
      { s: 'Efficiency', A: Math.min(100, (mRes.aerodynamics?.ld_ratio_3d || 0) * 5) },
      { s: 'Payload',    A: Math.min(100, ((miss.mtow_kg - miss.empty_weight_kg) / miss.mtow_kg) * 100) },
      { s: 'Safety',     A: Math.max(0, Math.min(100, (sRes.loads?.margin_of_safety_yield || 0) * 100)) },
      { s: 'Robust',     A: (stRes?.robustness_score || 0) * 100 },
    ];
  }, [mRes, sRes, stRes, miss]);

  /* ── PDF Export ─────────────────────────────────────────────────────── */
  const exportPDF = () => {
    if (!sRes || !mRes) return toast('Await convergence', 'error');
    setPdfBusy(true);
    setTimeout(() => {
      try {
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pw = pdf.internal.pageSize.getWidth();
        const page = (n, title) => {
          pdf.setFillColor(4, 7, 12); pdf.rect(0, 0, pw, 297, 'F');
          pdf.setTextColor(0, 255, 194); pdf.setFontSize(14); pdf.setFont('helvetica', 'bold');
          pdf.text('AEROML — FLIGHT DYNAMICS REPORT', 15, 22);
          pdf.setTextColor(139, 148, 158); pdf.setFontSize(9); pdf.setFont('courier', 'normal');
          pdf.text(`ASSET: ${String(name).toUpperCase()} | PAGE ${n}`, 15, 30);
          pdf.setDrawColor(0, 122, 255); pdf.setLineWidth(0.5); pdf.line(15, 34, pw - 15, 34);
          pdf.setTextColor(226, 232, 240); pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.text(title, 15, 44);
        };
        page(1, 'STRUCTURAL MECHANICS');
        autoTable(pdf, {
          startY: 50, head: [['Parameter', 'Value', 'Status']],
          body: [
            ['Root Bending Moment', fmt(sRes.loads.root_bending_moment_Nm, 1, 'Nm'), 'SOLVED'],
            ['Von Mises Stress', fmt(sRes.loads.von_mises_stress_MPa, 1, 'MPa'), 'NOMINAL'],
            ['Yield Safety Margin', fmt(mos, 2), (mos ?? 0) < 0 ? 'FAIL' : 'PASS'],
            ['Tip Deflection', fmt((sRes.loads.tip_deflection_z_m || 0) * 100, 2, 'cm'), 'STABLE'],
          ],
          theme: 'grid',
          headStyles: { fillColor: [0, 80, 200], textColor: [255, 255, 255], fontSize: 9, font: 'courier' },
          styles: { fontSize: 9, fillColor: [8, 14, 24], textColor: [190, 210, 230], font: 'courier' },
        });
        pdf.addPage(); page(2, 'MISSION PERFORMANCE');
        autoTable(pdf, {
          startY: 50, head: [['Metric', 'Value']],
          body: [
            ['Breguet Range', fmt(mRes.performance.breguet_range_km, 1, 'km')],
            ['Max Endurance', fmt(mRes.performance.max_endurance_hrs, 2, 'hrs')],
            ['Cruise Velocity', fmt(mRes.performance.v_cruise_optimal_mps, 1, 'm/s')],
            ['Stall Velocity', fmt(mRes.performance.v_stall_mps, 1, 'm/s')],
            ['Rate of Climb', fmt(mRes.performance.max_rate_of_climb_mps, 2, 'm/s')],
            ['3D L/D Ratio', fmt(mRes.aerodynamics.ld_ratio_3d, 1)],
          ],
          theme: 'grid',
          headStyles: { fillColor: [0, 80, 200], textColor: [255, 255, 255], fontSize: 9, font: 'courier' },
          styles: { fontSize: 9, fillColor: [8, 14, 24], textColor: [190, 210, 230], font: 'courier' },
        });
        pdf.save(`FlightDynamics_${name.replace(/\s+/g, '_')}.pdf`);
        toast('Report exported');
      } catch (err) { toast('PDF error', 'error'); console.error(err); }
      finally { setPdfBusy(false); }
    }, 300);
  };

  /* ── RENDER ─────────────────────────────────────────────────────────── */
  return (
    <div className={styles.workbench}>
      <input ref={geomRef} type="file" style={{ display: 'none' }} accept=".dat,.txt,.csv" onChange={handleGeomFile} />
      <input ref={logRef}  type="file" style={{ display: 'none' }} accept=".csv,.txt"      onChange={handleLogFile} />
      <Toasts list={toasts} />

      {/* ════════════════════════════════════════════════════════════
          LEFT SIDEBAR
      ════════════════════════════════════════════════════════════ */}
      <aside className={styles.sidebar}>

        <div className={styles.sidebarHeader}>
          <div className={styles.logoContainer}>
            <FiAnchor size={16} />
          </div>
          <div className={styles.headerText}>
            <h1 className={styles.brandTitle}>FlightDyn</h1>
            <span className={styles.brandSubtitle}>Kinematics Engine</span>
          </div>
          <div className={styles.statusIndicator}>
            <div className={`${styles.statusDot} ${fetching ? styles.statusFetching : styles.statusLive}`} />
            <span className={fetching ? styles.statusTextFetching : styles.statusTextLive}>
              {fetching ? 'SYNC' : 'LIVE'}
            </span>
          </div>
        </div>

        <div className={styles.sidebarContent}>

          <div className={styles.profileCard}>
            <div className={styles.profileHeader}>
              <span className={styles.profileLabel}>Active Platform</span>
              <span className={styles.profileConfidence} style={{ color: '#00FFC2' }}>
                AR={AR.toFixed(1)}
              </span>
            </div>
            <h2 className={styles.profileName}>{name}</h2>
            <div className={styles.profileMetrics}>
              <div className={styles.profileMetric}>
                <span className={styles.profileMetricLabel}>t/c</span>
                <span className={styles.profileMetricValue}>{(airfoilMetrics.thickness * 100).toFixed(1)}%</span>
              </div>
              <div className={styles.profileMetric}>
                <span className={styles.profileMetricLabel}>camber</span>
                <span className={styles.profileMetricValue}>{(airfoilMetrics.camber * 100).toFixed(2)}%</span>
              </div>
              <div className={styles.profileMetric}>
                <span className={styles.profileMetricLabel}>MTOW</span>
                <span className={styles.profileMetricValue}>{miss.mtow_kg.toFixed(1)}kg</span>
              </div>
            </div>
            <div className={styles.profileTags}>
              <span className={styles.profileTag}>Re {(cond.reynolds / 1e6).toFixed(1)}M</span>
              <span className={styles.profileTag}>α {cond.alpha}°</span>
              <span className={styles.profileTag}>M {cond.mach.toFixed(2)}</span>
              <span className={styles.profileTag}>{struct.altitude_m || miss.altitude_m}m</span>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <FiActivity size={10} />
              <span>Aero Coefficients</span>
            </div>
            <div className={styles.quickResults}>
              <div className={styles.quickResult}>
                <span className={styles.quickResultLabel}>CL</span>
                <span className={styles.quickResultValue} style={{ color: '#38bdf8' }}>{aero.cl?.toFixed(4) ?? '—'}</span>
              </div>
              <div className={styles.quickResult}>
                <span className={styles.quickResultLabel}>CD</span>
                <span className={styles.quickResultValue} style={{ color: '#f472b6' }}>{aero.cd?.toFixed(5) ?? '—'}</span>
              </div>
              <div className={styles.quickResult}>
                <span className={styles.quickResultLabel}>CM</span>
                <span className={styles.quickResultValue} style={{ color: '#fbbf24' }}>{aero.cm?.toFixed(4) ?? '—'}</span>
              </div>
              <div className={styles.quickResult}>
                <span className={styles.quickResultLabel}>L/D</span>
                <span className={styles.quickResultValue} style={{ color: '#00FFC2' }}>{ld?.toFixed(1) ?? '—'}</span>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <FiWind size={10} />
              <span>Flow Conditions</span>
            </div>
            <div className={styles.slidersContainer}>
              <ParameterSlider label="Alpha (deg)" value={cond.alpha} min={-5} max={20} step={0.5} unit="°" color="#00FFC2" description="Geometric incidence" onChange={v => setCond(p => ({ ...p, alpha: v }))} />
              <ParameterSlider label="Reynolds Number" value={cond.reynolds} min={50000} max={10000000} step={50000} color="#38bdf8" description="Re = ρVc/μ" onChange={v => setCond(p => ({ ...p, reynolds: v }))} />
              <ParameterSlider label="Mach Number" value={cond.mach} min={0} max={0.85} step={0.01} color="#f59e0b" description="V∞/a∞" onChange={v => setCond(p => ({ ...p, mach: v }))} />
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <FiSliders size={10} />
              <span>CST Geometry</span>
            </div>
            <div className={styles.cstGrid}>
              <div>
                <div style={{ fontSize: '0.58rem', color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>Upper A₀–A₇</div>
                {cst.a_upper.map((v, i) => (
                  <div key={i} className={styles.cstRow}>
                    <div className={styles.cstRowLabel}>
                      <span className={styles.cstKey}>A{i}</span>
                      <span className={styles.cstVal} style={{ color: '#38bdf8' }}>{v.toFixed(3)}</span>
                    </div>
                    <input type="range" className={styles.cstThin} min={-0.4} max={0.4} step={0.001} value={v}
                      onChange={e => setCst(p => ({ ...p, a_upper: p.a_upper.map((x, j) => j === i ? parseFloat(e.target.value) : x) }))}
                      style={{ '--accent': '#38bdf8' }}
                    />
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: '0.58rem', color: '#a855f7', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>Lower A₀–A₇</div>
                {cst.a_lower.map((v, i) => (
                  <div key={i} className={styles.cstRow}>
                    <div className={styles.cstRowLabel}>
                      <span className={styles.cstKey}>A{i}</span>
                      <span className={styles.cstVal} style={{ color: '#a855f7' }}>{v.toFixed(3)}</span>
                    </div>
                    <input type="range" className={styles.cstThin} min={-0.4} max={0.4} step={0.001} value={v}
                      onChange={e => setCst(p => ({ ...p, a_lower: p.a_lower.map((x, j) => j === i ? parseFloat(e.target.value) : x) }))}
                      style={{ '--accent': '#a855f7' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <FiShield size={10} />
              <span>Structure</span>
            </div>
            <div className={styles.slidersContainer}>
              <ParameterSlider label="Wing Span" value={struct.span_m} min={0.5} max={40} step={0.1} unit="m" color="#00FFC2" onChange={v => setStruct(p => ({ ...p, span_m: v }))} />
              <ParameterSlider label="Root Chord" value={struct.chord_m} min={0.1} max={10} step={0.05} unit="m" color="#f472b6" onChange={v => setStruct(p => ({ ...p, chord_m: v }))} />
              <ParameterSlider label="Skin Thickness" value={struct.skin_thickness_m} min={0.001} max={0.05} step={0.001} unit="m" color="#f59e0b" onChange={v => setStruct(p => ({ ...p, skin_thickness_m: v }))} />
              <ParameterSlider label="Load Factor" value={struct.load_factor} min={1} max={12} step={0.1} unit="G" color="#ef4444" onChange={v => setStruct(p => ({ ...p, load_factor: v }))} />
            </div>
            <div className={styles.colormapSelect}>
              <label className={styles.selectLabel}>Material</label>
              <select className={styles.selectInput} value={struct.material} onChange={e => setStruct(p => ({ ...p, material: e.target.value }))}>
                <option value="Al_7075_T6">Aluminum 7075-T6</option>
                <option value="Carbon_Fiber_Epoxy_Iso">Carbon Fiber Epoxy</option>
                <option value="Titanium_Ti6Al4V">Titanium Ti-6Al-4V</option>
              </select>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <FiTarget size={10} />
              <span>Mission Envelope</span>
            </div>
            <div className={styles.slidersContainer}>
              <ParameterSlider label="MTOW" value={miss.mtow_kg} min={1} max={50000} step={1} unit="kg" color="#00FFC2" onChange={v => setMiss(p => ({ ...p, mtow_kg: v }))} />
              <ParameterSlider label="Empty Mass" value={miss.empty_weight_kg} min={1} max={50000} step={1} unit="kg" color="#38bdf8" onChange={v => setMiss(p => ({ ...p, empty_weight_kg: v }))} />
              <ParameterSlider label="Fuel Mass" value={miss.fuel_weight_kg} min={0} max={20000} step={1} unit="kg" color="#f59e0b" onChange={v => setMiss(p => ({ ...p, fuel_weight_kg: v }))} />
              <ParameterSlider label="Thrust" value={miss.thrust_N} min={10} max={200000} step={10} unit="N" color="#f472b6" onChange={v => setMiss(p => ({ ...p, thrust_N: v }))} />
              <ParameterSlider label="Altitude" value={miss.altitude_m} min={0} max={20000} step={100} unit="m" color="#a855f7" description={`ρ=${atmo.rho.toFixed(3)} kg/m³`} onChange={v => setMiss(p => ({ ...p, altitude_m: v }))} />
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <FiCompass size={10} />
              <span>Trim & Robustness</span>
            </div>
            <div className={styles.slidersContainer}>
              <ParameterSlider label="CG Position" value={stab.cg_position} min={0.1} max={0.5} step={0.01} color="#f59e0b" description="% MAC" onChange={v => setStab(p => ({ ...p, cg_position: v }))} />
              <ParameterSlider label="Tail Volume Vh" value={stab.tail_volume} min={0.1} max={1.5} step={0.01} color="#00FFC2" onChange={v => setStab(p => ({ ...p, tail_volume: v }))} />
              <ParameterSlider label="Mfg Noise" value={stoch.noise_percent} min={0.1} max={5} step={0.1} unit="%" color="#ef4444" description="LHS tolerance" onChange={v => setStoch(p => ({ ...p, noise_percent: v }))} />
              <ParameterSlider label="MC Iterations" value={stoch.iterations} min={10} max={500} step={10} color="#a855f7" onChange={v => setStoch(p => ({ ...p, iterations: v }))} />
            </div>
          </div>

          <div style={{ flex: 1 }} />
        </div>

        {/* ─── SIDEBAR FOOTER WITH PROFESSIONAL BUTTONS ─── */}
        <div className={styles.sidebarFooter}>
          <div className={styles.actionGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '8px' }}>
            <button 
              className={styles.actionButton} 
              onClick={() => setLibOpen(true)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '10px 6px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid #30363d',
                borderRadius: '6px',
                color: '#8b949e',
                fontSize: '0.6rem',
                fontWeight: 700,
                fontFamily: '"Consolas", monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => { e.target.style.borderColor = '#007AFF'; e.target.style.color = '#007AFF'; e.target.style.background = 'rgba(0,122,255,0.08)'; }}
              onMouseLeave={e => { e.target.style.borderColor = '#30363d'; e.target.style.color = '#8b949e'; e.target.style.background = 'rgba(255,255,255,0.02)'; }}
            >
              <FiDatabase size={14} />
              <span>UIUC</span>
            </button>

            <div style={{ position: 'relative' }}>
              <button 
                className={styles.actionButton} 
                onClick={() => setImportOpen(o => !o)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  padding: '10px 6px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid #30363d',
                  borderRadius: '6px',
                  color: '#8b949e',
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  fontFamily: '"Consolas", monospace',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  width: '100%'
                }}
                onMouseEnter={e => { e.target.style.borderColor = '#f59e0b'; e.target.style.color = '#f59e0b'; e.target.style.background = 'rgba(245,158,11,0.08)'; }}
                onMouseLeave={e => { e.target.style.borderColor = '#30363d'; e.target.style.color = '#8b949e'; e.target.style.background = 'rgba(255,255,255,0.02)'; }}
              >
                <FiUploadCloud size={14} />
                <span>Import</span>
              </button>
              {importOpen && (
                <div className={styles.importMenu}>
                  <div className={styles.importItem} onClick={() => { geomRef.current.click(); setImportOpen(false); }}>
                    <FiFileText size={12} /> Geometry (.DAT)
                  </div>
                  <div className={styles.importItem} onClick={() => { logRef.current.click(); setImportOpen(false); }}>
                    <FiActivity size={12} /> Flight Log (.CSV)
                  </div>
                </div>
              )}
            </div>

            <button 
              className={styles.actionButton} 
              onClick={() => setMainTab('REALITY')} 
              disabled={!mRes}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '10px 6px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid #30363d',
                borderRadius: '6px',
                color: !mRes ? '#30363d' : '#8b949e',
                fontSize: '0.6rem',
                fontWeight: 700,
                fontFamily: '"Consolas", monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                cursor: !mRes ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: !mRes ? 0.5 : 1
              }}
              onMouseEnter={e => { 
                if (mRes) { 
                  e.target.style.borderColor = '#00FFC2'; 
                  e.target.style.color = '#00FFC2'; 
                  e.target.style.background = 'rgba(0,255,194,0.08)'; 
                }
              }}
              onMouseLeave={e => { 
                if (mRes) { 
                  e.target.style.borderColor = '#30363d'; 
                  e.target.style.color = '#8b949e'; 
                  e.target.style.background = 'rgba(255,255,255,0.02)'; 
                }
              }}
            >
              <FiZap size={14} />
              <span>Twin</span>
            </button>
          </div>

          <button 
            className={styles.exportButton} 
            onClick={exportPDF} 
            disabled={fetching || pdfBusy || !sRes}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px',
              background: 'rgba(0,122,255,0.08)',
              border: '1px solid #007AFF',
              borderRadius: '6px',
              color: '#007AFF',
              fontSize: '0.7rem',
              fontWeight: 700,
              fontFamily: '"Consolas", monospace',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              width: '100%',
              opacity: (fetching || pdfBusy || !sRes) ? 0.35 : 1
            }}
            onMouseEnter={e => { 
              if (!fetching && !pdfBusy && sRes) {
                e.target.style.background = '#007AFF'; 
                e.target.style.color = '#fff'; 
                e.target.style.boxShadow = '0 0 15px rgba(0,122,255,0.4)'; 
                e.target.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={e => { 
              e.target.style.background = 'rgba(0,122,255,0.08)'; 
              e.target.style.color = '#007AFF'; 
              e.target.style.boxShadow = 'none'; 
              e.target.style.transform = 'translateY(0px)';
            }}
          >
            <FiDownload size={14} />
            {pdfBusy ? 'COMPILING...' : 'EXPORT PDF DOSSIER'}
          </button>

          {/* ─── OPEN IN WORKBENCH BUTTON ─── */}
          <button 
            onClick={openInWorkbench}
            className={styles.exportButton}
            style={{ 
              marginTop: '8px',
              borderColor: '#a855f7',
              color: '#a855f7',
              background: 'rgba(168,85,247,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px',
              borderRadius: '6px',
              fontSize: '0.7rem',
              fontWeight: 700,
              fontFamily: '"Consolas", monospace',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              width: '100%'
            }}
            onMouseEnter={e => { 
              e.target.style.background = '#a855f7'; 
              e.target.style.color = '#fff'; 
              e.target.style.boxShadow = '0 0 15px rgba(168,85,247,0.4)'; 
              e.target.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => { 
              e.target.style.background = 'rgba(168,85,247,0.08)'; 
              e.target.style.color = '#a855f7'; 
              e.target.style.boxShadow = 'none'; 
              e.target.style.transform = 'translateY(0px)';
            }}
          >
            <FiBox size={14} /> OPEN IN WORKBENCH
          </button>
        </div>
      </aside>

      {/* ════════════════════════════════════════════════════════════
          MAIN CONTENT
      ════════════════════════════════════════════════════════════ */}
      <main className={styles.mainContent}>

        <div className={styles.metricsBar}>
          <MetricCard label="3D Lift (CL)" value={mRes?.aerodynamics?.cl_3d?.toFixed(4) ?? '—'} color="#38bdf8" subtitle="lifting surface" icon={FiTrendingUp} />
          <MetricCard label="L/D Ratio" value={mRes?.aerodynamics?.ld_ratio_3d?.toFixed(1) ?? '—'} color="#00FFC2" subtitle={ld > 15 ? 'excellent' : ld > 10 ? 'good' : 'moderate'} icon={FiActivity} />
          <MetricCard label="Safety Margin" value={fmt(mos, 2)} color={mosDanger ? '#ef4444' : '#10b981'} subtitle={mosDanger ? 'STRUCTURAL FAIL' : 'yield margin'} icon={FiShield} />
          <MetricCard label="V Stall" value={fmt(mRes?.performance?.v_stall_mps, 1, 'm/s')} color="#f472b6" subtitle="EAS" icon={FiWind} />
          <MetricCard label="Range" value={fmt(mRes?.performance?.breguet_range_km, 0, 'km')} color="#f59e0b" subtitle="Breguet" icon={FiCompass} />
          <MetricCard label="Robustness" value={stRes ? `${((stRes.robustness_score || 0) * 100).toFixed(0)}%` : '—'} color="#a855f7" subtitle="LHS score" icon={FiCpu} />
        </div>

        <div className={styles.workspace}>

          <div className={styles.canvasArea}>
            <div className={styles.canvasTabBar}>
              <TabButton active={mainTab === 'SIMULATOR'} onClick={() => setMainTab('SIMULATOR')}>Simulator</TabButton>
              <TabButton active={mainTab === 'STRUCTURE'} onClick={() => setMainTab('STRUCTURE')}>Structure</TabButton>
              <TabButton active={mainTab === 'STABILITY'} onClick={() => setMainTab('STABILITY')}>Stability</TabButton>
              <TabButton active={mainTab === 'PERFORMANCE'} onClick={() => setMainTab('PERFORMANCE')}>Performance</TabButton>
              <TabButton active={mainTab === 'ENVELOPE'} onClick={() => setMainTab('ENVELOPE')}>V-n</TabButton>
              <TabButton active={mainTab === 'PAYLOAD'} onClick={() => setMainTab('PAYLOAD')}>Payload</TabButton>
              <TabButton active={mainTab === 'STOCHASTIC'} onClick={() => setMainTab('STOCHASTIC')}>Stochastic</TabButton>
              <TabButton active={mainTab === 'REALITY'} onClick={() => setMainTab('REALITY')} badge={twin ? '●' : null}>Digital Twin</TabButton>
            </div>

            <div className={styles.canvasFrame}>

              {mainTab === 'SIMULATOR' && (
                <FlightSimulatorViz cst={cst} aero={{ ...aero, alpha: cond.alpha }} sRes={sRes} cgPos={stab.cg_position} />
              )}

              {mainTab === 'STRUCTURE' && (
                <div className={styles.chartContainer}>
                  <div className={styles.chartTitle}>STRUCTURAL TENSOR DISTRIBUTION — SHEAR · MOMENT · DEFLECTION</div>
                  {structDist.length > 0 ? (
                    <>
                      <div className={styles.chartMetrics}>
                        <div className={styles.chartMetric}>
                          <span className={styles.chartMetricLabel}>Root Moment</span>
                          <span className={styles.chartMetricValue} style={{ color: '#38bdf8' }}>{fmt(sRes?.loads?.root_bending_moment_Nm, 0, 'Nm')}</span>
                        </div>
                        <div className={styles.chartMetric}>
                          <span className={styles.chartMetricLabel}>Tip Deflection</span>
                          <span className={styles.chartMetricValue} style={{ color: '#00FFC2' }}>{fmt((sRes?.loads?.tip_deflection_z_m || 0) * 100, 2, 'cm')}</span>
                        </div>
                        <div className={styles.chartMetric}>
                          <span className={styles.chartMetricLabel}>Von Mises</span>
                          <span className={styles.chartMetricValue} style={{ color: mosDanger ? '#ef4444' : '#f59e0b' }}>{fmt(sRes?.loads?.von_mises_stress_MPa, 1, 'MPa')}</span>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height="65%">
                        <ComposedChart data={structDist} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                          <defs>
                            <linearGradient id="gM" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
                          <XAxis dataKey="y" stroke="#30363d" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas,monospace' }} label={{ value: 'Span (m)', position: 'insideBottom', offset: -5, fill: '#4b5563', fontSize: 10 }} />
                          <YAxis yAxisId="l" stroke="#30363d" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas,monospace' }} />
                          <YAxis yAxisId="r" orientation="right" stroke="#30363d" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas,monospace' }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Area yAxisId="l" type="monotone" dataKey="M" name="Moment (Nm)" stroke="#38bdf8" fill="url(#gM)" strokeWidth={2} isAnimationActive={false} />
                          <Line yAxisId="l" type="monotone" dataKey="V" name="Shear (N)" stroke="#a855f7" strokeWidth={2} dot={false} isAnimationActive={false} />
                          <Line yAxisId="r" type="monotone" dataKey="D" name="Deflect (cm)" stroke="#00FFC2" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                          <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'Consolas,monospace', color: '#8b949e' }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </>
                  ) : (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}><FiShield /></div>
                      <div className={styles.emptyText}>Awaiting Structural Solve</div>
                      <div className={styles.emptySubtext}>Pipeline computes structure after aerodynamic convergence</div>
                    </div>
                  )}
                </div>
              )}

              {mainTab === 'STABILITY' && (
                <div className={styles.chartContainer}>
                  <div className={styles.chartTitle}>LONGITUDINAL STATIC STABILITY — Cm VS α</div>
                  <div className={styles.chartMetrics}>
                    <div className={styles.chartMetric}>
                      <span className={styles.chartMetricLabel}>CG / MAC</span>
                      <span className={styles.chartMetricValue} style={{ color: '#f59e0b' }}>{(stab.cg_position * 100).toFixed(0)}%</span>
                    </div>
                    <div className={styles.chartMetric}>
                      <span className={styles.chartMetricLabel}>Tail Volume</span>
                      <span className={styles.chartMetricValue} style={{ color: '#00FFC2' }}>{stab.tail_volume.toFixed(2)}</span>
                    </div>
                    <div className={styles.chartMetric}>
                      <span className={styles.chartMetricLabel}>Static Margin</span>
                      <span className={styles.chartMetricValue} style={{ color: stabData.find(d => d.Cm > 0 && d.alpha > 0) ? '#10b981' : '#ef4444' }}>
                        {((0.25 - stab.cg_position) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height="65%">
                    <LineChart data={stabData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
                      <XAxis dataKey="alpha" stroke="#30363d" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas,monospace' }} label={{ value: 'α (deg)', position: 'insideBottom', offset: -5, fill: '#4b5563', fontSize: 10 }} />
                      <YAxis stroke="#30363d" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas,monospace' }} />
                      <Tooltip content={<CustomTooltip />} />
                      <ReferenceLine y={0} stroke="#444c56" strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="Cm" name="Cm Total" stroke="#00FFC2" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="Cm_Wing" name="Cm Wing" stroke="#38bdf8" strokeWidth={1} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="Cm_Tail" name="Cm Tail" stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                      <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'Consolas,monospace', color: '#8b949e' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {mainTab === 'PERFORMANCE' && (
                <div className={styles.chartContainer}>
                  <div className={styles.chartTitle}>KINETIC ENVELOPE — THRUST VS DRAG</div>
                  {perfData.length > 0 ? (
                    <>
                      <div className={styles.chartMetrics}>
                        <div className={styles.chartMetric}>
                          <span className={styles.chartMetricLabel}>V Cruise</span>
                          <span className={styles.chartMetricValue} style={{ color: '#00FFC2' }}>{fmt(mRes?.performance?.v_cruise_optimal_mps, 1, 'm/s')}</span>
                        </div>
                        <div className={styles.chartMetric}>
                          <span className={styles.chartMetricLabel}>Max RoC</span>
                          <span className={styles.chartMetricValue} style={{ color: '#38bdf8' }}>{fmt(mRes?.performance?.max_rate_of_climb_mps, 2, 'm/s')}</span>
                        </div>
                        <div className={styles.chartMetric}>
                          <span className={styles.chartMetricLabel}>V Max</span>
                          <span className={styles.chartMetricValue} style={{ color: '#f59e0b' }}>{fmt(mRes?.performance?.v_max_mps, 1, 'm/s')}</span>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height="65%">
                        <ComposedChart data={perfData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
                          <XAxis dataKey="v" stroke="#30363d" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas,monospace' }} label={{ value: 'V (m/s)', position: 'insideBottom', offset: -5, fill: '#4b5563', fontSize: 10 }} />
                          <YAxis yAxisId="l" stroke="#30363d" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas,monospace' }} />
                          <YAxis yAxisId="r" orientation="right" stroke="#30363d" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas,monospace' }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Area yAxisId="l" type="monotone" dataKey="T" name="Thrust (N)" stroke="#f59e0b" fill="rgba(245,158,11,.08)" strokeWidth={2} isAnimationActive={false} />
                          <Line yAxisId="l" type="monotone" dataKey="D" name="Drag (N)" stroke="#f472b6" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                          <Line yAxisId="r" type="monotone" dataKey="RoC" name="RoC (m/s)" stroke="#00FFC2" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                          <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'Consolas,monospace', color: '#8b949e' }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </>
                  ) : (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}><FiTrendingUp /></div>
                      <div className={styles.emptyText}>Awaiting Mission Solve</div>
                    </div>
                  )}
                </div>
              )}

              {mainTab === 'ENVELOPE' && (
                <div className={styles.chartContainer}>
                  <div className={styles.chartTitle}>STRUCTURAL BOUNDARIES — V-n DIAGRAM (FAR 25)</div>
                  {vnData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="85%">
                      <LineChart data={vnData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
                        <XAxis dataKey="v" stroke="#30363d" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas,monospace' }} label={{ value: 'EAS (m/s)', position: 'insideBottom', offset: -5, fill: '#4b5563', fontSize: 10 }} />
                        <YAxis stroke="#30363d" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas,monospace' }} label={{ value: 'Load Factor n', angle: -90, position: 'insideLeft', fill: '#4b5563', fontSize: 10 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <ReferenceLine y={struct.load_factor} stroke="#444c56" strokeDasharray="5 5" label={{ value: '+Limit', fill: '#8b949e', fontSize: 9 }} />
                        <ReferenceLine y={-struct.load_factor * 0.4} stroke="#444c56" strokeDasharray="5 5" label={{ value: '-Limit', fill: '#8b949e', fontSize: 9 }} />
                        <Line type="monotone" dataKey="pos" name="+Stall" stroke="#38bdf8" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                        <Line type="monotone" dataKey="neg" name="-Stall" stroke="#f472b6" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                        <Line type="monotone" dataKey="gp" name="+Gust 50fps" stroke="#00FFC2" strokeWidth={1} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                        <Line type="monotone" dataKey="gn" name="-Gust 50fps" stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                        <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'Consolas,monospace', color: '#8b949e' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}><FiTarget /></div>
                      <div className={styles.emptyText}>Awaiting Mission Data</div>
                    </div>
                  )}
                </div>
              )}

              {mainTab === 'PAYLOAD' && (
                <div className={styles.chartContainer}>
                  <div className={styles.chartTitle}>MISSION ECONOMICS — PAYLOAD-RANGE DIAGRAM (BREGUET)</div>
                  {payloadData.length > 0 ? (
                    <>
                      <div className={styles.chartMetrics}>
                        <div className={styles.chartMetric}>
                          <span className={styles.chartMetricLabel}>Max Range</span>
                          <span className={styles.chartMetricValue} style={{ color: '#f59e0b' }}>{fmt(payloadData[payloadData.length - 1]?.range, 0, 'km')}</span>
                        </div>
                        <div className={styles.chartMetric}>
                          <span className={styles.chartMetricLabel}>Max Payload</span>
                          <span className={styles.chartMetricValue} style={{ color: '#00FFC2' }}>{fmt(payloadData[0]?.payload, 1, 'kg')}</span>
                        </div>
                        <div className={styles.chartMetric}>
                          <span className={styles.chartMetricLabel}>Endurance</span>
                          <span className={styles.chartMetricValue} style={{ color: '#38bdf8' }}>{fmt(mRes?.performance?.max_endurance_hrs, 1, 'hr')}</span>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height="65%">
                        <LineChart data={payloadData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
                          <XAxis dataKey="range" stroke="#30363d" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas,monospace' }} label={{ value: 'Range (km)', position: 'insideBottom', offset: -5, fill: '#4b5563', fontSize: 10 }} />
                          <YAxis stroke="#30363d" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas,monospace' }} label={{ value: 'Payload (kg)', angle: -90, position: 'insideLeft', fill: '#4b5563', fontSize: 10 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Line type="linear" dataKey="payload" name="Payload" stroke="#00FFC2" strokeWidth={3} dot={{ r: 5, fill: '#00FFC2', strokeWidth: 2, stroke: '#010409' }} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </>
                  ) : (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}><FiCompass /></div>
                      <div className={styles.emptyText}>Awaiting Mission Data</div>
                    </div>
                  )}
                </div>
              )}

              {mainTab === 'STOCHASTIC' && (
                <div className={styles.chartContainer}>
                  <div className={styles.chartTitle}>MANUFACTURING ROBUSTNESS — LATIN HYPERCUBE KDE PDF</div>
                  {stRes ? (
                    <>
                      <div className={styles.chartMetrics}>
                        <div className={styles.chartMetric}>
                          <span className={styles.chartMetricLabel}>Robustness Score</span>
                          <span className={styles.chartMetricValue} style={{ color: '#a855f7' }}>{((stRes.robustness_score || 0) * 100).toFixed(1)}%</span>
                        </div>
                        <div className={styles.chartMetric}>
                          <span className={styles.chartMetricLabel}>Worst-Case L/D</span>
                          <span className={styles.chartMetricValue} style={{ color: '#ef4444' }}>{stRes.worst_case_ld?.toFixed(2) ?? '—'}</span>
                        </div>
                        <div className={styles.chartMetric}>
                          <span className={styles.chartMetricLabel}>Noise Level</span>
                          <span className={styles.chartMetricValue} style={{ color: '#f59e0b' }}>{stoch.noise_percent}%</span>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height="65%">
                        <AreaChart data={stRes.pdf_distribution} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                          <defs>
                            <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#a855f7" stopOpacity={0.5} />
                              <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
                          <XAxis dataKey="ld" stroke="#30363d" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas,monospace' }} label={{ value: 'L/D Ratio', position: 'insideBottom', offset: -5, fill: '#4b5563', fontSize: 10 }} />
                          <YAxis stroke="#30363d" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas,monospace' }} />
                          <Tooltip content={<CustomTooltip />} />
                          <ReferenceLine x={stRes.worst_case_ld} stroke="#ef4444" strokeWidth={2} label={{ value: '1st %ile', fill: '#ef4444', fontSize: 10 }} />
                          <Area type="monotone" dataKey="prob" name="PDF" stroke="#a855f7" fill="url(#gP)" strokeWidth={2.5} isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </>
                  ) : (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}><FiCpu /></div>
                      <div className={styles.emptyText}>Awaiting Stochastic Solve</div>
                      <div className={styles.emptySubtext}>Set iterations in Trim & Robustness section</div>
                    </div>
                  )}
                </div>
              )}

              {mainTab === 'REALITY' && (
                <div className={styles.chartContainer}>
                  <div className={styles.chartTitle}>DIGITAL TWIN — ARDUPILOT TELEMETRY CALIBRATION</div>
                  {twin?.status === 'success' && mRes ? (
                    <>
                      <div className={styles.chartMetrics}>
                        <div className={styles.chartMetric}>
                          <span className={styles.chartMetricLabel}>κ Drag</span>
                          <span className={styles.chartMetricValue} style={{ color: twin.calibration_factors.kappa_drag > 1.1 ? '#ef4444' : '#00FFC2' }}>
                            {twin.calibration_factors.kappa_drag.toFixed(3)}×
                          </span>
                        </div>
                        <div className={styles.chartMetric}>
                          <span className={styles.chartMetricLabel}>κ Lift</span>
                          <span className={styles.chartMetricValue} style={{ color: '#38bdf8' }}>
                            {twin.calibration_factors.kappa_lift.toFixed(3)}×
                          </span>
                        </div>
                        <div className={styles.chartMetric}>
                          <span className={styles.chartMetricLabel}>Telemetry Frames</span>
                          <span className={styles.chartMetricValue} style={{ color: '#a855f7' }}>{twin.telemetry_samples}</span>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height="65%">
                        <ComposedChart data={[]} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
                          <XAxis stroke="#30363d" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas,monospace' }} label={{ value: 'V (m/s)', position: 'insideBottom', offset: -5, fill: '#4b5563', fontSize: 10 }} />
                          <YAxis stroke="#30363d" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas,monospace' }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Line type="monotone" dataKey="P_theory" name="AI Model" stroke="#007AFF" strokeWidth={2} dot={false} isAnimationActive={false} />
                          <Scatter dataKey="P_actual" name="Flight Log" fill="#00FFC2" r={3} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </>
                  ) : (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}><FiDatabase /></div>
                      <div className={styles.emptyText}>No Twin Data Loaded</div>
                      <div className={styles.emptySubtext}>Use Import → Flight Log (.CSV) to upload ArduPilot telemetry and calibrate against AI model</div>
                      <button className={styles.actionButton} style={{ marginTop: 12 }} onClick={() => logRef.current.click()} disabled={!mRes}>
                        <FiUploadCloud size={14} /> Upload Flight Log
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={styles.analysisPanel}>
            <div className={styles.panelTabs}>
              <TabButton active={rightTab === 'MISSION'} onClick={() => setRightTab('MISSION')}>Mission</TabButton>
              <TabButton active={rightTab === 'RADAR'}  onClick={() => setRightTab('RADAR')}>Viability</TabButton>
              <TabButton active={rightTab === 'ATMO'}   onClick={() => setRightTab('ATMO')}>Atmosphere</TabButton>
            </div>

            <div className={styles.panelContent}>

              {rightTab === 'MISSION' && (
                <div className={styles.analysisCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardIndicator} style={{ background: '#00FFC2' }} />
                    <span className={styles.cardTitle}>Mission Outputs</span>
                  </div>
                  <div className={styles.cardContent}>
                    {[
                      { l: 'Breguet Range',   v: fmt(mRes?.performance?.breguet_range_km, 0, 'km'), col: '#f59e0b' },
                      { l: 'Max Endurance',   v: fmt(mRes?.performance?.max_endurance_hrs, 2, 'hr'), col: '#00FFC2' },
                      { l: 'V Cruise (opt)', v: fmt(mRes?.performance?.v_cruise_optimal_mps, 1, 'm/s') },
                      { l: 'V Stall (EAS)',  v: fmt(mRes?.performance?.v_stall_mps, 1, 'm/s'), col: '#f472b6' },
                      { l: 'V Max',          v: fmt(mRes?.performance?.v_max_mps, 1, 'm/s'), col: '#f59e0b' },
                      { l: 'Rate of Climb',  v: fmt(mRes?.performance?.max_rate_of_climb_mps, 2, 'm/s'), col: '#38bdf8' },
                      { l: '3D CL',         v: fmt(mRes?.aerodynamics?.cl_3d, 4), col: '#38bdf8' },
                      { l: '3D CD total',   v: fmt(mRes?.aerodynamics?.cd_3d_total, 5) },
                      { l: '3D L/D',        v: fmt(mRes?.aerodynamics?.ld_ratio_3d, 1), col: '#00FFC2' },
                      { l: 'Span / AR',      v: `${struct.span_m}m / ${AR.toFixed(1)}` },
                    ].map((r, i) => (
                      <div key={i} className={styles.dataRow}>
                        <span className={styles.dataLabel}>{r.l}</span>
                        <span className={styles.dataValue} style={r.col ? { color: r.col } : {}}>{r.v}</span>
                      </div>
                    ))}
                    <div className={styles.dataRowDivider} />
                    {[
                      { l: 'Root Moment',    v: fmt(sRes?.loads?.root_bending_moment_Nm, 0, 'Nm'), col: '#38bdf8' },
                      { l: 'Von Mises',      v: fmt(sRes?.loads?.von_mises_stress_MPa, 1, 'MPa'), col: mosDanger ? '#ef4444' : '#f59e0b' },
                      { l: 'Safety Margin',  v: fmt(mos, 3), col: mosDanger ? '#ef4444' : '#10b981' },
                      { l: 'Tip Deflection', v: fmt((sRes?.loads?.tip_deflection_z_m || 0) * 100, 2, 'cm'), col: '#a855f7' },
                    ].map((r, i) => (
                      <div key={i} className={styles.dataRow}>
                        <span className={styles.dataLabel}>{r.l}</span>
                        <span className={styles.dataValue} style={r.col ? { color: r.col } : {}}>{r.v}</span>
                      </div>
                    ))}
                    {twin?.status === 'success' && (
                      <>
                        <div className={styles.dataRowDivider} />
                        <div style={{ fontSize: '0.6rem', color: '#00FFC2', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', margin: '6px 0 4px', fontFamily: 'Consolas,monospace' }}>Digital Twin Δ</div>
                        <div className={styles.dataRow}>
                          <span className={styles.dataLabel}>κ Drag</span>
                          <span className={styles.dataValue} style={{ color: twin.calibration_factors.kappa_drag > 1.1 ? '#ef4444' : '#00FFC2' }}>{twin.calibration_factors.kappa_drag.toFixed(3)}×</span>
                        </div>
                        <div className={styles.dataRow}>
                          <span className={styles.dataLabel}>κ Lift</span>
                          <span className={styles.dataValue} style={{ color: '#38bdf8' }}>{twin.calibration_factors.kappa_lift.toFixed(3)}×</span>
                        </div>
                        <div className={styles.dataRow}>
                          <span className={styles.dataLabel}>Real Range</span>
                          <span className={styles.dataValue} style={{ color: '#f59e0b' }}>
                            {fmt(((mRes?.performance?.breguet_range_km || 0) / twin.calibration_factors.kappa_drag) * twin.calibration_factors.kappa_lift, 0, 'km')}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {rightTab === 'RADAR' && (
                <div className={styles.analysisCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardIndicator} style={{ background: '#a855f7' }} />
                    <span className={styles.cardTitle}>Platform Viability Index</span>
                  </div>
                  <div className={styles.cardContent}>
                    {radarData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={260}>
                        <RadarChart cx="50%" cy="50%" outerRadius="60%" data={radarData}>
                          <PolarGrid stroke="#21262d" />
                          <PolarAngleAxis dataKey="s" tick={{ fill: '#8b949e', fontSize: 10, fontFamily: 'Consolas,monospace' }} />
                          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                          <Radar name="Score" dataKey="A" stroke="#007AFF" fill="#007AFF" fillOpacity={0.35} />
                          <Tooltip content={<CustomTooltip />} />
                        </RadarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className={styles.emptyState} style={{ height: 260 }}>
                        <div className={styles.emptyText}>Awaiting All Analyses</div>
                      </div>
                    )}
                    {radarData.map((r, i) => (
                      <div key={i} className={styles.dataRow}>
                        <span className={styles.dataLabel}>{r.s}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 60, height: 4, background: '#21262d', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${r.A}%`, height: '100%', background: '#007AFF', borderRadius: 2 }} />
                          </div>
                          <span className={styles.dataValue} style={{ color: '#007AFF', minWidth: 32 }}>{r.A.toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {rightTab === 'ATMO' && (
                <div className={styles.analysisCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardIndicator} style={{ background: '#38bdf8' }} />
                    <span className={styles.cardTitle}>ISA Atmosphere</span>
                  </div>
                  <div className={styles.cardContent}>
                    {[
                      { l: 'Altitude',        v: `${miss.altitude_m} m` },
                      { l: 'Temperature',     v: fmt(atmo.T, 1, 'K'), col: '#f59e0b' },
                      { l: 'Pressure',        v: fmt(atmo.P / 1000, 2, 'kPa'), col: '#38bdf8' },
                      { l: 'Density (ρ)',     v: fmt(atmo.rho, 4, 'kg/m³'), col: '#00FFC2' },
                      { l: 'Speed of Sound', v: fmt(atmo.a, 1, 'm/s') },
                      { l: 'Reynolds @Vc',   v: fmt(atmo.rho * (mRes?.performance?.v_cruise_optimal_mps || 25) * struct.chord_m / 1.789e-5, 2, '') },
                      { l: 'Mach @Vc',       v: fmt((mRes?.performance?.v_cruise_optimal_mps || 0) / atmo.a, 3) },
                      { l: 'Dynamic Pressure', v: fmt(0.5 * atmo.rho * ((mRes?.performance?.v_cruise_optimal_mps || 0) ** 2), 1, 'Pa'), col: '#a855f7' },
                    ].map((r, i) => (
                      <div key={i} className={styles.dataRow}>
                        <span className={styles.dataLabel}>{r.l}</span>
                        <span className={styles.dataValue} style={r.col ? { color: r.col } : {}}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {libOpen && (
        <div className={styles.modalOverlay} onClick={() => setLibOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderLeft}>
                <div className={styles.modalTitle}>UIUC Airfoil Database</div>
                <div className={styles.modalSubtitle}>1,600+ profiles with CST parameterization</div>
              </div>
              <button className={styles.modalClose} onClick={() => setLibOpen(false)}><FiX size={16} /></button>
            </div>
            <div className={styles.modalSearch}>
              <FiSearch size={14} style={{ color: '#4b5563', flexShrink: 0 }} />
              <input
                className={styles.modalSearchInput}
                placeholder="Search — NACA 4412, Clark Y, Eppler 423..."
                value={libQ}
                onChange={e => setLibQ(e.target.value)}
                autoFocus
              />
              {libQ && (
                <button className={styles.modalSearchClear} onClick={() => { setLibQ(''); setLibRes([]); }}>
                  <FiX size={12} />
                </button>
              )}
            </div>
            <div className={styles.modalResults}>
              {libRes.length > 0 ? libRes.map(a => (
                <button key={a.name} className={styles.modalResultItem} onClick={() => loadLibraryAirfoil(a)}>
                  <span className={styles.modalResultName}>{a.name}</span>
                  <span className={styles.modalResultBadge}>UIUC</span>
                </button>
              )) : (
                <div className={styles.modalEmpty}>
                  <FiDatabase size={28} />
                  <span>{libQ.length < 3 ? 'Type 3+ characters to search' : `No results for "${libQ}"`}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── EXPORT WITH SUBSCRIPTION GUARD ────────────────────────────
export default function FlightDynamicsPage() {
  return (
    <SubscriptionGuard>
      <FlightDynamicsContent />
    </SubscriptionGuard>
  );
}