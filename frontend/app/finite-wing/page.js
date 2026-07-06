'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Grid, Html, Trail, Float, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import {
  FiWind, FiCpu, FiDownload, FiAlertTriangle,
  FiZap, FiActivity, FiTarget, FiLayers, FiVolume2, FiMaximize2,
  FiUploadCloud, FiDatabase, FiFileText, FiX, FiSearch, FiPenTool, FiBox
} from 'react-icons/fi';
import { generateAirfoilCoordinates, NACA4412_CST } from '@/lib/cst_geometry';
import AcousticsPanel from '@/components/AcousticsPanel';
import SubscriptionGuard from '@/components/SubscriptionGuard';
import styles from './finite-wing.module.css';

const API_BASE_URL = 'https://aeroml-production.up.railway.app';

// ============================================================
// 0. MATH SANITIZATION
// ============================================================
const safe = (val, fallback = 0) => (Number.isFinite(val) && !Number.isNaN(val) ? val : fallback);

// ============================================================
// 1. DYNAMIC VLM & ACOUSTIC ENGINES (Coupled Kernels)
// ============================================================
function runVLM({ AR, taperRatio, sweepDeg, twistDeg, dihedralDeg, CL2D, CD2D, alpha, velocity, altitude, chord, span, numPanels = 40 }) {
  const arSafe = safe(AR, 8);
  const taperSafe = safe(taperRatio, 0.5);
  const clSafe = safe(CL2D, 0.5);
  
  const sweepRad = safe(sweepDeg) * Math.PI / 180;
  const twistRad = safe(twistDeg) * Math.PI / 180;
  
  // 1. Atmosphere & Compressibility
  const T0 = 288.15;
  const T = T0 - 0.0065 * safe(altitude, 0);
  const a = Math.sqrt(1.4 * 287.05 * T);
  const mach = safe(velocity, 55) / a;
  
  // Prandtl-Glauert rule for subsonic flow (clamped to prevent singularity)
  const beta = Math.max(0.1, Math.sqrt(Math.max(0.01, 1 - mach * mach)));
  
  // Effective 2D CL scaled by compressibility
  const clComp = clSafe / beta;
  
  // 2. 3D Lifting Line + Sweep Correction
  const e_oswald = 0.85 * (1 - 0.045 * Math.pow(arSafe, 0.68)) * (1 + 0.1 * Math.pow(taperSafe - 0.5, 2));
  const sweepFactor = Math.cos(sweepRad);
  
  // Apply sweep and AR reduction to lift
  let CL3D = (clComp * sweepFactor) * (arSafe / (arSafe + 2 * (arSafe + 4) / (arSafe + 2)));
  
  // 3. Washout/Twist penalty (negative twist reduces CL)
  const twistPenalty = (twistRad * 0.15) * (arSafe / (arSafe + 2)); 
  CL3D = Math.max(0.0, CL3D + twistPenalty);

  // 4. Induced & Total Drag
  const CDi = (CL3D * CL3D) / (Math.PI * arSafe * e_oswald * sweepFactor);
  const cdComp = safe(CD2D) / beta;
  const CDtotal = cdComp + CDi;
  const LD3D = CL3D / Math.max(CDtotal, 1e-6);

  // 5. Spanwise Distribution (Schrenk's Approximation)
  const spanDist = [];
  const rootChord = (2 * 1.0) / (1 + taperSafe);
  let Mroot = 0;
  
  for (let i = 0; i <= numPanels; i++) {
    const theta = (Math.PI * i) / numPanels;
    const eta = 0.5 * (1 - Math.cos(theta)); 
    const y = eta; 
    const localChord = rootChord * (1 - (1 - taperSafe) * eta);
    const localAlpha = safe(alpha) - safe(twistDeg) * eta; 
    
    const cl_elliptical = CL3D * (4 / Math.PI) * Math.sqrt(Math.max(0, 1 - eta*eta));
    const cl_trapezoidal = CL3D * localChord * (localAlpha / (safe(alpha) || 1));
    const localCL = 0.5 * (cl_elliptical + cl_trapezoidal);
    const localCD = cdComp + (localCL * localCL) / (Math.PI * arSafe * e_oswald); 
    
    spanDist.push({ 
      eta, 
      y: Number(y.toFixed(3)), 
      span_m: Number((eta * safe(span)/2).toFixed(3)),
      localCL: Number(localCL.toFixed(4)), 
      ellipticCL: Number(cl_elliptical.toFixed(4)),
      chord: Number(localChord.toFixed(4)), 
      localAlpha: Number(localAlpha.toFixed(2)), 
      localCD: Number(localCD.toFixed(5)) 
    });
  }

  // Root Bending Moment
  for (let i = 0; i < spanDist.length - 1; i++) {
    const y1 = spanDist[i].y * (safe(span)/2);
    const y2 = spanDist[i + 1].y * (safe(span)/2);
    const L1 = spanDist[i].localCL * spanDist[i].chord;
    const L2 = spanDist[i + 1].localCL * spanDist[i + 1].chord;
    Mroot += 0.5 * (L1 * y1 + L2 * y2) * (y2 - y1);
  }
  
  const rootCL = spanDist[0]?.localCL || 1;
  const tipCL = spanDist[spanDist.length - 1]?.localCL || 0;
  const tipStallRisk = tipCL / (rootCL || 1);

  return { CL3D, CDi, CDtotal, LD3D, e_oswald, spanDist, Mroot, tipStallRisk, beta };
}

function computeBPMAcoustics({ velocity, chord, span, reynolds, CL, alpha }) {
  const vSafe = safe(velocity, 50);
  if (vSafe <= 0) return null;
  const M = vSafe / 343.0; 
  const freqs = [];
  const dbs = [];
  const delta_star = 0.037 * safe(chord, 1) * Math.pow(safe(reynolds, 1e6), -0.2); 
  const Ue = vSafe * (1 + 0.13 * Math.abs(safe(CL))); 
  
  for (let f = 100; f <= 20000; f *= 1.15) {
    const St = (f * delta_star) / (Ue || 1);
    const A = 67.552 - 31.033 * Math.abs(Math.log10(safe(St, 0.1) / 0.11));
    const SPL = A + 10 * Math.log10((M ** 5) * delta_star * safe(span, 1)) + 78.4;
    freqs.push(Math.round(f));
    dbs.push(Math.max(0, Math.min(120, safe(SPL))));
  }
  
  const peak_db = Math.max(...dbs);
  const peak_freq = freqs[dbs.indexOf(peak_db)];
  return {
    overall_spl_db: peak_db * 0.95 + 5 * Math.abs(safe(alpha)),
    peak_frequency_hz: peak_freq,
    spectrum_freq: freqs,
    spectrum_db: dbs
  };
}

