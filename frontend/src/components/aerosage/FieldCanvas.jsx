'use client';
import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';

const DOMAIN = { minX: -0.35, maxX: 1.65, minY: -0.55, maxY: 0.55 };

const COLORMAPS = {
    VELOCITY: (t) => d3.interpolateMagma(t),
    PRESSURE: (t) => d3.interpolateTurbo(t),
    TURBULENCE: (t) => d3.interpolatePlasma(t),
};

export default function FieldCanvas({
    nodes, airfoilCoords, baselineCoords, defects = [],
    fieldMode = 'VELOCITY', isoContour = false, showStreamlines = false,
    onProbe, onProbeEnd,
}) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const transformRef = useRef(d3.zoomIdentity);
    const [, forceUpdate] = useState(0);

    const getScalar = useCallback((n) => {
        if (fieldMode === 'VELOCITY') return Math.sqrt(n.ux ** 2 + n.uy ** 2);
        if (fieldMode === 'PRESSURE') return n.p;
        return n.nut;
    }, [fieldMode]);

    const scalarRange = useMemo(() => {
        if (!nodes || !nodes.length) return { min: 0, max: 1 };
        let min = Infinity, max = -Infinity;
        nodes.forEach(n => {
            const v = getScalar(n);
            if (v < min) min = v;
            if (v > max) max = v;
        });
        if (fieldMode === 'PRESSURE') {
            const absMax = Math.max(Math.abs(min), Math.abs(max));
            return { min: -absMax, max: absMax };
        }
        return { min, max };
    }, [nodes, getScalar, fieldMode]);

    // ── Zoom ─────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const zoom = d3.zoom().scaleExtent([0.5, 25]).on('zoom', (e) => {
            transformRef.current = e.transform;
            forceUpdate(v => v + 1);
        });
        d3.select(canvas).call(zoom);
    }, []);

    // ── Mouse probe ──────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !onProbe || !nodes?.length) return;

        const handleMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const W = rect.width, H = rect.height;
            const t = transformRef.current;

            const scale = Math.min(W / (DOMAIN.maxX - DOMAIN.minX), H / (DOMAIN.maxY - DOMAIN.minY)) * t.k;
            const ox = (W - (DOMAIN.maxX - DOMAIN.minX) * scale) / 2 + Math.abs(DOMAIN.minX) * scale + t.x;
            const oy = H / 2 + t.y;

            const wx = (sx - ox) / scale;
            const wy = -(sy - oy) / scale;

            let best = null, bestD = Infinity;
            for (const n of nodes) {
                const d = (n.x - wx) ** 2 + (n.y - wy) ** 2;
                if (d < bestD) { bestD = d; best = n; }
            }
            if (best && bestD < 0.01) {
                onProbe({ ...best, x: wx, y: wy }, { x: e.clientX, y: e.clientY });
            }
        };
        const handleLeave = () => onProbeEnd?.();

        canvas.addEventListener('mousemove', handleMove);
        canvas.addEventListener('mouseleave', handleLeave);
        return () => {
            canvas.removeEventListener('mousemove', handleMove);
            canvas.removeEventListener('mouseleave', handleLeave);
        };
    }, [nodes, onProbe, onProbeEnd]);

    // ── Render ────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d', { alpha: false });
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        const W = rect.width, H = rect.height;
        const t = transformRef.current;

        const toCanvas = (wx, wy) => {
            const scale = Math.min(W / (DOMAIN.maxX - DOMAIN.minX), H / (DOMAIN.maxY - DOMAIN.minY)) * t.k;
            const ox = (W - (DOMAIN.maxX - DOMAIN.minX) * scale) / 2 + Math.abs(DOMAIN.minX) * scale + t.x;
            const oy = H / 2 + t.y;
            return [ox + wx * scale, oy - wy * scale];
        };

        ctx.fillStyle = '#010409';
        ctx.fillRect(0, 0, W, H);

        const cmap = COLORMAPS[fieldMode] || COLORMAPS.VELOCITY;
        const { min: sMin, max: sMax } = scalarRange;

        // Field nodes
        if (nodes?.length) {
            const r = t.k > 3 ? 6 : t.k > 1.5 ? 4 : 3;
            for (const n of nodes) {
                const [cx, cy] = toCanvas(n.x, n.y);
                if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) continue;
                let scalar = getScalar(n);
                let tn = Math.max(0, Math.min(1, (scalar - sMin) / (sMax - sMin + 1e-9)));
                if (isoContour) tn = Math.floor(tn * 15) / 15;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fillStyle = cmap(tn);
                ctx.fill();
            }

            // Velocity arrows
            if (fieldMode === 'VELOCITY' && t.k > 1.2) {
                ctx.strokeStyle = 'rgba(255,255,255,0.35)';
                ctx.lineWidth = 0.8;
                nodes.forEach((n, i) => {
                    if (i % 20 !== 0) return;
                    const speed = Math.sqrt(n.ux ** 2 + n.uy ** 2);
                    if (speed < 0.05) return;
                    const [cx, cy] = toCanvas(n.x, n.y);
                    const arrowLen = Math.min(speed * 15 * t.k, 30);
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(cx + (n.ux / speed) * arrowLen, cy - (n.uy / speed) * arrowLen);
                    ctx.stroke();
                });
            }
        }

        // Baseline outline
        if (baselineCoords?.length > 0) {
            ctx.beginPath();
            baselineCoords.forEach((c, i) => {
                const [px, py] = toCanvas(c.x, c.y);
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            });
            ctx.closePath();
            ctx.strokeStyle = 'rgba(100,180,255,0.25)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Warped airfoil
        if (airfoilCoords?.length > 0) {
            ctx.beginPath();
            airfoilCoords.forEach((c, i) => {
                const [px, py] = toCanvas(c.x, c.y);
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            });
            ctx.closePath();
            ctx.fillStyle = '#0B0F14';
            ctx.fill();
            ctx.strokeStyle = '#00ffcc';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Defect markers
        defects.forEach(d => {
            if (d.type === 'ROUGHNESS') return;
            const [dx, dy] = toCanvas(d.location || d.x_loc, d.side === 'upper' ? 0.06 : -0.06);
            ctx.beginPath();
            ctx.arc(dx, dy, 8, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,0,100,0.3)';
            ctx.fill();
            ctx.strokeStyle = '#ff0064';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });

    }, [nodes, airfoilCoords, baselineCoords, fieldMode, isoContour, defects, scalarRange, getScalar]);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
            <canvas ref={canvasRef} style={{
                display: 'block', width: '100%', height: '100%', cursor: 'crosshair'
            }} />
        </div>
    );
}