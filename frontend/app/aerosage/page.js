'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import SubscriptionGuard from '@/components/SubscriptionGuard';
import styles from './aerosage.module.css';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  FiSearch, FiX, FiBookOpen, FiUploadCloud, FiChevronDown,
  FiFileText, FiAlertTriangle, FiCheckCircle, FiActivity,
  FiLayers, FiWind, FiZap, FiEye, FiRefreshCw,
  FiInfo, FiCpu, FiTarget, FiTrendingUp, FiTrendingDown,
  FiBox
} from 'react-icons/fi';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://aeroml-production.up.railway.app';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFECT_COLORS = {
  ice: '#60A5FA', dent: '#F87171', step: '#FBBF24',
  roughness: '#34D399', erosion: '#FB923C',
  contamination: '#C084FC', crack: '#F472B6', delamination: '#A78BFA'
};
const DEFECT_ICONS_MAP = {
  ice: '❄', dent: '⚡', step: '▤', roughness: '∿',
  erosion: '◈', contamination: '◉', crack: '╱', delamination: '◫'
};
const ORACLE_COLORS = {
  WARNING: '#F87171', CAUTION: '#FBBF24', ADVISORY: '#60A5FA', INFO: '#34D399'
};
const ORACLE_ICONS = { WARNING: '⚠', CAUTION: '◈', ADVISORY: 'ℹ', INFO: '✓' };

// ─── HiDPI / Retina Canvas Setup ─────────────────────────────────────────────
function setupHiDPICanvas(canvas, width, height) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, dpr, W: width, H: height };
}

function px(n) { return Math.round(n) + 0.5; }
function fpx(n) { return Math.round(n); }

// ─── Number formatting ──────────────────────────────
function fmt(val, decimals = 4) {
  if (val === undefined || val === null || !isFinite(val)) return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  return n.toFixed(decimals);
}

function fmtSmart(val) {
  if (val === undefined || val === null || !isFinite(val)) return '—';
  const n = Math.abs(Number(val));
  if (n === 0) return '0.0000';
  if (n >= 0.001) return Number(val).toFixed(4);
  if (n >= 0.00001) return Number(val).toFixed(6);
  return Number(val).toFixed(8);
}

function fmtCD(val) {
  if (val === undefined || val === null || !isFinite(val)) return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  return n.toFixed(6);
}

// ─── Token & API ─────────────────────────────────────────────────────────────
function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('token') || '';
}

async function apiPost(endpoint, body) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API error ${res.status}`);
  }
  return res.json();
}

async function apiGet(endpoint) {
  const res = await fetch(`${API}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ─── NACA client fallback ─────────────────────────────────────────────────────