// ============================================================
// 2. INDUSTRIAL 2D CAD BLUEPRINT ENGINE
// ============================================================
function WingCADBlueprint({ AR, taperRatio, sweepDeg, dihedralDeg, twistDeg, alphaDeg, span, cstParams, projectName }) {
  const canvasRef = useRef(null);

  const airfoilCoords = useMemo(() => {
      return generateAirfoilCoordinates(cstParams, 150);
  }, [cstParams]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // Deep Blueprint Background
    ctx.fillStyle = '#020617'; 
    ctx.fillRect(0, 0, W, H);

    const sSpan = safe(span, 10);
    const sAR = safe(AR, 8);
    const sTaper = safe(taperRatio, 0.5);

    const rootChord = (2 * sSpan) / (sAR * (1 + sTaper));
    const tipChord = rootChord * sTaper;
    const halfSpan = sSpan / 2;
    const sweepRad = safe(sweepDeg) * Math.PI / 180;
    const dihedralRad = safe(dihedralDeg) * Math.PI / 180; 
    
    const sweepOffsetC4 = halfSpan * Math.tan(sweepRad);
    const tipOffsetX = sweepOffsetC4 + (rootChord / 4) - (tipChord / 4);
    const tipOffsetY = halfSpan * Math.tan(dihedralRad); 

    const mac = (2/3) * rootChord * ((1 + sTaper + sTaper**2) / (1 + sTaper));
    const yMAC = (halfSpan / 3) * ((1 + 2*sTaper) / (1 + sTaper));
    const xMAC = yMAC * Math.tan(sweepRad) + (rootChord / 4) - (mac / 4);

    const leftW = W * 0.60;
    const rightW = W * 0.40;
    
    // Grid Lines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    const gridStep = 40; 
    for (let x = 0; x < W; x += gridStep) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += gridStep) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath(); ctx.moveTo(leftW, 0); ctx.lineTo(leftW, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(leftW, H/2); ctx.lineTo(W, H/2); ctx.stroke();

    // VIEW 1: TOP PLANFORM
    const viewWidth = sSpan * 1.2; 
    const viewHeightPlanform = Math.max(rootChord, tipOffsetX + tipChord);
    const scaleP = safe(Math.min((leftW - 80) / viewWidth, (H - 120) / viewHeightPlanform), 10);
    
    const cxP = leftW / 2;
    const cyP = H / 2 - (rootChord * scaleP)/4;

    const toX_P = (x) => cxP + x * scaleP;
    const toY_P = (y) => cyP + y * scaleP; 

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.setLineDash([10, 5, 2, 5]);
    ctx.beginPath(); ctx.moveTo(cxP, 0); ctx.lineTo(cxP, H); ctx.stroke();
    ctx.setLineDash([]);

    const rootLE = 0, rootTE = rootChord;
    const rightTipLE = tipOffsetX, rightTipTE = tipOffsetX + tipChord;
    const leftTipLE = tipOffsetX, leftTipTE = tipOffsetX + tipChord;

    ctx.beginPath();
    ctx.moveTo(toX_P(0), toY_P(rootLE));
    ctx.lineTo(toX_P(halfSpan), toY_P(rightTipLE));
    ctx.lineTo(toX_P(halfSpan), toY_P(rightTipTE));
    ctx.lineTo(toX_P(0), toY_P(rootTE));
    ctx.lineTo(toX_P(-halfSpan), toY_P(leftTipTE));
    ctx.lineTo(toX_P(-halfSpan), toY_P(leftTipLE));
    ctx.closePath();

    ctx.fillStyle = 'rgba(16, 185, 129, 0.05)'; ctx.fill();
    ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2; ctx.stroke();

    // Quarter Chord Sweep Line
    ctx.beginPath();
    ctx.moveTo(toX_P(-halfSpan), toY_P(leftTipLE + tipChord/4));
    ctx.lineTo(toX_P(0), toY_P(rootChord/4));
    ctx.lineTo(toX_P(halfSpan), toY_P(rightTipLE + tipChord/4));
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.stroke();
    ctx.setLineDash([]);

    const drawProfile = (xStart, yStart, chordLength, rotation, color) => {
        if(!airfoilCoords || airfoilCoords.length === 0) return;
        ctx.save();
        ctx.translate(toX_P(xStart), toY_P(yStart));
        ctx.rotate(rotation);
        ctx.beginPath();
        ctx.moveTo(-airfoilCoords[0][0] * chordLength * scaleP, -airfoilCoords[0][1] * chordLength * scaleP);
        airfoilCoords.forEach(p => ctx.lineTo(-p[0] * chordLength * scaleP, -p[1] * chordLength * scaleP));
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
    };

    drawProfile(0, rootLE, rootChord, -Math.PI/2, '#00F2FF'); 
    drawProfile(halfSpan, rightTipLE, tipChord, -Math.PI/2, '#a855f7'); 
    drawProfile(-halfSpan, leftTipLE, tipChord, -Math.PI/2, '#a855f7');

    ctx.beginPath();
    ctx.moveTo(toX_P(yMAC), toY_P(xMAC));
    ctx.lineTo(toX_P(yMAC), toY_P(xMAC + mac));
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.stroke();

    const drawDim = (x1, y1, x2, y2, text, offset, vertical, toX, toY, scale) => {
      const p1x = toX(x1), p1y = toY(y1);
      const p2x = toX(x2), p2y = toY(y2);
      const ox = vertical ? offset * scale : 0;
      const oy = vertical ? 0 : offset * scale;
      
      ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
      ctx.moveTo(p1x, p1y); ctx.lineTo(p1x + ox, p1y + oy);
      ctx.moveTo(p2x, p2y); ctx.lineTo(p2x + ox, p2y + oy);
      ctx.moveTo(p1x + ox, p1y + oy); ctx.lineTo(p2x + ox, p2y + oy);
      ctx.stroke();

      const drawArrow = (ax, ay, dirX, dirY) => {
        ctx.beginPath(); ctx.moveTo(ax, ay);
        ctx.lineTo(ax + dirX*5 + dirY*5, ay + dirY*5 - dirX*5);
        ctx.lineTo(ax + dirX*5 - dirY*5, ay + dirY*5 + dirX*5);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
      };
      
      if (vertical) {
        drawArrow(p1x+ox, p1y+oy, 0, Math.sign(p2y-p1y));
        drawArrow(p2x+ox, p2y+oy, 0, Math.sign(p1y-p2y));
      } else {
        drawArrow(p1x+ox, p1y+oy, Math.sign(p2x-p1x), 0);
        drawArrow(p2x+ox, p2y+oy, Math.sign(p1x-p2x), 0);
      }

      ctx.fillStyle = '#e2e8f0'; ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (vertical) {
        ctx.save(); ctx.translate(p1x + ox + (offset > 0 ? 15 : -15), (p1y + p2y)/2 + oy);
        ctx.rotate(-Math.PI/2); ctx.fillText(text, 0, 0); ctx.restore();
      } else {
        ctx.fillText(text, (p1x + p2x)/2 + ox, p1y + oy + (offset > 0 ? 10 : -10));
      }
    };

    drawDim(0, rootTE, 0, rootLE, `c_root = ${rootChord.toFixed(2)}m`, 0.8, true, toX_P, toY_P, scaleP);
    drawDim(halfSpan, rightTipTE, halfSpan, rightTipLE, `c_tip = ${tipChord.toFixed(2)}m`, 0.8, true, toX_P, toY_P, scaleP);
    drawDim(-halfSpan, leftTipLE, halfSpan, rightTipLE, `Span b = ${sSpan.toFixed(2)}m`, -1.5, false, toX_P, toY_P, scaleP);
    
    ctx.fillStyle = '#ef4444'; ctx.textAlign = 'left';
    ctx.fillText(`MAC = ${mac.toFixed(2)}m`, toX_P(yMAC) + 10, toY_P(xMAC + mac/2));
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(`Λ = ${safe(sweepDeg).toFixed(1)}°`, toX_P(halfSpan*0.5), toY_P((rightTipLE + tipChord/4)*0.5) - 10);

    ctx.fillStyle = '#64748b'; ctx.font = 'bold 12px "Inter"'; ctx.textAlign = 'left';
    ctx.fillText("TOP PLANFORM VIEW", 20, 30);

    // VIEW 2: FRONT ELEVATION
    const viewHeightFront = Math.max(rootChord * 0.2, tipOffsetY + rootChord*0.1);
    const scaleF = safe(Math.min((rightW - 40) / sSpan, (H/2 - 60) / viewHeightFront), 10);
    const cxF = leftW + rightW / 2;
    const cyF = H/4 + 20;

    const toX_F = (x) => cxF + x * scaleF;
    const toY_F = (y) => cyF - y * scaleF; 

    let tMaxNorm = 0.12;
    if (airfoilCoords.length > 0) {
        let maxY = -Infinity, minY = Infinity;
        airfoilCoords.forEach(p => { if (p[1] > maxY) maxY = p[1]; if (p[1] < minY) minY = p[1]; });
        tMaxNorm = maxY - minY;
    }
    const rootT = rootChord * tMaxNorm;
    const tipT = tipChord * tMaxNorm;

    ctx.beginPath();
    ctx.moveTo(toX_F(0), toY_F(rootT/2)); 
    ctx.lineTo(toX_F(halfSpan), toY_F(-tipOffsetY + tipT/2)); 
    ctx.lineTo(toX_F(halfSpan), toY_F(-tipOffsetY - tipT/2)); 
    ctx.lineTo(toX_F(0), toY_F(-rootT/2)); 
    ctx.lineTo(toX_F(-halfSpan), toY_F(-tipOffsetY - tipT/2)); 
    ctx.lineTo(toX_F(-halfSpan), toY_F(-tipOffsetY + tipT/2)); 
    ctx.closePath();

    ctx.fillStyle = 'rgba(16, 185, 129, 0.15)'; ctx.fill();
    ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2; ctx.stroke();

    ctx.beginPath(); ctx.moveTo(toX_F(-halfSpan - 0.5), toY_F(0)); ctx.lineTo(toX_F(halfSpan + 0.5), toY_F(0));
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);

    drawDim(0, 0, halfSpan, -tipOffsetY, `Γ = ${safe(dihedralDeg).toFixed(1)}°`, -0.8, false, toX_F, toY_F, scaleF);
    ctx.fillStyle = '#64748b'; ctx.font = 'bold 12px "Inter"'; ctx.textAlign = 'left';
    ctx.fillText("FRONT ELEVATION (DIHEDRAL)", leftW + 20, 30);

    // VIEW 3: SIDE PROFILE
    const scaleS = safe(Math.min((rightW - 60) / rootChord, (H/2 - 60) / (rootChord * 0.6)), 10);
    const cxS = leftW + 30;
    const cyS = H * 0.75;
    const toX_S = (x) => cxS + x * scaleS;
    const toY_S = (y) => cyS - y * scaleS; 

    const drawSideProfile = (chordLen, angleDeg, color, label) => {
        ctx.save();
        ctx.translate(toX_S(0), toY_S(0)); 
        ctx.rotate(-safe(angleDeg) * Math.PI / 180); 
        ctx.beginPath();
        ctx.moveTo(airfoilCoords[0][0] * chordLen * scaleS, -airfoilCoords[0][1] * chordLen * scaleS);
        airfoilCoords.forEach(p => ctx.lineTo(p[0] * chordLen * scaleS, -p[1] * chordLen * scaleS));
        ctx.fillStyle = `${color}20`; ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();

        ctx.fillStyle = color; ctx.font = '10px "JetBrains Mono"';
        ctx.fillText(label, toX_S(chordLen) + 10, toY_S(0) - 10 + (safe(angleDeg) * 2));
    };

    ctx.beginPath(); ctx.moveTo(toX_S(-0.1), toY_S(0)); ctx.lineTo(toX_S(rootChord * 1.1), toY_S(0));
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);

    drawSideProfile(tipChord, safe(alphaDeg) - safe(twistDeg), '#a855f7', `TIP (α=${(safe(alphaDeg) - safe(twistDeg)).toFixed(1)}°)`);
    drawSideProfile(rootChord, safe(alphaDeg), '#00F2FF', `ROOT (α=${safe(alphaDeg).toFixed(1)}°)`);

    ctx.fillStyle = '#64748b'; ctx.font = 'bold 12px "Inter"'; ctx.textAlign = 'left';
    ctx.fillText("SIDE PROFILE (AOA & WASHOUT)", leftW + 20, H/2 + 30);

    // Title Block
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; ctx.fillRect(leftW + rightW - 220, H - 70, 210, 60);
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1; ctx.strokeRect(leftW + rightW - 220, H - 70, 210, 60);
    ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 12px "Inter"'; ctx.fillText("AEROSPACE CAD", leftW + rightW - 210, H - 50);
    ctx.fillStyle = '#e2e8f0'; ctx.font = '9px "JetBrains Mono"';
    ctx.fillText(`DESIGN: ${projectName.substring(0,15)}`, leftW + rightW - 210, H - 35);
    ctx.fillText(`AR: ${sAR.toFixed(2)} | S: ${(sSpan*rootChord*(1+sTaper)/2).toFixed(2)}m²`, leftW + rightW - 210, H - 20);

  }, [AR, taperRatio, sweepDeg, dihedralDeg, twistDeg, alphaDeg, span, cstParams, projectName, airfoilCoords]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', borderRadius: '6px' }} />;
}

