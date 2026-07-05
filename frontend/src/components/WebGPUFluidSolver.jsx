'use client';
/**
 * WebGPUFluidSolver — Workbench-Compatible Edition
 *
 * Props (exact interface used by workbench/page.js):
 *   airfoilCoordinates : Array<[number, number]>  normalised [x,y] polygon points
 *   speed              : number  lattice velocity (0.05–0.15), driven by workbench Reynolds
 *
 * Features:
 *  • 500×200 LBM D2Q9 GPU solver, 8 sub-steps / frame
 *  • 4 visualization modes: Speed (Magma) | Schlieren | Vorticity | Pressure
 *  • Draw / Erase / Probe brush tools
 *  • Local AoA-offset slider (rotates received airfoilCoordinates ±15°)
 *  • Top HUD: Re, Ma, FPS, sim-time
 *  • Per-mode colormap legend bar
 *  • Export PNG / Flush Flow / Clear Ink
 *  • Smooth SVG airfoil overlay using the same coordinate transform as workbench
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────
const GRID_W = 500;
const GRID_H = 200;

// ─── WGSL Shaders ─────────────────────────────────────────────────────────────
const COMPUTE_SHADER = `
struct Uni{width:f32,height:f32,time:f32,viscosity:f32,u0:f32,mx:f32,my:f32,mode:f32}
@group(0)@binding(0)var<uniform>           U:Uni;
@group(0)@binding(1)var<storage,read>      fI:array<f32>;
@group(0)@binding(2)var<storage,read_write>fO:array<f32>;
@group(0)@binding(3)var<storage,read>      B:array<u32>;

const W9:array<f32,9>=array<f32,9>(4./9.,1./9.,1./9.,1./9.,1./9.,1./36.,1./36.,1./36.,1./36.);
const CX:array<f32,9>=array<f32,9>(0.,1.,0.,-1.,0.,1.,-1.,-1.,1.);
const CY:array<f32,9>=array<f32,9>(0.,0.,1.,0.,-1.,1.,1.,-1.,-1.);
const OP:array<u32,9>=array<u32,9>(0u,3u,4u,1u,2u,7u,8u,5u,6u);

fn i9(x:u32,y:u32)->u32{return(y*u32(U.width)+x)*9u;}
fn feq(w:f32,r:f32,ux:f32,uy:f32,cx:f32,cy:f32)->f32{
    let cu=cx*ux+cy*uy;return w*r*(1.+3.*cu+4.5*cu*cu-1.5*(ux*ux+uy*uy));
}

@compute @workgroup_size(16,16)
fn main(@builtin(global_invocation_id) g:vec3<u32>){
    let x=g.x;let y=g.y;
    let W=u32(U.width);let H=u32(U.height);
    if(x>=W||y>=H){return;}
    let omega=1./(3.*U.viscosity+0.5);

    // Hard inlet reset every step
    if(x==0u){
        let b=i9(0u,y);
        for(var i=0u;i<9u;i++){
            let cu=CX[i]*U.u0;
            fO[b+i]=W9[i]*(1.+3.*cu+4.5*cu*cu-1.5*U.u0*U.u0);
        }
        return;
    }

    for(var i=0u;i<9u;i++){
        let sx=i32(x)-i32(CX[i]);let sy=i32(y)-i32(CY[i]);
        var wall=false;
        if(sy<0||sy>=i32(H)){wall=true;}
        else if(sx>=0&&sx<i32(W)){if(B[u32(sy)*W+u32(sx)]==1u){wall=true;}}

        if(wall){
            fO[i9(x,y)+i]=fI[i9(x,y)+OP[i]];
        }else if(sx<0){
            let cu=CX[i]*U.u0;
            fO[i9(x,y)+i]=W9[i]*(1.+3.*cu+4.5*cu*cu-1.5*U.u0*U.u0);
        }else if(sx>=i32(W)){
            fO[i9(x,y)+i]=fI[i9(x-1u,y)+i];
        }else{
            let sb=i9(u32(sx),u32(sy));
            var sr=0.;var sux=0.;var suy=0.;
            for(var k=0u;k<9u;k++){let v=fI[sb+k];sr+=v;sux+=v*CX[k];suy+=v*CY[k];}
            if(sr>1e-6){sux/=sr;suy/=sr;}
            let spd=sqrt(sux*sux+suy*suy);
            if(spd>0.28){let s=0.28/spd;sux*=s;suy*=s;}
            fO[i9(x,y)+i]=fI[sb+i]+omega*(feq(W9[i],sr,sux,suy,CX[i],CY[i])-fI[sb+i]);
        }
    }
}`;

const RENDER_SHADER = `
struct Uni{width:f32,height:f32,time:f32,viscosity:f32,u0:f32,mx:f32,my:f32,mode:f32}
@group(0)@binding(0)var<uniform>  U:Uni;
@group(0)@binding(1)var<storage,read>F:array<f32>;
@group(0)@binding(2)var<storage,read>B:array<u32>;

struct VO{@builtin(position)p:vec4<f32>,@location(0)uv:vec2<f32>}
@vertex fn vert(@builtin(vertex_index)vi:u32)->VO{
    var pts=array<vec2<f32>,6>(vec2(-1.,-1.),vec2(1.,-1.),vec2(-1.,1.),vec2(-1.,1.),vec2(1.,-1.),vec2(1.,1.));
    var o:VO;o.p=vec4(pts[vi],0.,1.);o.uv=vec2(pts[vi].x*.5+.5,1.-(pts[vi].y*.5+.5));return o;
}

const CX9:array<f32,9>=array<f32,9>(0.,1.,0.,-1.,0.,1.,-1.,-1.,1.);
const CY9:array<f32,9>=array<f32,9>(0.,0.,1.,0.,-1.,1.,1.,-1.,-1.);
fn mac(x:u32,y:u32)->vec3<f32>{
    var r=0.;var ux=0.;var uy=0.;
    let b=(y*u32(U.width)+x)*9u;
    for(var i=0u;i<9u;i++){let f=F[b+i];r+=f;ux+=f*CX9[i];uy+=f*CY9[i];}
    if(r>1e-6){ux/=r;uy/=r;}
    return vec3(r,ux,uy);
}

fn magma(t:f32)->vec3<f32>{
    let v=clamp(t,0.,1.)*4.;
    let s=array<vec3<f32>,5>(
        vec3(0.001,0.000,0.014),vec3(0.316,0.076,0.485),
        vec3(0.722,0.254,0.347),vec3(0.979,0.557,0.035),vec3(0.988,0.998,0.645)
    );
    let si=clamp(u32(v),0u,3u);
    return mix(s[si],s[si+1u],fract(v));
}
fn schlieren(t:f32)->vec3<f32>{let v=clamp(t,0.,1.);return vec3(v*.86,v*.92,v);}
fn pressure(t:f32)->vec3<f32>{
    let v=clamp(t,0.,1.);
    return vec3(smoothstep(.35,.95,v),max(0.,1.-abs(v-.5)*1.9)*.6,smoothstep(.65,.05,v));
}

@fragment fn frag(@location(0)uv:vec2<f32>)->@location(0)vec4<f32>{
    let W=u32(U.width);let H=u32(U.height);
    let x=u32(uv.x*U.width);let y=u32(uv.y*U.height);
    if(x>=W||y>=H){discard;}
    if(B[y*W+x]==1u){return vec4(0.,0.,0.,0.);}

    let c=mac(x,y);
    let rx=min(x+1u,W-1u);let lx=select(x-1u,0u,x==0u);
    let dy=min(y+1u,H-1u);let uy2=select(y-1u,0u,y==0u);

    if(U.mode<0.5){
        let spd=sqrt(max(0.,c.y*c.y+c.z*c.z));
        return vec4(magma(clamp(spd/(U.u0*1.3),0.,1.)),1.);
    }
    if(U.mode<1.5){
        let r2=mac(rx,y);let u2=mac(x,uy2);
        let g=sqrt(max(0.,(r2.x-c.x)*(r2.x-c.x)+(u2.x-c.x)*(u2.x-c.x)));
        return vec4(schlieren(clamp(g*145.,0.,1.)),1.);
    }
    if(U.mode<2.5){
        let r2=mac(rx,y);let l2=mac(lx,y);
        let d2=mac(x,dy);let u2=mac(x,uy2);
        let curl=(r2.z-l2.z)-(d2.y-u2.y);
        let v=clamp(abs(curl)*43.,0.,1.);
        if(curl>0.){return vec4(v*.95,v*.15,v*.08,1.);}
        else{return vec4(v*.08,v*.3,v,1.);}
    }
    return vec4(pressure(clamp((c.x-.88)/.24,0.,1.)),1.);
}`;

// ─── Pure helpers ─────────────────────────────────────────────────────────────
function makeInitFluid() {
    const w9 = [4/9,1/9,1/9,1/9,1/9,1/36,1/36,1/36,1/36];
    const f = new Float32Array(GRID_W * GRID_H * 9);
    for (let i = 0; i < GRID_W * GRID_H; i++) w9.forEach((w, k) => { f[i*9+k] = w; });
    return f;
}

function rasterisePolygon(coords) {
    const off = document.createElement('canvas');
    off.width = GRID_W; off.height = GRID_H;
    const ctx = off.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = 'black'; ctx.fillRect(0, 0, GRID_W, GRID_H);
    ctx.fillStyle = 'white';
    ctx.beginPath();
    coords.forEach(([x, y], i) => {
        // Identical transform to the SVG overlay in the workbench page
        const sx = (x * 0.5 + 0.25) * GRID_W;
        const sy = (0.5 - y * 2.0) * GRID_H;
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    });
    ctx.closePath(); ctx.fill();
    const img = ctx.getImageData(0, 0, GRID_W, GRID_H).data;
    const barrier = new Uint32Array(GRID_W * GRID_H);
    for (let i = 0; i < barrier.length; i++) if (img[i*4] > 127) barrier[i] = 1;
    return barrier;
}

function rotateCoords(coords, deg) {
    if (!deg || !coords?.length) return coords;
    const rad = (deg * Math.PI) / 180;
    const cx  = coords.reduce((s, p) => s + p[0], 0) / coords.length;
    const cy  = coords.reduce((s, p) => s + p[1], 0) / coords.length;
    return coords.map(([x, y]) => {
        const dx = x - cx, dy = y - cy;
        return [cx + dx*Math.cos(rad) - dy*Math.sin(rad),
                cy + dx*Math.sin(rad) + dy*Math.cos(rad)];
    });
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function WebGPUFluidSolver({ airfoilCoordinates, speed = 0.12 }) {
    const canvasRef = useRef(null);

    // All mutable GPU state lives here to avoid closure staleness
    const g = useRef({
        device: null, context: null, isActive: false,
        pipelineCompute: null, pipelineRender: null,
        bufA: null, bufB: null, bufBarrier: null, bufUni: null,
        bindGroups: {},
        baseBarrier:  new Uint32Array(GRID_W * GRID_H),
        drawnBarrier: new Uint32Array(GRID_W * GRID_H),
        frame: 0,
    });

    const [error,     setError]     = useState(null);
    const [ready,     setReady]     = useState(false);
    const [hud,       setHud]       = useState({ fps: 0, t: '0.0' });
    const [vizMode,   setVizMode]   = useState(0);
    const [brushMode, setBrushMode] = useState('draw'); // 'draw' | 'erase' | 'probe'
    const [probeXY,   setProbeXY]   = useState(null);
    const [aoaTweak,  setAoaTweak]  = useState(0);  // local AoA offset layered on top of workbench

    // Effective coordinates: workbench coords + local AoA rotation
    const displayCoords = aoaTweak !== 0
        ? rotateCoords(airfoilCoordinates, -aoaTweak)
        : airfoilCoordinates;

    // ── 1. GPU initialisation ─────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!navigator.gpu) return setError('WebGPU not supported. Requires Chrome 113+ / Edge 113+.');
            const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
            if (!adapter) return setError('No GPU adapter found.');
            const device  = await adapter.requestDevice();
            if (cancelled) return;

            const canvas  = canvasRef.current;
            const context = canvas.getContext('webgpu');
            const format  = navigator.gpu.getPreferredCanvasFormat();
            context.configure({ device, format, alphaMode: 'premultiplied' });

            const fluidSz = GRID_W * GRID_H * 9 * 4;
            const barrSz  = GRID_W * GRID_H * 4;
            const mk = (sz, usage) => device.createBuffer({ size: sz, usage });

            const bufA   = mk(fluidSz, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC);
            const bufB   = mk(fluidSz, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC);
            const bufBar = mk(barrSz,  GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
            const bufUni = mk(32,      GPUBufferUsage.UNIFORM  | GPUBufferUsage.COPY_DST);

            const initF = makeInitFluid();
            device.queue.writeBuffer(bufA, 0, initF);
            device.queue.writeBuffer(bufB, 0, initF);

            const compMod  = device.createShaderModule({ code: COMPUTE_SHADER });
            const rendMod  = device.createShaderModule({ code: RENDER_SHADER });

            const compPipe = device.createComputePipeline({
                layout: 'auto', compute: { module: compMod, entryPoint: 'main' },
            });
            const rendPipe = device.createRenderPipeline({
                layout: 'auto',
                vertex:   { module: rendMod, entryPoint: 'vert' },
                fragment: { module: rendMod, entryPoint: 'frag', targets: [{ format }] },
                primitive: { topology: 'triangle-list' },
            });

            const mkCBG = (bIn, bOut) => device.createBindGroup({
                layout: compPipe.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: bufUni } },
                    { binding: 1, resource: { buffer: bIn  } },
                    { binding: 2, resource: { buffer: bOut } },
                    { binding: 3, resource: { buffer: bufBar } },
                ],
            });
            const mkRBG = (bIn) => device.createBindGroup({
                layout: rendPipe.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: bufUni } },
                    { binding: 1, resource: { buffer: bIn  } },
                    { binding: 2, resource: { buffer: bufBar } },
                ],
            });

            Object.assign(g.current, {
                device, context, format,
                pipelineCompute: compPipe, pipelineRender: rendPipe,
                bufA, bufB, bufBarrier: bufBar, bufUni,
                bindGroups: {
                    c0: mkCBG(bufA, bufB), c1: mkCBG(bufB, bufA),
                    rA: mkRBG(bufA),       rB: mkRBG(bufB),
                },
                isActive: true, frame: 0,
            });
            setReady(true);
        })().catch(e => setError(String(e)));

        return () => { cancelled = true; g.current.isActive = false; };
    }, []);

    // ── 2. Barrier sync helper ────────────────────────────────────────────────
    const syncBarrier = useCallback(() => {
        const { device, bufBarrier, baseBarrier, drawnBarrier } = g.current;
        if (!device) return;
        const merged = new Uint32Array(GRID_W * GRID_H);
        for (let i = 0; i < merged.length; i++) merged[i] = baseBarrier[i] | drawnBarrier[i];
        device.queue.writeBuffer(bufBarrier, 0, merged);
    }, []);

    // Re-rasterise whenever the effective airfoil polygon changes
    useEffect(() => {
        if (!ready || !displayCoords?.length) return;
        g.current.baseBarrier = rasterisePolygon(displayCoords);
        syncBarrier();
    }, [ready, displayCoords, syncBarrier]);

    // ── 3. Animation loop ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!ready) return;
        let rafId;
        let lastT = performance.now(), fpsCnt = 0;

        const loop = (now) => {
            if (!g.current.isActive) return;
            const { device, context, pipelineCompute, pipelineRender, bindGroups, bufUni } = g.current;

            const safeSpeed = Math.min(Math.max(Number(speed) || 0.12, 0.05), 0.15);
            device.queue.writeBuffer(bufUni, 0, new Float32Array([
                GRID_W, GRID_H, now * 0.001, 0.01, safeSpeed, 0, 0, vizMode,
            ]));

            const enc = device.createCommandEncoder();

            // 8 compute sub-steps (ping-pong)
            for (let s = 0; s < 8; s++) {
                const cp = enc.beginComputePass();
                cp.setPipeline(pipelineCompute);
                cp.setBindGroup(0, g.current.frame % 2 === 0 ? bindGroups.c0 : bindGroups.c1);
                cp.dispatchWorkgroups(Math.ceil(GRID_W / 16), Math.ceil(GRID_H / 16));
                cp.end();
                g.current.frame++;
            }

            // Render
            const rp = enc.beginRenderPass({
                colorAttachments: [{
                    view:       context.getCurrentTexture().createView(),
                    clearValue: { r: 0.04, g: 0.07, b: 0.11, a: 1 },
                    loadOp:     'clear',
                    storeOp:    'store',
                }],
            });
            rp.setPipeline(pipelineRender);
            rp.setBindGroup(0, g.current.frame % 2 === 0 ? bindGroups.rA : bindGroups.rB);
            rp.draw(6);
            rp.end();
            device.queue.submit([enc.finish()]);

            // HUD throttle
            fpsCnt++;
            if (now - lastT > 750) {
                setHud({
                    fps: Math.round((fpsCnt / (now - lastT)) * 1000),
                    t:   (now * 0.001).toFixed(1),
                });
                lastT = now; fpsCnt = 0;
            }

            rafId = requestAnimationFrame(loop);
        };

        rafId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafId);
    }, [ready, speed, vizMode]);

    // ── 4. Brush interaction ──────────────────────────────────────────────────
    const pointerDown = useRef(false);

    const applyBrush = useCallback((e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const gx = Math.floor(((e.clientX - rect.left) / rect.width)  * GRID_W);
        const gy = Math.floor(((e.clientY - rect.top)  / rect.height) * GRID_H);

        if (brushMode === 'probe') { setProbeXY({ gx, gy }); return; }

        const val = brushMode === 'draw' ? 1 : 0;
        const R   = 4;
        for (let dy = -R; dy <= R; dy++) {
            for (let dx = -R; dx <= R; dx++) {
                if (dx*dx + dy*dy <= R*R) {
                    const px = gx + dx, py = gy + dy;
                    if (px >= 0 && px < GRID_W && py >= 0 && py < GRID_H)
                        g.current.drawnBarrier[py * GRID_W + px] = val;
                }
            }
        }
        syncBarrier();
    }, [brushMode, syncBarrier]);

    const onPD = (e) => { pointerDown.current = true;  applyBrush(e); e.preventDefault(); };
    const onPU = ()  => { pointerDown.current = false; };
    const onPM = (e) => { if (pointerDown.current) applyBrush(e); };

    // ── 5. Action handlers ────────────────────────────────────────────────────
    const clearInk = () => { g.current.drawnBarrier.fill(0); syncBarrier(); };

    const flushFlow = () => {
        const { device, bufA, bufB } = g.current;
        if (!device) return;
        const f = makeInitFluid();
        device.queue.writeBuffer(bufA, 0, f);
        device.queue.writeBuffer(bufB, 0, f);
    };

    const exportPNG = () => {
        const a = document.createElement('a');
        a.download = `wind_tunnel_${Date.now()}.png`;
        a.href = canvasRef.current.toDataURL('image/png');
        a.click();
    };

    // ── 6. Derived display values ─────────────────────────────────────────────
    const safeSpeed = Math.min(Math.max(Number(speed) || 0.12, 0.05), 0.15);
    const re        = Math.round((safeSpeed * GRID_W * 0.5) / 0.01);
    const ma        = (safeSpeed / (1 / Math.sqrt(3))).toFixed(3);

    const MODES = [
        { id: 0, label: 'SPEED',     color: '#38bdf8' },
        { id: 1, label: 'SCHLIEREN', color: '#c084fc' },
        { id: 2, label: 'VORTICITY', color: '#f97316' },
        { id: 3, label: 'PRESSURE',  color: '#34d399' },
    ];
    const LEGENDS = [
        { lo: '0',      hi: '1.5× U₀', grad: 'linear-gradient(to right,#010011,#1a0050,#7a1929,#f0730f,#fde76e,#fbfdbf)' },
        { lo: 'Low Δρ', hi: 'High Δρ', grad: 'linear-gradient(to right,#090d12,#8090a0,#d8e8f0)' },
        { lo: '−ω',     hi: '+ω',      grad: 'linear-gradient(to right,#1050cc,#030820,#200408,#b01a10)' },
        { lo: 'Low P',  hi: 'High P',  grad: 'linear-gradient(to right,#1020cc,#cce,#cc1010)' },
    ];

    // ── Error screen ──────────────────────────────────────────────────────────
    if (error) return (
        <div style={{
            width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#060a0f', color: '#ff6b6b',
            fontFamily: 'monospace', gap: 10, padding: 32, textAlign: 'center',
        }}>
            <div style={{ fontSize: 28 }}>⚠</div>
            <div style={{ fontWeight: 700 }}>WebGPU Unavailable</div>
            <div style={{ color: '#666', fontSize: 12, maxWidth: 340 }}>{error}</div>
        </div>
    );

    // ── Main render ───────────────────────────────────────────────────────────
    return (
        <div style={{
            position: 'relative', width: '100%', height: '100%',
            background: '#060a0f', overflow: 'hidden',
            fontFamily: '"JetBrains Mono","Fira Code",monospace',
            userSelect: 'none',
        }}>

            {/* Raw WebGPU canvas */}
            <canvas
                ref={canvasRef}
                width={GRID_W}
                height={GRID_H}
                style={{
                    position: 'absolute', inset: 0,
                    width: '100%', height: '100%',
                    display: 'block',
                    imageRendering: 'pixelated',
                    cursor: brushMode === 'probe' ? 'crosshair'
                          : brushMode === 'erase' ? 'cell'
                          : 'crosshair',
                }}
                onPointerDown={onPD}
                onPointerUp={onPU}
                onPointerLeave={onPU}
                onPointerMove={onPM}
            />

            {/* Anti-aliased SVG airfoil overlay — same coordinate transform as workbench */}
            {displayCoords?.length > 0 && (
                <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    style={{
                        position: 'absolute', inset: 0,
                        width: '100%', height: '100%',
                        pointerEvents: 'none',
                    }}
                >
                    <defs>
                        <filter id="wt-glow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="0.25" result="b"/>
                            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                    </defs>
                    <polygon
                        points={displayCoords.map(([x, y]) =>
                            `${(x * 0.5 + 0.25) * 100},${(0.5 - y * 2.0) * 100}`
                        ).join(' ')}
                        fill="#060a0f"
                        stroke="#00f2ff"
                        strokeWidth="0.25"
                        vectorEffect="non-scaling-stroke"
                        filter="url(#wt-glow)"
                    />
                </svg>
            )}

            {/* ── Top HUD strip ─────────────────────────────────────────────── */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 34,
                background: 'rgba(4,8,14,0.90)', borderBottom: '1px solid #0d1a26',
                display: 'flex', alignItems: 'center', padding: '0 12px', gap: 16,
                pointerEvents: 'none', zIndex: 20,
            }}>
                <span style={{ color: '#00f2ff', fontWeight: 900, fontSize: 11, letterSpacing: 2 }}>
                    ◈ LBM WIND TUNNEL
                </span>
                <HudSep />
                <HudPill label="Re"  value={re.toLocaleString()} color="#c084fc" />
                <HudPill label="Ma"  value={ma}                  color="#38bdf8" />
                <HudPill label="FPS" value={hud.fps}             color="#00f2ff" />
                <HudPill label="T"   value={`${hud.t}s`}         color="#64748b" />
                {probeXY && (
                    <>
                        <HudSep />
                        <HudPill label="PROBE" value={`(${probeXY.gx}, ${probeXY.gy})`} color="#f97316" />
                    </>
                )}
            </div>

            {/* ── Right control panel ───────────────────────────────────────── */}
            <div style={{
                position: 'absolute', top: 42, right: 10, bottom: 30,
                width: 128, display: 'flex', flexDirection: 'column', gap: 7, zIndex: 20,
            }}>

                {/* Visualization */}
                <CtrlPane label="VISUALIZATION">
                    {MODES.map(m => (
                        <ModeBtn
                            key={m.id}
                            active={vizMode === m.id}
                            color={m.color}
                            onClick={() => setVizMode(m.id)}
                        >{m.label}</ModeBtn>
                    ))}
                </CtrlPane>

                {/* Tool */}
                <CtrlPane label="TOOL">
                    <ModeBtn active={brushMode === 'draw'}  color="#00f2ff"
                        onClick={() => { setBrushMode('draw');  setProbeXY(null); }}>✦ DRAW</ModeBtn>
                    <ModeBtn active={brushMode === 'erase'} color="#f97316"
                        onClick={() => { setBrushMode('erase'); setProbeXY(null); }}>◈ ERASE</ModeBtn>
                    <ModeBtn active={brushMode === 'probe'} color="#c084fc"
                        onClick={() => setBrushMode('probe')}>⊕ PROBE</ModeBtn>
                </CtrlPane>

                {/* Local AoA tweak (on top of workbench angle-of-attack) */}
                <CtrlPane label="AoA OFFSET">
                    <input
                        type="range" min={-15} max={15} step={0.5}
                        value={aoaTweak}
                        onChange={e => setAoaTweak(Number(e.target.value))}
                        style={{ width: '100%', accentColor: '#f97316', cursor: 'pointer' }}
                    />
                    <div style={{ color: '#f97316', fontSize: 10, textAlign: 'center' }}>
                        {aoaTweak > 0 ? '+' : ''}{aoaTweak}°
                    </div>
                </CtrlPane>

                {/* Actions */}
                <CtrlPane label="ACTIONS">
                    <ActionBtn color="#ef4444" onClick={clearInk}>CLEAR INK</ActionBtn>
                    <ActionBtn color="#38bdf8" onClick={flushFlow}>FLUSH FLOW</ActionBtn>
                    <ActionBtn color="#34d399" onClick={exportPNG}>EXPORT PNG</ActionBtn>
                </CtrlPane>
            </div>

            {/* ── Colormap legend ───────────────────────────────────────────── */}
            <div style={{
                position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(4,8,14,0.85)', border: '1px solid #0d1a26',
                borderRadius: 4, padding: '5px 14px', pointerEvents: 'none', zIndex: 20,
            }}>
                <span style={{ color: '#2e4055', fontSize: 9 }}>{LEGENDS[vizMode].lo}</span>
                <div style={{ width: 100, height: 6, borderRadius: 2, background: LEGENDS[vizMode].grad }} />
                <span style={{ color: '#2e4055', fontSize: 9 }}>{LEGENDS[vizMode].hi}</span>
            </div>

            {/* ── Init overlay ──────────────────────────────────────────────── */}
            {!ready && !error && (
                <div style={{
                    position: 'absolute', inset: 0, background: '#060a0f',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    color: '#00f2ff', gap: 10, zIndex: 50,
                }}>
                    <style>{`@keyframes wt-spin{to{transform:rotate(360deg)}}`}</style>
                    <div style={{ fontSize: 24, animation: 'wt-spin 1.1s linear infinite' }}>◈</div>
                    <div style={{ fontSize: 11, letterSpacing: 2 }}>INITIALISING GPU…</div>
                </div>
            )}
        </div>
    );
}

