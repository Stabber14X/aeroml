// frontend/src/components/ThreeDWingStudio.jsx
'use client';
import React, { useRef, useMemo, useState, useCallback, useLayoutEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { 
    OrbitControls, Environment, Grid, PerspectiveCamera, 
    Instances, Instance, Html, Text, GizmoHelper, GizmoViewport,
    AccumulativeShadows, RandomizedLight, ContactShadows, Float
} from '@react-three/drei';
import * as THREE from 'three';
import { generateAirfoilCoordinates } from '@/lib/cst_geometry';

// --- SHADER LIBRARY ---

const CurvatureShader = {
    uniforms: {
        minCurvature: { value: 0.0 },
        maxCurvature: { value: 0.5 },
        colorLow: { value: new THREE.Color('#0ea5e9') },
        colorMid: { value: new THREE.Color('#10b981') },
        colorHigh: { value: new THREE.Color('#ef4444') },
        time: { value: 0.0 }
    },
    vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPos;
        varying vec3 vWorldNormal;
        varying vec2 vUv;
        
        void main() {
            vNormal = normalize(normalMatrix * normal);
            vWorldNormal = normalize(mat3(modelMatrix) * normal);
            vPos = (modelMatrix * vec4(position, 1.0)).xyz;
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPos;
        varying vec3 vWorldNormal;
        varying vec2 vUv;
        uniform float minCurvature;
        uniform float maxCurvature;
        uniform vec3 colorLow;
        uniform vec3 colorMid;
        uniform vec3 colorHigh;
        uniform float time;

        void main() {
            vec3 dNdx = dFdx(vNormal);
            vec3 dNdy = dFdy(vNormal);
            float curvature = length(cross(dNdx, dNdy));
            float t = smoothstep(minCurvature, maxCurvature, curvature * 12.0);
            
            vec3 color;
            if (t < 0.5) {
                color = mix(colorLow, colorMid, t * 2.0);
            } else {
                color = mix(colorMid, colorHigh, (t - 0.5) * 2.0);
            }
            
            // Subtle grid overlay
            float gridX = 1.0 - smoothstep(0.01, 0.03, mod(vPos.x + 0.015, 0.5));
            float gridZ = 1.0 - smoothstep(0.01, 0.03, mod(vPos.z + 0.015, 0.5));
            float grid = max(gridX, gridZ);
            color = mix(color, vec3(1.0), grid * 0.12);
            
            // Rim lighting
            float rim = 1.0 - abs(dot(normalize(vWorldNormal), vec3(0.0, 1.0, 0.0)));
            color += vec3(0.22, 0.75, 0.97) * pow(rim, 3.0) * 0.15;

            gl_FragColor = vec4(color, 1.0);
        }
    `
};

const ZebraShader = {
    uniforms: {
        scale: { value: 4.0 },
        sharpness: { value: 0.8 },
        baseColor: { value: new THREE.Color('#1a1a2e') },
        stripeColor: { value: new THREE.Color('#e2e8f0') }
    },
    vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPos;
        void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vViewPosition = -mvPosition.xyz;
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPos;
        uniform float scale;
        uniform float sharpness;
        uniform vec3 baseColor;
        uniform vec3 stripeColor;

        void main() {
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(vViewPosition);
            vec3 ref = reflect(-viewDir, normal);
            
            float theta = acos(clamp(ref.y, -1.0, 1.0));
            float phi = atan(ref.z, ref.x);
            
            float stripe = sin(phi * scale * 10.0) + sin(theta * scale * 10.0);
            float t = smoothstep(1.0 - sharpness, 1.0, abs(stripe));
            
            vec3 color = mix(baseColor, stripeColor, t);
            
            // Subtle Fresnel
            float fresnel = pow(1.0 - abs(dot(viewDir, normal)), 3.0);
            color += vec3(0.22, 0.75, 0.97) * fresnel * 0.1;
            
            gl_FragColor = vec4(color, 1.0);
        }
    `
};

const PressureShader = {
    uniforms: {
        colorLow: { value: new THREE.Color('#3b82f6') },
        colorMid: { value: new THREE.Color('#22c55e') },
        colorHigh: { value: new THREE.Color('#ef4444') },
        alpha_rad: { value: 0.07 }
    },
    vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPos;
        varying float vY;
        void main() {
            vNormal = normalize(normalMatrix * normal);
            vPos = position;
            vY = normal.y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPos;
        varying float vY;
        uniform vec3 colorLow;
        uniform vec3 colorMid;
        uniform vec3 colorHigh;
        uniform float alpha_rad;

        void main() {
            // Pressure approximation: lower surface = higher pressure, upper = lower pressure
            float cp = -vY * 0.5 + 0.5; // 0=low pressure (upper), 1=high pressure (lower)
            cp = clamp(cp, 0.0, 1.0);
            
            vec3 color;
            if (cp < 0.5) {
                color = mix(colorLow, colorMid, cp * 2.0);
            } else {
                color = mix(colorMid, colorHigh, (cp - 0.5) * 2.0);
            }
            
            gl_FragColor = vec4(color, 1.0);
        }
    `
};

// --- DATA ---

const VIEW_MODES = {
    STANDARD: 'Standard',
    CURVATURE: 'Curvature',
    PRESSURE: 'Pressure',
    ZEBRA: 'Zebra',
    WIREFRAME: 'Wireframe'
};

const MATERIALS = {
    ALUMINUM: {
        color: '#e2e8f0',
        metalness: 0.85,
        roughness: 0.2,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
        envMapIntensity: 1.2
    },
    CARBON_FIBER: {
        color: '#1a1a1a',
        metalness: 0.15,
        roughness: 0.55,
        clearcoat: 0.7,
        clearcoatRoughness: 0.3,
        envMapIntensity: 0.8
    },
    TITANIUM: {
        color: '#b0b8c8',
        metalness: 0.95,
        roughness: 0.15,
        clearcoat: 0.8,
        clearcoatRoughness: 0.05,
        envMapIntensity: 1.5
    },
    PRIMER: {
        color: '#ea580c',
        metalness: 0.0,
        roughness: 0.9,
        clearcoat: 0.0,
        clearcoatRoughness: 1.0,
        envMapIntensity: 0.3
    },
    STEALTH: {
        color: '#0f1419',
        metalness: 0.05,
        roughness: 0.95,
        clearcoat: 0.0,
        clearcoatRoughness: 1.0,
        envMapIntensity: 0.1
    }
};

// --- SUB-COMPONENTS ---

function SmartWindStream({ count = 300, speed = 15, rangeY = 4, rangeX = 12, length = 20, wingSpan, wingChord }) {
    const group = useRef();
    
    const particles = useMemo(() => {
        const temp = [];
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * rangeX;
            const y = (Math.random() - 0.5) * rangeY;
            const z = -length / 2 - Math.random() * length;
            const speedOffset = Math.random() * 0.5 + 0.8;
            const size = Math.random() * 0.5 + 0.5;
            temp.push({ x, y, z, speedOffset, size, originalY: y });
        }
        return temp;
    }, [count, rangeX, rangeY, length]);

    useFrame((state, delta) => {
        if (!group.current) return;
        
        group.current.children.forEach((mesh, i) => {
            const data = particles[i];
            mesh.position.z += speed * data.speedOffset * delta;

            const distToCenter = Math.abs(mesh.position.x);
            if (mesh.position.z > -1 && mesh.position.z < wingChord + 1 && distToCenter < wingSpan / 2 + 1) {
                const pushStrength = 2.0 * delta;
                if (data.originalY > 0) mesh.position.y += pushStrength;
                else mesh.position.y -= pushStrength;
            } else {
                mesh.position.y += (data.originalY - mesh.position.y) * 1.0 * delta;
            }

            if (mesh.position.z > length / 2) {
                mesh.position.z = -length / 2;
                mesh.position.x = data.x;
                mesh.position.y = data.y;
            }
            
            mesh.scale.z = 1.0 + (speed * delta * 2);
        });
    });

    return (
        <Instances range={count} ref={group}>
            <boxGeometry args={[0.015, 0.015, 0.6]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} />
            {particles.map((p, i) => (
                <Instance key={i} position={[p.x, p.y, p.z]} scale={[p.size, p.size, 1]} />
            ))}
        </Instances>
    );
}

function Dimensions({ span, chord, taper, sweep, visible }) {
    if (!visible) return null;

    const COLOR = "#a855f7";
    const tipChord = chord * taper;
    
    return (
        <group>
            {/* Span Line */}
            <group position={[0, -1.5, 0]}>
                <line>
                    <bufferGeometry>
                        <float32BufferAttribute attach="attributes-position" count={2} 
                            array={new Float32Array([-span / 2, 0, 0, span / 2, 0, 0])} itemSize={3} />
                    </bufferGeometry>
                    <lineBasicMaterial color={COLOR} />
                </line>
                <Text position={[0, -0.3, 0]} fontSize={0.3} color={COLOR} anchorX="center" anchorY="top"
                    font="/fonts/JetBrainsMono-Bold.woff">
                    b = {span.toFixed(1)}m
                </Text>
                <mesh position={[-span / 2, 0, 0]}><boxGeometry args={[0.05, 0.5, 0.05]} /><meshBasicMaterial color={COLOR} /></mesh>
                <mesh position={[span / 2, 0, 0]}><boxGeometry args={[0.05, 0.5, 0.05]} /><meshBasicMaterial color={COLOR} /></mesh>
            </group>

            {/* Root Chord */}
            <group position={[-span / 2 - 0.6, 0, 0]}>
                <line>
                    <bufferGeometry>
                        <float32BufferAttribute attach="attributes-position" count={2} 
                            array={new Float32Array([0, 0, 0, 0, 0, chord])} itemSize={3} />
                    </bufferGeometry>
                    <lineBasicMaterial color={COLOR} />
                </line>
                <Text position={[-0.3, 0, chord / 2]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={0.22} color={COLOR}
                    anchorX="center" anchorY="middle">
                    c = {chord.toFixed(2)}m
                </Text>
            </group>

            {/* Quarter Chord Line */}
            <line>
                <bufferGeometry>
                    <float32BufferAttribute attach="attributes-position" count={2}
                        array={new Float32Array([
                            -span / 2, 0, chord * 0.25,
                            span / 2, 0, (span / 2) * Math.tan(sweep * Math.PI / 180) + tipChord * 0.25
                        ])} itemSize={3} />
                </bufferGeometry>
                <lineBasicMaterial color="#22c55e" transparent opacity={0.6} />
            </line>
        </group>
    );
}

function SlicingPlane({ visible, zPos, wingSpan }) {
    if (!visible) return null;

    return (
        <mesh position={[zPos, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[10, 5]} />
            <meshBasicMaterial color="#f43f5e" transparent opacity={0.1} side={THREE.DoubleSide} depthWrite={false} />
            <lineSegments>
                <edgesGeometry args={[new THREE.PlaneGeometry(10, 5)]} />
                <lineBasicMaterial color="#f43f5e" transparent opacity={0.4} />
            </lineSegments>
            <Html position={[0, 2.8, 0]} center transform>
                <div style={{
                    background: 'rgba(244, 63, 94, 0.9)', color: 'white',
                    padding: '2px 8px', fontSize: '10px', borderRadius: '4px',
                    whiteSpace: 'nowrap', fontWeight: 700, letterSpacing: '0.5px',
                    backdropFilter: 'blur(4px)', fontFamily: 'JetBrains Mono, monospace'
                }}>
                    y = {zPos.toFixed(1)}m
                </div>
            </Html>
        </mesh>
    );
}

function AnimatedCurvatureMaterial() {
    const materialRef = useRef();
    
    useFrame((state) => {
        if (materialRef.current) {
            materialRef.current.uniforms.time.value = state.clock.elapsedTime;
        }
    });

    return (
        <shaderMaterial
            ref={materialRef}
            {...CurvatureShader}
            side={THREE.DoubleSide}
        />
    );
}

function EngineeringWing({ cstParams, wingParams, viewMode, material, setBounds }) {
    const meshRef = useRef();
    const { span, chord, taper, sweep, twist, dihedral } = wingParams;
    const CHORD_RES = 100;
    const SPAN_RES = 60;

    const geometry = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        const coords2D = generateAirfoilCoordinates(cstParams, CHORD_RES);
        
        const vertices = [];
        const indices = [];
        
        for (let s = 0; s <= SPAN_RES; s++) {
            const t = s / SPAN_RES;
            const spanPos = (t - 0.5) * 2;
            const absPos = Math.abs(spanPos);
            
            const localChord = chord * (1 - absPos * (1 - taper));
            const x_loc = spanPos * (span / 2);
            const z_le = absPos * (span / 2) * Math.tan(sweep * Math.PI / 180);
            const y_le = absPos * (span / 2) * Math.tan(dihedral * Math.PI / 180);
            const localTwist = -twist * absPos * (Math.PI / 180);

            for (let i = 0; i < coords2D.length; i++) {
                const [cx, cy] = coords2D[i];
                let px = cx * localChord;
                let py = cy * localChord;
                
                const z_rot = px * Math.cos(localTwist) - py * Math.sin(localTwist);
                const y_rot = px * Math.sin(localTwist) + py * Math.cos(localTwist);
                
                vertices.push(x_loc, y_le + y_rot, z_le + z_rot);
            }
        }

        const pointsPerSection = coords2D.length;
        for (let s = 0; s < SPAN_RES; s++) {
            for (let i = 0; i < pointsPerSection - 1; i++) {
                const row1 = s * pointsPerSection;
                const row2 = (s + 1) * pointsPerSection;
                const a = row1 + i;
                const b = row1 + i + 1;
                const c = row2 + i;
                const d = row2 + i + 1;
                
                indices.push(a, d, b);
                indices.push(a, c, d);
            }
        }

        const leftStart = 0;
        for (let i = 0; i < pointsPerSection - 1; i++) {
            indices.push(leftStart, leftStart + i + 1, leftStart + i);
        }
        const rightStart = SPAN_RES * pointsPerSection;
        for (let i = 0; i < pointsPerSection - 1; i++) {
            indices.push(rightStart, rightStart + i, rightStart + i + 1);
        }

        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        
        return geo;
    }, [cstParams, span, chord, taper, sweep, twist, dihedral]);

    useLayoutEffect(() => {
        if (meshRef.current) {
            geometry.computeBoundingBox();
            if (setBounds) setBounds(geometry.boundingBox);
        }
    }, [geometry, setBounds]);

    const renderMaterial = useMemo(() => {
        if (viewMode === VIEW_MODES.ZEBRA) {
            return new THREE.ShaderMaterial({ ...ZebraShader, side: THREE.DoubleSide });
        }
        if (viewMode === VIEW_MODES.PRESSURE) {
            return new THREE.ShaderMaterial({ ...PressureShader, side: THREE.DoubleSide });
        }
        return new THREE.MeshPhysicalMaterial({
            ...MATERIALS[material],
            side: THREE.DoubleSide,
            wireframe: viewMode === VIEW_MODES.WIREFRAME
        });
    }, [viewMode, material]);

    return (
        <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
            {viewMode === VIEW_MODES.CURVATURE ? (
                <AnimatedCurvatureMaterial />
            ) : (
                <primitive object={renderMaterial} attach="material" />
            )}
            {(viewMode === VIEW_MODES.STANDARD || viewMode === VIEW_MODES.PRESSURE) && (
                <lineSegments>
                    <edgesGeometry args={[geometry, 25]} />
                    <lineBasicMaterial color="#38bdf8" transparent opacity={0.15} />
                </lineSegments>
            )}
        </mesh>
    );
}

// --- MAIN STUDIO ---
export default function ThreeDWingStudio({ cstParams, wingParams }) {
    const [viewMode, setViewMode] = useState(VIEW_MODES.STANDARD);
    const [materialType, setMaterialType] = useState('ALUMINUM');
    const [showDimensions, setShowDimensions] = useState(true);
    const [showWind, setShowWind] = useState(true);
    const [showSlice, setShowSlice] = useState(false);
    const [slicePos, setSlicePos] = useState(0);
    const [showControls, setShowControls] = useState(true);

    const orbitRef = useRef();
    
    const resetCamera = () => {
        if (orbitRef.current) orbitRef.current.reset();
    };

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', background: '#050508', overflow: 'hidden' }}>
            <Canvas
                shadows
                dpr={[1, 2]}
                camera={{ position: [8, 6, 8], fov: 40, near: 0.1, far: 200 }}
                gl={{ preserveDrawingBuffer: true, antialias: true, alpha: false }}
                style={{ background: '#050508' }}
            >
                <PerspectiveCamera makeDefault position={[8, 6, 8]} />
                <OrbitControls
                    ref={orbitRef}
                    enablePan={true}
                    enableZoom={true}
                    minDistance={2}
                    maxDistance={50}
                    maxPolarAngle={Math.PI / 2 - 0.05}
                    autoRotate={viewMode === VIEW_MODES.STANDARD}
                    autoRotateSpeed={0.3}
                    target={[0, 0, 0]}
                    enableDamping={true}
                    dampingFactor={0.05}
                />
                
                {/* Lighting */}
                <ambientLight intensity={0.35} />
                <spotLight
                    position={[12, 18, 12]}
                    angle={0.35}
                    penumbra={0.6}
                    intensity={2.0}
                    castShadow
                    shadow-mapSize={[2048, 2048]}
                    shadow-bias={-0.0001}
                />
                <pointLight position={[-12, 5, -12]} intensity={1.2} color="#38bdf8" />
                <pointLight position={[12, 3, -8]} intensity={0.8} color="#a855f7" />
                <pointLight position={[0, -5, 5]} intensity={0.4} color="#f472b6" />
                <Environment preset="city" />

                <group position={[0, 1.5, 0]}>
                    <EngineeringWing
                        cstParams={cstParams}
                        wingParams={wingParams}
                        viewMode={viewMode}
                        material={materialType}
                    />
                    
                    <Dimensions
                        span={wingParams.span}
                        chord={wingParams.chord}
                        taper={wingParams.taper}
                        sweep={wingParams.sweep}
                        visible={showDimensions}
                    />
                    
                    <SlicingPlane visible={showSlice} zPos={slicePos} wingSpan={wingParams.span} />
                    
                    {showWind && (
                        <SmartWindStream
                            count={350}
                            speed={18}
                            rangeX={wingParams.span * 1.5}
                            rangeY={4}
                            length={18}
                            wingSpan={wingParams.span}
                            wingChord={wingParams.chord}
                        />
                    )}
                </group>

                <Grid
                    position={[0, -0.01, 0]}
                    args={[50, 50]}
                    cellSize={1}
                    cellThickness={0.4}
                    cellColor="#1a1f2e"
                    sectionSize={5}
                    sectionThickness={1.2}
                    sectionColor="#2d3748"
                    fadeDistance={35}
                    fadeStrength={1.5}
                />
                
                <AccumulativeShadows temporal frames={60} alphaTest={0.85} scale={25} opacity={0.5} color="#000000">
                    <RandomizedLight amount={8} radius={5} ambient={0.5} intensity={1} position={[5, 8, -10]} bias={0.001} />
                </AccumulativeShadows>

                <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
                    <GizmoViewport axisColors={['#ef4444', '#10b981', '#3b82f6']} labelColor="white" />
                </GizmoHelper>
            </Canvas>

            {/* STUDIO HUD */}
            {showControls && (
                <div style={{
                    position: 'absolute', top: 16, right: 16,
                    display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end',
                    pointerEvents: 'none', zIndex: 50
                }}>
                    {/* Visualization Mode */}
                    <HudPanel title="VISUALIZATION">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                            {Object.values(VIEW_MODES).map(mode => (
                                <HudButton
                                    key={mode}
                                    label={mode.toUpperCase()}
                                    active={viewMode === mode}
                                    onClick={() => setViewMode(mode)}
                                />
                            ))}
                        </div>
                    </HudPanel>

                    {/* Material & Controls */}
                    <HudPanel title="SURFACE & OVERLAYS">
                        <div style={{ marginBottom: 8 }}>
                            <select
                                value={materialType}
                                onChange={(e) => setMaterialType(e.target.value)}
                                style={{
                                    width: '100%', background: '#020617', border: '1px solid #1e293b',
                                    color: '#e2e8f0', padding: '6px 8px', borderRadius: 4,
                                    fontSize: '11px', outline: 'none', cursor: 'pointer',
                                    fontFamily: 'JetBrains Mono, monospace'
                                }}
                            >
                                <option value="ALUMINUM">Aerospace Aluminum</option>
                                <option value="CARBON_FIBER">Carbon Fiber Composite</option>
                                <option value="TITANIUM">Titanium Alloy</option>
                                <option value="PRIMER">Factory Primer</option>
                                <option value="STEALTH">RAM Coating (Stealth)</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <Toggle label="CAD Dimensions" active={showDimensions} onClick={() => setShowDimensions(!showDimensions)} />
                            <Toggle label="Wind Stream FX" active={showWind} onClick={() => setShowWind(!showWind)} />
                            <Toggle label="Section Plane" active={showSlice} onClick={() => setShowSlice(!showSlice)} />
                        </div>

                        {showSlice && (
                            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1e293b' }}>
                                <input
                                    type="range"
                                    min={-wingParams.span / 2} max={wingParams.span / 2} step={0.1}
                                    value={slicePos}
                                    onChange={(e) => setSlicePos(parseFloat(e.target.value))}
                                    style={{ width: '100%', cursor: 'pointer', accentColor: '#f43f5e' }}
                                />
                                <div style={{ textAlign: 'right', fontSize: '10px', color: '#f43f5e', fontFamily: 'JetBrains Mono, monospace' }}>
                                    y = {slicePos.toFixed(1)}m
                                </div>
                            </div>
                        )}
                    </HudPanel>

                    <button
                        onClick={resetCamera}
                        style={{
                            pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.9)',
                            border: '1px solid #1e293b', color: '#94a3b8',
                            padding: '6px 12px', borderRadius: 6, fontSize: '10px',
                            cursor: 'pointer', fontWeight: 700, letterSpacing: '0.5px',
                            fontFamily: 'JetBrains Mono, monospace',
                            backdropFilter: 'blur(10px)',
                            transition: 'all 150ms ease'
                        }}
                        onMouseEnter={(e) => { e.target.style.borderColor = '#38bdf8'; e.target.style.color = '#38bdf8'; }}
                        onMouseLeave={(e) => { e.target.style.borderColor = '#1e293b'; e.target.style.color = '#94a3b8'; }}
                    >
                        RESET CAMERA
                    </button>
                </div>
            )}

            {/* Toggle HUD visibility */}
            <button
                onClick={() => setShowControls(!showControls)}
                style={{
                    position: 'absolute', top: 16, right: showControls ? 240 : 16,
                    pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid #1e293b', color: '#94a3b8',
                    width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', zIndex: 51, backdropFilter: 'blur(10px)',
                    transition: 'right 250ms ease'
                }}
                title={showControls ? 'Hide Controls' : 'Show Controls'}
            >
                {showControls ? '◂' : '▸'}
            </button>

            {/* Viewport Badge */}
            <div style={{ position: 'absolute', bottom: 16, left: 16, pointerEvents: 'none', zIndex: 50 }}>
                <div style={{
                    background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
                    padding: '8px 12px'
                }}>
                    <div style={{ color: '#38bdf8', fontSize: '12px', fontWeight: 900, letterSpacing: 1 }}>AEROML STUDIO</div>
                    <div style={{ color: '#64748b', fontSize: '9px', marginTop: 2, fontFamily: 'JetBrains Mono, monospace' }}>
                        REAL-TIME RENDERER V7.2
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- HUD HELPER COMPONENTS ---

function HudPanel({ title, children }) {
    return (
        <div style={{
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(16px) saturate(1.5)',
            padding: 12, borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.06)',
            pointerEvents: 'auto', minWidth: 200,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
        }}>
            <div style={{
                fontSize: '9px', color: '#64748b', fontWeight: 800,
                marginBottom: 8, letterSpacing: 1.2,
                fontFamily: 'JetBrains Mono, monospace'
            }}>
                {title}
            </div>
            {children}
        </div>
    );
}

function HudButton({ label, active, onClick }) {
    return (
        <button
            onClick={onClick}
            style={{
                background: active
                    ? 'linear-gradient(135deg, rgba(56,189,248,0.2), rgba(56,189,248,0.1))'
                    : 'rgba(255,255,255,0.03)',
                color: active ? '#38bdf8' : '#64748b',
                border: active ? '1px solid rgba(56,189,248,0.3)' : '1px solid transparent',
                padding: '5px 10px', borderRadius: 5,
                fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                transition: 'all 150ms ease',
                fontFamily: 'JetBrains Mono, monospace',
                letterSpacing: '0.3px'
            }}
            onMouseEnter={(e) => {
                if (!active) {
                    e.target.style.background = 'rgba(255,255,255,0.06)';
                    e.target.style.color = '#cbd5e1';
                }
            }}
            onMouseLeave={(e) => {
                if (!active) {
                    e.target.style.background = 'rgba(255,255,255,0.03)';
                    e.target.style.color = '#64748b';
                }
            }}
        >
            {label}
        </button>
    );
}

function Toggle({ label, active, onClick }) {
    return (
        <div
            onClick={onClick}
            style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', cursor: 'pointer', padding: '3px 0'
            }}
        >
            <span style={{ fontSize: '11px', color: active ? '#e2e8f0' : '#475569', fontWeight: 500, transition: 'color 150ms' }}>
                {label}
            </span>
            <div style={{
                width: 28, height: 16,
                background: active ? 'linear-gradient(135deg, #38bdf8, #0ea5e9)' : '#1e293b',
                borderRadius: 999, position: 'relative', transition: 'background 200ms',
                boxShadow: active ? '0 0 8px rgba(56,189,248,0.3)' : 'none'
            }}>
                <div style={{
                    width: 12, height: 12,
                    background: '#fff', borderRadius: '50%',
                    position: 'absolute', top: 2,
                    left: active ? 14 : 2,
                    transition: 'left 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                }} />
            </div>
        </div>
    );
}