// ============================================================
// 3. ADVANCED 3D WIND TUNNEL VIEWPORT
// ============================================================
function AutoFitCamera({ spanVal }) {
  const { camera, controls } = useThree();
  useEffect(() => {
      const targetDist = Math.max(15, safe(spanVal) * 1.5);
      const dir = camera.position.clone().normalize();
      camera.position.copy(dir.multiplyScalar(targetDist));
      camera.far = Math.max(1000, targetDist * 10);
      camera.updateProjectionMatrix();
      if (controls) {
          controls.maxDistance = targetDist * 5;
          controls.update();
      }
  }, [spanVal, camera, controls]);
  return null;
}

const getAeroColor = (v, vmin, vmax) => {
  const c = new THREE.Color('#94a3b8'); 
  if (vmax === vmin) return c;
  const t = Math.max(0, Math.min(1, (v - vmin) / (vmax - vmin)));
  c.lerp(new THREE.Color('#00f2ff'), t * 0.9); 
  return c;
};

function WindTunnelStreamlines({ span, velocity, alpha }) {
  const count = 400;
  const mesh = useRef();
  const dummy = new THREE.Object3D();
  
  const particles = useMemo(() => {
    const temp = [];
    const sSpan = safe(span, 10);
    const sVel = safe(velocity, 50);
    for (let i = 0; i < count; i++) {
      temp.push({
        x: (Math.random() - 0.5) * (sSpan * 1.5),
        y: (Math.random() - 0.5) * 8, 
        z: (Math.random() - 0.5) * 30 - 15,
        speed: Math.max(10, sVel * 0.3) * (0.8 + Math.random() * 0.4)
      });
    }
    return temp;
  }, [span, velocity]);

  useFrame((state, delta) => {
    const alphaRad = safe(alpha) * Math.PI / 180;
    particles.forEach((p, i) => {
      p.z += p.speed * delta;
      
      if (p.z > -3 && p.z < 3 && Math.abs(p.x) < safe(span)/2) {
        const deflection = Math.sin(alphaRad) * p.speed * delta;
        p.y -= (p.z < 1 ? -deflection : deflection) * 0.5;
      }
      
      if (p.z > 15) {
        p.z = -15 - Math.random() * 5;
        p.y = (Math.random() - 0.5) * 8;
        p.x = (Math.random() - 0.5) * (safe(span) * 1.5);
      }

      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.set(0.015, 0.015, 0.6 + p.speed * 0.03); 
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[null, null, count]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#00F2FF" transparent opacity={0.2} blending={THREE.AdditiveBlending} />
    </instancedMesh>
  );
}

function Wing3DModel({ AR, taperRatio, sweepDeg, twistDeg, dihedralDeg, span, spanDist, cstParams, mRoot, alpha }) {
  
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const chordRes = 80; 
    const spanRes = 50;  
    
    const rawCoords = generateAirfoilCoordinates(cstParams, chordRes);
    if (!rawCoords || rawCoords.length === 0) return geo;

    const sSpan = safe(span, 10);
    const sAR = safe(AR, 8);
    const sTaper = safe(taperRatio, 0.5);

    const rootChord = (2 * sSpan) / (sAR * (1 + sTaper));
    const halfSpan = sSpan / 2;
    
    const vertices = [];
    const colors = [];
    const indices = [];
    
    const maxCL = spanDist && spanDist.length > 0 ? Math.max(...spanDist.map(s => safe(s.localCL))) : 1;
    const minCL = 0;

    for (let i = 0; i <= spanRes; i++) {
      const t = (i / spanRes) * 2 - 1; 
      const absT = Math.abs(t);
      const spanX = t * halfSpan; 
      
      const localChord = rootChord * (1 - absT * (1 - sTaper));
      const sweepZ = absT * halfSpan * Math.tan(safe(sweepDeg) * Math.PI / 180); 
      const dihedralY = absT * halfSpan * Math.tan(safe(dihedralDeg) * Math.PI / 180); 
      const localTwist = -absT * safe(twistDeg) * (Math.PI / 180); 
      
      const bendScale = Math.min(safe(mRoot) * 0.05, 2.0); 
      const deflectY = bendScale * Math.pow(absT, 2);

      const statIdx = Math.floor(absT * (spanDist?.length - 1 || 0));
      const localCL = spanDist?.[statIdx]?.localCL || 0.5;
      const vColor = getAeroColor(localCL, minCL, maxCL);

      for (let j = 0; j < rawCoords.length; j++) {
        const pt = rawCoords[j];
        const z_c = (pt[0] !== undefined ? pt[0] : pt.x) - 0.25; 
        const y_c = pt[1] !== undefined ? pt[1] : pt.y;

        const rz = z_c * Math.cos(localTwist) - y_c * Math.sin(localTwist);
        const ry = z_c * Math.sin(localTwist) + y_c * Math.cos(localTwist);

        const finalZ = sweepZ + (rz + 0.25) * localChord;
        const finalY = dihedralY + deflectY + ry * localChord;

        vertices.push(spanX, finalY, finalZ);
        colors.push(vColor.r, vColor.g, vColor.b);
      }
    }

    const pts = rawCoords.length;
    for (let i = 0; i < spanRes; i++) {
      for (let j = 0; j < pts - 1; j++) {
        const a = i * pts + j;
        const b = i * pts + j + 1;
        const c = (i + 1) * pts + j;
        const d = (i + 1) * pts + j + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
  }, [AR, taperRatio, sweepDeg, twistDeg, dihedralDeg, span, cstParams, spanDist, mRoot]);

  const liftVectors = useMemo(() => {
    if (!spanDist || spanDist.length === 0) return [];
    
    const sSpan = safe(span, 10);
    const sAR = safe(AR, 8);
    const sTaper = safe(taperRatio, 0.5);

    const rootChord = (2 * sSpan) / (sAR * (1 + sTaper));
    const halfSpan = sSpan / 2;
    const vectors = [];
    
    for (let i = -12; i <= 12; i++) {
      if (i === 0) continue;
      const t = i / 12;
      const absT = Math.abs(t);
      const spanX = t * halfSpan;
      
      const localChord = rootChord * (1 - absT * (1 - sTaper));
      const sweepZ = absT * halfSpan * Math.tan(safe(sweepDeg) * Math.PI / 180);
      const dihedralY = absT * halfSpan * Math.tan(safe(dihedralDeg) * Math.PI / 180);
      const deflectY = Math.min(safe(mRoot) * 0.05, 2.0) * Math.pow(absT, 2);

      const statIdx = Math.floor(absT * (spanDist.length - 1));
      const cl = safe(spanDist[statIdx]?.localCL, 0);
      
      const zPos = sweepZ + 0.25 * localChord;
      const yPos = dihedralY + deflectY + 0.1; 
      
      vectors.push({ pos: [spanX, yPos, zPos], length: cl * 1.5, cl });
    }
    return vectors;
  }, [AR, taperRatio, sweepDeg, dihedralDeg, span, spanDist, mRoot]);

  const sSpan = safe(span, 10);
  const sAR = safe(AR, 8);
  const sTaper = safe(taperRatio, 0.5);
  const mRootSafe = safe(mRoot);
  const sweepSafe = safe(sweepDeg);
  const dihedralSafe = safe(dihedralDeg);
  const alphaSafe = safe(alpha);

  const tipY = (sSpan/2) * Math.tan(dihedralSafe * Math.PI/180) + Math.min(mRootSafe*0.05, 2.0);
  const tipZ = (sSpan/2) * Math.tan(sweepSafe * Math.PI/180) + ((2*sSpan)/(sAR*(1+sTaper)))*sTaper;

  return (
    <group rotation={[-alphaSafe * Math.PI / 180, 0, 0]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial 
          vertexColors={true} 
          roughness={0.3} 
          metalness={0.8} 
          clearcoat={1.0}
          clearcoatRoughness={0.1}
          side={THREE.DoubleSide} 
        />
      </mesh>
      
      <mesh geometry={geometry}>
        <meshBasicMaterial color="#1e293b" wireframe transparent opacity={0.05} />
      </mesh>

      {liftVectors.map((vec, i) => (
        <group key={i} position={vec.pos}>
          <mesh position={[0, vec.length / 2, 0]}>
            <cylinderGeometry args={[0.02, 0.02, vec.length, 8]} />
            <meshBasicMaterial color="#00F2FF" transparent opacity={0.6} />
          </mesh>
          <mesh position={[0, vec.length, 0]}>
            <coneGeometry args={[0.08, 0.2, 8]} />
            <meshBasicMaterial color="#00F2FF" />
          </mesh>
        </group>
      ))}

      {Number.isFinite(tipY) && Number.isFinite(tipZ) && (
        <>
          <Trail width={0.4} length={15} color="#a855f7" attenuation={(t) => t * t}>
            <mesh position={[sSpan/2, tipY, tipZ]}>
              <sphereGeometry args={[0.02]} />
              <meshBasicMaterial transparent opacity={0} />
            </mesh>
          </Trail>
          <Trail width={0.4} length={15} color="#a855f7" attenuation={(t) => t * t}>
            <mesh position={[-sSpan/2, tipY, tipZ]}>
              <sphereGeometry args={[0.02]} />
              <meshBasicMaterial transparent opacity={0} />
            </mesh>
          </Trail>
        </>
      )}
    </group>
  );
}

// ============================================================
// 4. UI COMPONENTS
// ============================================================
function IndustrialTooltip2({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: 'rgba(11,15,20,0.97)', border: '1px solid #30363d',
      borderRadius: '6px', padding: '8px 12px', fontFamily: '"Consolas",monospace', fontSize: '11px' }}>
      <div style={{ color: '#8b949e', marginBottom: '4px' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || p.stroke, marginBottom: '2px' }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(4) : p.value}</strong>
        </div>
      ))}
    </div>
  );
}