function naca4Client(code, n = 200) {
  const m = parseInt(code[0]) / 100;
  const p = parseInt(code[1]) / 10;
  const t = parseInt(code.slice(2)) / 100;
  const pts = [];
  for (let i = 0; i <= n / 2; i++) {
    const beta = (i / (n / 2)) * Math.PI;
    const x = 0.5 * (1 - Math.cos(beta));
    const yt = 5 * t * (0.2969 * Math.sqrt(x + 1e-10) - 0.1260 * x
      - 0.3516 * x * x + 0.2843 * x * x * x - 0.1015 * x * x * x * x);
    let yc = 0, dyc = 0;
    if (m > 0 && p > 0) {
      if (x <= p) { yc = (m / (p * p)) * (2 * p * x - x * x); dyc = (2 * m / (p * p)) * (p - x); }
      else { yc = (m / ((1 - p) * (1 - p))) * ((1 - 2 * p) + 2 * p * x - x * x); dyc = (2 * m / ((1 - p) * (1 - p))) * (p - x); }
    }
    const theta = Math.atan(dyc);
    pts.push({ x: x - yt * Math.sin(theta), yU: yc + yt * Math.cos(theta), yL: yc - yt * Math.cos(theta) });
  }
  return [
    ...pts.slice().reverse().map(p => [p.x, p.yU]),
    ...pts.slice(1).map(p => [p.x, p.yL])
  ];
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function makeTransform(W, H, PAD, coords) {
    const xs = coords.map(c => c[0]);
    const ys = coords.map(c => c[1]);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 0.3;
    
    const drawW = W - PAD * 2;
    const drawH = H - PAD * 2;
    
    const scaleX = drawW / xRange;
    const scaleY = drawH / (yRange * 1.8);
    
    const scale = Math.min(scaleX, scaleY);
    
    const cx = PAD + (drawW - xRange * scale) / 2;
    const cy = H / 2;
    
    return (x, y) => [
        cx + x * scale,
        cy - y * scale
    ];
}

// ─── Crisp engineering grid ───────────────────────────────────────────────────
function drawEngineeringGrid(ctx, W, H) {
  ctx.fillStyle = 'rgba(48,54,61,0.6)';
  const spacing = 20;
  for (let x = 0; x <= W; x += spacing) {
    for (let y = 0; y <= H; y += spacing) {
      ctx.fillRect(fpx(x) - 0.5, fpx(y) - 0.5, 1, 1); 
    }
  }
  ctx.strokeStyle = 'rgba(48,54,61,0.2)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 100) {
    ctx.beginPath(); ctx.moveTo(fpx(x), 0); ctx.lineTo(fpx(x), H); ctx.stroke();
  }
  for (let y = 0; y <= H; y += 100) {
    ctx.beginPath(); ctx.moveTo(0, fpx(y)); ctx.lineTo(W, fpx(y)); ctx.stroke();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: ENHANCED 2D AIRFOIL CANVAS - FIXED
// ═══════════════════════════════════════════════════════════════════════════════
function AirfoilCanvas({
  coords, defects, analysisResult, viewMode,
  onCanvasClick, activeDefectDraw, defectPending, hoveredDefect
}) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const timeRef = useRef(0);
  const sizeRef = useRef({ W: 0, H: 0 });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = canvas.parentElement;
    if (!p) return;

    const W = p.clientWidth;
    const H = p.clientHeight;

    if (sizeRef.current.W !== W || sizeRef.current.H !== H) {
      sizeRef.current = { W, H };
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
    }

    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    timeRef.current += 0.012;
    const t = timeRef.current;

    // ── Background ──
    ctx.fillStyle = '#010409';
    ctx.fillRect(0, 0, W, H);
    drawEngineeringGrid(ctx, W, H);

    if (!coords || coords.length < 10) {
      ctx.fillStyle = '#4b5563';
      ctx.font = '500 13px "JetBrains Mono", Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Import or generate an airfoil to begin', W / 2, H / 2 - 8);
      ctx.font = '11px Consolas, monospace';
      ctx.fillStyle = '#30363d';
      ctx.fillText('Use the Import panel on the left', W / 2, H / 2 + 12);
      ctx.textBaseline = 'alphabetic';
      animRef.current = requestAnimationFrame(draw);
      return;
    }

    const PAD = 70;
    const T = makeTransform(W, H, PAD, coords);

    const [leX, leY] = T(0, 0);
    const [teX, teY] = T(1, 0);

    // ── Chord line ──
    ctx.beginPath();
    ctx.moveTo(leX - 20, leY);
    ctx.lineTo(teX + 20, teY);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Cp / velocity field overlay ──
    if (viewMode !== 'geometry' && analysisResult?.result?.panel_method) {
      const pm = analysisResult.result.panel_method;
      const fieldData = pm.Cp;
      const xm = pm.xm, ym = pm.ym;
      if (fieldData && xm) {
        const vMin = Math.min(...fieldData.filter(isFinite));
        const vMax = Math.max(...fieldData.filter(isFinite));
        const vRange = vMax - vMin || 1;
        for (let i = 0; i < xm.length; i++) {
          if (!isFinite(fieldData[i])) continue;
          const norm = (fieldData[i] - vMin) / vRange;
          let r, g, b;
          if (norm < 0.2) { r = 0; g = Math.round(norm / 0.2 * 100); b = 255; }
          else if (norm < 0.4) { r = 0; g = Math.round(100 + (norm - 0.2) / 0.2 * 155); b = 255 - Math.round((norm - 0.2) / 0.2 * 100); }
          else if (norm < 0.6) { r = Math.round((norm - 0.4) / 0.2 * 255); g = 255; b = 0; }
          else if (norm < 0.8) { r = 255; g = Math.round(255 - (norm - 0.6) / 0.2 * 155); b = 0; }
          else { r = 255; g = 0; b = Math.round((norm - 0.8) / 0.2 * 100); }
          const [ppx, ppy] = T(xm[i], ym[i]);
          ctx.fillStyle = `rgba(${r},${g},${b},0.65)`;
          ctx.fillRect(fpx(ppx) - 3, fpx(ppy) - 3, 6, 6);
        }
      }
    }

    // ── Defect zones ──
    const upperCoords = coords.filter(c => c[1] >= 0);
    const lowerCoords = coords.filter(c => c[1] <= 0);
    const uYmax = upperCoords.length ? Math.max(...upperCoords.map(c => c[1])) : 0.12;
    const lYmin = lowerCoords.length ? Math.min(...lowerCoords.map(c => c[1])) : -0.06;

    for (let di = 0; di < defects.length; di++) {
      const d = defects[di];
      const col = DEFECT_COLORS[d.defect_type] || '#fff';
      const isHov = hoveredDefect === di;
      const pulse = 0.18 + 0.08 * Math.sin(t * 1.8 + di * 1.2);

      const [bx1, by_top] = T(d.x_start, (d.surface === 'lower') ? lYmin * 1.5 : uYmax * 1.5);
      const [bx2, by_bot] = T(d.x_end, (d.surface === 'upper') ? 0 : lYmin * 1.5);
      const bW = bx2 - bx1;
      const bH = Math.abs(by_top - by_bot);
      const byTop = Math.min(by_top, by_bot);

      ctx.save();
      ctx.globalAlpha = isHov ? 0.5 : pulse;
      ctx.fillStyle = col;
      ctx.fillRect(fpx(bx1), fpx(byTop), Math.round(bW), Math.round(bH));

      ctx.globalAlpha = isHov ? 0.9 : 0.65;
      ctx.strokeStyle = col;
      ctx.lineWidth = isHov ? 1.5 : 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(fpx(bx1) + 0.5, fpx(byTop) + 0.5, Math.round(bW), Math.round(bH));
      ctx.setLineDash([]);

      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.font = `bold 9px Consolas, monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(`${DEFECT_ICONS_MAP[d.defect_type]} ${d.defect_type.toUpperCase()}`, fpx(bx1) + 3, fpx(byTop) - 4);
      ctx.restore();
    }

    if (defectPending) {
      const [ppx_] = T(defectPending.x_start, 0);
      const ppxS = px(ppx_);
      ctx.save();
      ctx.strokeStyle = '#FBBF24'; ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(ppxS, PAD / 2); ctx.lineTo(ppxS, H - PAD / 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#FBBF24'; ctx.font = 'bold 10px Consolas';
      ctx.fillText(`x/c=${defectPending.x_start.toFixed(3)}`, ppxS + 5, PAD + 4);
      ctx.restore();
    }

    let leIdx = 0, minX = Infinity;
    for (let i = 0; i < coords.length; i++) {
      if (coords[i][0] < minX) { minX = coords[i][0]; leIdx = i; }
    }
    const upper = coords.slice(0, leIdx + 1).slice().reverse();
    const lower = coords.slice(leIdx);

    // ── Airfoil body fill ──
    ctx.beginPath();
    coords.forEach((c, i) => {
      const [ppx_, ppy_] = T(c[0], c[1]);
      i === 0 ? ctx.moveTo(ppx_, ppy_) : ctx.lineTo(ppx_, ppy_);
    });
    ctx.closePath();
    const bodyGrad = ctx.createLinearGradient(leX, leY - 60, leX, leY + 60);
    bodyGrad.addColorStop(0, 'rgba(0,80,220,0.20)');
    bodyGrad.addColorStop(0.4, 'rgba(0,50,160,0.10)');
    bodyGrad.addColorStop(1, 'rgba(0,20,80,0.05)');
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // ── Upper surface ──
    ctx.beginPath();
    upper.forEach((c, i) => {
      const [ppx_, ppy_] = T(c[0], c[1]);
      i === 0 ? ctx.moveTo(ppx_, ppy_) : ctx.lineTo(ppx_, ppy_);
    });
    ctx.strokeStyle = 'rgba(0,122,255,0.15)';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.beginPath();
    upper.forEach((c, i) => {
      const [ppx_, ppy_] = T(c[0], c[1]);
      i === 0 ? ctx.moveTo(ppx_, ppy_) : ctx.lineTo(ppx_, ppy_);
    });
    ctx.strokeStyle = 'rgba(0,150,255,0.3)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    upper.forEach((c, i) => {
      const [ppx_, ppy_] = T(c[0], c[1]);
      i === 0 ? ctx.moveTo(ppx_, ppy_) : ctx.lineTo(ppx_, ppy_);
    });
    const upperGrad = ctx.createLinearGradient(leX, 0, teX, 0);
    upperGrad.addColorStop(0, '#00C8FF');
    upperGrad.addColorStop(0.3, '#007AFF');
    upperGrad.addColorStop(0.7, '#005FCC');
    upperGrad.addColorStop(1, '#0040AA');
    ctx.strokeStyle = upperGrad;
    ctx.lineWidth = 2;
    ctx.stroke();

    // ── Lower surface ──
    ctx.beginPath();
    lower.forEach((c, i) => {
      const [ppx_, ppy_] = T(c[0], c[1]);
      i === 0 ? ctx.moveTo(ppx_, ppy_) : ctx.lineTo(ppx_, ppy_);
    });
    ctx.strokeStyle = 'rgba(0,100,200,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ── Analysis overlays ──
    if (analysisResult?.result?.boundary_layer) {
      const bl = analysisResult.result.boundary_layer;

      if (isFinite(bl.transition_upper) && bl.transition_upper <= 1.0) {
        const [txVal, tyVal] = T(bl.transition_upper, 0);
        const txS = px(txVal);
        ctx.save();
        ctx.strokeStyle = '#34D399';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(txS, H * 0.12);
        ctx.lineTo(txS, tyVal - 4);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(52,211,153,0.10)';
        ctx.strokeStyle = 'rgba(52,211,153,0.35)';
        ctx.lineWidth = 1;
        const lw = 58, lh = 16;
        const bx = fpx(txVal - lw / 2), by = fpx(H * 0.12 - lh - 2);
        ctx.fillRect(bx, by, lw, lh);
        ctx.strokeRect(bx + 0.5, by + 0.5, lw - 1, lh - 1);
        ctx.fillStyle = '#34D399';
        ctx.font = 'bold 9px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`Tr↑ ${(bl.transition_upper * 100).toFixed(1)}%`, txVal, H * 0.12 - 7);
        ctx.restore();
      }

      if (isFinite(bl.transition_lower) && bl.transition_lower <= 1.0) {
        const [txVal] = T(bl.transition_lower, 0);
        const txS = px(txVal);
        ctx.save();
        ctx.strokeStyle = '#FB923C';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(txS, leY + 4);
        ctx.lineTo(txS, H * 0.88);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(251,146,60,0.10)';
        ctx.strokeStyle = 'rgba(251,146,60,0.35)';
        ctx.lineWidth = 1;
        const lw = 58, lh = 16;
        const bx = fpx(txVal - lw / 2), by = fpx(H * 0.88 + 2);
        ctx.fillRect(bx, by, lw, lh);
        ctx.strokeRect(bx + 0.5, by + 0.5, lw - 1, lh - 1);
        ctx.fillStyle = '#FB923C';
        ctx.font = 'bold 9px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`Tr↓ ${(bl.transition_lower * 100).toFixed(1)}%`, txVal, H * 0.88 + 13);
        ctx.restore();
      }
    }

    if (analysisResult?.oracle) {
      for (const msg of analysisResult.oracle) {
        if (!msg.zone_x || msg.zone_x > 1) continue;
        const [mxVal] = T(msg.zone_x, 0);
        const mxS = px(mxVal);
        const col = ORACLE_COLORS[msg.level] || '#fff';
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = col; ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(mxS, PAD / 2); ctx.lineTo(mxS, H - PAD / 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = col; ctx.font = 'bold 11px Consolas';
        ctx.textAlign = 'center';
        ctx.fillText(ORACLE_ICONS[msg.level] || '!', mxVal, PAD - 2);
        ctx.restore();
      }
    }

    // ── Chord percentage tick marks ──
    ctx.save();
    ctx.font = '500 8px Consolas, monospace';
    for (let xi = 0; xi <= 10; xi++) {
      const [lxVal, lyVal] = T(xi / 10, 0);
      const lxS = px(lxVal), lyS = fpx(lyVal);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(lxS, lyS - 4); ctx.lineTo(lxS, lyS + 4); ctx.stroke();
      ctx.fillStyle = '#374151';
      ctx.textAlign = 'center';
      ctx.fillText(`${xi * 10}%`, lxVal, lyVal + 20);
    }
    ctx.restore();

    // ── LE & TE points ──
    const lePulse = 1 + 0.25 * Math.sin(t * 2);
    const leR = 4 * lePulse;
    ctx.beginPath();
    ctx.arc(fpx(leX), fpx(leY), leR + 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,255,194,${0.08 * lePulse})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(fpx(leX), fpx(leY), leR, 0, Math.PI * 2);
    ctx.fillStyle = '#00FFC2';
    ctx.fill();
    ctx.fillStyle = 'rgba(0,255,194,0.75)';
    ctx.font = 'bold 8px Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('LE', leX - 10, leY - 8);

    ctx.beginPath();
    ctx.arc(fpx(teX), fpx(teY), 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = 'bold 8px Consolas';
    ctx.textAlign = 'left';
    ctx.fillText('TE', teX + 8, teY - 4);

    if (analysisResult?.result?.panel_method) {
      const pm = analysisResult.result.panel_method;
      if (pm.stagnation_x !== undefined && pm.stagnation_y !== undefined) {
        const [sxVal, syVal] = T(pm.stagnation_x, pm.stagnation_y);
        ctx.beginPath();
        ctx.arc(fpx(sxVal), fpx(syVal), 4, 0, Math.PI * 2);
        ctx.fillStyle = '#FBBF24';
        ctx.fill();
        ctx.strokeStyle = 'rgba(251,191,36,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = 'rgba(251,191,36,0.8)';
        ctx.font = 'bold 8px Consolas';
        ctx.textAlign = 'left';
        ctx.fillText('Stag.', sxVal + 7, syVal + 4);
      }
    }

    const aoaRad = (analysisResult?.conditions?.alpha_deg || 0) * Math.PI / 180;
    if (Math.abs(aoaRad) > 0.01) {
      const arrowLen = 36;
      const arrowX = leX - 50, arrowY = leY;
      ctx.save();
      ctx.translate(arrowX, arrowY);
      ctx.rotate(-aoaRad);
      ctx.strokeStyle = 'rgba(251,191,36,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-arrowLen, 0); ctx.lineTo(arrowLen, 0); ctx.stroke();
      ctx.fillStyle = 'rgba(251,191,36,0.45)';
      ctx.beginPath(); ctx.moveTo(arrowLen, 0); ctx.lineTo(arrowLen - 6, -3); ctx.lineTo(arrowLen - 6, 3); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(48,54,61,0.35)';
    ctx.font = '500 8px Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Hess-Smith · AeroSAGE v8', W - 12, H - 10);

    animRef.current = requestAnimationFrame(draw);
  }, [coords, defects, analysisResult, viewMode, hoveredDefect, defectPending]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      sizeRef.current = { W: 0, H: 0 }; 
    });
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, []);

  const handleClick = useCallback((e) => {
    if (!activeDefectDraw || !coords?.length) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const PAD = 70;
    const W = rect.width, H = rect.height;
    const T = makeTransform(W, H, PAD, coords);
    const [x0] = T(0, 0), [x1] = T(1, 0);
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left - x0) / (x1 - x0)));
    onCanvasClick(frac);
  }, [activeDefectDraw, coords, onCanvasClick]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvasElement}
      onClick={handleClick}
      style={{ cursor: activeDefectDraw ? 'crosshair' : 'default', display: 'block' }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: ENHANCED 3D AIRFOIL CANVAS
// ═══════════════════════════════════════════════════════════════════════════════
function Airfoil3DCanvas({ coords, analysisResult }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const sizeRef = useRef({ W: 0, H: 0 });
  const stateRef = useRef({
    rotX: 0.32, rotY: 0.4, rotZ: 0,
    drag: false, lastX: 0, lastY: 0,
    autoRotate: true, autoAngle: 0.4,
    zoom: 1.0
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = canvas.parentElement;

    const onMouseDown = (e) => {
      stateRef.current.drag = true;
      stateRef.current.autoRotate = false;
      stateRef.current.lastX = e.clientX;
      stateRef.current.lastY = e.clientY;
    };
    const onMouseMove = (e) => {
      if (!stateRef.current.drag) return;
      const dx = e.clientX - stateRef.current.lastX;
      const dy = e.clientY - stateRef.current.lastY;
      stateRef.current.rotY += dx * 0.007;
      stateRef.current.rotX += dy * 0.004;
      stateRef.current.rotX = Math.max(-0.7, Math.min(0.85, stateRef.current.rotX));
      stateRef.current.lastX = e.clientX;
      stateRef.current.lastY = e.clientY;
    };
    const onMouseUp = () => { stateRef.current.drag = false; };
    const onWheel = (e) => {
      e.preventDefault();
      stateRef.current.zoom = Math.max(0.5, Math.min(2.2, stateRef.current.zoom - e.deltaY * 0.001));
    };
    const onDblClick = () => { stateRef.current.autoRotate = true; };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDblClick);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    const render = () => {
      const W = p.clientWidth, H = p.clientHeight;

      if (sizeRef.current.W !== W || sizeRef.current.H !== H) {
        sizeRef.current = { W, H };
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
      }
      const dpr = window.devicePixelRatio || 1;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = '#010409';
      ctx.fillRect(0, 0, W, H);
      drawEngineeringGrid(ctx, W, H);

      if (!coords || coords.length < 6) {
        ctx.fillStyle = '#4b5563';
        ctx.font = '500 13px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('3D view requires airfoil data', W / 2, H / 2);
        ctx.textBaseline = 'alphabetic';
        animRef.current = requestAnimationFrame(render);
        return;
      }

      if (stateRef.current.autoRotate) {
        stateRef.current.autoAngle += 0.005;
        stateRef.current.rotY = stateRef.current.autoAngle;
        stateRef.current.rotX = 0.28 + 0.06 * Math.sin(stateRef.current.autoAngle * 0.5);
      }

      const { rotX, rotY, zoom } = stateRef.current;
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);

      const SPAN = 0.55;
      const N_SPAN = 24;
      const TAPER = 0.72;
      const SWEEP_ANGLE = 0.22;
      const DIHEDRAL = 0.06;
      const TWIST = -0.04;

      const pm = analysisResult?.result?.panel_method;
      const hasCp = pm?.Cp && pm?.xm;
      const cpArr = hasCp ? pm.Cp : null;
      const xmArr = hasCp ? pm.xm : null;
      const cpMin = hasCp ? Math.min(...cpArr.filter(isFinite)) : -3;
      const cpMax = hasCp ? Math.max(...cpArr.filter(isFinite)) : 1;
      const cpRange = cpMax - cpMin || 1;

      const getCpColor = (x, isUpper, spanFrac) => {
        if (hasCp && xmArr) {
          let nearest = -1, minDist = Infinity;
          for (let k = 0; k < xmArr.length; k++) {
            const dist = Math.abs(xmArr[k] - x);
            if (dist < minDist) { minDist = dist; nearest = k; }
          }
          if (nearest >= 0) {
            const norm = Math.max(0, Math.min(1, (cpArr[nearest] - cpMin) / cpRange));
            let r, g, b;
            if (norm < 0.25) { r = 0; g = Math.round(norm / 0.25 * 100); b = 255; }
            else if (norm < 0.5) { r = 0; g = 100 + Math.round((norm - 0.25) / 0.25 * 155); b = Math.round((1 - (norm - 0.25) / 0.25) * 255); }
            else if (norm < 0.75) { r = Math.round((norm - 0.5) / 0.25 * 255); g = 255; b = 0; }
            else { r = 255; g = Math.round((1 - (norm - 0.75) / 0.25) * 200); b = 0; }
            const bright = 0.65 + 0.35 * (isUpper ? 1 : 0.6);
            return `rgba(${Math.round(r * bright)},${Math.round(g * bright)},${Math.round(b * bright)},0.95)`;
          }
        }
        const spanBright = 0.5 + 0.5 * spanFrac;
        if (isUpper) return `rgba(${Math.round(20 * spanBright)},${Math.round(80 + 80 * spanBright)},${Math.round(200 + 55 * spanBright)},0.92)`;
        return `rgba(${Math.round(10 * spanBright)},${Math.round(40 + 40 * spanBright)},${Math.round(100 + 80 * spanBright)},0.82)`;
      };

      const project = ([x, y, z]) => {
        x -= 0.5; z -= SPAN / 2;
        let tx = x * cosY + z * sinY;
        let tz = -x * sinY + z * cosY;
        let ty2 = y * cosX - tz * sinX;
        let tz2 = y * sinX + tz * cosX;
        const fov = 2.0;
        tz2 += 2.8 / zoom;
        const perspective = fov / tz2;
        const scale = Math.min(W, H) * zoom * 0.78;
        return [
          W / 2 + tx * scale * perspective,
          H / 2 - ty2 * scale * perspective,
          tz2
        ];
      };

      const slices = [];
      for (let si = 0; si <= N_SPAN; si++) {
        const sf = si / N_SPAN;
        const spanZ = sf * SPAN;
        const taper = 1 - (1 - TAPER) * sf;
        const sweep = spanZ * Math.tan(SWEEP_ANGLE);
        const dihedral = spanZ * Math.tan(DIHEDRAL);
        const twist = TWIST * sf;
        const cosTwist = Math.cos(twist), sinTwist = Math.sin(twist);
        const slice = coords.map(([cx, cy]) => {
          const xT = cx * taper + sweep;
          const yT = (cy * cosTwist - (cx - 0.5) * sinTwist) * taper + dihedral;
          return [xT, yT, spanZ];
        });
        slices.push({ pts: slice, sf, taper, sweep });
      }

      const panels = [];
      const chordStep = Math.max(1, Math.floor(coords.length / 80));

      for (let si = 0; si < N_SPAN; si++) {
        const s0 = slices[si], s1 = slices[si + 1];
        const sf = (si + 0.5) / N_SPAN;
        for (let ci = 0; ci < coords.length - chordStep; ci += chordStep) {
          const ci2 = Math.min(ci + chordStep, coords.length - 1);
          const p0 = project(s0.pts[ci]);
          const p1 = project(s0.pts[ci2]);
          const p2 = project(s1.pts[ci2]);
          const p3 = project(s1.pts[ci]);
          const avgZ = (p0[2] + p1[2] + p2[2] + p3[2]) / 4;
          const isUpper = coords[ci][1] >= -0.001;
          const xMid = (coords[ci][0] + coords[ci2][0]) / 2;
          panels.push({ pts: [p0, p1, p2, p3], z: avgZ, isUpper, sf, xMid });
        }
      }

      panels.sort((a, b) => b.z - a.z);

      panels.forEach(({ pts, isUpper, sf, xMid }) => {
        if (pts.some(p => !isFinite(p[0]) || !isFinite(p[1]))) return;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        pts.forEach(p => ctx.lineTo(p[0], p[1]));
        ctx.closePath();
        ctx.fillStyle = getCpColor(xMid, isUpper, sf);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,30,100,0.12)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      });

      // Leading edge highlight
      const lePoints = slices.map(s => {
        const minXi = s.pts.reduce((best, pt, i) => pt[0] < s.pts[best][0] ? i : best, 0);
        return project(s.pts[minXi]);
      });
      ctx.beginPath();
      lePoints.forEach((p, i) => {
        if (!isFinite(p[0]) || !isFinite(p[1])) return;
        i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
      });
      ctx.strokeStyle = '#00FFC2';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Trailing edge
      const tePoints = slices.map(s => {
        const maxXi = s.pts.reduce((best, pt, i) => pt[0] > s.pts[best][0] ? i : best, 0);
        return project(s.pts[maxXi]);
      });
      ctx.beginPath();
      tePoints.forEach((p, i) => {
        if (!isFinite(p[0]) || !isFinite(p[1])) return;
        i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
      });
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Root & tip caps
      [0, N_SPAN].forEach((si, idx) => {
        const slice = slices[si];
        ctx.beginPath();
        slice.pts.forEach((pt, i) => {
          const [ppx_, ppy_] = project(pt);
          if (!isFinite(ppx_) || !isFinite(ppy_)) return;
          i === 0 ? ctx.moveTo(ppx_, ppy_) : ctx.lineTo(ppx_, ppy_);
        });
        ctx.closePath();
        ctx.fillStyle = idx === 0 ? 'rgba(0,50,130,0.55)' : 'rgba(0,30,80,0.35)';
        ctx.fill();
        ctx.strokeStyle = idx === 0 ? 'rgba(0,122,255,0.5)' : 'rgba(0,100,200,0.25)';
        ctx.lineWidth = idx === 0 ? 1.2 : 0.6;
        ctx.stroke();
      });

      // Cp colorbar
      if (hasCp) {
        const cbX = W - 28, cbY = H * 0.2, cbH = H * 0.55, cbW = 10;
        const barGrad = ctx.createLinearGradient(0, cbY, 0, cbY + cbH);
        barGrad.addColorStop(0, 'rgb(255,0,0)');
        barGrad.addColorStop(0.33, 'rgb(255,255,0)');
        barGrad.addColorStop(0.66, 'rgb(0,255,100)');
        barGrad.addColorStop(1, 'rgb(0,0,255)');
        ctx.fillStyle = barGrad;
        ctx.fillRect(fpx(cbX), fpx(cbY), cbW, Math.round(cbH));
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(fpx(cbX) + 0.5, fpx(cbY) + 0.5, cbW - 1, Math.round(cbH) - 1);
        ctx.fillStyle = '#6B7280'; ctx.font = '8px Consolas'; ctx.textAlign = 'right';
        ctx.fillText(`${cpMin.toFixed(2)}`, cbX - 2, cbY + cbH + 4);
        ctx.fillText(`${cpMax.toFixed(2)}`, cbX - 2, cbY + 4);
        ctx.fillText('Cp', cbX - 2, cbY + cbH / 2);
      }

      // HUD
      ctx.fillStyle = 'rgba(0,255,194,0.6)';
      ctx.font = 'bold 9px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('3D INDUSTRIAL VIEW', 12, 18);
      ctx.fillStyle = '#4b5563';
      ctx.font = '8px Consolas';
      ctx.fillText(stateRef.current.autoRotate
        ? 'DRAG · SCROLL TO ZOOM · DBL-CLICK TO AUTO'
        : `β=${(rotY * 57.3).toFixed(1)}° φ=${(rotX * 57.3).toFixed(1)}° ×${stateRef.current.zoom.toFixed(1)}`, 12, 30);
      ctx.fillStyle = '#374151'; ctx.font = '7.5px Consolas';
      ctx.fillText(`TAPER ${TAPER.toFixed(2)} · SWEEP ${(SWEEP_ANGLE * 57.3).toFixed(1)}° · DIHEDRAL ${(DIHEDRAL * 57.3).toFixed(1)}°`, 12, H - 10);

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);

    const ro = new ResizeObserver(() => { sizeRef.current = { W: 0, H: 0 }; });
    ro.observe(p);

    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDblClick);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      ro.disconnect();
    };
  }, [coords, analysisResult]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas3D}
      style={{ cursor: 'grab', display: 'block' }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Cp CANVAS
// ═══════════════════════════════════════════════════════════════════════════════
function CpCanvas({ analysisResult }) {
  const canvasRef = useRef(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = canvas.parentElement;
    if (!p) return;

    const W = p.clientWidth, H = p.clientHeight;
    const { ctx } = setupHiDPICanvas(canvas, W, H);

    ctx.fillStyle = '#010409';
    ctx.fillRect(0, 0, W, H);
    drawEngineeringGrid(ctx, W, H);

    const pm = analysisResult?.result?.panel_method;
    if (!pm?.Cp || !pm?.xm) {
      ctx.fillStyle = '#4b5563';
      ctx.font = '600 13px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Run analysis to see Cp distribution', W / 2, H / 2);
      ctx.textBaseline = 'alphabetic';
      return;
    }

    const PAD = { top: 40, right: 32, bottom: 52, left: 68 };
    const dW = W - PAD.left - PAD.right, dH = H - PAD.top - PAD.bottom;
    const { Cp, xm, ym } = pm;
    const valid = Cp.filter(v => isFinite(v));
    const cpMax = Math.max(...valid), cpMin = Math.min(...valid);
    const cpR = cpMax - cpMin || 1;
    const toC = (x, cp) => [PAD.left + x * dW, PAD.top + (cpMax - cp) / cpR * dH];

    // Grid lines
    ctx.strokeStyle = 'rgba(48,54,61,0.55)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const gy = px(PAD.top + (i / 5) * dH);
      ctx.beginPath(); ctx.moveTo(PAD.left, gy); ctx.lineTo(W - PAD.right, gy); ctx.stroke();
      ctx.fillStyle = '#6B7280';
      ctx.font = '600 10px Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.fillText((cpMax - (i / 5) * cpR).toFixed(3), PAD.left - 8, gy + 4);
    }
    for (let i = 0; i <= 10; i++) {
      const gx = px(PAD.left + (i / 10) * dW);
      ctx.beginPath(); ctx.moveTo(gx, PAD.top); ctx.lineTo(gx, H - PAD.bottom); ctx.stroke();
      ctx.fillStyle = '#6B7280';
      ctx.font = '10px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${i * 10}%`, gx, H - PAD.bottom + 17);
    }

    // Cp=0 reference line
    const [, y0] = toC(0, 0);
    const y0s = px(y0);
    ctx.beginPath(); ctx.moveTo(PAD.left, y0s); ctx.lineTo(W - PAD.right, y0s);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#4b5563'; ctx.font = '10px Consolas'; ctx.textAlign = 'right';
    ctx.fillText('Cp=0', PAD.left - 8, y0 + 4);

    const upper = [], lower = [];
    for (let i = 0; i < xm.length; i++) {
      if (isFinite(xm[i]) && isFinite(Cp[i]))
        (ym[i] >= 0 ? upper : lower).push([xm[i], Cp[i]]);
    }
    upper.sort((a, b) => a[0] - b[0]);
    lower.sort((a, b) => a[0] - b[0]);

    const drawLine = (pts, color, lw, dash = []) => {
      if (pts.length < 2) return;
      ctx.beginPath(); ctx.setLineDash(dash);
      pts.forEach(([x, cp], i) => {
        const [ppx_, ppy_] = toC(x, cp);
        i === 0 ? ctx.moveTo(ppx_, ppy_) : ctx.lineTo(ppx_, ppy_);
      });
      ctx.strokeStyle = color; ctx.lineWidth = lw;
      ctx.stroke(); ctx.setLineDash([]);
    };

    // Area fill between upper & lower
    if (upper.length && lower.length) {
      ctx.beginPath();
      upper.forEach(([x, cp], i) => { const [ppx_, ppy_] = toC(x, cp); i === 0 ? ctx.moveTo(ppx_, ppy_) : ctx.lineTo(ppx_, ppy_); });
      [...lower].reverse().forEach(([x, cp]) => { const [ppx_, ppy_] = toC(x, cp); ctx.lineTo(ppx_, ppy_); });
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,122,255,0.04)'; ctx.fill();
    }

    // Glow fill under upper surface
    if (upper.length > 1) {
      const ugGrad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
      ugGrad.addColorStop(0, 'rgba(0,122,255,0.10)');
      ugGrad.addColorStop(1, 'rgba(0,122,255,0)');
      ctx.beginPath();
      upper.forEach(([x, cp], i) => { const [ppx_, ppy_] = toC(x, cp); i === 0 ? ctx.moveTo(ppx_, ppy_) : ctx.lineTo(ppx_, ppy_); });
      ctx.lineTo(toC(upper[upper.length - 1][0], 0)[0], y0);
      ctx.lineTo(toC(upper[0][0], 0)[0], y0);
      ctx.closePath();
      ctx.fillStyle = ugGrad; ctx.fill();
    }

    // Main lines
    drawLine(upper, '#007AFF', 2.5);
    drawLine(lower, '#00FFC2', 2, [5, 3]);

    // Clean baseline comparison
    if (analysisResult?.clean_result?.panel_method) {
      const cpm = analysisResult.clean_result.panel_method;
      if (cpm.xm && cpm.Cp && cpm.ym) {
        const cu = [], cl = [];
        for (let i = 0; i < cpm.xm.length; i++) {
          if (isFinite(cpm.xm[i]) && isFinite(cpm.Cp[i]))
            (cpm.ym[i] >= 0 ? cu : cl).push([cpm.xm[i], cpm.Cp[i]]);
        }
        cu.sort((a, b) => a[0] - b[0]); cl.sort((a, b) => a[0] - b[0]);
        drawLine(cu, 'rgba(0,122,255,0.28)', 1.2, [4, 3]);
        drawLine(cl, 'rgba(0,255,194,0.20)', 1, [4, 3]);
      }
    }

    // Transition markers
    const bl = analysisResult?.result?.boundary_layer;
    if (bl) {
      [[bl.transition_upper, `Tr↑ ${(bl.transition_upper * 100).toFixed(1)}%`, '#34D399'],
       [bl.transition_lower, `Tr↓ ${(bl.transition_lower * 100).toFixed(1)}%`, '#FB923C']].forEach(([xTr, lbl, col]) => {
         if (!isFinite(xTr) || xTr >= 1) return;
         const [txVal] = toC(xTr, 0);
         const txS = px(txVal);
         ctx.save();
         ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
         ctx.beginPath(); ctx.moveTo(txS, PAD.top); ctx.lineTo(txS, H - PAD.bottom); ctx.stroke();
         ctx.setLineDash([]);
         const bw = 52, bh = 16;
         const bx = fpx(txVal - bw / 2);
         ctx.fillStyle = col + '18';
         ctx.fillRect(bx, PAD.top + 4, bw, bh);
         ctx.strokeStyle = col + '50'; ctx.lineWidth = 1;
         ctx.strokeRect(bx + 0.5, PAD.top + 4.5, bw - 1, bh - 1);
         ctx.fillStyle = col; ctx.font = 'bold 9px Consolas, monospace'; ctx.textAlign = 'center';
         ctx.fillText(lbl, txVal, PAD.top + 15);
         ctx.restore();
       });
    }

    // Suction peak marker
    const mi = Cp.reduce((best, v, i) => (isFinite(v) && v < (Cp[best] ?? Infinity)) ? i : best, 0);
    const [spx_, spy_] = toC(xm[mi], Cp[mi]);
    ctx.beginPath(); ctx.arc(fpx(spx_), fpx(spy_), 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(248,113,113,0.3)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(fpx(spx_), fpx(spy_), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#F87171'; ctx.fill();
    ctx.fillStyle = '#F87171'; ctx.font = 'bold 10px Consolas, monospace'; ctx.textAlign = 'left';
    ctx.fillText(`Cp_min = ${Cp[mi].toFixed(4)}`, spx_ + 10, spy_ + 4);

    // Axes labels
    ctx.fillStyle = '#8b949e'; ctx.font = '600 11px Consolas, monospace'; ctx.textAlign = 'center';
    ctx.fillText('x/c', PAD.left + dW / 2, H - 8);
    ctx.save(); ctx.translate(16, PAD.top + dH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('−Cp', 0, 0); ctx.restore();

    ctx.fillStyle = '#4b5563'; ctx.font = '600 9px Consolas, monospace'; ctx.textAlign = 'right';
    ctx.fillText('PRESSURE COEFFICIENT DISTRIBUTION', W - PAD.right, PAD.top - 10);
  }, [analysisResult]);

  useEffect(() => { render(); }, [render]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => render());
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [render]);

  return <canvas ref={canvasRef} className={styles.cpCanvas} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POLAR CHART CANVAS
