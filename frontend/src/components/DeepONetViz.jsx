'use client';
import React, { useRef, useEffect, useState, useCallback } from 'react';

// --- INDUSTRIAL COLORMAPS ---
// Pressure: Blue -> Cyan -> Green -> Yellow -> Red
const getSpectralColor = (val, min, max, shimmer = 0) => {
    const range = max - min || 1;
    let t = (val - min) / range;
    t = Math.max(0, Math.min(1, t)) + shimmer;
    t = Math.max(0, Math.min(1, t));

    const r = Math.max(0, Math.min(255, Math.floor(255 * t)));
    const g = Math.max(0, Math.min(255, Math.floor(255 * (1 - Math.abs(2 * t - 1)))));
    const b = Math.max(0, Math.min(255, Math.floor(255 * (1 - t))));
    
    return `rgb(${r}, ${g}, ${b})`;
};

// Velocity: Black -> Purple -> Orange -> Yellow -> White
const getMagmaColor = (val, min, max, shimmer = 0) => {
    const range = max - min || 1;
    let t = (val - min) / range;
    t = Math.max(0, Math.min(1, t)) + shimmer;
    t = Math.max(0, Math.min(1, t));
    
    const r = Math.floor(255 * Math.min(1, t * 2.5));
    const g = Math.floor(255 * Math.max(0, Math.min(1, t * 2 - 0.5)));
    const b = Math.floor(255 * Math.max(0, Math.min(1, Math.sin(t * Math.PI))));
    
    return `rgb(${r}, ${g}, ${b})`;
};

// Turbulence: Dark Blue -> Magenta -> Yellow
const getPlasmaColor = (val, min, max, shimmer = 0) => {
    const range = max - min || 1;
    let t = (val - min) / range;
    t = Math.max(0, Math.min(1, t)) + shimmer;
    t = Math.max(0, Math.min(1, t));
    
    const r = Math.floor(255 * Math.min(1, t * 2));
    const g = Math.floor(255 * Math.max(0, t - 0.5) * 2);
    const b = Math.floor(255 * (1 - t));
    
    return `rgb(${r}, ${g}, ${b})`;
};

// Skin Friction: White -> Yellow -> Red
const getHotColor = (val, min, max) => {
    const range = max - min || 1;
    let t = (val - min) / range;
    t = Math.max(0, Math.min(1, t));
    
    const r = 255;
    const g = Math.floor(255 * Math.max(0, 1 - t));
    const b = Math.floor(255 * Math.max(0, 1 - 2 * t));
    
    return `rgb(${r}, ${g}, ${b})`;
};