function ParamSlider({ label, value, min, max, step, unit = '', onChange, color = '#007AFF' }) {
  return (
    <div className={styles.paramRow}>
      <div className={styles.paramLabel}>
        <span>{label}</span>
        <span style={{ color, fontFamily: '"Consolas",monospace', fontSize: '0.75rem' }}>
          {typeof value === 'number' ? value.toFixed(step < 0.01 ? 4 : step < 1 ? 2 : 1) : value}{unit}
        </span>
      </div>
      <input type="range" className={styles.slider} min={min} max={max} step={step}
        value={safe(value)} onChange={e => onChange(Number(e.target.value))}
        style={{ '--slider-color': color }} />
    </div>
  );
}

function Toast({ toasts }) {
  return (
    <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {toasts.map(t => (
        <div key={t.id} style={{ background: t.type === 'error' ? 'rgba(239,68,68,0.95)' : 'rgba(0,255,194,0.15)',
          border: `1px solid ${t.type === 'error' ? '#ef4444' : '#00FFC2'}`, borderRadius: '6px',
          padding: '10px 16px', fontSize: '0.8rem', color: '#e2e8f0', backdropFilter: 'blur(8px)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// 5. MAIN PAGE ASSEMBLE
// ============================================================
function FiniteWingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fileInputRef = useRef(null);

  // --- Airfoil State ---
  const [cstParams, setCstParams] = useState(NACA4412_CST);
  const [designName, setDesignName] = useState('NACA4412');
  const [alpha2D, setAlpha2D] = useState(4.0);
  const [CL2D, setCL2D] = useState(0.85);
  const [CD2D, setCD2D] = useState(0.0095);
  const [CM2D, setCM2D] = useState(-0.055);

  // --- Planform State ---
  const [AR, setAR] = useState(8.0);
  const [taperRatio, setTaperRatio] = useState(0.45);
  const [sweepDeg, setSweepDeg] = useState(15.0);
  const [twistDeg, setTwistDeg] = useState(-2.0);
  const [dihedralDeg, setDihedralDeg] = useState(3.0); 
  const [span, setSpan] = useState(10.0); 
  const [velocity, setVelocity] = useState(55.0); 
  const [altitude, setAltitude] = useState(0.0);

  // --- Computed Atmospherics ---
  const chord = safe(span) / safe(AR, 8);
  const T = 288.15 - 0.0065 * safe(altitude, 0);
  const P = 101325 * Math.pow(1 - 0.0065 * safe(altitude, 0) / 288.15, 5.255);
  const rho = P / (287.05 * T);
  const speedOfSound = Math.sqrt(1.4 * 287.05 * T);
  const mu = 1.458e-6 * Math.pow(T, 1.5) / (T + 110.4);
  const kinVisc = mu / rho;
  
  const mach = safe(velocity, 55) / speedOfSound;
  const reynolds = (safe(velocity, 55) * chord) / kinVisc;

  // --- Modals & State ---
  const [vlmResult, setVlmResult] = useState(null);
  const [acoustics, setAcoustics] = useState(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('PLANFORM');
  const [planformView, setPlanformView] = useState('3D'); 
  const [toasts, setToasts] = useState([]);
  
  const [libModalOpen, setLibModalOpen] = useState(false);
  const [libSearchQuery, setLibSearchQuery] = useState('');
  const [libResults, setLibResults] = useState([]);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const showToast = useCallback((msg, type = 'success') => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  // --- Load from URL params ---
  useEffect(() => {
    const cst = searchParams.get('cst');
    const name = searchParams.get('name');
    const al = searchParams.get('alpha');
    const re = searchParams.get('re');

    if (cst) {
      try { 
        const parsed = JSON.parse(decodeURIComponent(cst));
        let upper, lower;
        if (parsed.a_upper) {
          upper = parsed.a_upper;
          lower = parsed.a_lower;
        } else if (Array.isArray(parsed) && parsed.length === 16) {
          upper = parsed.slice(0, 8);
          lower = parsed.slice(8, 16);
        } else {
          throw new Error('Invalid CST format');
        }
        setCstParams({ a_upper: upper, a_lower: lower });
        if (name) setDesignName(decodeURIComponent(name));
        if (al) setAlpha2D(Number(al));
        if (re) {
          // Trigger re-prediction with new Reynolds
        }
        showToast(`Loaded: ${name ? decodeURIComponent(name) : 'Design from Workbench'}`, 'success');
      } catch (e) {
        console.error('Failed to load CST:', e);
        showToast('Failed to load design from Workbench', 'error');
      }
    }
    if (name && !cst) setDesignName(name);
    if (al) setAlpha2D(Number(al));
  }, [searchParams, showToast]);

  // --- Open in Workbench ---
  const openInWorkbench = () => {
    const cstArray = [...cstParams.a_upper, ...cstParams.a_lower];
    const cstString = encodeURIComponent(JSON.stringify(cstArray));
    router.push(`/workbench?importedCST=${cstString}&name=${encodeURIComponent(designName)}&re=${reynolds}&alpha=${alpha2D}&mach=${mach}`);
  };

  // --- Library Search ---
  useEffect(() => {
    if (libSearchQuery.length < 3) { setLibResults([]); return; }
    const timer = setTimeout(async () => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_BASE_URL}/airfoils/search?q=${libSearchQuery}`, { headers: { 'Authorization': `Bearer ${token}` }});
            if (res.ok) setLibResults(await res.json());
        } catch (e) {}
    }, 300);
    return () => clearTimeout(timer);
  }, [libSearchQuery]);

  const selectLibraryAirfoil = async (airfoilName) => {
    setLibModalOpen(false);
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_BASE_URL}/airfoils/${airfoilName}`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
            const data = await res.json();
            setCstParams(prev => ({...prev, a_upper: data.cst_coefficients.slice(0, 8), a_lower: data.cst_coefficients.slice(8, 16) }));
            setDesignName(data.name);
            showToast(`Loaded ${data.name} from library`);
        }
    } catch (e) { showToast('Failed to download library profile.', 'error'); }
  };

  // --- Local File Import ---
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData(); formData.append('file', file);
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_BASE_URL}/airfoils/import`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
        if (res.ok) {
            const data = await res.json();
            setCstParams(prev => ({...prev, a_upper: data.cst_coefficients.slice(0, 8), a_lower: data.cst_coefficients.slice(8, 16) }));
            setDesignName(data.filename);
            showToast(`Geometry Loaded: ${data.filename}`);
        }
    } catch (err) { showToast("Upload failed", "error"); }
    e.target.value = null; 
  };

  const handleExportSTL = () => {
      const chordRes = 80;
      const spanRes = 50;
      const rawCoords = generateAirfoilCoordinates(cstParams, chordRes);
      
      const sSpan = safe(span, 10);
      const sAR = safe(AR, 8);
      const sTaper = safe(taperRatio, 0.5);

      const rootChord = (2 * sSpan) / (sAR * (1 + sTaper));
      const halfSpan = sSpan / 2;

      let stl = `solid AeroML_Wing_${designName}\n`;

      const getVertex = (i, j) => {
          const t = (i / spanRes) * 2 - 1;
          const absT = Math.abs(t);
          const spanX = t * halfSpan;
          const localChord = rootChord * (1 - absT * (1 - sTaper));
          const sweepZ = absT * halfSpan * Math.tan(safe(sweepDeg) * Math.PI / 180);
          const dihedralY = absT * halfSpan * Math.tan(safe(dihedralDeg) * Math.PI / 180);
          const localTwist = -absT * safe(twistDeg) * (Math.PI / 180);

          const pt = rawCoords[j];
          const z_c = (pt[0] !== undefined ? pt[0] : pt.x) - 0.25;
          const y_c = pt[1] !== undefined ? pt[1] : pt.y;

          const rz = z_c * Math.cos(localTwist) - y_c * Math.sin(localTwist);
          const ry = z_c * Math.sin(localTwist) + y_c * Math.cos(localTwist);

          const finalZ = sweepZ + (rz + 0.25) * localChord;
          const finalY = dihedralY + ry * localChord; 

          return new THREE.Vector3(spanX, finalY, finalZ);
      };

      const writeTriangle = (v1, v2, v3) => {
          const cb = new THREE.Vector3().subVectors(v3, v2);
          const ab = new THREE.Vector3().subVectors(v1, v2);
          const normal = new THREE.Vector3().crossVectors(cb, ab).normalize();
          
          stl += `facet normal ${safe(normal.x).toExponential(4)} ${safe(normal.y).toExponential(4)} ${safe(normal.z).toExponential(4)}\n`;
          stl += `  outer loop\n`;
          stl += `    vertex ${safe(v1.x).toExponential(4)} ${safe(v1.y).toExponential(4)} ${safe(v1.z).toExponential(4)}\n`;
          stl += `    vertex ${safe(v2.x).toExponential(4)} ${safe(v2.y).toExponential(4)} ${safe(v2.z).toExponential(4)}\n`;
          stl += `    vertex ${safe(v3.x).toExponential(4)} ${safe(v3.y).toExponential(4)} ${safe(v3.z).toExponential(4)}\n`;
          stl += `  endloop\n`;
          stl += `endfacet\n`;
      };

      const pts = rawCoords.length;
      for (let i = 0; i < spanRes; i++) {
          for (let j = 0; j < pts - 1; j++) {
              const vA = getVertex(i, j);
              const vB = getVertex(i, j + 1);
              const vC = getVertex(i + 1, j);
              const vD = getVertex(i + 1, j + 1);
              writeTriangle(vA, vC, vB);
              writeTriangle(vB, vC, vD);
          }
      }

      const capTip = (iIndex, flip) => {
          const center = getVertex(iIndex, 0).clone().add(getVertex(iIndex, Math.floor(pts/2))).multiplyScalar(0.5);
          for (let j = 0; j < pts - 1; j++) {
              const v1 = getVertex(iIndex, j);
              const v2 = getVertex(iIndex, j + 1);
              if (flip) writeTriangle(center, v1, v2);
              else writeTriangle(center, v2, v1);
          }
      };
      
      capTip(0, true); 
      capTip(spanRes, false); 

      stl += `endsolid AeroML_Wing_${designName}\n`;
      const blob = new Blob([stl], { type: 'text/plain' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `AeroML_Wing_${designName.replace(/ /g, '_')}.stl`;
      link.click();
      URL.revokeObjectURL(link.href);
      showToast('STL Solid Model Extracted for CAD', 'success');
  };

  const fetch2DPrediction = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setApiLoading(true);
    try {
      const cst_arr = [...(cstParams.a_upper || []), ...(cstParams.a_lower || [])];
      const res = await fetch(`${API_BASE_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ cst_coefficients: cst_arr, reynolds: safe(reynolds, 1e6), alpha: safe(alpha2D), mach: safe(mach), n_crit: 9 })
      });
      if (res.ok) {
        const d = await res.json();
        setCL2D(safe(d.cl, 0.85));
        setCD2D(safe(d.cd, 0.015));
        setCM2D(safe(d.cm, -0.05));
      }
    } catch (e) {
      showToast('2D prediction failed', 'error');
    } finally {
      setApiLoading(false);
    }
  }, [cstParams, reynolds, alpha2D, mach, showToast]);

  useEffect(() => {
    const t = setTimeout(fetch2DPrediction, 600);
    return () => clearTimeout(t);
  }, [fetch2DPrediction]);

  useEffect(() => {
    const result = runVLM({ AR, taperRatio, sweepDeg, twistDeg, dihedralDeg, CL2D, CD2D, alpha: alpha2D, velocity, altitude, chord, span });
    setVlmResult(result);

    const ac = computeBPMAcoustics({ velocity, chord, span, reynolds, CL: CL2D, alpha: alpha2D });
    setAcoustics(ac);
  }, [AR, taperRatio, sweepDeg, twistDeg, dihedralDeg, CL2D, CD2D, alpha2D, velocity, altitude, chord, span, reynolds]);

  const handleGenerateReport = () => {
    if (!vlmResult) return showToast("Await matrix convergence.", "error");
    setIsGeneratingPDF(true);
    setTimeout(() => {
        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pw = pdf.internal.pageSize.getWidth();
            const ph = pdf.internal.pageSize.getHeight();
            
            pdf.setFillColor(255, 255, 255); pdf.rect(0, 0, pw, ph, 'F');
            
            pdf.setFillColor(15, 23, 42); pdf.rect(0, 0, pw, 35, 'F');
            pdf.setTextColor(0, 242, 255); pdf.setFontSize(22); pdf.setFont('helvetica', 'bold');
            pdf.text("FINITE WING AEROELASTIC & ACOUSTIC REPORT", 15, 20);
            pdf.setTextColor(248, 250, 252); pdf.setFontSize(10); pdf.setFont('courier', 'normal');
            pdf.text(`AeroML // Design: ${designName.toUpperCase()} | Date: ${new Date().toISOString().split('T')[0]}`, 15, 28);

            pdf.setTextColor(15, 23, 42); pdf.setFontSize(14); pdf.setFont('helvetica', 'bold');
            pdf.text("1. PLANFORM & FLIGHT CONFIGURATION", 15, 50);
            
            autoTable(pdf, {
                startY: 55,
                head: [['Parameter', 'Value', 'Parameter', 'Value']],
                body: [
                    ['Wingspan (b)', `${safe(span).toFixed(2)} m`, 'Velocity (V)', `${safe(velocity).toFixed(1)} m/s`],
                    ['Aspect Ratio (AR)', safe(AR).toFixed(2), 'Mach (M)', safe(mach).toFixed(3)],
                    ['Taper Ratio (λ)', safe(taperRatio).toFixed(3), 'Reynolds (Re)', `${(safe(reynolds)/1e6).toFixed(2)} M`],
                    ['Sweep (Λ c/4)', `${safe(sweepDeg).toFixed(1)}°`, 'Alpha 2D (α)', `${safe(alpha2D).toFixed(1)}°`],
                    ['Twist / Washout', `${safe(twistDeg).toFixed(1)}°`, 'Dihedral (Γ)', `${safe(dihedralDeg).toFixed(1)}°`]
                ],
                theme: 'grid',
                headStyles: { fillColor: [0, 122, 255], textColor: [255, 255, 255], font: 'courier' },
                styles: { font: 'courier', fontSize: 9 }
            });

            const curY = pdf.lastAutoTable.finalY + 15;
            pdf.setTextColor(15, 23, 42); pdf.setFontSize(14); pdf.setFont('helvetica', 'bold');
            pdf.text("2. VLM 3D AERODYNAMIC TENSORS", 15, curY);

            autoTable(pdf, {
                startY: curY + 5,
                head: [['Metric', 'Computed Value', 'Description']],
                body: [
                    ['3D Lift (CL)', safe(vlmResult.CL3D).toFixed(4), 'Total integrated wing lift coefficient'],
                    ['Total Drag (CD)', safe(vlmResult.CDtotal).toFixed(5), 'Profile Drag + Induced Drag'],
                    ['Induced Drag (CDi)', safe(vlmResult.CDi).toFixed(5), 'Drag due to wingtip vortices'],
                    ['Oswald Efficiency (e)', safe(vlmResult.e_oswald).toFixed(4), 'Spanwise loading efficiency (1.0 = ideal)'],
                    ['L/D Ratio', safe(vlmResult.LD3D).toFixed(2), 'Aerodynamic Glide Ratio'],
                    ['Root Bending Moment', safe(vlmResult.Mroot).toFixed(3), 'Normalized structural cantilever load'],
                    ['Tip Stall Risk', (safe(vlmResult.tipStallRisk) * 100).toFixed(1) + '%', safe(vlmResult.tipStallRisk) > 0.85 ? 'WARNING: HIGH RISK' : 'Stable']
                ],
                theme: 'striped',
                headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], font: 'courier' },
                styles: { font: 'courier', fontSize: 9 }
            });

            const acY = pdf.lastAutoTable.finalY + 15;
            pdf.setTextColor(15, 23, 42); pdf.setFontSize(14); pdf.setFont('helvetica', 'bold');
            pdf.text("3. AEROACOUSTIC SIGNATURE (BPM METHOD)", 15, acY);

            autoTable(pdf, {
                startY: acY + 5,
                head: [['Acoustic Metric', 'Calculated Value']],
                body: [
                    ['Overall Sound Pressure Level (OASPL)', `${safe(acoustics?.overall_spl_db).toFixed(1)} dB`],
                    ['Peak Frequency', `${safe(acoustics?.peak_frequency_hz) >= 1000 ? (safe(acoustics?.peak_frequency_hz)/1000).toFixed(1) + ' kHz' : Math.round(safe(acoustics?.peak_frequency_hz)) + ' Hz'}`],
                    ['Primary Noise Source', 'Turbulent Boundary Layer - Trailing Edge (TBL-TE)']
                ],
                theme: 'grid',
                headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], font: 'courier' },
                styles: { font: 'courier', fontSize: 9 }
            });

            pdf.save(`AeroML_FiniteWing_${designName}.pdf`);
            showToast("Report Generated Successfully");
        } catch (error) {
            console.error(error);
            showToast("Failed to generate PDF.", "error");
        } finally {
            setIsGeneratingPDF(false);
        }
    }, 100);
  };

  const spanDistData = useMemo(() => {
    if (!vlmResult || !vlmResult.spanDist) return [];
    return vlmResult.spanDist.map(s => ({
      y: s.y,
      localCL: s.localCL,
      ellipticCL: s.ellipticCL,
      chord: s.chord,
      localCD: s.localCD * 100,
    }));
  }, [vlmResult]);

  const tipStallColor = vlmResult ? (vlmResult.tipStallRisk > 0.85 ? '#ef4444' : vlmResult.tipStallRisk > 0.65 ? '#f59e0b' : '#00FFC2') : '#8b949e';
  const tipStallLabel = vlmResult ? (vlmResult.tipStallRisk > 0.85 ? 'HIGH RISK' : vlmResult.tipStallRisk > 0.65 ? 'MODERATE' : 'STABLE') : '---';

  const TABS = ['PLANFORM', 'SPANWISE', 'INDUCED DRAG', 'ACOUSTICS', 'LOAD MAP'];

  return (
    <div className={styles.container}>
      <Toast toasts={toasts} />
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".dat,.txt,.csv" onChange={handleFileChange} />

      {/* ===== LEFT: CONTROL PANEL ===== */}
      <div className={styles.controlPanel}>
        <div className={styles.panelHeader}>
          <FiWind className={styles.panelIcon} />
          <span>FINITE-WING SOLVER</span>
          {apiLoading && <span className={styles.loadingDot} />}
        </div>

        <div className={styles.designNameBadge}>
          <span className={styles.designLabel}>AIRFOIL SECTION</span>
          <span className={styles.designName}>{designName}</span>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>2D SECTION POLAR</div>
          <div className={styles.miniGrid}>
            <div className={styles.miniCard}>
              <span className={styles.miniLabel}>CL₂D</span>
              <span className={styles.miniVal} style={{ color: '#007AFF' }}>{safe(CL2D).toFixed(4)}</span>
            </div>
            <div className={styles.miniCard}>
              <span className={styles.miniLabel}>CD₂D</span>
              <span className={styles.miniVal} style={{ color: '#ef4444' }}>{safe(CD2D).toFixed(5)}</span>
            </div>
            <div className={styles.miniCard}>
              <span className={styles.miniLabel}>CM₂D</span>
              <span className={styles.miniVal} style={{ color: '#a855f7' }}>{safe(CM2D).toFixed(4)}</span>
            </div>
            <div className={styles.miniCard}>
              <span className={styles.miniLabel}>L/D₂D</span>
              <span className={styles.miniVal} style={{ color: '#00FFC2' }}>{safe(CD2D) !== 0 ? (safe(CL2D) / safe(CD2D)).toFixed(1) : '---'}</span>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>FLIGHT CONDITIONS</div>
          <ParamSlider label="Alpha (α)" value={alpha2D} min={-5} max={20} step={0.5} unit="°" onChange={setAlpha2D} color="#00FFC2" />
          <ParamSlider label="Velocity" value={velocity} min={10} max={340} step={1} unit=" m/s" onChange={setVelocity} color="#ff7a00" />
          <ParamSlider label="Altitude" value={altitude} min={0} max={15000} step={100} unit=" m" onChange={setAltitude} color="#007AFF" />
          
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <div style={{flex: 1, background: '#161b22', border: '1px solid #30363d', padding: '8px', borderRadius: '4px', textAlign: 'center'}}>
                 <div style={{fontSize: '0.6rem', color: '#8b949e', marginBottom: '2px'}}>MACH NUMBER</div>
                 <div style={{fontSize: '0.9rem', color: '#f59e0b', fontWeight: 'bold'}}>{mach.toFixed(3)}</div>
              </div>
              <div style={{flex: 1, background: '#161b22', border: '1px solid #30363d', padding: '8px', borderRadius: '4px', textAlign: 'center'}}>
                 <div style={{fontSize: '0.6rem', color: '#8b949e', marginBottom: '2px'}}>REYNOLDS</div>
                 <div style={{fontSize: '0.9rem', color: '#007AFF', fontWeight: 'bold'}}>{(reynolds/1e6).toFixed(2)}M</div>
              </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>WING PLANFORM</div>
          <ParamSlider label="Aspect Ratio" value={AR} min={2} max={20} step={0.1} onChange={setAR} color="#007AFF" />
          <ParamSlider label="Taper Ratio λ" value={taperRatio} min={0.1} max={1.0} step={0.01} onChange={setTaperRatio} color="#a855f7" />
          <ParamSlider label="Sweep Λ" value={sweepDeg} min={-15} max={60} step={0.5} unit="°" onChange={setSweepDeg} color="#f59e0b" />
          <ParamSlider label="Twist (washout)" value={twistDeg} min={-10} max={5} step={0.5} unit="°" onChange={setTwistDeg} color="#00FFC2" />
          <ParamSlider label="Dihedral Γ" value={dihedralDeg} min={-10} max={15} step={0.5} unit="°" onChange={setDihedralDeg} color="#f472b6" />
          <ParamSlider label="Span (b)" value={span} min={1} max={100} step={0.5} unit=" m" onChange={setSpan} color="#ef4444" />
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
                <button className={styles.exportBtn} onClick={() => setLibModalOpen(true)} style={{ flex: 1, padding: '10px 0' }}>
                    <FiDatabase size={16} /> UIUC
                </button>
                <button className={styles.exportBtn} onClick={() => fileInputRef.current.click()} style={{ flex: 1, padding: '10px 0' }}>
                    <FiUploadCloud size={16} /> Import
                </button>
            </div>
            <button className={styles.exportBtn} onClick={handleGenerateReport} disabled={!vlmResult || isGeneratingPDF} style={{ padding: '12px 0', borderColor: '#f59e0b', color: '#f59e0b', background: 'rgba(245,158,11,0.1)' }}>
                <FiFileText size={16} /> {isGeneratingPDF ? 'GENERATING...' : 'EXPORT ENGINEERING REPORT'}
            </button>
            {/* ─── OPEN IN WORKBENCH BUTTON ─── */}
            <button 
                onClick={openInWorkbench} 
                className={styles.exportBtn} 
                style={{ 
                    padding: '12px 0', 
                    borderColor: '#007AFF', 
                    color: '#007AFF', 
                    background: 'rgba(0,122,255,0.1)',
                    marginTop: '4px'
                }}
            >
                <FiBox size={16} /> OPEN IN WORKBENCH
            </button>
        </div>
      </div>

      {/* ===== CENTER: VISUALIZATION ===== */}
      <div className={styles.vizColumn}>
        <div className={styles.telemetryStrip}>
          {[
            { label: '3D LIFT CL', val: safe(vlmResult?.CL3D).toFixed(4), color: '#007AFF', icon: <FiZap /> },
            { label: 'TOTAL CD', val: safe(vlmResult?.CDtotal).toFixed(5), color: '#ef4444', icon: <FiWind /> },
            { label: 'INDUCED CDᵢ', val: safe(vlmResult?.CDi).toFixed(5), color: '#f59e0b', icon: <FiActivity /> },
            { label: 'L/D RATIO', val: safe(vlmResult?.LD3D).toFixed(2), color: '#00FFC2', icon: <FiTarget /> },
            { label: 'OSWALD e', val: safe(vlmResult?.e_oswald).toFixed(3), color: '#a855f7', icon: <FiCpu /> },
            { label: 'ROOT MOMENT', val: safe(vlmResult?.Mroot).toFixed(2), color: '#ff7a00', icon: <FiLayers /> },
            { label: 'TIP STALL', val: tipStallLabel, color: tipStallColor, icon: <FiAlertTriangle /> },
            { label: 'CHORD c', val: `${safe(chord).toFixed(2)} m`, color: '#8b949e', icon: <FiTarget /> },
          ].map((m, i) => (
            <div key={i} className={styles.telCard}>
              <div className={styles.telIcon} style={{ color: m.color }}>{m.icon}</div>
              <span className={styles.telLabel}>{m.label}</span>
              <span className={styles.telVal} style={{ color: m.color }}>{m.val}</span>
            </div>
          ))}
        </div>

        <div className={styles.tabBar}>
          {TABS.map(t => (
            <button key={t} className={`${styles.tabBtn} ${activeTab === t ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(t)}>
              {t}
            </button>
          ))}
        </div>

        <div className={styles.mainViz}>

          {activeTab === 'PLANFORM' && (
            <div className={styles.planformLayout} style={{ position: 'relative' }}>
                
                {/* Embedded Sub-Toggle for 3D vs 2D */}
                <div style={{ position: 'absolute', top: 15, left: 15, zIndex: 20, display: 'flex', gap: '5px', background: 'rgba(11, 15, 20, 0.9)', padding: '4px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                    <button onClick={() => setPlanformView('3D')} style={{ background: planformView === '3D' ? '#007AFF' : 'transparent', color: planformView === '3D' ? '#fff' : '#64748b', border: 'none', padding: '6px 12px', fontSize: '11px', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', transition: '0.2s' }}>
                        <FiMaximize2 style={{ display: 'inline', marginRight: 6 }}/> 3D KINEMATICS
                    </button>
                    <button onClick={() => setPlanformView('2D')} style={{ background: planformView === '2D' ? '#00FFC2' : 'transparent', color: planformView === '2D' ? '#000' : '#64748b', border: 'none', padding: '6px 12px', fontSize: '11px', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', transition: '0.2s' }}>
                        <FiPenTool style={{ display: 'inline', marginRight: 6 }}/> 2D CAD BLUEPRINT
                    </button>
                </div>

                <div style={{ flex: 1, width: '100%', height: '100%', background: planformView === '3D' ? '#030508' : '#06101e' }}>
                  {planformView === '3D' ? (
                      <Canvas camera={{ position: [-12, 10, 15], fov: 45 }}>
                        <AutoFitCamera spanVal={span} />
                        <color attach="background" args={['#030508']} />
                        
                        <Grid infiniteGrid fadeDistance={Math.max(50, span * 3)} cellColor="#1a1f2e" sectionColor="#2d3748" position={[0, -4, 0]} />
                        
                        <ambientLight intensity={0.4} />
                        <directionalLight 
                            position={[10, 15, 5]} 
                            intensity={1.5} 
                            castShadow 
                            shadow-camera-left={-span}
                            shadow-camera-right={span}
                            shadow-camera-top={span}
                            shadow-camera-bottom={-span}
                            shadow-mapSize={[2048, 2048]}
                        />
                        <spotLight position={[-15, 10, 0]} angle={0.4} penumbra={1} intensity={2.5} color="#00FFC2" castShadow />
                        
                       <WindTunnelStreamlines span={span} velocity={velocity} alpha={alpha2D} />

                        <group position={[0, 0, 0]}>
                            <Wing3DModel 
                              AR={AR} taperRatio={taperRatio} sweepDeg={sweepDeg} 
                             twistDeg={twistDeg} dihedralDeg={dihedralDeg} span={span} 
                             spanDist={vlmResult?.spanDist} cstParams={cstParams} 
                             mRoot={vlmResult?.Mroot || 0} alpha={alpha2D}
                            />
                        </group>

                        <ContactShadows position={[0, -3.9, 0]} opacity={0.7} scale={Math.max(40, span * 2.5)} blur={2.5} far={10} color="#000000" />
                        <OrbitControls makeDefault autoRotate autoRotateSpeed={0.3} maxPolarAngle={Math.PI / 2 - 0.05} minDistance={5} maxDistance={200} />
                        <Environment preset="studio" />
                      </Canvas>
                  ) : (
                      <WingCADBlueprint 
                          AR={AR} taperRatio={taperRatio} sweepDeg={sweepDeg} dihedralDeg={dihedralDeg}
                          twistDeg={twistDeg} alphaDeg={alpha2D} span={span} cstParams={cstParams} projectName={designName}
                      />
                  )}
                </div>
              
             <div className={styles.planformStats}>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>WING AREA S</span>
                  <span className={styles.statVal}>{(safe(span) * safe(chord) * (1 + safe(taperRatio)) / 2).toFixed(2)} m²</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>ROOT CHORD</span>
                  <span className={styles.statVal}>{(safe(chord) * 2 / (1 + safe(taperRatio))).toFixed(3)} m</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>TIP CHORD</span>
                  <span className={styles.statVal}>{(safe(chord) * 2 * safe(taperRatio) / (1 + safe(taperRatio))).toFixed(3)} m</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>SWEEP (Λ c/4)</span>
                  <span className={styles.statVal}>{safe(sweepDeg).toFixed(1)}°</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>VLM PANELS</span>
                  <span className={styles.statVal}>40 × 1</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>MACH β</span>
                  <span className={styles.statVal}>{safe(vlmResult?.beta).toFixed(4)}</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>INDUCED DRAG %</span>
                  <span className={styles.statVal} style={{ color: '#f59e0b' }}>
                    {vlmResult && vlmResult.CDtotal > 0 ? ((vlmResult.CDi / vlmResult.CDtotal) * 100).toFixed(1) : '--'}%
                  </span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>DIHEDRAL Γ</span>
                  <span className={styles.statVal}>{safe(dihedralDeg).toFixed(1)}°</span>
                </div>
                
                <button className={styles.exportBtn} onClick={handleExportSTL} style={{ marginTop: 'auto', background: 'rgba(168, 85, 247, 0.1)', borderColor: '#a855f7', color: '#a855f7' }}>
                    <FiBox size={16} /> EXPORT 3D CAD (.STL)
                </button>
             </div>
            </div>
          )}

          {/* SPANWISE TAB */}
          {activeTab === 'SPANWISE' && (
            <div className={styles.chartContainer}>
              <div className={styles.chartTitle}>SPANWISE LIFT DISTRIBUTION — Schrenk Approximation</div>
              <ResponsiveContainer width="100%" height="85%">
                <AreaChart data={spanDistData} margin={{ top: 20, right: 30, left: 10, bottom: 40 }}>
                  <defs>
                    <linearGradient id="clGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#007AFF" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#007AFF" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="ellGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00FFC2" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#00FFC2" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
                  <XAxis dataKey="y" stroke="#8b949e" tick={{ fill: '#8b949e', fontSize: 11, fontFamily: '"Consolas",monospace' }}
                    label={{ value: 'Normalised Half-Span η', position: 'insideBottom', offset: -25, fill: '#8b949e', fontSize: 11 }} />
                  <YAxis stroke="#8b949e" tick={{ fill: '#8b949e', fontSize: 11, fontFamily: '"Consolas",monospace' }}
                    label={{ value: 'Local CL', angle: -90, position: 'insideLeft', fill: '#8b949e', fontSize: 11 }} />
                  <Tooltip content={<IndustrialTooltip2 />} />
                  <Area type="monotone" dataKey="localCL" name="Schrenk CL" stroke="#007AFF" strokeWidth={2.5} fill="url(#clGrad)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="ellipticCL" name="Elliptic Ideal" stroke="#00FFC2" strokeWidth={1.5} strokeDasharray="6 4" fill="url(#ellGrad)" isAnimationActive={false} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontFamily: '"Consolas",monospace', fontSize: 11, color: '#e2e8f0' }} />
                </AreaChart>
             </ResponsiveContainer>
            </div>
          )}

          {/* INDUCED DRAG TAB */}
          {activeTab === 'INDUCED DRAG' && (
            <div className={styles.chartContainer}>
              <div className={styles.chartTitle}>INDUCED DRAG POLAR — CDᵢ vs AR / Sweep Sensitivity</div>
              <ResponsiveContainer width="100%" height="42%">
                <LineChart data={Array.from({ length: 19 }, (_, i) => {
                  const testAR = 2 + i;
                  const eo = 0.85 * (1 - 0.045 * Math.pow(testAR, 0.68));
                  const cdi = Math.pow(safe(CL2D), 2) / (Math.PI * testAR * eo);
                  const cdtotal = safe(CD2D) + cdi;
                  return { AR: testAR, CDi: Number(cdi.toFixed(5)), CDtotal: Number(cdtotal.toFixed(5)), LD: Number((safe(CL2D) / cdtotal).toFixed(2)) };
                })} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
                  <XAxis dataKey="AR" stroke="#8b949e" tick={{ fill: '#8b949e', fontSize: 10 }}
                    label={{ value: 'Aspect Ratio', position: 'insideBottom', offset: -10, fill: '#8b949e', fontSize: 11 }} />
                  <YAxis yAxisId="drag" stroke="#8b949e" tick={{ fill: '#8b949e', fontSize: 10 }} />
                  <YAxis yAxisId="ld" orientation="right" stroke="#8b949e" tick={{ fill: '#8b949e', fontSize: 10 }} />
                  <Tooltip content={<IndustrialTooltip2 />} />
                  <ReferenceLine yAxisId="drag" x={AR} stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" />
                  <Line yAxisId="drag" type="monotone" dataKey="CDi" name="CDᵢ (induced)" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line yAxisId="drag" type="monotone" dataKey="CDtotal" name="CD (total)" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line yAxisId="ld" type="monotone" dataKey="LD" name="L/D" stroke="#00FFC2" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontFamily: '"Consolas",monospace', fontSize: 11, color: '#e2e8f0' }} />
                </LineChart>
             </ResponsiveContainer>

             <div className={styles.chartTitle} style={{ marginTop: '1rem' }}>SWEEP SENSITIVITY — CDᵢ vs Sweep Angle Λ</div>
             <ResponsiveContainer width="100%" height="42%">
                <LineChart data={Array.from({ length: 23 }, (_, i) => {
                  const sw = i * 2.5;
                  const swRad = sw * Math.PI / 180;
                  const AReff = safe(AR) * Math.cos(swRad);
                  const eo = 0.85 * (1 - 0.045 * Math.pow(AReff, 0.68));
                  const cdi = Math.pow(safe(CL2D), 2) / (Math.PI * AReff * eo);
                  return { sweep: sw, CDi: Number(cdi.toFixed(5)), AReff: Number(AReff.toFixed(2)) };
                })} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
                  <XAxis dataKey="sweep" stroke="#8b949e" tick={{ fill: '#8b949e', fontSize: 10 }}
                    label={{ value: 'Sweep Angle Λ (deg)', position: 'insideBottom', offset: -10, fill: '#8b949e', fontSize: 11 }} />
                  <YAxis stroke="#8b949e" tick={{ fill: '#8b949e', fontSize: 10 }} />
                  <Tooltip content={<IndustrialTooltip2 />} />
                  <ReferenceLine x={sweepDeg} stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="CDi" name="CDᵢ (induced)" stroke="#a855f7" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontFamily: '"Consolas",monospace', fontSize: 11, color: '#e2e8f0' }} />
                </LineChart>
             </ResponsiveContainer>
            </div>
          )}

          {/* ACOUSTICS TAB */}
          {activeTab === 'ACOUSTICS' && (
            <div className={styles.chartContainer}>
              <div className={styles.chartTitle}>
                <FiVolume2 style={{ marginRight: 8 }} /> 
                AEROACOUSTIC SIGNATURE — Brooks-Pope-Marcolini (BPM) Self-Noise Model
              </div>
              <div style={{ flex: 1, padding: '1rem' }}>
                <AcousticsPanel data={acoustics} />
              </div>
              <div className={styles.acousticsMeta}>
                <div className={styles.aMetaCard}>
                  <span>BL Displacement δ*</span>
                  <span>{acoustics ? (0.037 * safe(chord) * Math.pow(safe(reynolds), -0.2) * 1000).toFixed(3) : '---'} mm</span>
                </div>
                <div className={styles.aMetaCard}>
                  <span>Edge Velocity Uₑ</span>
                  <span>{acoustics ? (safe(velocity) * (1 + 0.13 * Math.abs(safe(CL2D)))).toFixed(1) : '---'} m/s</span>
                </div>
                <div className={styles.aMetaCard}>
                  <span>Acoustic Mach Mₐ</span>
                  <span>{(safe(velocity) / 343).toFixed(3)}</span>
                </div>
                <div className={styles.aMetaCard}>
                  <span>Noise Model</span>
                  <span style={{ color: '#00FFC2' }}>BPM TE Noise</span>
                </div>
              </div>
            </div>
          )}

          {/* LOAD MAP TAB */}
          {activeTab === 'LOAD MAP' && (
            <div className={styles.chartContainer}>
              <div className={styles.chartTitle}>STRUCTURAL LOAD MAP — Spanwise Shear & Bending for AeroStructuralSolver</div>
              <ResponsiveContainer width="100%" height="43%">
                <AreaChart data={(() => {
                  if (!vlmResult) return [];
                  const halfSpanM = safe(span) / 2;
                  return vlmResult.spanDist.map(s => {
                    const yM = safe(s.y) * halfSpanM;
                    let shear = 0;
                    for (let i = vlmResult.spanDist.length - 1; i >= 0; i--) {
                      if (vlmResult.spanDist[i].y >= s.y) {
                        shear += safe(vlmResult.spanDist[i].localCL) * safe(vlmResult.spanDist[i].chord) * (halfSpanM / vlmResult.spanDist.length);
                      }
                    }
                    const moment = shear * (halfSpanM - yM) * 0.5;
                    return { y_span: Number(yM.toFixed(2)), shear: Number(shear.toFixed(4)), moment: Number(moment.toFixed(4)) };
                  });
                })()} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                  <defs>
                    <linearGradient id="shearGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#007AFF" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#007AFF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
                  <XAxis dataKey="y_span" stroke="#8b949e" tick={{ fill: '#8b949e', fontSize: 10 }}
                    label={{ value: 'Span Station (m)', position: 'insideBottom', offset: -10, fill: '#8b949e', fontSize: 11 }} />
                  <YAxis yAxisId="l" stroke="#8b949e" tick={{ fill: '#8b949e', fontSize: 10 }} />
                  <YAxis yAxisId="r" orientation="right" stroke="#8b949e" tick={{ fill: '#8b949e', fontSize: 10 }} />
                  <Tooltip content={<IndustrialTooltip2 />} />
                  <Area yAxisId="l" type="monotone" dataKey="shear" name="Shear Force" stroke="#007AFF" fill="url(#shearGrad)" strokeWidth={2} isAnimationActive={false} />
                  <Line yAxisId="r" type="monotone" dataKey="moment" name="Bending Moment" stroke="#ff7a00" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontFamily: '"Consolas",monospace', fontSize: 11, color: '#e2e8f0' }} />
                </AreaChart>
              </ResponsiveContainer>

              <div className={styles.loadSummary}>
                <div className={styles.loadCard}>
                  <span className={styles.loadLabel}>ROOT BENDING MOMENT</span>
                  <span className={styles.loadVal} style={{ color: '#ff7a00' }}>
                    {vlmResult ? safe(vlmResult.Mroot).toFixed(3) : '---'} <span style={{ fontSize: '0.75rem' }}>normalized</span>
                  </span>
                </div>
                <div className={styles.loadCard}>
                  <span className={styles.loadLabel}>TIP STALL RISK</span>
                  <span className={styles.loadVal} style={{ color: tipStallColor }}>{tipStallLabel}</span>
                </div>
                <div className={styles.loadCard}>
                  <span className={styles.loadLabel}>INDUCED CDᵢ FRACTION</span>
                  <span className={styles.loadVal} style={{ color: '#f59e0b' }}>
                    {vlmResult && vlmResult.CDtotal > 0 ? ((safe(vlmResult.CDi) / safe(vlmResult.CDtotal)) * 100).toFixed(1) : '--'}%
                  </span>
                </div>
                <div className={styles.loadCard}>
                  <span className={styles.loadLabel}>EFFECTIVE AR (SWEPT)</span>
                  <span className={styles.loadVal}>
                    {(safe(AR) * Math.cos(safe(sweepDeg) * Math.PI / 180)).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className={styles.chartTitle} style={{ marginTop: '0.5rem' }}>CHORD DISTRIBUTION</div>
              <ResponsiveContainer width="100%" height="30%">
                <AreaChart data={spanDistData} margin={{ top: 5, right: 30, left: 10, bottom: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
                  <XAxis dataKey="y" stroke="#8b949e" tick={{ fill: '#8b949e', fontSize: 10 }} />
                  <YAxis stroke="#8b949e" tick={{ fill: '#8b949e', fontSize: 10 }} />
                  <Tooltip content={<IndustrialTooltip2 />} />
                  <Area type="monotone" dataKey="chord" name="c/c_ref" stroke="#a855f7" fill="rgba(168,85,247,0.15)" strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
      
      {/* LIBRARY MODAL */}
      {libModalOpen && (
          <div className={styles.modalOverlay} onClick={() => setLibModalOpen(false)}>
              <div className={styles.libModal} onClick={e => e.stopPropagation()}>
                  <div className={styles.libModalHeader}>
                      <h2>Select Airfoil from UIUC Library</h2>
                      <button onClick={() => setLibModalOpen(false)}><FiX size={20} /></button>
                  </div>
                  <div className={styles.searchBox}>
                      <FiSearch size={18} color="#64748b" />
                      <input type="text" placeholder="Search by name (e.g. NACA 2412)..." value={libSearchQuery} onChange={(e) => setLibSearchQuery(e.target.value)} autoFocus />
                  </div>
                  <div className={styles.libResults}>
                      {libResults.map(airfoil => (
                          <div key={airfoil.id || airfoil.name} className={styles.libResultItem} onClick={() => selectLibraryAirfoil(airfoil.name)}>
                              <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{airfoil.name}</span>
                              <span style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '2px 6px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 'bold' }}>DB RECORD</span>
                          </div>
                      ))}
                      {libSearchQuery.length > 2 && libResults.length === 0 && (
                          <div style={{ textAlign: 'center', color: '#64748b', padding: '20px', fontSize: '0.9rem', fontStyle: 'italic' }}>No matches found.</div>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

// ─── EXPORT WITH SUBSCRIPTION GUARD ────────────────────────────
export default function FiniteWingPage() {
  return (
    <SubscriptionGuard>
      <FiniteWingContent />
    </SubscriptionGuard>
  );
}