// ═══════════════════════════════════════════════════════════════════════════════
function PolarChartCanvas({ polarData, xKey, yKey, xlabel, ylabel, color, color2 }) {
  const canvasRef = useRef(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = canvas.parentElement;
    if (!p) return;

    const W = p.clientWidth, H = p.clientHeight;
    const { ctx } = setupHiDPICanvas(canvas, W, H);

    ctx.fillStyle = '#010409'; ctx.fillRect(0, 0, W, H);
    drawEngineeringGrid(ctx, W, H);

    if (!polarData?.[xKey] || polarData[xKey].length < 2) return;

    const xArr = polarData[xKey], yArr = polarData[yKey];
    const y2Arr = (yKey === 'Cl' && polarData.Cl_clean) ? polarData.Cl_clean :
      (yKey === 'Cd' && polarData.Cd_clean) ? polarData.Cd_clean : null;

    const PAD = { top: 28, right: 24, bottom: 42, left: 62 };
    const dW = W - PAD.left - PAD.right, dH = H - PAD.top - PAD.bottom;

    const vX = xArr.filter(v => isFinite(v)), vY = yArr.filter(v => isFinite(v));
    if (!vX.length || !vY.length) return;

    const xMin = Math.min(...vX), xMax = Math.max(...vX);
    const yMin = Math.min(...vY), yMax = Math.max(...vY);
    const xR = xMax - xMin || 1, yR = yMax - yMin || 1;
    const xPad = xR * 0.06, yPad = yR * 0.08;

    const toC = (x, y) => [
      PAD.left + ((x - (xMin - xPad)) / (xR + xPad * 2)) * dW,
      PAD.top + dH - ((y - (yMin - yPad)) / (yR + yPad * 2)) * dH
    ];

    // Grid
    ctx.strokeStyle = 'rgba(48,54,61,0.55)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const gy = px(PAD.top + (i / 4) * dH);
      ctx.beginPath(); ctx.moveTo(PAD.left, gy); ctx.lineTo(W - PAD.right, gy); ctx.stroke();
      const v = (yMax + yPad) - (i / 4) * (yR + yPad * 2);
      ctx.fillStyle = '#6B7280'; ctx.font = '9.5px Consolas, monospace'; ctx.textAlign = 'right';
      ctx.fillText(v.toFixed(yR < 0.1 ? 4 : 3), PAD.left - 6, gy + 4);
    }
    for (let i = 0; i <= 5; i++) {
      const gx = px(PAD.left + (i / 5) * dW);
      ctx.beginPath(); ctx.moveTo(gx, PAD.top); ctx.lineTo(gx, H - PAD.bottom); ctx.stroke();
      const v = (xMin - xPad) + (i / 5) * (xR + xPad * 2);
      ctx.fillStyle = '#6B7280'; ctx.font = '9.5px Consolas, monospace'; ctx.textAlign = 'center';
      ctx.fillText(v.toFixed(xR < 5 ? 1 : 0), gx, H - PAD.bottom + 16);
    }

    // Zero lines
    if (xMin <= 0 && xMax >= 0) {
      const [zx] = toC(0, yMin);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px(zx), PAD.top); ctx.lineTo(px(zx), H - PAD.bottom); ctx.stroke();
    }
    if (yMin <= 0 && yMax >= 0) {
      const [, zy] = toC(xMin, 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD.left, px(zy)); ctx.lineTo(W - PAD.right, px(zy)); ctx.stroke();
    }

    // Clean baseline dashed
    if (y2Arr?.length === xArr.length) {
      ctx.beginPath(); let s = false;
      for (let i = 0; i < xArr.length; i++) {
        if (!isFinite(xArr[i]) || !isFinite(y2Arr[i])) continue;
        const [ppx_, ppy_] = toC(xArr[i], y2Arr[i]);
        if (!s) { ctx.moveTo(ppx_, ppy_); s = true; } else ctx.lineTo(ppx_, ppy_);
      }
      ctx.strokeStyle = color2 || 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.2; ctx.setLineDash([5, 3]); ctx.stroke(); ctx.setLineDash([]);
    }

    // Area fill
    ctx.beginPath(); let sf = false;
    for (let i = 0; i < xArr.length; i++) {
      if (!isFinite(xArr[i]) || !isFinite(yArr[i])) continue;
      const [ppx_, ppy_] = toC(xArr[i], yArr[i]);
      if (!sf) { ctx.moveTo(ppx_, ppy_); sf = true; } else ctx.lineTo(ppx_, ppy_);
    }
    const lastValid = xArr.map((v, i) => ({ v, i })).filter(({ v }) => isFinite(v)).pop();
    const firstValid = xArr.map((v, i) => ({ v, i })).filter(({ v }) => isFinite(v))[0];
    if (lastValid && firstValid) {
      const [lxVal] = toC(xArr[lastValid.i], yArr[lastValid.i]);
      const [fxVal] = toC(xArr[firstValid.i], yArr[firstValid.i]);
      ctx.lineTo(lxVal, H - PAD.bottom);
      ctx.lineTo(fxVal, H - PAD.bottom);
      ctx.closePath();
      const aGrad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
      aGrad.addColorStop(0, (color || '#007AFF') + '22');
      aGrad.addColorStop(1, (color || '#007AFF') + '00');
      ctx.fillStyle = aGrad; ctx.fill();
    }

    // Main line
    ctx.beginPath(); let s2 = false;
    for (let i = 0; i < xArr.length; i++) {
      if (!isFinite(xArr[i]) || !isFinite(yArr[i])) continue;
      const [ppx_, ppy_] = toC(xArr[i], yArr[i]);
      if (!s2) { ctx.moveTo(ppx_, ppy_); s2 = true; } else ctx.lineTo(ppx_, ppy_);
    }
    ctx.strokeStyle = color || '#007AFF'; ctx.lineWidth = 2.5;
    ctx.stroke();

    // Data points
    for (let i = 0; i < xArr.length; i++) {
      if (!isFinite(xArr[i]) || !isFinite(yArr[i])) continue;
      const [ppx_, ppy_] = toC(xArr[i], yArr[i]);
      ctx.beginPath(); ctx.arc(fpx(ppx_), fpx(ppy_), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color || '#007AFF';
      ctx.fill();
    }

    // Axes labels
    ctx.fillStyle = '#8b949e'; ctx.font = '600 11px Consolas, monospace'; ctx.textAlign = 'center';
    ctx.fillText(xlabel, PAD.left + dW / 2, H - 6);
    ctx.save(); ctx.translate(14, PAD.top + dH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(ylabel, 0, 0); ctx.restore();
  }, [polarData, xKey, yKey, xlabel, ylabel, color, color2]);

  useEffect(() => { render(); }, [render]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => render());
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [render]);

  return <canvas ref={canvasRef} className={styles.polarCanvas} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BL CHART CANVAS
