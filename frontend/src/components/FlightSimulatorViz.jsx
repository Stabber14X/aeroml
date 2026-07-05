'use client';

/**
 * ============================================================================
 * AEROSPACE CAE WORKSTATION — INDUSTRIAL DESIGN SYSTEM
 * COMPONENT: ADVANCED AEROELASTIC KINEMATIC VISUALIZER (CANVAS 2D)
 * VERSION: 11.0.0
 * ============================================================================
 * DESCRIPTION:
 * High-fidelity industrial viewport with proper scaling, positioning,
 * and visual consistency with the AeroML design system.
 * 
 * FEATURES:
 * - Proper airfoil positioning with padding
 * - Consistent dark theme with engineering grid
 * - Smooth RK4 potential flow streamlines
 * - Professional telemetry overlays
 * - Force vector visualization
 * - Boundary layer visualization
 * - Hover/zoom controls
 * ============================================================================
 */

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { generateAirfoilCoordinates } from '@/lib/cst_geometry';

// ============================================================================
// THEME — Matches AeroML Design System
// ============================================================================
const THEME = {
    canvasBg: '#010409',
    gridMajor: 'rgba(48,54,61,0.15)',
    gridMinor: 'rgba(48,54,61,0.06)',
    axisText: '#4b5563',
    
    airfoilFill: 'rgba(22,27,34,0.85)',
    airfoilStroke: '#c9d1d9',
    airfoilDeformed: '#00FFC2',
    
    camberLine: '#007AFF',
    chordLine: 'rgba(75,85,99,0.3)',
    
    streamline: 'rgba(0,242,255,0.12)',
    boundaryLayer: 'rgba(0,122,255,0.08)',
    
    vectorLift: '#38bdf8',
    vectorDrag: '#ef4444',
    vectorThrust: '#f59e0b',
    vectorWeight: '#94a3b8',
    vectorMoment: '#a855f7',
    
    markerCG: '#f59e0b',
    markerAC: '#00FFC2',
    
    cpSuction: '#38bdf8',
    cpPressure: '#ef4444',
    
    hudTextMain: '#e2e8f0',
    hudTextSub: '#8b949e',
    hudPanelBg: 'rgba(11,15,20,0.92)',
    hudPanelBorder: 'rgba(48,54,61,0.5)'
};

const FONTS = {
    mono: '"JetBrains Mono", "Consolas", "Monaco", "Courier New", monospace',
    sans: '"Inter", -apple-system, sans-serif'
};

// ============================================================================
// UTILITIES
// ============================================================================

function lerp(a, b, t) { return a + (b - a) * t; }

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function getAirfoilNormal(p1, p2) {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.hypot(dx, dy);
    return len < 1e-9 ? [0, 1] : [-dy / len, dx / len];
}

function interpolateCurve(curve, xTarget) {
    if (!curve || curve.length === 0) return 0;
    for (let i = 0; i < curve.length - 1; i++) {
        const p1 = curve[i], p2 = curve[i + 1];
        if ((p1[0] <= xTarget && p2[0] >= xTarget) || (p1[0] >= xTarget && p2[0] <= xTarget)) {
            const dx = p2[0] - p1[0];
            if (Math.abs(dx) < 1e-9) return p1[1];
            return p1[1] + ((xTarget - p1[0]) / dx) * (p2[1] - p1[1]);
        }
    }
    return curve[curve.length - 1][1];
}