export default function DeepONetViz({ fieldData, coordinates, blData }) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [probe, setProbe] = useState(null);
    const [activeLayer, setActiveLayer] = useState('pressure'); // pressure, velocity, turbulence, friction
    
    const stateRef = useRef({ 
        loop: null, 
        tx: null, 
        frame: 0,
        displayedField: null,
        targetField: null
    });

    const PHYS = { minX: -0.5, maxX: 1.5, minY: -0.5, maxY: 0.5, w: 2.0, h: 1.0 };

    // --- LIVE INTERPOLATION LOGIC ---
    useEffect(() => {
        if (!fieldData) return;
        
        let targetArray = [];
        if (activeLayer === 'pressure') targetArray = fieldData.cp_values;
        if (activeLayer === 'turbulence') targetArray = fieldData.nut_values.map(v => Math.max(0, v));
        if (activeLayer === 'velocity') {
            targetArray = fieldData.u_values.map((u, i) => {
                const v = fieldData.v_values[i];
                return Math.sqrt(u*u + v*v);
            });
        }
        if (activeLayer === 'friction') {
            targetArray = fieldData.cp_values.map(() => 0); // Background goes dark for friction
        }
        
        stateRef.current.targetField = targetArray;

        if (!stateRef.current.displayedField || stateRef.current.displayedField.length !== targetArray.length) {
            stateRef.current.displayedField = [...targetArray];
            return;
        }

        const interpolate = () => {
            let finished = true;
            const target = stateRef.current.targetField;
            const current = stateRef.current.displayedField;
            
            for (let i = 0; i < current.length; i++) {
                const diff = target[i] - current[i];
                if (Math.abs(diff) > 0.001) {
                    current[i] += diff * 0.25; 
                    finished = false;
                }
            }
            if (!finished) requestAnimationFrame(interpolate);
        };
        interpolate();
    }, [fieldData, activeLayer]);

    const draw = useCallback(() => {
        if (!containerRef.current || !canvasRef.current || !fieldData || !stateRef.current.displayedField) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: false });
        const container = containerRef.current;
        const rect = container.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;

        if (w <= 0 || h <= 0) return;

        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            ctx.scale(dpr, dpr);
        }

        // --- PROJECTION MATRIX ---
        const padding = 15; // Decreased padding to increase the visual grid size
        const scale = Math.min((w - padding * 2) / PHYS.w, (h - padding * 2) / PHYS.h);
        const offsetX = (w - (PHYS.w * scale)) / 2 + Math.abs(PHYS.minX) * scale;
        const offsetY = h / 2;

        const toX = (x) => offsetX + x * scale;
        const toY = (y) => offsetY - y * scale;

        // 1. BACKGROUND
        ctx.fillStyle = '#010409';
        ctx.fillRect(0, 0, w, h);

        const { x_grid, y_grid, u_values, v_values, diagnostics } = fieldData;
        const current_values = stateRef.current.displayedField;
        
        let min_val = Infinity;
        let max_val = -Infinity;
        for (let i=0; i<current_values.length; i++) {
            if (current_values[i] < min_val) min_val = current_values[i];
            if (current_values[i] > max_val) max_val = current_values[i];
        }

        const totalPoints = current_values.length;
        const aspect = PHYS.w / PHYS.h;
        const resY = Math.sqrt(totalPoints / aspect);
        const cellSize = (PHYS.h * scale) / resY;

        // 2. HEATMAP RENDERING
        stateRef.current.frame += 0.05;
        const shimmerVal = Math.sin(stateRef.current.frame) * 0.005;

        for (let i = 0; i < current_values.length; i++) {
            if (activeLayer === 'friction') {
                ctx.fillStyle = 'rgba(2, 6, 12, 0.9)'; // Darken background to highlight surface
            } else if (activeLayer === 'pressure') {
                ctx.fillStyle = getSpectralColor(current_values[i], min_val, max_val, shimmerVal);
            } else if (activeLayer === 'velocity') {
                ctx.fillStyle = getMagmaColor(current_values[i], min_val, max_val, shimmerVal);
            } else {
                ctx.fillStyle = getPlasmaColor(current_values[i], min_val, max_val, shimmerVal);
            }
            // Slightly increased the fill rect size (+1.0) to prevent subpixel grid lines
            ctx.fillRect(toX(x_grid[i]) - 0.5, toY(y_grid[i]) - 0.5, cellSize + 1.0, cellSize + 1.0);
        }

        // 3. VECTORS
        if (activeLayer === 'velocity' || activeLayer === 'pressure') {
            ctx.strokeStyle = activeLayer === 'velocity' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            const stride = 6; 
            const vLen = 0.03 * scale;
            for (let i = 0; i < x_grid.length; i += stride) {
                const sx = toX(x_grid[i]), sy = toY(y_grid[i]);
                const flowOffset = Math.sin(stateRef.current.frame + i) * 2;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(sx + u_values[i] * vLen + flowOffset, sy - v_values[i] * vLen);
                ctx.stroke();
            }
        }

        // 4. AIRFOIL OVERLAY
        if (coordinates && coordinates.length > 0) {
            ctx.beginPath();
            ctx.moveTo(toX(coordinates[0][0] || coordinates[0].x), toY(coordinates[0][1] || coordinates[0].y));
            coordinates.forEach(p => ctx.lineTo(toX(p[0] || p.x), toY(p[1] || p.y)));
            ctx.closePath();
            ctx.fillStyle = '#0d1117';
            ctx.fill();
            ctx.strokeStyle = activeLayer === 'friction' ? '#334155' : '#e2e8f0';
            ctx.lineWidth = 2.0;
            ctx.stroke();
        }

        // 5. SKIN FRICTION BOUNDARY LAYER RENDERING
        if (activeLayer === 'friction' && blData && blData.upper_bl && blData.lower_bl) {
            // Render Upper BL
            const u_x = blData.upper_bl.x;
            const u_cf = blData.upper_bl.cf;
            const cf_max = Math.max(...u_cf, ...blData.lower_bl.cf);
            const cf_min = Math.min(...u_cf, ...blData.lower_bl.cf);

            // Interpolate Y from coordinates for surface mapping
            const getSurfaceY = (queryX, isUpper) => {
                let bestY = 0;
                let minDist = Infinity;
                coordinates.forEach(p => {
                    const px = p[0] || p.x;
                    const py = p[1] || p.y;
                    if ((isUpper && py > 0) || (!isUpper && py <= 0)) {
                        const dist = Math.abs(px - queryX);
                        if (dist < minDist) { minDist = dist; bestY = py; }
                    }
                });
                return bestY;
            };

            for (let i = 0; i < u_x.length; i++) {
                const sx = toX(u_x[i]);
                const sy = toY(getSurfaceY(u_x[i], true)) - 5; // Offset slightly above surface
                ctx.fillStyle = getHotColor(u_cf[i], cf_min, cf_max);
                ctx.beginPath();
                ctx.arc(sx, sy, 4, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Render Lower BL
            const l_x = blData.lower_bl.x;
            const l_cf = blData.lower_bl.cf;
            for (let i = 0; i < l_x.length; i++) {
                const sx = toX(l_x[i]);
                const sy = toY(getSurfaceY(l_x[i], false)) + 5; // Offset below surface
                ctx.fillStyle = getHotColor(l_cf[i], cf_min, cf_max);
                ctx.beginPath();
                ctx.arc(sx, sy, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 6. ADVANCED DIAGNOSTIC MARKERS
        if (diagnostics && activeLayer !== 'friction') {
            if (diagnostics.suction_peak && diagnostics.suction_peak.x !== 0) {
                const spX = toX(diagnostics.suction_peak.x);
                const spY = toY(diagnostics.suction_peak.y);
                const pulse = 10 + Math.sin(stateRef.current.frame * 2) * 3;
                
                ctx.beginPath();
                ctx.arc(spX, spY, pulse, 0, 2 * Math.PI);
                ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                ctx.beginPath();
                ctx.arc(spX, spY, 3, 0, 2 * Math.PI);
                ctx.fillStyle = '#ef4444';
                ctx.fill();

                ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
                ctx.font = '10px monospace';
                ctx.fillText("SUCTION PEAK", spX + 15, spY - 15);
            }

            if (diagnostics.separation && diagnostics.separation.separated) {
                const sepX = toX(diagnostics.separation.x_sep);
                
                ctx.beginPath();
                ctx.moveTo(sepX, offsetY - (PHYS.h * scale)/2);
                ctx.lineTo(sepX, offsetY + (PHYS.h * scale)/2);
                ctx.strokeStyle = 'rgba(249, 115, 22, 0.8)';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                ctx.setLineDash([]); 
                
                ctx.fillStyle = 'rgba(249, 115, 22, 0.9)';
                ctx.font = 'bold 11px monospace';
                ctx.fillText("FLOW SEPARATION (STALL)", sepX + 10, offsetY - (PHYS.h * scale)/3);
            }
        }

        stateRef.current.tx = { scale, offsetX, offsetY };
        stateRef.current.loop = requestAnimationFrame(draw);
    }, [fieldData, coordinates, activeLayer, blData]);

    useEffect(() => {
        stateRef.current.loop = requestAnimationFrame(draw);
        const obs = new ResizeObserver(() => {
            if (canvasRef.current) draw();
        });
        if (containerRef.current) obs.observe(containerRef.current);
        return () => {
            cancelAnimationFrame(stateRef.current.loop);
            obs.disconnect();
        };
    }, [draw]);

    const handleProbe = (e) => {
        const tx = stateRef.current.tx;
        if (!tx || !fieldData) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const fx = (mx - tx.offsetX) / tx.scale;
        const fy = (tx.offsetY - my) / tx.scale;

        if (fx >= PHYS.minX && fx <= PHYS.maxX && fy >= PHYS.minY && fy <= PHYS.maxY) {
            const { x_grid, y_grid, cp_values, u_values, v_values, nut_values } = fieldData;
            const aspect = PHYS.w / PHYS.h;
            const resY = Math.floor(Math.sqrt(cp_values.length / aspect));
            const resX = Math.floor(resY * aspect);
            
            const gx = Math.max(0, Math.min(resX - 1, Math.floor(((fx - PHYS.minX) / PHYS.w) * resX)));
            const gy = Math.max(0, Math.min(resY - 1, Math.floor(((fy - PHYS.minY) / PHYS.h) * resY)));
            const idx = gy * resX + gx;

            if (cp_values[idx] !== undefined) {
                setProbe({ 
                    mx, my, fx, fy, 
                    cp: cp_values[idx], 
                    u: u_values[idx], 
                    v: v_values[idx],
                    nut: Math.max(0, nut_values[idx]) 
                });
            }
        } else setProbe(null);
    };

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', background: '#06090e', position: 'relative', minHeight: '100%', borderRadius: '8px', overflow: 'hidden' }}>
            
            <div style={{ width: '250px', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(15px)', borderRight: '1px solid rgba(255,255,255,0.1)', padding: '20px', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #1e293b', paddingBottom: '15px' }}>
                    <div style={{ width: '10px', height: '10px', background: '#10b981', borderRadius: '50%', boxShadow: '0 0 10px #10b981' }}></div>
                    <span style={{ fontSize: '11px', color: '#fff', fontWeight: 800, letterSpacing: '2px' }}>SOVEREIGN CORE</span>
                </div>

                <TelemetryBox label="PRESSURE (Cp)" value={probe?.cp.toFixed(4) || '0.0000'} active={!!probe} color="#38bdf8" />
                <TelemetryBox label="VELOCITY X (Ux)" value={probe?.u.toFixed(4) || '0.0000'} active={!!probe} color="#f472b6" />
                <TelemetryBox label="VELOCITY Y (Uy)" value={probe?.v.toFixed(4) || '0.0000'} active={!!probe} color="#f472b6" />
                <TelemetryBox label="TURBULENCE (νt)" value={probe?.nut.toFixed(4) || '0.0000'} active={!!probe} color="#a855f7" />

                <div style={{ marginTop: 'auto', borderTop: '1px solid #30363d', paddingTop: '15px' }}>
                    <div style={{ fontSize: '9px', color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>Kernel: 198-Dim Vector Space</div>
                    <div style={{ fontSize: '9px', color: '#475569', fontFamily: 'monospace' }}>PROBE_XY: [{probe?.fx.toFixed(3) || '---'}, {probe?.fy.toFixed(3) || '---'}]</div>
                </div>
            </div>

            <div style={{ flex: 1, position: 'relative', cursor: 'crosshair', overflow: 'hidden' }}>
                <canvas ref={canvasRef} onMouseMove={handleProbe} onMouseLeave={() => setProbe(null)} style={{ width: '100%', height: '100%', display: 'block' }} />
                
                {/* --- PROFESSIONAL BUTTON BAR AT THE BOTTOM --- */}
                <div style={{ 
                    position: 'absolute', 
                    bottom: '24px', 
                    left: '50%', 
                    transform: 'translateX(-50%)', 
                    zIndex: 20, 
                    display: 'flex', 
                    gap: '12px', 
                    background: 'rgba(11, 15, 20, 0.85)', 
                    padding: '10px 14px', 
                    borderRadius: '12px', 
                    backdropFilter: 'blur(10px)', 
                    border: '1px solid #30363d',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
                }}>
                    <button 
                        onClick={() => setActiveLayer('pressure')}
                        style={{ 
                            background: activeLayer === 'pressure' ? '#38bdf8' : 'transparent', 
                            color: activeLayer === 'pressure' ? '#0f172a' : '#94a3b8', 
                            border: '1px solid rgba(56,189,248,0.5)', 
                            padding: '8px 16px', 
                            borderRadius: '6px', 
                            cursor: 'pointer', 
                            fontSize: '0.75rem', 
                            fontWeight: 'bold',
                            transition: 'all 0.2s'
                        }}
                    >
                        PRESSURE (Cp)
                    </button>
                    <button 
                        onClick={() => setActiveLayer('velocity')}
                        style={{ 
                            background: activeLayer === 'velocity' ? '#f472b6' : 'transparent', 
                            color: activeLayer === 'velocity' ? '#0f172a' : '#94a3b8', 
                            border: '1px solid rgba(244,114,182,0.5)', 
                            padding: '8px 16px', 
                            borderRadius: '6px', 
                            cursor: 'pointer', 
                            fontSize: '0.75rem', 
                            fontWeight: 'bold',
                            transition: 'all 0.2s'
                        }}
                    >
                        VELOCITY MAG
                    </button>
                    <button 
                        onClick={() => setActiveLayer('turbulence')}
                        style={{ 
                            background: activeLayer === 'turbulence' ? '#a855f7' : 'transparent', 
                            color: activeLayer === 'turbulence' ? '#ffffff' : '#94a3b8', 
                            border: '1px solid rgba(168,85,247,0.5)', 
                            padding: '8px 16px', 
                            borderRadius: '6px', 
                            cursor: 'pointer', 
                            fontSize: '0.75rem', 
                            fontWeight: 'bold',
                            transition: 'all 0.2s'
                        }}
                    >
                        TURBULENCE (νt)
                    </button>
                    <button 
                        onClick={() => setActiveLayer('friction')}
                        style={{ 
                            background: activeLayer === 'friction' ? '#fbbf24' : 'transparent', 
                            color: activeLayer === 'friction' ? '#0f172a' : '#94a3b8', 
                            border: '1px solid rgba(251,191,36,0.5)', 
                            padding: '8px 16px', 
                            borderRadius: '6px', 
                            cursor: 'pointer', 
                            fontSize: '0.75rem', 
                            fontWeight: 'bold',
                            transition: 'all 0.2s'
                        }}
                    >
                        SKIN FRICTION (Cf)
                    </button>
                </div>

                {probe && (
                    <div style={{ position: 'absolute', left: probe.mx, top: probe.my, pointerEvents: 'none' }}>
                        <div style={{ width: '1px', height: '2000px', background: 'rgba(255,255,255,0.2)', position: 'absolute', top: -1000 }} />
                        <div style={{ height: '1px', width: '2000px', background: 'rgba(255,255,255,0.2)', position: 'absolute', left: -1000 }} />
                        <div style={{ width: '14px', height: '14px', border: '2px solid #fff', borderRadius: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(255,255,255,0.1)' }} />
                    </div>
                )}
            </div>
        </div>
    );
}

function TelemetryBox({ label, value, active, color }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{label}</span>
            <span style={{ fontSize: '24px', fontWeight: 900, color: active ? color : 'rgba(255,255,255,0.1)', fontFamily: 'monospace', transition: 'color 0.2s' }}>{value}</span>
        </div>
    );
}