// ═══════════════════════════════════════════════════════════════════════════════
function BLChartCanvas({ blData, surface, field, fieldLabel, color }) {
  const canvasRef = useRef(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = canvas.parentElement;
    if (!p) return;

    const W = p.clientWidth, H = p.clientHeight;
    const { ctx } = setupHiDPICanvas(canvas, W, H);

    ctx.fillStyle = '#010409'; ctx.fillRect(0, 0, W, H);
    drawEngineeringGrid(ctx, W, H);

    const surf = blData?.surfaces?.[surface];
    if (!surf) {
      ctx.fillStyle = '#4b5563'; ctx.font = '11px Consolas, monospace'; ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`No ${surface} surface data`, W / 2, H / 2);
      ctx.textBaseline = 'alphabetic';
      return;
    }
    const x = surf.x, y = surf[field];
    if (!x || !y) return;

    const PAD = { top: 28, right: 20, bottom: 42, left: 64 };
    const dW = W - PAD.left - PAD.right, dH = H - PAD.top - PAD.bottom;
    const vY = y.filter(v => isFinite(v) && v !== 0);
    if (!vY.length) return;
    const yMax = Math.max(...vY) * 1.18 || 1;
    const toC = (xi, yi) => [PAD.left + xi * dW, PAD.top + dH - (yi / yMax) * dH];

    // Grid
    ctx.strokeStyle = 'rgba(48,54,61,0.55)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const gy = px(PAD.top + (i / 4) * dH);
      ctx.beginPath(); ctx.moveTo(PAD.left, gy); ctx.lineTo(W - PAD.right, gy); ctx.stroke();
      const v = yMax * (1 - i / 4);
      ctx.fillStyle = '#6B7280'; ctx.font = '9px Consolas, monospace'; ctx.textAlign = 'right';
      ctx.fillText(v < 0.001 ? v.toFixed(6) : v.toFixed(4), PAD.left - 5, gy + 4);
    }
    for (let i = 0; i <= 5; i++) {
      const gx = px(PAD.left + (i / 5) * dW);
      ctx.beginPath(); ctx.moveTo(gx, PAD.top); ctx.lineTo(gx, H - PAD.bottom); ctx.stroke();
      ctx.fillStyle = '#6B7280'; ctx.font = '9px Consolas, monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${i * 20}%`, gx, H - PAD.bottom + 15);
    }

    // Lam/turb region fill
    const lam = surf.laminar;
    if (lam) {
      let ss = 0, sl = lam[0];
      for (let i = 1; i <= x.length; i++) {
        const isEnd = i === x.length, il = isEnd ? sl : lam[i];
        if (il !== sl || isEnd) {
          ctx.beginPath(); let first = true;
          for (let k = ss; k < Math.min(i, x.length); k++) {
            if (!isFinite(x[k]) || !isFinite(y[k])) continue;
            const [ppx_, ppy_] = toC(x[k], y[k]);
            if (first) { ctx.moveTo(ppx_, ppy_); first = false; } else ctx.lineTo(ppx_, ppy_);
          }
          const ek = Math.min(i - 1, x.length - 1);
          if (isFinite(x[ek])) { ctx.lineTo(toC(x[ek], 0)[0], PAD.top + dH); }
          if (isFinite(x[ss])) { ctx.lineTo(toC(x[ss], 0)[0], PAD.top + dH); }
          ctx.closePath();
          ctx.fillStyle = sl ? 'rgba(0,122,255,0.08)' : 'rgba(251,146,60,0.08)'; ctx.fill();
          ss = i; sl = il;
        }
      }
    }

    // Area fill
    ctx.beginPath(); let firstPt = true;
    for (let i = 0; i < x.length; i++) {
      if (!isFinite(x[i]) || !isFinite(y[i])) continue;
      const [ppx_, ppy_] = toC(x[i], y[i]);
      if (firstPt) { ctx.moveTo(ppx_, ppy_); firstPt = false; } else ctx.lineTo(ppx_, ppy_);
    }
    const aGrad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
    aGrad.addColorStop(0, (color || '#007AFF') + '28');
    aGrad.addColorStop(1, (color || '#007AFF') + '00');
    ctx.lineTo(PAD.left + dW, PAD.top + dH);
    ctx.lineTo(PAD.left, PAD.top + dH);
    ctx.closePath();
    ctx.fillStyle = aGrad; ctx.fill();

    // Main line
    const lineGrad = ctx.createLinearGradient(PAD.left, 0, W - PAD.right, 0);
    lineGrad.addColorStop(0, color || '#007AFF');
    lineGrad.addColorStop(1, 'rgba(0,255,194,0.8)');
    ctx.beginPath(); let s2 = false;
    for (let i = 0; i < x.length; i++) {
      if (!isFinite(x[i]) || !isFinite(y[i])) continue;
      const [ppx_, ppy_] = toC(x[i], y[i]);
      if (!s2) { ctx.moveTo(ppx_, ppy_); s2 = true; } else ctx.lineTo(ppx_, ppy_);
    }
    ctx.strokeStyle = lineGrad; ctx.lineWidth = 2;
    ctx.stroke();

    // Transition marker
    if (surf.transition_x !== undefined && surf.transition_x < 1) {
      const [txVal] = toC(surf.transition_x, 0);
      const txS = px(txVal);
      ctx.save();
      ctx.strokeStyle = '#34D399'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(txS, PAD.top); ctx.lineTo(txS, H - PAD.bottom); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#34D399'; ctx.font = 'bold 9px Consolas, monospace'; ctx.textAlign = 'left';
      ctx.fillText(`Tr ${(surf.transition_x * 100).toFixed(1)}%`, txVal + 3, PAD.top + 14);
      ctx.restore();
    }

    ctx.fillStyle = '#8b949e'; ctx.font = '600 11px Consolas, monospace'; ctx.textAlign = 'center';
    ctx.fillText('x/c', PAD.left + dW / 2, H - 6);
    ctx.save(); ctx.translate(14, PAD.top + dH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(fieldLabel, 0, 0); ctx.restore();
    ctx.fillStyle = '#4b5563'; ctx.font = '600 10px Consolas, monospace'; ctx.textAlign = 'right';
    ctx.fillText(surface.toUpperCase(), W - PAD.right, PAD.top + 14);
  }, [blData, surface, field, fieldLabel, color]);

  useEffect(() => { render(); }, [render]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => render());
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [render]);

  return <canvas ref={canvasRef} className={styles.blCanvas} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SENSITIVITY CANVAS