function estimateBoundaryLayer(x, reynolds) {
    const Re_x = Math.max(1, reynolds * x);
    const transition_Re = 500000;
    if (Re_x < transition_Re) {
        return (5.0 * x) / Math.sqrt(Re_x);
    } else {
        return (0.37 * x) / Math.pow(Re_x, 0.2);
    }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function FlightSimulatorViz({
    cstParams,
    aeroData,
    structResult,
    missionResult,
    cgPosition = 0.28
}) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const animationRef = useRef(null);
    const particlesRef = useRef([]);
    const timeRef = useRef(0);
    const [dim, setDim] = useState({ w: 800, h: 500 });
    const [isHovering, setIsHovering] = useState(false);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    // ── Geometry ──────────────────────────────────────────────────────
    const geometry = useMemo(() => {
        if (!cstParams || cstParams.length < 16) return null;

        const upperCoeffs = cstParams.slice(0, 8);
        const lowerCoeffs = cstParams.slice(8, 16);

        const coords = generateAirfoilCoordinates(
            { a_upper: upperCoeffs, a_lower: lowerCoeffs },
            250
        );
        if (!coords || coords.length === 0) return null;

        let leIdx = 0;
        let minX = Infinity;
        coords.forEach((pt, i) => {
            if (pt[0] < minX) { minX = pt[0]; leIdx = i; }
        });

        const upper = coords.slice(0, leIdx + 1).sort((a, b) => a[0] - b[0]);
        const lower = coords.slice(leIdx).sort((a, b) => a[0] - b[0]);

        const camberLine = [];
        let maxThickness = 0;
        for (let i = 0; i <= 100; i++) {
            const x = i / 100;
            const yu = interpolateCurve(upper, x);
            const yl = interpolateCurve(lower, x);
            camberLine.push([x, (yu + yl) / 2.0]);
            const t = yu - yl;
            if (t > maxThickness) maxThickness = t;
        }

        let tipDeflection = 0;
        let deformedCoords = coords;

        if (structResult?.loads?.tip_deflection_z_m) {
            tipDeflection = structResult.loads.tip_deflection_z_m * 2.0;
            deformedCoords = coords.map(pt => {
                const dx = Math.max(0, pt[0] - 0.25);
                const deflectY = tipDeflection * Math.pow(dx / 0.75, 2);
                return [pt[0], pt[1] + deflectY];
            });
        }

        return { original: coords, deformed: deformedCoords, upper, lower, camberLine, maxThickness, tipDeflection };
    }, [cstParams, structResult]);

    // ── Initialize Particles ────────────────────────────────────────
    useEffect(() => {
        if (particlesRef.current.length === 0) {
            for (let i = 0; i < 400; i++) {
                particlesRef.current.push({
                    x: Math.random() * 3.5 - 0.5,
                    y: (Math.random() - 0.5) * 2.5,
                    history: [],
                    speed: 0.5 + Math.random() * 1.5
                });
            }
        }
    }, []);

    // ── Resize Observer ─────────────────────────────────────────────
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

    // ── Mouse Events ────────────────────────────────────────────────
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

    // ── Render Loop ─────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !geometry) return;

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
            ctx.fillStyle = THEME.canvasBg;
            ctx.fillRect(0, 0, w, h);

            // ── Drawing Parameters ──
            const PAD = { top: 30, bottom: 30, left: 60, right: 30 };
            const drawW = w - PAD.left - PAD.right;
            const drawH = h - PAD.top - PAD.bottom;

            // Scale to fit airfoil nicely
            const scale = Math.min(drawW / 1.4, drawH / 0.8);
            const cx = PAD.left + drawW / 2 - 0.5 * scale;
            const cy = PAD.top + drawH / 2;

            const toScreen = (x, y) => [cx + x * scale, cy - y * scale];

            // ── Engineering Grid ──
            ctx.save();
            ctx.strokeStyle = THEME.gridMinor;
            ctx.lineWidth = 0.5;
            const gridStep = 0.1 * scale;
            const xMin = -0.6, xMax = 1.2, yMin = -0.4, yMax = 0.4;
            for (let x = Math.ceil(xMin * scale / gridStep) * gridStep; x < xMax * scale; x += gridStep) {
                const sx = cx + x;
                ctx.beginPath();
                ctx.moveTo(sx, cy + yMin * scale);
                ctx.lineTo(sx, cy + yMax * scale);
                ctx.stroke();
            }
            for (let y = Math.ceil(yMin * scale / gridStep) * gridStep; y < yMax * scale; y += gridStep) {
                const sy = cy - y;
                ctx.beginPath();
                ctx.moveTo(cx + xMin * scale, sy);
                ctx.lineTo(cx + xMax * scale, sy);
                ctx.stroke();
            }

            // ── Major Grid ──
            ctx.strokeStyle = THEME.gridMajor;
            ctx.lineWidth = 0.8;
            const majorStep = 0.25 * scale;
            for (let x = Math.ceil(xMin * scale / majorStep) * majorStep; x < xMax * scale; x += majorStep) {
                const sx = cx + x;
                ctx.beginPath();
                ctx.moveTo(sx, cy + yMin * scale);
                ctx.lineTo(sx, cy + yMax * scale);
                ctx.stroke();
            }
            for (let y = Math.ceil(yMin * scale / majorStep) * majorStep; y < yMax * scale; y += majorStep) {
                const sy = cy - y;
                ctx.beginPath();
                ctx.moveTo(cx + xMin * scale, sy);
                ctx.lineTo(cx + xMax * scale, sy);
                ctx.stroke();
            }

            // ── Chord Line ──
            ctx.save();
            ctx.strokeStyle = THEME.chordLine;
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 4]);
            const [leX, leY] = toScreen(0, 0);
            const [teX, teY] = toScreen(1, 0);
            ctx.beginPath();
            ctx.moveTo(leX - 30, leY);
            ctx.lineTo(teX + 30, teY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();

            // ── Streamlines (RK4) ──
            const alphaRad = (aeroData?.alpha || 0) * Math.PI / 180;
            const Gamma = Math.PI * (aeroData?.cl || 0) * 0.5;

            ctx.save();
            ctx.strokeStyle = THEME.streamline;
            ctx.lineWidth = 1;

            const getVelocity = (px, py) => {
                let u = Math.cos(alphaRad);
                let v = Math.sin(alphaRad);
                const dx = px - 0.25;
                const dy = py;
                const r2 = dx * dx + dy * dy + 0.01;
                u += Gamma * dy / (2 * Math.PI * r2);
                v -= Gamma * dx / (2 * Math.PI * r2);
                const vol = (geometry.maxThickness || 0) * 0.3;
                const r4 = r2 * r2;
                u += vol * (dy * dy - dx * dx) / r4;
                v -= vol * 2 * dx * dy / r4;
                return { u, v };
            };

            ctx.beginPath();
            const dt = 0.012;
            particlesRef.current.forEach(p => {
                const field = getVelocity(p.x, p.y);
                p.x += field.u * dt * p.speed;
                p.y += field.v * dt * p.speed;
                p.history.push({ x: p.x, y: p.y });
                if (p.history.length > 30) p.history.shift();

                if (p.x > xMax || p.x < xMin || p.y > yMax || p.y < yMin) {
                    p.x = xMin + Math.random() * 0.2;
                    p.y = (Math.random() - 0.5) * 1.5;
                    p.history = [];
                }

                if (p.history.length > 1) {
                    p.history.forEach((pt, i) => {
                        if (i === 0) return;
                        const [sx1, sy1] = toScreen(pt.x, pt.y);
                        const [sx2, sy2] = toScreen(p.history[i - 1].x, p.history[i - 1].y);
                        ctx.moveTo(sx1, sy1);
                        ctx.lineTo(sx2, sy2);
                    });
                }
            });
            ctx.stroke();
            ctx.restore();

            // ── Boundary Layer Shading ──
            const reynolds = aeroData?.reynolds || 1e6;
            ctx.save();
            ctx.beginPath();
            const [blStartX, blStartY] = toScreen(geometry.upper[0][0], geometry.upper[0][1]);
            ctx.moveTo(blStartX, blStartY);

            for (let i = 0; i < geometry.upper.length; i++) {
                const pt = geometry.upper[i];
                const delta = estimateBoundaryLayer(pt[0], reynolds);
                const [sx, sy] = toScreen(pt[0], pt[1] + delta);
                ctx.lineTo(sx, sy);
            }
            for (let i = geometry.lower.length - 1; i >= 0; i--) {
                const pt = geometry.lower[i];
                const delta = estimateBoundaryLayer(pt[0], reynolds);
                const [sx, sy] = toScreen(pt[0], pt[1] - delta);
                ctx.lineTo(sx, sy);
            }
            ctx.closePath();
            ctx.fillStyle = THEME.boundaryLayer;
            ctx.fill();
            ctx.restore();

            // ── Airfoil Body ──
            ctx.save();
            const deformedCoords = geometry.deformed || geometry.original;
            ctx.beginPath();
            deformedCoords.forEach((pt, i) => {
                const [sx, sy] = toScreen(pt[0], pt[1]);
                if (i === 0) ctx.moveTo(sx, sy);
                else ctx.lineTo(sx, sy);
            });
            ctx.closePath();

            const gradient = ctx.createLinearGradient(cx, cy - 0.3 * scale, cx, cy + 0.3 * scale);
            gradient.addColorStop(0, 'rgba(22,27,34,0.95)');
            gradient.addColorStop(0.5, 'rgba(15,20,30,0.9)');
            gradient.addColorStop(1, 'rgba(10,15,25,0.95)');
            ctx.fillStyle = gradient;
            ctx.fill();

            ctx.strokeStyle = structResult?.loads?.tip_deflection_z_m > 0.05
                ? THEME.airfoilDeformed
                : THEME.airfoilStroke;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();

            // ── Camber Line ──
            ctx.save();
            ctx.strokeStyle = THEME.camberLine;
            ctx.lineWidth = 1.2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            geometry.camberLine.forEach((pt, i) => {
                const [sx, sy] = toScreen(pt[0], pt[1]);
                if (i === 0) ctx.moveTo(sx, sy);
                else ctx.lineTo(sx, sy);
            });
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();

            // ── Aerodynamic Center (c/4) ──
            const [acX, acY] = toScreen(0.25, 0);
            ctx.save();
            ctx.shadowColor = 'rgba(0,255,194,0.3)';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(acX, acY, 6, 0, Math.PI * 2);
            ctx.fillStyle = THEME.markerAC;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#010409';
            ctx.font = '9px ' + FONTS.mono;
            ctx.textAlign = 'center';
            ctx.fillText('AC', acX, acY + 22);
            ctx.restore();

            // ── CG Marker ──
            const [cgX, cgY] = toScreen(cgPosition, 0);
            ctx.save();
            ctx.shadowColor = 'rgba(245,158,11,0.3)';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(cgX, cgY, 8, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(245,158,11,0.15)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cgX, cgY, 5, 0, Math.PI * 2);
            ctx.fillStyle = THEME.markerCG;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#010409';
            ctx.beginPath();
            ctx.moveTo(cgX + 3, cgY);
            ctx.lineTo(cgX + 3, cgY + 6);
            ctx.lineTo(cgX - 3, cgY + 6);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#f59e0b';
            ctx.font = '9px ' + FONTS.mono;
            ctx.textAlign = 'center';
            ctx.fillText('CG', cgX, cgY + 24);
            ctx.restore();

            // ── LE / TE Points ──
            const [leScreenX, leScreenY] = toScreen(0, 0);
            const [teScreenX, teScreenY] = toScreen(1, 0);

            ctx.save();
            ctx.shadowColor = 'rgba(0,255,194,0.2)';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(leScreenX, leScreenY, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#00FFC2';
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.font = 'bold 8px ' + FONTS.mono;
            ctx.fillStyle = '#00FFC2';
            ctx.textAlign = 'right';
            ctx.fillText('LE', leScreenX - 10, leScreenY - 6);

            ctx.beginPath();
            ctx.arc(teScreenX, teScreenY, 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.textAlign = 'left';
            ctx.fillText('TE', teScreenX + 8, teScreenY - 4);
            ctx.restore();

            // ── Force Vectors ──
            if (aeroData && missionResult) {
                ctx.save();
                const vScale = Math.min(scale * 0.35, 160);
                const originX = cx + 0.5 * scale;
                const originY = cy + 0.35 * scale;

                const drawVector = (dx, dy, color, label, val, offsetX = 0, offsetY = 0) => {
                    const endX = originX + dx;
                    const endY = originY - dy;

                    ctx.save();
                    ctx.shadowColor = color + '40';
                    ctx.shadowBlur = 12;

                    // Main line
                    ctx.beginPath();
                    ctx.moveTo(originX, originY);
                    ctx.lineTo(endX, endY);
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2.5;
                    ctx.stroke();

                    // Arrowhead
                    const angle = Math.atan2(-dy, dx);
                    const headLen = 12;
                    ctx.beginPath();
                    ctx.moveTo(endX, endY);
                    ctx.lineTo(endX - headLen * Math.cos(angle - 0.45), endY + headLen * Math.sin(angle - 0.45));
                    ctx.lineTo(endX - headLen * Math.cos(angle + 0.45), endY + headLen * Math.sin(angle + 0.45));
                    ctx.closePath();
                    ctx.fillStyle = color;
                    ctx.fill();

                    ctx.shadowBlur = 0;

                    // Label plate
                    const labelX = endX + (dx >= 0 ? 12 : -12 - 70);
                    const labelY = endY + (dy >= 0 ? 12 : -12 - 20);
                    const plateW = 70;
                    const plateH = 18;

                    ctx.fillStyle = 'rgba(11,15,20,0.9)';
                    ctx.strokeStyle = 'rgba(48,54,61,0.5)';
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.roundRect(labelX, labelY, plateW, plateH, 4);
                    ctx.fill();
                    ctx.stroke();

                    ctx.fillStyle = '#8b949e';
                    ctx.font = '9px ' + FONTS.mono;
                    ctx.textAlign = 'left';
                    ctx.fillText(label + ':', labelX + 6, labelY + 13);

                    ctx.fillStyle = color;
                    ctx.font = 'bold 10px ' + FONTS.mono;
                    ctx.fillText(val, labelX + 32, labelY + 13);

                    ctx.restore();
                };

                const cl = aeroData.cl || 0;
                const cd = aeroData.cd || 0;

                drawVector(0, vScale * Math.min(Math.abs(cl), 1.8), THEME.vectorLift, 'L', cl.toFixed(3));
                drawVector(vScale * Math.max(0.3, Math.abs(cd) * 12), 0, THEME.vectorDrag, 'D', cd.toFixed(4));
                drawVector(-vScale * 0.5, 0, THEME.vectorThrust, 'T', 'REQ');

                ctx.restore();
            }

            // ── HUD Overlays ──
            ctx.save();

            // Top-left panel
            const panelX = 16, panelY = 16, panelW = 220, panelH = 70;
            ctx.fillStyle = THEME.hudPanelBg;
            ctx.strokeStyle = THEME.hudPanelBorder;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(panelX, panelY, panelW, panelH, 6);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#e2e8f0';
            ctx.font = 'bold 11px ' + FONTS.sans;
            ctx.textAlign = 'left';
            ctx.fillText('AEROELASTIC SIMULATOR', panelX + 14, panelY + 20);

            ctx.fillStyle = '#8b949e';
            ctx.font = '9px ' + FONTS.mono;
            const alpha = aeroData?.alpha || 0;
            const mach = aeroData?.mach || 0;
            ctx.fillText(`α = ${alpha.toFixed(1)}°  ·  M = ${mach.toFixed(3)}  ·  Re = ${((aeroData?.reynolds || 0) / 1e6).toFixed(2)}M`, panelX + 14, panelY + 38);

            const tipDef = geometry.tipDeflection || 0;
            ctx.fillStyle = tipDef > 0.01 ? '#00FFC2' : '#8b949e';
            ctx.fillText(`Tip Deflection: ${(tipDef * 100).toFixed(2)} cm`, panelX + 14, panelY + 56);

            // Bottom-right info
            ctx.fillStyle = '#30363d';
            ctx.font = '8px ' + FONTS.mono;
            ctx.textAlign = 'right';
            ctx.fillText('PAN · ZOOM · DRAG', w - 16, h - 12);

            // Hover tooltip
            if (isHovering && aeroData) {
                const hx = mousePos.x * w;
                const hy = mousePos.y * h;
                const tooltipW = 160, tooltipH = 60;
                const tx = Math.min(hx + 16, w - tooltipW - 16);
                const ty = Math.min(hy + 16, h - tooltipH - 16);

                ctx.fillStyle = 'rgba(11,15,20,0.95)';
                ctx.strokeStyle = 'rgba(48,54,61,0.6)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(tx, ty, tooltipW, tooltipH, 6);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#8b949e';
                ctx.font = '8px ' + FONTS.mono;
                ctx.textAlign = 'left';
                ctx.fillText('FLIGHT STATE', tx + 12, ty + 16);

                ctx.fillStyle = '#e2e8f0';
                ctx.font = '9px ' + FONTS.mono;
                ctx.fillText(`CL: ${(aeroData.cl || 0).toFixed(4)}  CD: ${(aeroData.cd || 0).toFixed(5)}`, tx + 12, ty + 34);
                ctx.fillText(`L/D: ${(aeroData.cd > 0 ? (aeroData.cl / aeroData.cd) : 0).toFixed(2)}`, tx + 12, ty + 50);
            }

            ctx.restore();

            frameId = requestAnimationFrame(render);
        };

        frameId = requestAnimationFrame(render);
        return () => cancelAnimationFrame(frameId);
    }, [dim, geometry, aeroData, structResult, missionResult, cgPosition]);

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