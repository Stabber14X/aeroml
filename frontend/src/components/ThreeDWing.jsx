'use client';

import React, { useRef, useMemo, useLayoutEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Center, Float, ContactShadows, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { generateAirfoilCoordinates } from '@/lib/cst_geometry';

/**
 * LiquidWing - A high-performance mesh that morphs vertices instantly
 */
function LiquidWing({ cstParams, wingSpan = 3.5 }) {
    const meshRef = useRef();
    const geomRef = useRef();

    // Configuration for resolution
    const SEGMENTS_CHORD = 100; // Smoothness around the airfoil
    const SEGMENTS_SPAN = 1;    // Simple extrusion (we don't need spanwise deformation for this view)
    
    // 1. INITIALIZE MESH TOPOLOGY (Runs Once)
    const initialGeometry = useMemo(() => {
        const geometry = new THREE.BufferGeometry();
        
        // We need (SEGMENTS_CHORD + 1) points per profile slice
        // Total vertices = (Points per slice) * (Slices + 2 for caps)
        // For simple visualization, we can just use 2 slices (Root and Tip) + Caps if needed.
        // Let's do a simple "Ribbon" approach: Top Surface + Bottom Surface closed.
        
        // Vertices calculation
        // A standard airfoil coordinates array has ~200 points (100 top + 100 bottom)
        // Let's allocate enough buffer space.
        const MAX_POINTS = 300; 
        const NUM_SLICES = 2; // Root and Tip
        
        // Total vertex count (safe upper bound)
        const vertexCount = MAX_POINTS * NUM_SLICES * 6; // *6 for triangle expansion safety
        
        const positions = new Float32Array(vertexCount * 3);
        const normals = new Float32Array(vertexCount * 3);
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        
        return geometry;
    }, []);

    // 2. REAL-TIME VERTEX UPDATE (Runs every time params change)
    useLayoutEffect(() => {
        if (!geomRef.current) return;

        // A. Generate raw 2D coordinates from CST
        const rawCoords = generateAirfoilCoordinates(cstParams, SEGMENTS_CHORD);
        
        // B. Build the 3D Mesh Data manually
        const positions = geomRef.current.attributes.position.array;
        let ptr = 0;

        // Helper to push a vertex
        const pushVertex = (x, y, z) => {
            positions[ptr++] = x;
            positions[ptr++] = y;
            positions[ptr++] = z;
        };

        // We build triangles connecting the Root profile (z=0) to Tip profile (z=wingSpan)
        // rawCoords is an ordered array: TE -> Upper -> LE -> Lower -> TE
        const numPoints = rawCoords.length;

        for (let i = 0; i < numPoints - 1; i++) {
            const p1 = rawCoords[i];
            const p2 = rawCoords[i + 1];

            // Normalize coordinates if they are objects {x,y} or arrays [x,y]
            const x1 = (p1.x !== undefined ? p1.x : p1[0]) - 0.5; // Center X
            const y1 = p1.y !== undefined ? p1.y : p1[1];
            
            const x2 = (p2.x !== undefined ? p2.x : p2[0]) - 0.5;
            const y2 = p2.y !== undefined ? p2.y : p2[1];

            // --- CREATE TWO TRIANGLES (QUAD) ---
            
            // Triangle 1: Root1 -> Tip1 -> Root2
            pushVertex(x1, y1, -wingSpan/2); // Root 1
            pushVertex(x1, y1, wingSpan/2);  // Tip 1
            pushVertex(x2, y2, -wingSpan/2); // Root 2

            // Triangle 2: Tip1 -> Tip2 -> Root2
            pushVertex(x1, y1, wingSpan/2);  // Tip 1
            pushVertex(x2, y2, wingSpan/2);  // Tip 2
            pushVertex(x2, y2, -wingSpan/2); // Root 2
        }

        // C. Fill Caps (Simple Fan for now to close holes)
        // Root Cap
        const rootZ = -wingSpan/2;
        const centerX = 0; // Approx center
        const centerY = 0;
        
        for (let i = 0; i < numPoints - 1; i++) {
             const p1 = rawCoords[i];
             const p2 = rawCoords[i + 1];
             const x1 = (p1.x !== undefined ? p1.x : p1[0]) - 0.5;
             const y1 = p1.y !== undefined ? p1.y : p1[1];
             const x2 = (p2.x !== undefined ? p2.x : p2[0]) - 0.5;
             const y2 = p2.y !== undefined ? p2.y : p2[1];

             // Root Cap Triangle (Clockwise relative to outside)
             pushVertex(centerX, centerY, rootZ);
             pushVertex(x2, y2, rootZ);
             pushVertex(x1, y1, rootZ);
        }

        // Tip Cap
        const tipZ = wingSpan/2;
        for (let i = 0; i < numPoints - 1; i++) {
             const p1 = rawCoords[i];
             const p2 = rawCoords[i + 1];
             const x1 = (p1.x !== undefined ? p1.x : p1[0]) - 0.5;
             const y1 = p1.y !== undefined ? p1.y : p1[1];
             const x2 = (p2.x !== undefined ? p2.x : p2[0]) - 0.5;
             const y2 = p2.y !== undefined ? p2.y : p2[1];

             // Tip Cap Triangle
             pushVertex(centerX, centerY, tipZ);
             pushVertex(x1, y1, tipZ);
             pushVertex(x2, y2, tipZ);
        }

        // D. Commit Updates
        geomRef.current.attributes.position.needsUpdate = true;
        
        // Re-calculate normals for correct lighting reflection
        geomRef.current.computeVertexNormals();
        
        // Reset draw range to ensure we render exactly what we pushed
        geomRef.current.setDrawRange(0, ptr / 3);

    }, [cstParams, wingSpan]); // Only re-run vertex calc when CST changes

    return (
        <mesh ref={meshRef} rotation={[0, Math.PI / 2, 0]}>
            <primitive object={initialGeometry} ref={geomRef} attach="geometry" />
            <meshPhysicalMaterial
                color="#007AFF"
                emissive="#001133"
                emissiveIntensity={0.6}
                roughness={0.05}
                metalness={0.95}
                clearcoat={1.0}
                clearcoatRoughness={0.02}
                reflectivity={1.0}
                ior={1.5}
                envMapIntensity={3.5}
                transmission={0.12}
                thickness={0.5}
                side={THREE.DoubleSide}
            />
        </mesh>
    );
}

export default function ThreeDWing({ cstParams }) {
    return (
        <div style={{ width: '100%', height: '100%', minHeight: 420, background: 'radial-gradient(circle at center, #111827 0%, #000 100%)', borderRadius: '8px', overflow: 'hidden' }}>
            <Canvas 
                camera={{ position: [4, 2.5, 5], fov: 30 }} 
                dpr={[1, 2]} 
                shadows
            >
                <ambientLight intensity={0.55} />
                <hemisphereLight skyColor={"#bfe7ff"} groundColor={"#06121a"} intensity={0.22} />
                <directionalLight position={[-6, 8, -4]} intensity={0.9} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={2.5} castShadow shadow-mapSize={[2048, 2048]} />
                <pointLight position={[-8, 2, -5]} intensity={1.2} color="#00FFC2" distance={20} />
                {/* soft rim fill so edges read clearly in silhouette */}
                <pointLight position={[6, -2, 6]} intensity={0.85} color="#8feaff" distance={30} />

                <Environment preset="city" background={false} /> 
                <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
                
                <Center>
                    <Float speed={2} rotationIntensity={0.4} floatIntensity={0.4}>
                        <LiquidWing cstParams={cstParams} wingSpan={3.2} />
                    </Float>
                </Center>

                <ContactShadows position={[0, -1.6, 0]} opacity={0.55} scale={12} blur={3} far={4} color="#000000" />
                <OrbitControls
                  enableZoom={true}
                  enablePan={true}
                  minPolarAngle={0}
                  maxPolarAngle={Math.PI}
                  autoRotate={true}
                  autoRotateSpeed={0.8}
                />
            </Canvas>
        </div>
    );
}