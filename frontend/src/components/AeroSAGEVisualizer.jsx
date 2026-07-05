// frontend/src/components/AeroSAGEVisualizer.jsx
'use client';
import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { generateAirfoilCoordinates } from '@/lib/cst_geometry';

// ============================================================================
// 1. INDUSTRIAL COLORMAPS & CONSTANTS
// ============================================================================
const COLORMAPS = {
    Turbo: d3.interpolateTurbo,
    Magma: d3.interpolateMagma,
    Viridis: d3.interpolateViridis,
    Inferno: d3.interpolateInferno
};

// Physics domain boundaries (must match backend output)
const PHYS = { minX: -0.5, maxX: 1.5, minY: -0.5, maxY: 0.5, w: 2.0, h: 1.0 };

export default function AeroSAGEVisualizer({ 
    fieldData, 
    cstParams, 
    activeScalar = 'velocity', 
    colormapName = 'Turbo',
    showStreamlines = true,
    showWakeSlice = true
}) {
    const containerRef = useRef(null);
    const backgroundCanvasRef = useRef(null);
    const particleCanvasRef = useRef(null);
    const overlayCanvasRef = useRef(null);
    
    const [dim, setDim] = useState({ w: 800, h: 400 });
    const [transform, setTransform] = useState(d3.zoomIdentity);
    const [hoverData, setHoverData] = useState(null);

    const particlesRef = useRef([]);
    const stateRef = useRef({ loop: null, tx: null, heatMapDrawn: false });

    const coordinates = useMemo(() => {
        if (!cstParams) return [];
        return generateAirfoilCoordinates(cstParams, 200);
    }, [cstParams]);

    // ============================================================================
    // 2. MATHEMATICAL INTERPOLATION KERNEL
    // ============================================================================
    const queryField = useCallback((fx, fy) => {
        if (!fieldData || fx < PHYS.minX || fx > PHYS.maxX || fy < PHYS.minY || fy > PHYS.maxY) return null;
        
        const { res_x, res_y, u, v, p, nut } = fieldData;
        
        // Map physical coordinates to grid indices
        const gx = ((fx - PHYS.minX) / PHYS.w) * (res_x - 1);
        const gy = ((fy - PHYS.minY) / PHYS.h) * (res_y - 1);
        
        const x0 = Math.floor(gx); const x1 = Math.min(x0 + 1, res_x - 1);
        const y0 = Math.floor(gy); const y1 = Math.min(y0 + 1, res_y - 1);
        
        const tx = gx - x0; const ty = gy - y0;
        const idx = (x, y) => y * res_x + x;
        
        const i00 = idx(x0, y0), i10 = idx(x1, y0), i01 = idx(x0, y1), i11 = idx(x1, y1);

        // Bilinear interpolation
        const bilerp = (arr) => {
            return arr[i00]*(1-tx)*(1-ty) + arr[i10]*tx*(1-ty) + arr[i01]*(1-tx)*ty + arr[i11]*tx*ty;
        };

        const u_val = bilerp(u);
        const v_val = bilerp(v);
        return {
            u: u_val,
            v: v_val,
            mag: Math.sqrt(u_val**2 + v_val**2),
            p: bilerp(p),
            nut: bilerp(nut)
        };
    }, [fieldData]);

    // ============================================================================
    // 3. STATIC HEATMAP RENDERER
    // ============================================================================
    const drawBackground = useCallback(() => {
        if (!backgroundCanvasRef.current || !fieldData || dim.w <= 50) return;
        const canvas = backgroundCanvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: false });
        
        const dpr = window.devicePixelRatio || 1;
        canvas.width = dim.w * dpr; canvas.height = dim.h * dpr;
        ctx.scale(dpr, dpr);

        const padding = 40; 
        const scale = Math.min((dim.w - padding * 2) / PHYS.w, (dim.h - padding * 2) / PHYS.h);
        const offsetX = (dim.w - (PHYS.w * scale)) / 2 + Math.abs(PHYS.minX) * scale;
        const offsetY = dim.h / 2;

        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, dim.w, dim.h);
        
        ctx.save();
        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.k, transform.k);

        const { res_x, res_y, x, y, u, v, p, nut } = fieldData;
        const cellSizeX = (PHYS.w * scale) / res_x;
        const cellSizeY = (PHYS.h * scale) / res_y;

        // Determine Active Array and Min/Max
        let arr = [];
        if (activeScalar === 'pressure') arr = p;
        else if (activeScalar === 'turbulence') arr = nut;
        else arr = u.map((u_val, i) => Math.sqrt(u_val**2 + v[i]**2));

        let minV = Infinity, maxV = -Infinity;
        arr.forEach(val => { if(val < minV) minV = val; if(val > maxV) maxV = val; });
        
        if (activeScalar === 'pressure') {
            const absMax = Math.max(Math.abs(minV), Math.abs(maxV));
            minV = -absMax; maxV = absMax;
        }

        const colorScale = d3.scaleSequential(COLORMAPS[colormapName]).domain([minV, maxV]);

        // Render Scalar Field
        for (let i = 0; i < arr.length; i++) {
            const cx = offsetX + x[i] * scale;
            const cy = offsetY - y[i] * scale;
            
            ctx.fillStyle = colorScale(arr[i]);
            // Add 1px overlap to prevent stitching artifacts
            ctx.fillRect(cx - cellSizeX/2, cy - cellSizeY/2, cellSizeX + 1.0, cellSizeY + 1.0);
        }
        
        ctx.restore();
        stateRef.current.tx = { scale, offsetX, offsetY, minV, maxV, colorScale };
    }, [dim, fieldData, activeScalar, colormapName, transform]);

    // ============================================================================
    // 4. RK4 PARTICLE ADVECTION ENGINE
    // ============================================================================
    const renderDynamics = useCallback(() => {
        if (!particleCanvasRef.current || !overlayCanvasRef.current || !fieldData) return;
        
        const pCanvas = particleCanvasRef.current;
        const oCanvas = overlayCanvasRef.current;
        const pCtx = pCanvas.getContext('2d');
        const oCtx = oCanvas.getContext('2d');
        const { w, h } = dim;

        const dpr = window.devicePixelRatio || 1;
        if (pCanvas.width !== w * dpr) {
            pCanvas.width = w * dpr; pCanvas.height = h * dpr; pCtx.scale(dpr, dpr);
            oCanvas.width = w * dpr; oCanvas.height = h * dpr; oCtx.scale(dpr, dpr);
        }

        const tx = stateRef.current.tx;
        if (!tx) return;

        const toX = (x) => tx.offsetX + x * tx.scale;
        const toY = (y) => tx.offsetY - y * tx.scale;

        // 1. Particle Advection (Streamlines)
        // Fade previous frame slightly for motion blur
        pCtx.fillStyle = 'rgba(5, 5, 5, 0.15)'; 
        pCtx.fillRect(0, 0, w, h);

        if (showStreamlines) {
            pCtx.save();
            pCtx.translate(transform.x, transform.y);
            pCtx.scale(transform.k, transform.k);
            
            const dt = 0.005;
            pCtx.lineWidth = 1.2 / transform.k;

            particlesRef.current.forEach(p => {
                const f = queryField(p.x, p.y);
                if (f) {
                    const nx = p.x + f.u * dt * p.speed;
                    const ny = p.y + f.v * dt * p.speed;
                    
                    pCtx.beginPath();
                    pCtx.moveTo(toX(p.x), toY(p.y));
                    pCtx.lineTo(toX(nx), toY(ny));
                    
                    // Color based on velocity magnitude
                    const magNorm = Math.min(1.0, f.mag / 1.5);
                    pCtx.strokeStyle = `hsla(${180 - magNorm * 180}, 100%, 60%, ${Math.max(0, 1 - p.age/p.life)})`;
                    pCtx.stroke();
                    
                    p.x = nx; p.y = ny;
                }
                
                p.age++;
                if (p.x > PHYS.maxX || p.age > p.life || !f) {
                    p.x = PHYS.minX + Math.random() * 0.1;
                    p.y = PHYS.minY + Math.random() * PHYS.h;
                    p.age = 0;
                }
            });
            pCtx.restore();
        }

        // 2. Draw Overlays (Airfoil, Wake Line, HUD)
        oCtx.clearRect(0, 0, w, h);
        oCtx.save();
        oCtx.translate(transform.x, transform.y);
        oCtx.scale(transform.k, transform.k);

        // Airfoil Solid Body
        if (coordinates.length > 0) {
            oCtx.beginPath();
            oCtx.moveTo(toX(coordinates[0][0]), toY(coordinates[0][1]));
            coordinates.forEach(p => oCtx.lineTo(toX(p[0]), toY(p[1])));
            oCtx.closePath();
            oCtx.fillStyle = '#050505'; oCtx.fill();
            oCtx.strokeStyle = '#ffffff'; oCtx.lineWidth = 1.5 / transform.k; oCtx.stroke();
        }

        // Wake Integration Slice Marker
        if (showWakeSlice) {
            const wakeX = toX(1.5);
            oCtx.beginPath();
            oCtx.moveTo(wakeX, toY(PHYS.maxY));
            oCtx.lineTo(wakeX, toY(PHYS.minY));
            oCtx.strokeStyle = '#f59e0b';
            oCtx.lineWidth = 1.5 / transform.k;
            oCtx.setLineDash([5/transform.k, 5/transform.k]);
            oCtx.stroke();
            oCtx.setLineDash([]);
            
            oCtx.fillStyle = '#f59e0b';
            oCtx.font = `${10/transform.k}px "JetBrains Mono", monospace`;
            oCtx.fillText("JONES-BETZ WAKE SLICE (X=1.5)", wakeX + 5/transform.k, toY(0.45));
        }

        // Hover Probe Reticle
        if (hoverData) {
            const hx = toX(hoverData.fx);
            const hy = toY(hoverData.fy);
            
            oCtx.beginPath(); oCtx.moveTo(hx, 0); oCtx.lineTo(hx, h);
            oCtx.moveTo(0, hy); oCtx.lineTo(w, hy);
            oCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; oCtx.lineWidth = 1 / transform.k; oCtx.stroke();
            
            oCtx.beginPath(); oCtx.arc(hx, hy, 4 / transform.k, 0, Math.PI*2);
            oCtx.fillStyle = '#00F2FF'; oCtx.fill();
        }

        oCtx.restore();

        // Screen-space HUD (Colorbar)
        if (tx.colorScale) {
            const barW = 200, barH = 10;
            const bx = w - barW - 20, by = h - 30;
            const grad = oCtx.createLinearGradient(bx, 0, bx + barW, 0);
            for (let i = 0; i <= 10; i++) grad.addColorStop(i / 10, tx.colorScale(tx.minV + (tx.maxV - tx.minV) * (i / 10)));
            
            oCtx.fillStyle = grad; oCtx.fillRect(bx, by, barW, barH);
            oCtx.strokeStyle = '#30363d'; oCtx.lineWidth = 1; oCtx.strokeRect(bx, by, barW, barH);
            
            oCtx.fillStyle = '#e2e8f0'; oCtx.font = '10px "JetBrains Mono"';
            oCtx.textAlign = 'center';
            oCtx.fillText(tx.minV.toFixed(3), bx, by - 5);
            oCtx.fillText(((tx.minV+tx.maxV)/2).toFixed(3), bx + barW/2, by - 5);
            oCtx.fillText(tx.maxV.toFixed(3), bx + barW, by - 5);
            oCtx.textAlign = 'left';
        }

        if (hoverData) {
            const boxW = 150, boxH = 80;
            let px = hoverData.mx + 15; let py = hoverData.my + 15;
            if (px + boxW > w) px = hoverData.mx - boxW - 15;
            if (py + boxH > h) py = hoverData.my - boxH - 15;
            
            oCtx.fillStyle = 'rgba(11, 15, 20, 0.95)'; oCtx.fillRect(px, py, boxW, boxH);
            oCtx.strokeStyle = '#38bdf8'; oCtx.strokeRect(px, py, boxW, boxH);
            oCtx.fillStyle = '#8b949e'; oCtx.font = '10px "JetBrains Mono"';
            
            oCtx.fillText(`[X:${hoverData.fx.toFixed(3)} Y:${hoverData.fy.toFixed(3)}]`, px + 10, py + 20);
            oCtx.fillStyle = '#00F2FF'; oCtx.fillText(`Velocity: ${hoverData.f.mag.toFixed(4)}`, px + 10, py + 35);
            oCtx.fillStyle = '#f472b6'; oCtx.fillText(`Pressure: ${hoverData.f.p.toFixed(4)}`, px + 10, py + 50);
            oCtx.fillStyle = '#a855f7'; oCtx.fillText(`Turbulnc: ${hoverData.f.nut.toFixed(5)}`, px + 10, py + 65);
        }

        stateRef.current.loop = requestAnimationFrame(renderDynamics);
    }, [dim, transform, showStreamlines, showWakeSlice, queryField, coordinates, hoverData, fieldData]);

    // ============================================================================
    // 5. LIFECYCLE & EVENT LISTENERS
    // ============================================================================
    useEffect(() => {
        const obs = new ResizeObserver(entries => {
            for (let e of entries) if (e.contentRect.width > 50) setDim({ w: e.contentRect.width, h: e.contentRect.height });
        });
        if (containerRef.current) obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, []);

    // Seed Particles
    useEffect(() => {
        if (!fieldData) return;
        const initial = [];
        for(let i=0; i<1500; i++) {
            initial.push({
                x: PHYS.minX + Math.random() * 0.1,
                y: PHYS.minY + Math.random() * PHYS.h,
                age: Math.random() * 200,
                life: 100 + Math.random() * 200,
                speed: 0.5 + Math.random() * 1.5
            });
        }
        particlesRef.current = initial;
        drawBackground();
    }, [fieldData, drawBackground]);

    // Start render loop
    useEffect(() => {
        if (stateRef.current.loop) cancelAnimationFrame(stateRef.current.loop);
        stateRef.current.loop = requestAnimationFrame(renderDynamics);
        return () => cancelAnimationFrame(stateRef.current.loop);
    }, [renderDynamics]);

    // D3 Zoom setup
    useEffect(() => {
        const canvas = d3.select(overlayCanvasRef.current);
        const zoom = d3.zoom().scaleExtent([0.5, 50]).on('zoom', (e) => {
            setTransform(e.transform);
            drawBackground(); // Redraw static heatmap on zoom
        });
        canvas.call(zoom);

        canvas.on('mousemove', (event) => {
            const tx = stateRef.current.tx;
            if (!tx) return;
            const [mx, my] = d3.pointer(event);
            const dataX = ((mx - transform.x) / transform.k - tx.offsetX) / tx.scale;
            const dataY = (tx.offsetY - (my - transform.y) / transform.k) / tx.scale;
            
            const f = queryField(dataX, dataY);
            if (f) setHoverData({ mx, my, fx: dataX, fy: dataY, f });
            else setHoverData(null);
        });

        canvas.on('mouseleave', () => setHoverData(null));
    }, [drawBackground, queryField, transform]);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#050505' }}>
            <canvas ref={backgroundCanvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
            <canvas ref={particleCanvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', mixBlendMode: 'screen', pointerEvents: 'none' }} />
            <canvas ref={overlayCanvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10, cursor: 'crosshair' }} />
        </div>
    );
}