// ═══════════════════════════════════════════════════════════════════════════════
function SensitivityCanvas({ sensData }) {
  const canvasRef = useRef(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = canvas.parentElement;
    if (!p) return;

    const W = p.clientWidth, H = p.clientHeight;
    const { ctx } = setupHiDPICanvas(canvas, W, H);

    ctx.fillStyle = '#010409'; ctx.fillRect(0, 0, W, H);
    drawEngineeringGrid(ctx, W, H);

    const zones = sensData?.zones;
    if (!zones?.length) {
      ctx.fillStyle = '#4b5563'; ctx.font = '12px Consolas, monospace'; ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No sensitivity data', W / 2, H / 2);
      ctx.textBaseline = 'alphabetic';
      return;
    }

    const PAD = { top: 36, right: 24, bottom: 46, left: 22 };
    const dW = W - PAD.left - PAD.right, dH = H - PAD.top - PAD.bottom;
    const bW = dW / zones.length;
    const critColors = { CRITICAL: '#F87171', HIGH: '#FBBF24', MODERATE: '#34D399', LOW: '#1e3a5f' };

    zones.forEach((z, i) => {
      const bH = (z.sensitivity_norm || 0) * dH;
      const bX = fpx(PAD.left + i * bW);
      const bY = fpx(PAD.top + dH - bH);
      const bWr = Math.max(1, Math.round(bW - 1));
      const col = critColors[z.criticality] || '#1e3a5f';
      const g = ctx.createLinearGradient(0, bY, 0, bY + bH);
      g.addColorStop(0, col);
      g.addColorStop(1, col + '33');
      ctx.fillStyle = g;
      ctx.fillRect(bX, bY, bWr, Math.round(bH));

      if (z.criticality === 'CRITICAL') {
        ctx.fillStyle = '#F87171';
        ctx.fillRect(bX, bY, bWr, 2);
      }

      if (i % 4 === 0 || i === zones.length - 1) {
        ctx.fillStyle = '#6B7280'; ctx.font = '8.5px Consolas, monospace'; ctx.textAlign = 'center';
        ctx.fillText(`${((z.x_mid || 0) * 100).toFixed(0)}%`, bX + bWr / 2, H - PAD.bottom + 16);
      }
    });

    ctx.strokeStyle = 'rgba(48,54,61,0.45)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const gy = px(PAD.top + (i / 3) * dH);
      ctx.beginPath(); ctx.moveTo(PAD.left, gy); ctx.lineTo(W - PAD.right, gy); ctx.stroke();
      ctx.fillStyle = '#4b5563'; ctx.font = '8.5px Consolas, monospace'; ctx.textAlign = 'left';
      ctx.fillText(`${((1 - i / 3) * 100).toFixed(0)}%`, PAD.left + 2, gy + 4);
    }

    ctx.fillStyle = '#8b949e'; ctx.font = '600 10px Consolas, monospace'; ctx.textAlign = 'center';
    ctx.fillText(`d${(sensData.target || '?').toUpperCase()}/dRoughness — Chord Zone Sensitivity`, W / 2, PAD.top - 12);
    ctx.fillStyle = '#6B7280'; ctx.font = '9px Consolas'; ctx.textAlign = 'left';
    ctx.fillText('LE', PAD.left, H - 4);
    ctx.textAlign = 'right';
    ctx.fillText('TE', W - PAD.right, H - 4);
  }, [sensData]);

  useEffect(() => { render(); }, [render]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => render());
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [render]);

  return <canvas ref={canvasRef} className={styles.sensCanvas} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIBRARY MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function LibraryModal({ onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await apiGet(`/airfoils/search?q=${encodeURIComponent(query)}`);
        setResults(Array.isArray(data) ? data : []);
      } catch { setResults([]); }
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.libModal} onClick={e => e.stopPropagation()}>
        <div className={styles.libModalHeader}>
          <div className={styles.libModalTitle}><FiBookOpen size={18} color="#007AFF" /> Airfoil Library</div>
          <button className={styles.libModalClose} onClick={onClose}><FiX size={18} /></button>
        </div>
        <div className={styles.libSearchBox}>
          <FiSearch size={16} color="#6B7280" />
          <input className={styles.libSearchInput} type="text"
            placeholder="Search NACA, FX, CLARK, GOE, RAE…"
            value={query} onChange={e => setQuery(e.target.value)} autoFocus />
        </div>
        <div className={styles.libResults}>
          {loading && <div className={styles.libLoading}><div className={styles.loadingSpinnerLarge} style={{ marginRight: 10 }} />Searching library…</div>}
          {!loading && query.length >= 2 && results.length === 0 && <div className={styles.libEmpty}>No airfoils found for "{query}"</div>}
          {!loading && query.length < 2 && <div className={styles.libEmpty}>Type at least 2 characters to search the database</div>}
          {results.map((af, i) => (
            <div key={af.id || af.name || i} className={styles.libResultItem} onClick={() => onSelect(af.name)}>
              <div className={styles.libResultLeft}>
                <span className={styles.libResultName}>{af.name}</span>
                {af.description && <span className={styles.libResultDesc}>{af.description}</span>}
              </div>
              <span className={styles.libResultTag}>Library</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORACLE PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function OraclePanel({ messages }) {
  if (!messages?.length) {
    return (
      <div className={styles.oracleEmpty}>
        <div className={styles.oracleEmptyDot} />
        Awaiting analysis…
      </div>
    );
  }
  const sorted = [...messages].sort((a, b) => {
    const o = { WARNING: 0, CAUTION: 1, ADVISORY: 2, INFO: 3 };
    return (o[a.level] ?? 4) - (o[b.level] ?? 4);
  });
  return (
    <div className={styles.oracleList}>
      {sorted.map((msg, i) => {
        const col = ORACLE_COLORS[msg.level] || '#fff';
        return (
          <div key={i} className={styles.oracleItem} style={{ borderLeftColor: col }}>
            <div className={styles.oracleItemHeader}>
              <span className={styles.oracleLevelBadge} style={{ color: col }}>{ORACLE_ICONS[msg.level]} {msg.level}</span>
              <span className={styles.oracleCodeBadge}>{msg.code}</span>
            </div>
            <div className={styles.oracleTitle}>{msg.title}</div>
            <div className={styles.oracleMessage}>{msg.message}</div>
            <div className={styles.oracleRecommendation}>{msg.recommendation}</div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELTA PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function DeltaPanel({ deltas, integrated }) {
  if (!integrated) return <div className={styles.deltaEmpty}>Run analysis to see aerodynamic coefficients</div>;
  const items = [
    { key: 'Cl', label: 'CL', val: integrated.Cl, dKey: 'delta_Cl', pKey: 'delta_Cl_pct', dec: 5 },
    { key: 'Cd_total', label: 'CD', val: integrated.Cd_total, dKey: 'delta_Cd', pKey: 'delta_Cd_pct', dec: 6, isCD: true },
    { key: 'Cm', label: 'CM', val: integrated.Cm, dKey: 'delta_Cm', dec: 5 },
    { key: 'L_D', label: 'L/D', val: integrated.L_D, dKey: 'delta_LD', dec: 3 },
    { key: 'Cd_pressure', label: 'CD_pressure', val: integrated.Cd_pressure, dec: 6, isCD: true },
    { key: 'Cd_friction', label: 'CD_friction', val: integrated.Cd_friction, dec: 6, isCD: true },
    { key: 'transition_upper', label: 'Tr↑ x/c', val: integrated.transition_upper, dec: 4, col: '#34D399' },
    { key: 'transition_lower', label: 'Tr↓ x/c', val: integrated.transition_lower, dec: 4, col: '#FB923C' },
  ];
  return (
    <div className={styles.deltaGrid}>
      {items.map(item => {
        const dv = deltas?.[item.dKey];
        const pct = deltas?.[item.pKey];
        const isNeg = dv !== undefined && dv < 0;
        const cardCol = item.col || '#00FFC2';
        const displayVal = item.val !== undefined && item.val !== null && isFinite(item.val)
          ? Number(item.val).toFixed(item.dec)
          : '—';
        return (
          <div key={item.key} className={styles.deltaCard}>
            <div className={styles.deltaCardLabel}>{item.label}</div>
            <div className={styles.deltaCardValue}
              style={{ color: dv !== undefined ? (isNeg ? '#F87171' : '#34D399') : cardCol, fontSize: '0.9rem' }}>
              {displayVal}
            </div>
            {dv !== undefined && (
              <div className={styles.deltaCardPct} style={{ color: isNeg ? '#F87171' : '#34D399' }}>
                {dv > 0 ? '+' : ''}{Number(dv).toFixed(item.dec)}
                {pct !== undefined ? ` (${pct > 0 ? '+' : ''}${Number(pct).toFixed(1)}%)` : ''}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STALL HUD
// ═══════════════════════════════════════════════════════════════════════════════
function StallHUD({ alpha, defects, analysisResult }) {
  const stallAlpha = analysisResult?.result?.integrated?.stall_alpha_est ?? Math.max(8, 15 - defects.length * 1.2);
  const margin = stallAlpha - alpha;
  const pct = Math.min(100, Math.max(0, (alpha / stallAlpha) * 100));
  const col = pct > 85 ? '#F87171' : pct > 60 ? '#FBBF24' : '#34D399';
  const hasWarn = analysisResult?.oracle?.some(m => m.code === 'STALL_IMMINENT' || m.code === 'LOW_STALL_MARGIN');
  return (
    <div className={styles.stallHUD}>
      <div className={styles.stallTitle}>STALL PROXIMITY MONITOR</div>
      <div className={styles.stallBarTrack}>
        <div className={styles.stallBarFill} style={{ width: `${pct}%`, background: col, boxShadow: `0 0 8px ${col}50` }} />
      </div>
      <div className={styles.stallStats}>
        <span style={{ color: col, fontWeight: 700 }}>α = {alpha.toFixed(1)}°</span>
        <span style={{ fontWeight: 700 }}>Stall ≈ {stallAlpha.toFixed(1)}°</span>
        <span style={{ color: margin < 3 ? '#F87171' : '#34D399', fontWeight: 700 }}>Margin: {margin.toFixed(1)}°</span>
      </div>
      {hasWarn && <div className={styles.stallAlert}>⚠ STALL WARNING — Reduce AoA immediately</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GEOMETRY PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function GeometryPanel({ geom }) {
  if (!geom) return null;
  const items = [
    { label: 't/c max', val: geom.max_thickness !== undefined ? `${Number(geom.max_thickness * 100).toFixed(3)}%` : '—' },
    { label: 'at x/c', val: geom.max_thickness_x !== undefined ? Number(geom.max_thickness_x).toFixed(4) : '—' },
    { label: 'Camber', val: geom.max_camber !== undefined ? `${Number(geom.max_camber * 100).toFixed(4)}%` : '—' },
    { label: 'at x/c', val: geom.max_camber_x !== undefined ? Number(geom.max_camber_x).toFixed(4) : '—' },
    { label: 'LE radius', val: geom.le_radius !== undefined ? `${Number(geom.le_radius * 100).toFixed(5)}%c` : '—' },
    { label: 'TE angle', val: geom.te_angle_deg !== undefined ? `${Number(geom.te_angle_deg).toFixed(3)}°` : '—' },
    { label: 'Area', val: geom.area !== undefined ? Number(geom.area).toFixed(6) : '—' },
    { label: 'N pts', val: geom.n_points ?? '—' },
  ];
  return (
    <div className={styles.geomGrid}>
      {items.map((item, i) => (
        <div key={i} className={styles.geomItem}>
          <span className={styles.geomLabel}>{item.label}</span>
          <span className={styles.geomValue}>{item.val}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDF GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════
function generatePDF({ airfoilName, alpha, reynolds, mach, nCrit, intg, defects, analysisResult, polarResult, sensResult, elapsedMs }) {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();

  const drawBG = () => {
    pdf.setFillColor(11, 15, 20); pdf.rect(0, 0, pw, ph, 'F');
    pdf.setDrawColor(22, 27, 34); pdf.setLineWidth(0.1);
    for (let i = 0; i < pw; i += 8) pdf.line(i, 0, i, ph);
    for (let i = 0; i < ph; i += 8) pdf.line(0, i, pw, i);
  };

  const drawHeader = (title, sub) => {
    pdf.setFillColor(13, 17, 23); pdf.rect(0, 0, pw, 56, 'F');
    pdf.setDrawColor(0, 122, 255); pdf.setLineWidth(0.6); pdf.line(0, 56, pw, 56);
    pdf.setTextColor(0, 122, 255); pdf.setFontSize(22); pdf.setFont('helvetica', 'bold');
    pdf.text('AeroSAGE', 15, 22);
    pdf.setTextColor(0, 255, 194); pdf.setFontSize(8); pdf.setFont('courier', 'normal');
    pdf.text('PANEL METHOD ENGINE v8', pw - 15, 18, { align: 'right' });
    pdf.setTextColor(230, 232, 240); pdf.setFontSize(11); pdf.setFont('helvetica', 'normal');
    pdf.text(title, 15, 33);
    pdf.setTextColor(107, 114, 128); pdf.setFontSize(8); pdf.setFont('courier', 'normal');
    pdf.text(sub, 15, 43);
    pdf.setTextColor(107, 114, 128); pdf.text(new Date().toISOString(), pw - 15, 30, { align: 'right' });
  };

  const drawFooter = (pg, total) => {
    pdf.setDrawColor(48, 54, 61); pdf.setLineWidth(0.3); pdf.line(15, ph - 16, pw - 15, ph - 16);
    pdf.setFont('courier', 'normal'); pdf.setFontSize(7); pdf.setTextColor(75, 85, 99);
    pdf.text('AEROSAGE v8 — Hess-Smith Panel Method · Professional Aerodynamic Report', 15, ph - 9);
    pdf.text(`${pg} / ${total}`, pw - 15, ph - 9, { align: 'right' });
  };

  const fmtPDF = (val, dec = 5) => {
    if (val === undefined || val === null || !isFinite(Number(val))) return '—';
    return Number(val).toFixed(dec);
  };

  pdf.addPage(); drawBG();
  drawHeader('I. EXECUTIVE SUMMARY', `AIRFOIL: ${airfoilName} | Re=${(reynolds / 1e6).toFixed(3)}M | α=${alpha}° | M=${mach} | n_crit=${nCrit}`);
  drawFooter(1, 4);

  pdf.save(`AeroSAGE_Report_${(airfoilName || 'analysis').replace(/\s+/g, '_')}_${Date.now()}.pdf`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT CONTENT
// ═══════════════════════════════════════════════════════════════════════════════
function AeroSAGEContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [coords, setCoords] = useState(null);
  const [airfoilName, setAirfoilName] = useState('');
  const [geomProps, setGeomProps] = useState(null);
  const [importedCST, setImportedCST] = useState(null);

  const [alpha, setAlpha] = useState(4.0);
  const [reynolds, setReynolds] = useState(1e6);
  const [mach, setMach] = useState(0.0);
  const [nCrit, setNCrit] = useState(9.0);

  const [defects, setDefects] = useState([]);
  const [activeDefectType, setActiveDefectType] = useState(null);
  const [defectConfig, setDefectConfig] = useState({ severity: 2.0, surface: 'upper', height_mm: null, roughness_ks_um: null });
  const [defectPending, setDefectPending] = useState(null);
  const [defectXStart, setDefectXStart] = useState(0.1);
  const [defectXEnd, setDefectXEnd] = useState(0.3);
  const [defectTypes, setDefectTypes] = useState([]);

  const [analysisResult, setAnalysisResult] = useState(null);
  const [polarResult, setPolarResult] = useState(null);
  const [sensResult, setSensResult] = useState(null);

  const [loadingMaster, setLoadingMaster] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [loadingPolar, setLoadingPolar] = useState(false);
  const [loadingSens, setLoadingSens] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  const [masterProgress, setMasterProgress] = useState({ step: '', pct: 0 });

  const [activeTab, setActiveTab] = useState('diagnostics');
  const [viewMode, setViewMode] = useState('geometry');
  const [canvasMode, setCanvasMode] = useState('2d');
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [libModalOpen, setLibModalOpen] = useState(false);
  const [hoveredDefect, setHoveredDefect] = useState(-1);
  const [elapsedMs, setElapsedMs] = useState(null);
  const [error, setError] = useState(null);

  const [polarAlphaStart, setPolarAlphaStart] = useState(-5);
  const [polarAlphaEnd, setPolarAlphaEnd] = useState(18);
  const [polarAlphaStep, setPolarAlphaStep] = useState(1.0);

  const [sensTarget, setSensTarget] = useState('cl');
  const [sensNZones, setSensNZones] = useState(20);

  const [panelStates, setPanelStates] = useState({
    import: true, geometry: true, conditions: true, defects: true, actions: true
  });

  const fileInputRef = useRef(null);
  const importDropdownRef = useRef(null);

  // ─── LOAD FROM URL PARAMETERS ──────────────────────────────────────────────
  useEffect(() => {
    const cstStr = searchParams.get('cst');
    const nameStr = searchParams.get('name');
    const reStr = searchParams.get('re');
    const alphaStr = searchParams.get('alpha');
    const machStr = searchParams.get('mach');

    if (cstStr) {
      try {
        const cstArray = JSON.parse(decodeURIComponent(cstStr));
        if (Array.isArray(cstArray) && cstArray.length === 16) {
          const upper = cstArray.slice(0, 8);
          const lower = cstArray.slice(8, 16);
          
          console.log('AeroSAGE: Loading CST from URL:', { upper, lower });
          setImportedCST(cstArray);
          
          if (reStr) {
            const reVal = parseFloat(reStr);
            if (!isNaN(reVal) && reVal > 0) setReynolds(reVal);
          }
          if (alphaStr) {
            const alphaVal = parseFloat(alphaStr);
            if (!isNaN(alphaVal)) setAlpha(alphaVal);
          }
          if (machStr) {
            const machVal = parseFloat(machStr);
            if (!isNaN(machVal) && machVal >= 0) setMach(machVal);
          }
          
          if (nameStr) {
            setAirfoilName(decodeURIComponent(nameStr));
          }
          
          generateCoordsFromCST(upper, lower);
        }
      } catch (e) {
        console.error('Failed to parse CST from URL:', e);
        setError('Failed to load design from Workbench. Please try importing manually.');
        handleGenerateNACA('2412');
      }
    } else {
      handleGenerateNACA('2412');
    }
  }, [searchParams]);

  // ─── Generate coordinates from CST ─────────────────────────────────────────
  const generateCoordsFromCST = async (upper, lower) => {
    setLoadingImport(true);
    setError(null);
    try {
      const sanitizedUpper = upper.map(v => Math.max(-0.1, Math.min(0.8, v)));
      const sanitizedLower = lower.map(v => Math.max(-0.8, Math.min(0.1, v)));
      
      const data = await apiPost('/aerosage/generate/cst', {
        upper_coeffs: sanitizedUpper,
        lower_coeffs: sanitizedLower,
        n_points: 160,
        te_thickness: 0.0
      });
      
      let coords = data.coordinates;
      
      const leIdx = coords.reduce((min, p, i) => p[0] < coords[min][0] ? i : min, 0);
      if (leIdx !== 0) {
        coords = [...coords.slice(leIdx), ...coords.slice(0, leIdx)];
      }
      
      setCoords(coords);
      setGeomProps(data.geometry);
      setAnalysisResult(null);
      setPolarResult(null);
      setSensResult(null);
      setImportedCST(null);
    } catch (err) {
      console.error('Failed to generate coordinates from CST:', err);
      setError('Failed to load design. Please try importing manually.');
    } finally {
      setLoadingImport(false);
    }
  };

  // ─── Open in Workbench ─────────────────────────────────────────────────────
  const openInWorkbench = () => {
    if (!coords && !importedCST) {
      setError('No airfoil loaded to send to Workbench.');
      return;
    }
    
    if (importedCST && Array.isArray(importedCST) && importedCST.length === 16) {
      const cstString = encodeURIComponent(JSON.stringify(importedCST));
      const name = encodeURIComponent(airfoilName || 'AeroSAGE_Design');
      router.push(`/workbench?importedCST=${cstString}&name=${name}&re=${reynolds}&alpha=${alpha}&mach=${mach}`);
      return;
    }
    
    setLoadingImport(true);
    fetch(`${API}/aerosage/import/coordinates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify({
        text: coords.map(c => `${c[0]} ${c[1]}`).join('\n'),
        name: airfoilName || 'AeroSAGE_Design'
      })
    })
    .then(res => {
      if (!res.ok) throw new Error('Failed to fit CST from coordinates');
      return res.json();
    })
    .then(data => {
      const cstString = encodeURIComponent(JSON.stringify(data.cst_coefficients));
      const name = encodeURIComponent(data.name || airfoilName || 'AeroSAGE_Design');
      router.push(`/workbench?importedCST=${cstString}&name=${name}&re=${reynolds}&alpha=${alpha}&mach=${mach}`);
    })
    .catch(err => {
      console.error('Failed to fit CST for Workbench:', err);
      setError('Failed to send to Workbench. Please export manually.');
    })
    .finally(() => {
      setLoadingImport(false);
    });
  };

  useEffect(() => {
    const handler = (e) => {
      if (importDropdownRef.current && !importDropdownRef.current.contains(e.target))
        setImportMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    apiGet('/aerosage/defect-types')
      .then(d => setDefectTypes(d.defect_types || []))
      .catch(() => setDefectTypes([
        { id: 'ice', label: 'Ice Accretion', color: '#60A5FA', icon: '❄' },
        { id: 'dent', label: 'Surface Dent', color: '#F87171', icon: '⚡' },
        { id: 'step', label: 'Surface Step', color: '#FBBF24', icon: '▤' },
        { id: 'roughness', label: 'Roughness', color: '#34D399', icon: '∿' },
        { id: 'erosion', label: 'Erosion Band', color: '#FB923C', icon: '◈' },
        { id: 'contamination', label: 'Contamination', color: '#C084FC', icon: '◉' },
        { id: 'crack', label: 'Surface Crack', color: '#F472B6', icon: '╱' },
        { id: 'delamination', label: 'Delamination', color: '#A78BFA', icon: '◫' },
      ]));
  }, []);

  useEffect(() => {
    const cstStr = searchParams.get('cst');
    if (!cstStr && !coords) {
      handleGenerateNACA('2412');
    }
  }, []);

  // ─── NACA generation function ─────────────────────────────────────────────
  const handleGenerateNACA = async (code) => {
    if (!code || !/^\d{4,5}$/.test(code.trim())) {
      setError('Enter a valid NACA 4/5 digit code');
      return;
    }
    setLoadingImport(true);
    setError(null);
    try {
      const data = await apiPost('/aerosage/generate/naca', { 
        naca_code: code.trim(), 
        n_points: 160 
      });
      
      let coords = data.coordinates;
      
      const leIdx = coords.reduce((min, p, i) => p[0] < coords[min][0] ? i : min, 0);
      if (leIdx !== 0) {
        coords = [...coords.slice(leIdx), ...coords.slice(0, leIdx)];
      }
      
      setCoords(coords);
      setAirfoilName(data.name);
      setGeomProps(data.geometry);
      setAnalysisResult(null);
      setPolarResult(null);
      setSensResult(null);
      setImportedCST(null);
    } catch {
      try {
        const coords = naca4Client(code.trim(), 160);
        setCoords(coords);
        setAirfoilName(`NACA ${code.trim()}`);
        setGeomProps(null);
      } catch (e2) {
        setError(`NACA generation failed: ${e2.message}`);
      }
    }
    setLoadingImport(false);
  };

  const handleFileImport = async (file) => {
    if (!file) return;
    setLoadingImport(true); setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API}/aerosage/import/dat`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` }, body: formData
      });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      
      let coords = data.coordinates;
      const leIdx = coords.reduce((min, p, i) => p[0] < coords[min][0] ? i : min, 0);
      if (leIdx !== 0) {
        coords = [...coords.slice(leIdx), ...coords.slice(0, leIdx)];
      }
      
      setCoords(coords);
      setAirfoilName(data.name || file.name.replace('.dat', ''));
      setGeomProps(data.geometry);
      setAnalysisResult(null); setPolarResult(null); setSensResult(null);
      setImportedCST(null);
    } catch (e) { setError(`File import failed: ${e.message}`); }
    setLoadingImport(false);
  };

  const handleLibrarySelect = async (name) => {
    setLibModalOpen(false); setLoadingImport(true); setError(null);
    try {
      const data = await apiGet(`/airfoils/${encodeURIComponent(name)}`);
      
      if (data.cst_coefficients && data.cst_coefficients.length === 16) {
        const upper = data.cst_coefficients.slice(0, 8);
        const lower = data.cst_coefficients.slice(8, 16);
        await generateCoordsFromCST(upper, lower);
        setAirfoilName(data.name || name);
      } else if (data.coordinates && Array.isArray(data.coordinates)) {
        let coords = data.coordinates;
        const leIdx = coords.reduce((min, p, i) => p[0] < coords[min][0] ? i : min, 0);
        if (leIdx !== 0) {
          coords = [...coords.slice(leIdx), ...coords.slice(0, leIdx)];
        }
        setCoords(coords);
        setAirfoilName(data.name || name);
        setGeomProps(data.geometry || null);
        setImportedCST(null);
      } else if (data.naca_code) {
        setLoadingImport(false); await handleGenerateNACA(data.naca_code); setAirfoilName(data.name || name); return;
      } else throw new Error('Unsupported data format');
      
      setAnalysisResult(null); setPolarResult(null); setSensResult(null);
    } catch (e) {
      const nacaMatch = name.replace(/\s/g, '').match(/^naca(\d{4,5})$/i);
      if (nacaMatch) { setLoadingImport(false); await handleGenerateNACA(nacaMatch[1]); return; }
      setError(`Library import failed: ${e.message}`);
    }
    setLoadingImport(false);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileImport(file);
  }, []);

  const handleCanvasClick = useCallback((xFrac) => {
    if (!activeDefectType) return;
    if (!defectPending) {
      setDefectPending({ x_start: xFrac });
    } else {
      const xs = Math.min(defectPending.x_start, xFrac);
      const xe = Math.max(defectPending.x_start, xFrac);
      if (xe - xs > 0.005) {
        setDefects(prev => [...prev, {
          defect_type: activeDefectType,
          x_start: Math.round(xs * 1000) / 1000,
          x_end: Math.round(xe * 1000) / 1000,
          surface: defectConfig.surface,
          severity: defectConfig.severity,
          height_mm: defectConfig.height_mm || null,
          roughness_ks_um: defectConfig.roughness_ks_um || null,
          depth_mm: null,
        }]);
      }
      setDefectPending(null); setActiveDefectType(null);
    }
  }, [activeDefectType, defectPending, defectConfig]);

  const addDefectManual = () => {
    if (!activeDefectType) { setError('Select a defect type first'); return; }
    if (defectXEnd <= defectXStart) { setError('x_end must be > x_start'); return; }
    setDefects(prev => [...prev, {
      defect_type: activeDefectType,
      x_start: Math.round(Math.min(defectXStart, defectXEnd) * 1000) / 1000,
      x_end: Math.round(Math.max(defectXStart, defectXEnd) * 1000) / 1000,
      surface: defectConfig.surface,
      severity: defectConfig.severity,
      height_mm: defectConfig.height_mm || null,
      roughness_ks_um: defectConfig.roughness_ks_um || null,
      depth_mm: null,
    }]);
    setError(null);
  };

  const runAll = async () => {
    if (!coords) { setError('Load an airfoil first'); return; }
    setLoadingMaster(true); setLoadingAnalysis(true); setError(null);
    const t0 = Date.now();

    setMasterProgress({ step: 'Running Panel Method Analysis…', pct: 8 });
    let aResult = null;
    try {
      aResult = await apiPost('/aerosage/analyze', {
        coordinates: coords,
        conditions: { alpha_deg: alpha, reynolds, mach, n_crit: nCrit },
        defects, compute_clean_baseline: defects.length > 0, airfoil_name: airfoilName
      });
      setAnalysisResult(aResult);
      setGeomProps(aResult.result?.geometry || geomProps);
      setElapsedMs(Date.now() - t0);
      setViewMode('cp');
      setMasterProgress({ step: 'Panel method complete ✓', pct: 35 });
    } catch (e) {
      setError(`Analysis failed: ${e.message}`);
      setLoadingMaster(false); setLoadingAnalysis(false); return;
    }
    setLoadingAnalysis(false);

    setLoadingPolar(true);
    setMasterProgress({ step: 'Computing Polar Sweep…', pct: 42 });
    try {
      const pResult = await apiPost('/aerosage/polar', {
        coordinates: coords, reynolds, mach,
        alpha_start: polarAlphaStart, alpha_end: polarAlphaEnd, alpha_step: polarAlphaStep,
        defects, airfoil_name: airfoilName
      });
      setPolarResult(pResult);
      setMasterProgress({ step: 'Polar complete ✓', pct: 68 });
    } catch (e) {
      console.warn('Polar skipped:', e.message);
      setMasterProgress({ step: 'Polar skipped', pct: 68 });
    }
    setLoadingPolar(false);

    setLoadingSens(true);
    setMasterProgress({ step: 'Computing Surface Sensitivity…', pct: 72 });
    try {
      const sResult = await apiPost('/aerosage/sensitivity', {
        coordinates: coords,
        conditions: { alpha_deg: alpha, reynolds, mach, n_crit: nCrit },
        target: sensTarget, n_zones: sensNZones, perturbation_severity: 1.0
      });
      setSensResult(sResult.sensitivity);
      setMasterProgress({ step: 'Sensitivity complete ✓', pct: 96 });
    } catch (e) {
      console.warn('Sensitivity skipped:', e.message);
      setMasterProgress({ step: 'Sensitivity skipped', pct: 96 });
    }
    setLoadingSens(false);

    setMasterProgress({ step: 'All computations complete ✓', pct: 100 });
    setLoadingMaster(false);
    setActiveTab('diagnostics');
    setTimeout(() => setMasterProgress({ step: '', pct: 0 }), 3000);
  };

  const runAnalysisOnly = async () => {
    if (!coords) return;
    setLoadingAnalysis(true); setError(null);
    const t0 = Date.now();
    try {
      const data = await apiPost('/aerosage/analyze', {
        coordinates: coords,
        conditions: { alpha_deg: alpha, reynolds, mach, n_crit: nCrit },
        defects, compute_clean_baseline: defects.length > 0, airfoil_name: airfoilName
      });
      setAnalysisResult(data); setGeomProps(data.result?.geometry || geomProps);
      setElapsedMs(Date.now() - t0); setViewMode('cp');
    } catch (e) { setError(`Analysis failed: ${e.message}`); }
    setLoadingAnalysis(false);
  };

  const runPolar = async () => {
    if (!coords) return;
    setLoadingPolar(true); setError(null);
    try {
      const data = await apiPost('/aerosage/polar', {
        coordinates: coords, reynolds, mach,
        alpha_start: polarAlphaStart, alpha_end: polarAlphaEnd, alpha_step: polarAlphaStep,
        defects, airfoil_name: airfoilName
      });
      setPolarResult(data); setElapsedMs(data.elapsed_ms);
    } catch (e) { setError(`Polar failed: ${e.message}`); }
    setLoadingPolar(false);
  };

  const runSensitivity = async () => {
    if (!coords) return;
    setLoadingSens(true); setError(null);
    try {
      const data = await apiPost('/aerosage/sensitivity', {
        coordinates: coords,
        conditions: { alpha_deg: alpha, reynolds, mach, n_crit: nCrit },
        target: sensTarget, n_zones: sensNZones, perturbation_severity: 1.0
      });
      setSensResult(data.sensitivity);
    } catch (e) { setError(`Sensitivity failed: ${e.message}`); }
    setLoadingSens(false);
  };

  const handleGeneratePDF = () => {
    if (!analysisResult) { setError('Run analysis first'); return; }
    setGeneratingPDF(true);
    setTimeout(() => {
      try {
        generatePDF({
          airfoilName, alpha, reynolds, mach, nCrit,
          intg: analysisResult.result?.integrated,
          defects, analysisResult, polarResult, sensResult, elapsedMs
        });
      } catch (e) { setError(`PDF failed: ${e.message}`); }
      setGeneratingPDF(false);
    }, 100);
  };

  const intg = analysisResult?.result?.integrated;
  const warningCount = analysisResult?.oracle?.filter(m => m.level === 'WARNING').length || 0;
  const cautionCount = analysisResult?.oracle?.filter(m => m.level === 'CAUTION').length || 0;
  const statusLabel = warningCount > 0 ? `${warningCount} WARNING${warningCount > 1 ? 'S' : ''}` :
    cautionCount > 0 ? `${cautionCount} CAUTION${cautionCount > 1 ? 'S' : ''}` : 'NOMINAL';
  const togglePanel = (k) => setPanelStates(s => ({ ...s, [k]: !s[k] }));

  const fmtTelemetry = (val, decimals) => {
    if (val === undefined || val === null || !isFinite(Number(val))) return '—';
    return Number(val).toFixed(decimals);
  };

  const telemetryCells = [
    { label: 'CL', val: fmtTelemetry(intg?.Cl, 5), delta: analysisResult?.deltas?.delta_Cl, color: '#00FFC2' },
    { label: 'CD', val: fmtTelemetry(intg?.Cd_total, 6), delta: analysisResult?.deltas?.delta_Cd },
    { label: 'CM', val: fmtTelemetry(intg?.Cm, 5), delta: analysisResult?.deltas?.delta_Cm },
    { label: 'L/D', val: fmtTelemetry(intg?.L_D, 3), color: intg?.L_D > 30 ? '#00FFC2' : intg?.L_D > 15 ? '#FBBF24' : intg?.L_D !== undefined ? '#F87171' : '#00FFC2' },
    { label: 'Cp_min', val: fmtTelemetry(intg?.Cp_min, 4), color: intg?.Cp_min < -4 ? '#F87171' : intg?.Cp_min < -2 ? '#FBBF24' : '#00FFC2' },
    { label: 'Tr↑ x/c', val: fmtTelemetry(intg?.transition_upper, 4), color: intg?.transition_upper < 0.1 ? '#F87171' : '#34D399' },
    { label: 'Re', val: reynolds >= 1e6 ? `${(reynolds / 1e6).toFixed(2)}M` : `${(reynolds / 1e3).toFixed(0)}k`, color: '#6B7280' },
    { label: 'AoA', val: alpha.toFixed(1), unit: '°', color: alpha > 12 ? '#F87171' : alpha > 8 ? '#FBBF24' : '#00FFC2' },
  ];

  // ── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>

      {libModalOpen && (
        <LibraryModal onClose={() => setLibModalOpen(false)} onSelect={handleLibrarySelect} />
      )}

      <input ref={fileInputRef} type="file" accept=".dat,.txt,.csv"
        style={{ display: 'none' }}
        onChange={e => { handleFileImport(e.target.files?.[0]); e.target.value = null; }} />

      {/* ════════════════════════ LEFT PANEL ════════════════════════ */}
      <div className={styles.controlsColumn}>

        <div className={styles.headerBar}>
          <div className={styles.logoGroup}>
            <div className={styles.logoIcon}><FiWind size={16} /></div>
            <div>
              <div className={styles.logoText}>AeroSAGE</div>
              <div className={styles.logoVersion}>Panel Method Engine v8</div>
            </div>
          </div>
          <div className={styles.headerStatus}>
            <div className={analysisResult
              ? (warningCount > 0 ? styles.statusDotError : cautionCount > 0 ? styles.statusDotWarning : styles.statusDot)
              : styles.statusDot} />
            <span className={styles.statusLabel}>{analysisResult ? statusLabel : 'READY'}</span>
          </div>
        </div>

        <div className={styles.controlsScroll}>

          {/* ── IMPORT ─────────────────────────────── */}
          <div className={styles.panel}>
            <div className={styles.panelTitleClickable} onClick={() => togglePanel('import')}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FiUploadCloud size={13} /> IMPORT AIRFOIL
              </span>
              <span className={panelStates.import ? styles.panelTitleIconOpen : styles.panelTitleIcon}>▼</span>
            </div>
            <div className={panelStates.import ? styles.panelContent : styles.panelContentHidden}>
              {airfoilName && (
                <div className={styles.airfoilNameBadge}>
                  <FiLayers size={13} /> {airfoilName}
                </div>
              )}
              <div className={styles.importDropdownContainer} ref={importDropdownRef}>
                <button className={styles.importDropdownBtn}
                  onClick={() => setImportMenuOpen(!importMenuOpen)} disabled={loadingImport}>
                  {loadingImport
                    ? <><span className={styles.spinner} /> Loading…</>
                    : <><FiUploadCloud size={14} /> Import Airfoil <FiChevronDown size={13} /></>
                  }
                </button>
                {importMenuOpen && (
                  <div className={styles.importDropdownMenu}>
                    <button className={styles.importDropdownItem}
                      onClick={() => { fileInputRef.current?.click(); setImportMenuOpen(false); }}>
                      <FiUploadCloud size={15} /> Upload .DAT File
                    </button>
                    <button className={styles.importDropdownItem}
                      onClick={() => { setLibModalOpen(true); setImportMenuOpen(false); }}>
                      <FiBookOpen size={15} /> Select from Library
                    </button>
                    <div className={styles.importDropdownDivider} />
                    <div className={styles.importDropdownSectionLabel}>Quick NACA</div>
                    {['0012', '2412', '4412', '23012', '0006', '4415'].map(n => (
                      <button key={n} className={styles.importDropdownItem}
                        onClick={() => { setImportMenuOpen(false); handleGenerateNACA(n); }}>
                        <span style={{ color: '#00FFC2', fontSize: '0.82rem', fontFamily: 'Consolas, monospace' }}>
                          NACA {n}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.dropZone}
                onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}>
                <div className={styles.dropZoneIcon}><FiUploadCloud size={22} color="#30363d" /></div>
                <div className={styles.dropZoneText}>Drop .dat file here or click to browse</div>
              </div>
              {error && (
                <div className={styles.errorBox}>
                  <FiAlertTriangle size={13} /> {error}
                </div>
              )}

              {/* ─── OPEN IN WORKBENCH BUTTON ─── */}
              <button 
                onClick={openInWorkbench}
                className={styles.importDropdownBtn}
                style={{ 
                  marginTop: '10px', 
                  borderColor: '#a855f7', 
                  color: '#a855f7', 
                  background: 'rgba(168,85,247,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                disabled={loadingImport || !coords}
              >
                <FiBox size={14} /> OPEN IN WORKBENCH
              </button>
            </div>
          </div>

          {/* ── GEOMETRY ─────────────────────────────────── */}
          {geomProps && (
            <div className={styles.panel}>
              <div className={styles.panelTitleClickable} onClick={() => togglePanel('geometry')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FiActivity size={13} /> GEOMETRY PROPERTIES
                </span>
                <span className={panelStates.geometry ? styles.panelTitleIconOpen : styles.panelTitleIcon}>▼</span>
              </div>
              <div className={panelStates.geometry ? styles.panelContent : styles.panelContentHidden}>
                <GeometryPanel geom={geomProps} />
              </div>
            </div>
          )}

          {/* ── CONDITIONS ──────────────────────────────── */}
          <div className={styles.panel}>
            <div className={styles.panelTitleClickable} onClick={() => togglePanel('conditions')}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FiWind size={13} /> FLIGHT CONDITIONS
              </span>
              <span className={panelStates.conditions ? styles.panelTitleIconOpen : styles.panelTitleIcon}>▼</span>
            </div>
            <div className={panelStates.conditions ? styles.panelContent : styles.panelContentHidden}>
              <div className={styles.inputGroup}>
                <div className={styles.inputLabel}>Alpha (°) <span className={styles.inputValue}>{alpha.toFixed(1)}°</span></div>
                <input type="range" className={styles.sliderInput} min={-15} max={25} step={0.5} value={alpha} onChange={e => setAlpha(parseFloat(e.target.value))} />
                <input type="number" className={styles.numberInput} min={-15} max={25} step={0.5} value={alpha} onChange={e => setAlpha(parseFloat(e.target.value) || 0)} />
              </div>
              <div className={styles.inputGroup}>
                <div className={styles.inputLabel}>Reynolds (×10⁶) <span className={styles.inputValue}>{(reynolds / 1e6).toFixed(2)}</span></div>
                <input type="range" className={styles.sliderInput} min={0.1} max={20} step={0.1} value={reynolds / 1e6} onChange={e => setReynolds(parseFloat(e.target.value) * 1e6)} />
                <input type="number" className={styles.numberInput} min={0.1} max={100} step={0.1} value={(reynolds / 1e6).toFixed(2)} onChange={e => setReynolds(parseFloat(e.target.value) || 1e6)} />
              </div>
              <div className={styles.inputGroup}>
                <div className={styles.inputLabel}>Mach <span className={styles.inputValue}>{mach.toFixed(3)}</span></div>
                <input type="range" className={styles.sliderInput} min={0} max={0.85} step={0.01} value={mach} onChange={e => setMach(parseFloat(e.target.value))} />
                <input type="number" className={styles.numberInput} min={0} max={0.85} step={0.01} value={mach} onChange={e => setMach(parseFloat(e.target.value) || 0)} />
              </div>
              <div className={styles.inputGroup}>
                <div className={styles.inputLabel}>n_crit <span className={styles.inputValue}>{nCrit.toFixed(1)}</span></div>
                <input type="range" className={styles.sliderInput} min={1} max={14} step={0.5} value={nCrit} onChange={e => setNCrit(parseFloat(e.target.value))} />
                <div className={styles.hintText}>1=turbulent · 9=standard · 14=quiet</div>
              </div>
              <StallHUD alpha={alpha} defects={defects} analysisResult={analysisResult} />
            </div>
          </div>

          {/* ── DEFECTS ─────────────────────────────────── */}
          <div className={styles.panel}>
            <div className={styles.panelTitleClickable} onClick={() => togglePanel('defects')}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FiZap size={13} /> DEFECT INJECTION
                {defects.length > 0 && <span className={styles.defectCountBadge}>{defects.length}</span>}
              </span>
              <span className={panelStates.defects ? styles.panelTitleIconOpen : styles.panelTitleIcon}>▼</span>
            </div>
            <div className={panelStates.defects ? styles.panelContent : styles.panelContentHidden}>
              <div className={styles.defectTypeGrid}>
                {defectTypes.map(dt => (
                  <button key={dt.id}
                    className={activeDefectType === dt.id ? styles.defectTypeBtnActive : styles.defectTypeBtn}
                    style={{ '--defect-color': dt.color }}
                    onClick={() => { setActiveDefectType(activeDefectType === dt.id ? null : dt.id); setDefectPending(null); }}>
                    <span className={styles.defectIcon} style={{ color: dt.color }}>{dt.icon}</span>
                    <span>{dt.label}</span>
                  </button>
                ))}
              </div>
              {activeDefectType && (
                <div className={styles.defectConfigPanel}>
                  <div className={styles.defectConfigTitle}>
                    <span style={{ color: DEFECT_COLORS[activeDefectType] }}>{DEFECT_ICONS_MAP[activeDefectType]}</span>
                    {activeDefectType.toUpperCase()}
                  </div>
                  <div className={styles.inputGroup}>
                    <div className={styles.inputLabel}>Severity <span className={styles.inputValue}>{defectConfig.severity.toFixed(1)}/5</span></div>
                    <input type="range" className={styles.sliderInput} min={0.5} max={5} step={0.5} value={defectConfig.severity}
                      onChange={e => setDefectConfig(c => ({ ...c, severity: parseFloat(e.target.value) }))} />
                  </div>
                  <div className={styles.inputGroup}>
                    <div className={styles.inputLabel}>Surface</div>
                    <select className={styles.selectInput} value={defectConfig.surface}
                      onChange={e => setDefectConfig(c => ({ ...c, surface: e.target.value }))}>
                      <option value="upper">Upper Surface</option>
                      <option value="lower">Lower Surface</option>
                      <option value="both">Both Surfaces</option>
                    </select>
                  </div>
                  <div className={styles.inputGroup}>
                    <div className={styles.inputLabel}>Chord Range (x/c)</div>
                    <div className={styles.defectManualRow}>
                      <input type="number" className={styles.numberInput} min={0} max={0.99} step={0.01} value={defectXStart}
                        onChange={e => setDefectXStart(parseFloat(e.target.value) || 0)} />
                      <span className={styles.rangeArrow}>→</span>
                      <input type="number" className={styles.numberInput} min={0.01} max={1} step={0.01} value={defectXEnd}
                        onChange={e => setDefectXEnd(parseFloat(e.target.value) || 0.3)} />
                    </div>
                  </div>
                  <button className={styles.addDefectBtn} onClick={addDefectManual}>+ Add Defect</button>
                  <div className={styles.defectInstruction}>
                    {!defectPending ? '① Click START on canvas or use manual entry' : '② Click END position to place defect'}
                  </div>
                </div>
              )}
              {defects.length > 0 && (
                <div className={styles.defectList}>
                  {defects.map((d, i) => (
                    <div key={i} className={styles.defectItem}
                      style={{ borderLeftColor: DEFECT_COLORS[d.defect_type] }}
                      onMouseEnter={() => setHoveredDefect(i)}
                      onMouseLeave={() => setHoveredDefect(-1)}>
                      <span style={{ color: DEFECT_COLORS[d.defect_type], fontSize: '1rem' }}>{DEFECT_ICONS_MAP[d.defect_type]}</span>
                      <span className={styles.defectItemName}>{d.defect_type}</span>
                      <span className={styles.defectItemRange}>{d.x_start.toFixed(3)}–{d.x_end.toFixed(3)}</span>
                      <span className={styles.defectItemFill} />
                      <span className={styles.defectItemSurface}>{d.surface[0].toUpperCase()}</span>
                      <span className={styles.defectItemSev}>S{d.severity}</span>
                      <button className={styles.defectRemoveBtn} onClick={() => setDefects(p => p.filter((_, j) => j !== i))}>
                        <FiX size={12} />
                      </button>
                    </div>
                  ))}
                  <button className={styles.clearAllBtn} onClick={() => setDefects([])}>Clear All</button>
                </div>
              )}
            </div>
          </div>

          {/* ── ACTIONS ─────────────────────────────────── */}
          <div className={styles.panel}>
            <div className={styles.panelTitle}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FiCpu size={13} /> ANALYSIS ACTIONS
              </span>
            </div>
            <div className={styles.runBtnGroup}>
              <button className={styles.runBtn} onClick={runAll} disabled={loadingMaster || !coords}>
                {loadingMaster
                  ? <><span className={styles.spinner} /> {masterProgress.step || 'Computing…'}</>
                  : <><FiZap size={16} /> Run Full Analysis Suite</>
                }
              </button>
              {loadingMaster && masterProgress.pct > 0 && (
                <div className={styles.masterProgressWrap}>
                  <div className={styles.masterProgressBar}>
                    <div className={styles.masterProgressFill} style={{ width: `${masterProgress.pct}%` }} />
                  </div>
                  <div className={styles.masterProgressLabel}>{masterProgress.step}</div>
                </div>
              )}
              <div className={styles.secondaryBtnGrid}>
                <button className={styles.runBtnSecondary} onClick={runAnalysisOnly} disabled={loadingAnalysis || !coords}>
                  {loadingAnalysis ? <><span className={styles.spinner} /> …</> : <><FiActivity size={12} /> Analysis</>}
                </button>
                <button className={styles.runBtnSecondary} onClick={() => { setActiveTab('polar'); runPolar(); }} disabled={loadingPolar || !coords}>
                  {loadingPolar ? <><span className={styles.spinner} /> …</> : <><FiTrendingUp size={12} /> Polar</>}
                </button>
                <button className={styles.runBtnSecondary} onClick={() => { setActiveTab('sensitivity'); runSensitivity(); }} disabled={loadingSens || !coords}>
                  {loadingSens ? <><span className={styles.spinner} /> …</> : <><FiTarget size={12} /> Sensitivity</>}
                </button>
                <button className={styles.runBtnSecondary} onClick={() => setActiveTab('report')} disabled={!analysisResult}>
                  <FiEye size={12} /> Report
                </button>
              </div>
            </div>
            {elapsedMs && !loadingMaster && (
              <div className={styles.elapsedText}>
                Last run: {elapsedMs}ms
                {analysisResult?.result?.panel_method?.n_panels && ` · ${analysisResult.result.panel_method.n_panels} panels`}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ════════════════════════════ RIGHT PANEL ════════════════════════ */}
      <div className={styles.vizColumn}>

        {/* ── TELEMETRY STRIP ──────────────────────────────────── */}
        <div className={styles.telemetryStrip}>
          {telemetryCells.map((item, i) => (
            <div key={i} className={styles.telemetryCell}>
              <span className={styles.telemetryLabel}>{item.label}</span>
              <span className={styles.telemetryValue}
                style={{
                  color: item.color || '#00FFC2',
                  fontSize: item.val?.length > 8 ? '0.82rem' : undefined,
                  fontVariantNumeric: 'tabular-nums'
                }}>
                {item.val}{item.unit && <span className={styles.telemetryUnit}>{item.unit}</span>}
              </span>
              {item.delta !== undefined && (
                <span className={item.delta < 0 ? styles.telemetryDeltaNeg : styles.telemetryDeltaPos}>
                  {item.delta > 0 ? '+' : ''}{Number(item.delta).toFixed(5)}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* ── CANVAS SECTION ──────────────────────────────────── */}
        <div className={styles.canvasSection}>
          <div className={styles.canvasTopBar}>
            <div className={styles.canvasLabel}>
              {airfoilName || 'No Airfoil Loaded'}
              {coords && <span className={styles.canvasTag}>{coords.length} pts</span>}
              {defects.length > 0 && (
                <span className={styles.canvasTag} style={{ color: '#FBBF24', borderColor: 'rgba(251,191,36,0.3)' }}>
                  {defects.length} defect{defects.length > 1 ? 's' : ''}
                </span>
              )}
              {loadingMaster && (
                <span className={styles.canvasTag} style={{ color: '#007AFF', borderColor: 'rgba(0,122,255,0.3)' }}>
                  <span className={styles.spinner} style={{ width: 8, height: 8, display: 'inline-block', marginRight: 4 }} />
                  {masterProgress.step}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className={styles.viewToggleGroup}>
                <button className={canvasMode === '2d' ? styles.viewToggleBtnActive : styles.viewToggleBtn} onClick={() => setCanvasMode('2d')}>2D</button>
                <button className={canvasMode === '3d' ? styles.viewToggleBtnActive : styles.viewToggleBtn} onClick={() => setCanvasMode('3d')}>3D</button>
              </div>
              {canvasMode === '2d' && (
                <div className={styles.viewToggleGroup}>
                  {[{ id: 'geometry', label: 'Geometry' }, { id: 'cp', label: 'Cp Field' }, { id: 'vel', label: 'Velocity' }].map(v => (
                    <button key={v.id}
                      className={viewMode === v.id ? styles.viewToggleBtnActive : styles.viewToggleBtn}
                      onClick={() => setViewMode(v.id)}>
                      {v.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {canvasMode === '2d' ? (
            <AirfoilCanvas
              coords={coords} defects={defects} analysisResult={analysisResult}
              viewMode={viewMode} onCanvasClick={handleCanvasClick}
              activeDefectDraw={activeDefectType} defectPending={defectPending}
              hoveredDefect={hoveredDefect}
            />
          ) : (
            <Airfoil3DCanvas coords={coords} analysisResult={analysisResult} />
          )}

          {activeDefectType && canvasMode === '2d' && (
            <div className={styles.drawHint}>
              {!defectPending
                ? `✦ Click START of ${activeDefectType} on canvas`
                : `✦ Click END — started at x/c = ${defectPending.x_start.toFixed(4)}`}
            </div>
          )}
          <div className={styles.canvasCoordLabel}>
            {canvasMode === '3d' ? 'DRAG TO ROTATE · SCROLL TO ZOOM · DBL-CLICK TO AUTO-ROTATE' : 'Hess-Smith Panel Method · AeroSAGE v8'}
          </div>
        </div>

        {/* ── TABS ─────────────────────────────────────────────── */}
        <div className={styles.tabBar}>
          {[
            { id: 'diagnostics', label: 'Diagnostics', icon: <FiActivity size={12} />, badge: warningCount > 0 },
            { id: 'cp', label: 'Cp Distribution', icon: <FiTrendingDown size={12} /> },
            { id: 'polar', label: 'Polar Curves', icon: <FiTrendingUp size={12} /> },
            { id: 'bl', label: 'Boundary Layer', icon: <FiLayers size={12} /> },
            { id: 'sensitivity', label: 'Sensitivity', icon: <FiTarget size={12} /> },
            { id: 'report', label: 'Report', icon: <FiFileText size={12} /> },
          ].map(tab => (
            <button key={tab.id}
              className={activeTab === tab.id ? styles.tabBtnActive : styles.tabBtn}
              onClick={() => setActiveTab(tab.id)}>
              {tab.icon} {tab.label}
              {tab.badge && <span className={styles.tabBtnBadge} />}
            </button>
          ))}
        </div>

        {/* ── TAB CONTENT ─────────────────────────────────────── */}
        <div className={styles.tabContent}>

          {activeTab === 'diagnostics' && (
            <div className={styles.diagLayout}>
              <div className={styles.diagLeft}>
                <div className={styles.diagSectionTitle}><FiInfo size={12} style={{ marginRight: 6 }} />Oracle Diagnostics</div>
                {loadingAnalysis
                  ? <div className={styles.oracleEmpty}><div className={styles.loadingSpinnerLarge} style={{ marginRight: 10 }} />Running panel method…</div>
                  : <OraclePanel messages={analysisResult?.oracle} />
                }
              </div>
              <div className={styles.diagRight}>
                <div className={styles.diagSectionTitle}><FiActivity size={12} style={{ marginRight: 6 }} />Aerodynamic Coefficients</div>
                {loadingAnalysis
                  ? <div className={styles.deltaEmpty}>Computing…</div>
                  : <DeltaPanel deltas={analysisResult?.deltas} integrated={intg} />
                }
              </div>
            </div>
          )}

          {activeTab === 'cp' && (
            <div className={styles.cpTabContent}>
              <div className={styles.cpCanvasWrap}>
                {(loadingAnalysis || loadingMaster) && (
                  <div className={styles.loadingOverlay}>
                    <div className={styles.loadingSpinnerLarge} />
                    <div className={styles.loadingText}>Running Panel Method…</div>
                  </div>
                )}
                <CpCanvas analysisResult={analysisResult} />
                {!analysisResult && !loadingAnalysis && !loadingMaster && (
                  <div className={styles.emptyState}>
                    <FiTrendingDown size={32} color="#21262d" />
                    <div className={styles.emptyStateText}>Run Full Analysis Suite to see Cp distribution</div>
                  </div>
                )}
              </div>
              <div className={styles.cpLegend}>
                {[['#007AFF', 'Upper surface'], ['#00FFC2', 'Lower surface (dashed)'], ['#34D399', 'Transition Tr↑'], ['#FB923C', 'Transition Tr↓']].map(([c, l]) => (
                  <div key={l} className={styles.cpLegendItem}>
                    <div className={styles.cpLegendColor} style={{ background: c }} />{l}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'polar' && (
            <div className={styles.polarTabContent}>
              <div className={styles.polarControls}>
                <span className={styles.polarControlLabel}>α range:</span>
                <input type="number" className={styles.polarControlInput} value={polarAlphaStart}
                  onChange={e => setPolarAlphaStart(parseFloat(e.target.value) || -5)} step={1} min={-20} max={20} />
                <span style={{ color: '#30363d' }}>→</span>
                <input type="number" className={styles.polarControlInput} value={polarAlphaEnd}
                  onChange={e => setPolarAlphaEnd(parseFloat(e.target.value) || 18)} step={1} min={-10} max={30} />
                <span className={styles.polarControlLabel}>step:</span>
                <input type="number" className={styles.polarControlInput} value={polarAlphaStep}
                  onChange={e => setPolarAlphaStep(parseFloat(e.target.value) || 1)} step={0.5} min={0.25} max={2} />
                <button className={styles.polarRunBtn} onClick={runPolar} disabled={loadingPolar || loadingMaster || !coords}>
                  {loadingPolar ? <><span className={styles.spinner} /> …</> : '▶ Re-Run'}
                </button>
              </div>
              {(loadingPolar || loadingMaster) && !polarResult ? (
                <div className={styles.polarEmpty}><div className={styles.loadingSpinnerLarge} style={{ display: 'inline-block', marginRight: 12 }} />Computing polar…</div>
              ) : polarResult?.polar ? (
                <>
                  <div className={styles.polarChartsGrid}>
                    {[
                      { title: 'CL vs α', xKey: 'alpha', yKey: 'Cl', xl: 'α (°)', yl: 'CL', color: '#007AFF' },
                      { title: 'CD vs α', xKey: 'alpha', yKey: 'Cd', xl: 'α (°)', yl: 'CD', color: '#F87171' },
                      { title: 'Drag Polar (CL vs CD)', xKey: 'Cd', yKey: 'Cl', xl: 'CD', yl: 'CL', color: '#00FFC2' },
                      { title: 'L/D vs α', xKey: 'alpha', yKey: 'L_D', xl: 'α (°)', yl: 'L/D', color: '#34D399' },
                    ].map(c => (
                      <div key={c.title} className={styles.polarChartBox}>
                        <div className={styles.polarChartLabel}>{c.title}</div>
                        <PolarChartCanvas polarData={polarResult.polar}
                          xKey={c.xKey} yKey={c.yKey} xlabel={c.xl} ylabel={c.yl} color={c.color} />
                      </div>
                    ))}
                  </div>
                  {polarResult.metrics && (
                    <div className={styles.polarMetrics}>
                      {[
                        { label: 'CL_max', val: Number(polarResult.metrics.Cl_max).toFixed(5) },
                        { label: 'α @ CL_max', val: `${Number(polarResult.metrics.alpha_Cl_max).toFixed(2)}°` },
                        { label: 'CD_min', val: Number(polarResult.metrics.Cd_min).toFixed(7) },
                        { label: 'L/D max', val: Number(polarResult.metrics.LD_max).toFixed(3) },
                        { label: 'α @ L/D_max', val: `${Number(polarResult.metrics.alpha_LD_max).toFixed(2)}°` },
                        { label: 'CL at α=0', val: Number(polarResult.metrics.Cl0).toFixed(5) },
                        { label: 'α_ZL', val: `${Number(polarResult.metrics.alpha_zero_lift).toFixed(3)}°` },
                        { label: 'CLα /rad', val: Number(polarResult.metrics.Cl_alpha_per_rad).toFixed(4) },
                      ].map((m, i) => (
                        <div key={i} className={styles.polarMetricCard}>
                          <div className={styles.polarMetricLabel}>{m.label}</div>
                          <div className={styles.polarMetricValue}>{m.val ?? '—'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                !loadingPolar && !loadingMaster && (
                  <div className={styles.polarEmpty}>
                    Click "Run Full Analysis Suite" to compute the polar automatically.
                  </div>
                )
              )}
            </div>
          )}

          {activeTab === 'bl' && (
            <div className={styles.blTabContent}>
              {(loadingAnalysis || loadingMaster) && !analysisResult?.result?.boundary_layer ? (
                <div className={styles.blEmpty}><div className={styles.loadingSpinnerLarge} style={{ display: 'inline-block', marginRight: 12 }} />Computing boundary layer…</div>
              ) : analysisResult?.result?.boundary_layer ? (
                <>
                  <div className={styles.blChartsGrid}>
                    {[
                      { title: 'θ Momentum Thickness (Upper)', surface: 'upper', field: 'theta', fl: 'θ/c', color: '#007AFF' },
                      { title: 'θ Momentum Thickness (Lower)', surface: 'lower', field: 'theta', fl: 'θ/c', color: '#00FFC2' },
                      { title: 'H Shape Factor (Upper)', surface: 'upper', field: 'H', fl: 'H', color: '#FBBF24' },
                      { title: 'cf Skin Friction (Upper)', surface: 'upper', field: 'cf', fl: 'cf', color: '#34D399' },
                    ].map(c => (
                      <div key={c.title} className={styles.blChartBox}>
                        <div className={styles.blChartLabel}>{c.title}</div>
                        <BLChartCanvas blData={analysisResult.result.boundary_layer}
                          surface={c.surface} field={c.field} fieldLabel={c.fl} color={c.color} />
                      </div>
                    ))}
                  </div>
                  <div className={styles.blSummary}>
                    {[
                      { label: 'Tr↑ x/c', val: Number(analysisResult.result.boundary_layer.transition_upper).toFixed(5), color: '#34D399' },
                      { label: 'Tr↓ x/c', val: Number(analysisResult.result.boundary_layer.transition_lower).toFixed(5), color: '#FB923C' },
                      { label: 'CD_friction', val: Number(analysisResult.result.boundary_layer.Cd_friction).toFixed(7), color: '#00FFC2' },
                      { label: 'CD_pressure', val: intg?.Cd_pressure !== undefined ? Number(intg.Cd_pressure).toFixed(7) : '—', color: '#007AFF' },
                    ].map((item, i) => (
                      <div key={i} className={styles.blSummaryCard}>
                        <div className={styles.blSummaryLabel}>{item.label}</div>
                        <div className={styles.blSummaryValue} style={{ color: item.color }}>{item.val ?? '—'}</div>
                      </div>
                    ))}
                  </div>
                  <div className={styles.blLegend}>
                    <span style={{ color: 'rgba(0,122,255,0.5)' }}>■</span> Laminar (Thwaites) &nbsp;|&nbsp;
                    <span style={{ color: 'rgba(251,146,60,0.5)' }}>■</span> Turbulent (Head's) &nbsp;|&nbsp;
                    Michel criterion (n_crit={nCrit})
                  </div>
                </>
              ) : (
                <div className={styles.blEmpty}>Click "Run Full Analysis Suite" to compute boundary layer.</div>
              )}
            </div>
          )}

          {activeTab === 'sensitivity' && (
            <div className={styles.sensTabContent}>
              <div className={styles.sensControls}>
                <span className={styles.sensControlLabel}>Target:</span>
                {['cl', 'cd', 'cm', 'ld', 'transition'].map(t => (
                  <button key={t}
                    className={sensTarget === t ? styles.sensTargetBtnActive : styles.sensTargetBtn}
                    onClick={() => setSensTarget(t)}>
                    {t.toUpperCase()}
                  </button>
                ))}
                <select className={styles.selectInput} style={{ width: 80 }}
                  value={sensNZones} onChange={e => setSensNZones(parseInt(e.target.value))}>
                  {[10, 15, 20, 30, 40, 50].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <button className={styles.sensRunBtn} onClick={runSensitivity} disabled={loadingSens || loadingMaster || !coords}>
                  {loadingSens ? <><span className={styles.spinner} /> …</> : '▶ Re-Compute'}
                </button>
              </div>
              <div className={styles.sensChartBox}>
                <div className={styles.sensChartLabel}>d({sensTarget.toUpperCase()})/d(roughness)</div>
                {(loadingSens || loadingMaster) && !sensResult ? (
                  <div className={styles.sensEmpty}><div className={styles.loadingSpinnerLarge} style={{ display: 'inline-block' }} /></div>
                ) : sensResult ? (
                  <SensitivityCanvas sensData={sensResult} />
                ) : (
                  <div className={styles.sensEmpty}>Click "Run Full Analysis Suite" or Re-Compute above.</div>
                )}
              </div>
              {sensResult && (
                <>
                  <div className={styles.sensLegend}>
                    {[['#F87171', 'CRITICAL (>70%)'], ['#FBBF24', 'HIGH (40–70%)'], ['#34D399', 'MODERATE (15–40%)'], ['#374151', 'LOW (<15%)']].map(([c, l]) => (
                      <div key={l} className={styles.sensLegendItem}>
                        <div className={styles.sensLegendDot} style={{ background: c }} />{l}
                      </div>
                    ))}
                  </div>
                  {sensResult.critical_zones?.length > 0 && (
                    <div className={styles.sensCriticalAlert}>
                      <FiAlertTriangle size={13} /> Critical: {sensResult.critical_zones.map(z => `x/c=${z.x_start.toFixed(3)}–${z.x_end.toFixed(3)}`).join(', ')}
                    </div>
                  )}
                  <div className={styles.sensInfoRow}>
                    Max zone: x/c={Number(sensResult.max_sensitivity_zone).toFixed(4)} · Baseline {sensTarget.toUpperCase()}={Number(sensResult.baseline_value).toFixed(6)} · {sensResult.zones?.length} zones
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'report' && (
            <div className={styles.reportTabContent}>
              <div className={styles.reportHeader}>
                <div className={styles.reportTitle}>Aerodynamic Surface Analysis Report</div>
                <div className={styles.reportMeta}>
                  {[airfoilName || 'No airfoil', `Re=${(reynolds / 1e6).toFixed(3)}M`, `α=${alpha.toFixed(1)}°`, `M=${mach.toFixed(3)}`, `n_crit=${nCrit}`, new Date().toLocaleDateString()].map((v, i) => (
                    <span key={i} className={styles.reportMetaItem}>{v}</span>
                  ))}
                </div>
              </div>

              {analysisResult ? (
                <>
                  <div className={styles.reportSummaryGrid}>
                    {[
                      { val: warningCount, label: 'Warnings', color: warningCount > 0 ? '#F87171' : '#34D399' },
                      { val: cautionCount, label: 'Cautions', color: cautionCount > 0 ? '#FBBF24' : '#34D399' },
                      { val: defects.length, label: 'Defects', color: defects.length > 0 ? '#FBBF24' : '#34D399' },
                      { val: `${elapsedMs}ms`, label: 'Solve Time', color: '#007AFF' },
                    ].map((item, i) => (
                      <div key={i} className={styles.reportSummaryCard}>
                        <div className={styles.reportSummaryValue} style={{ color: item.color }}>{item.val}</div>
                        <div className={styles.reportSummaryLabel}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                  {intg && (
                    <div className={styles.reportCoeffsGrid}>
                      {[
                        { label: 'CL', val: Number(intg.Cl).toFixed(6) },
                        { label: 'CD_total', val: Number(intg.Cd_total).toFixed(7) },
                        { label: 'CM', val: Number(intg.Cm).toFixed(6) },
                        { label: 'L/D', val: Number(intg.L_D).toFixed(4) },
                        { label: 'Transition↑', val: `${Number(intg.transition_upper).toFixed(5)}c` },
                        { label: 'Stall margin', val: `${Number(intg.stall_margin_deg).toFixed(2)}°` },
                      ].map((item, i) => (
                        <div key={i} className={styles.reportCoeffCard}>
                          <div className={styles.reportCoeffLabel}>{item.label}</div>
                          <div className={styles.reportCoeffValue}>{item.val}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Panel Analysis', done: !!analysisResult },
                      { label: 'Polar Sweep', done: !!polarResult },
                      { label: 'Sensitivity', done: !!sensResult },
                    ].map(item => (
                      <div key={item.label} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: '0.75rem', fontWeight: 600,
                        color: item.done ? '#34D399' : '#4b5563',
                        background: item.done ? 'rgba(52,211,153,0.07)' : 'rgba(75,85,99,0.05)',
                        border: `1px solid ${item.done ? 'rgba(52,211,153,0.2)' : 'rgba(75,85,99,0.15)'}`,
                        borderRadius: 4, padding: '5px 12px'
                      }}>
                        <FiCheckCircle size={13} /> {item.label}
                      </div>
                    ))}
                  </div>
                  <div className={styles.reportActions}>
                    <button className={styles.reportBtn} onClick={handleGeneratePDF} disabled={generatingPDF}>
                      {generatingPDF
                        ? <><span className={styles.spinner} /> Compiling PDF…</>
                        : <><FiFileText size={15} /> Download 4-Page PDF Report</>
                      }
                    </button>
                    <button className={styles.reportBtn}
                      style={{ color: '#6B7280', borderColor: '#30363d', background: 'transparent' }}
                      onClick={() => { setAnalysisResult(null); setPolarResult(null); setSensResult(null); }}>
                      <FiRefreshCw size={14} /> Reset
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.reportEmpty}>
                  {loadingMaster
                    ? 'Computing full analysis suite…'
                    : 'Click "Run Full Analysis Suite" to generate the complete engineering report.'}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── EXPORT WITH SUBSCRIPTION GUARD ────────────────────────────
export default function AeroSAGEPage() {
  return (
    <SubscriptionGuard>
      <AeroSAGEContent />
    </SubscriptionGuard>
  );
}