// ─── Tiny reusable sub-components ─────────────────────────────────────────────
const HudSep = () => <div style={{ width: 1, height: 16, background: '#0d1a26' }} />;

const HudPill = ({ label, value, color }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ color: '#2e4055', fontSize: 9, letterSpacing: 1 }}>{label}</span>
        <span style={{ color, fontSize: 11, fontWeight: 700 }}>{value}</span>
    </div>
);

const CtrlPane = ({ label, children }) => (
    <div style={{
        background: 'rgba(6,10,16,0.93)',
        border: '1px solid #0d1a26',
        borderRadius: 5,
        padding: '7px 9px',
    }}>
        <div style={{ color: '#1e3040', fontSize: 8, letterSpacing: 2, marginBottom: 6 }}>{label}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
);

const ModeBtn = ({ active, color, onClick, children }) => (
    <button onClick={onClick} style={{
        background:  active ? `${color}1c` : 'transparent',
        color:       active ? color : '#243040',
        border:      `1px solid ${active ? color : '#0d1a26'}`,
        borderRadius: 3, padding: '5px 0',
        cursor: 'pointer', fontSize: 9, fontWeight: 'bold',
        letterSpacing: 1, fontFamily: 'inherit',
        transition: 'all 0.12s', width: '100%',
    }}>{children}</button>
);

const ActionBtn = ({ color, onClick, children }) => (
    <button onClick={onClick}
        onMouseEnter={e => e.currentTarget.style.background = `${color}18`}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        style={{
            background: 'transparent', color,
            border: `1px solid ${color}44`,
            borderRadius: 3, padding: '6px 0',
            cursor: 'pointer', fontSize: 9, fontWeight: 'bold',
            letterSpacing: 1, fontFamily: 'inherit',
            width: '100%', transition: 'all 0.12s',
        }}
    >{children}</button>
);