'use client';
import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export default function FieldViz({ fieldData }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!fieldData || !canvasRef.current) return;
        
        const { x, y, value, grid_size } = fieldData;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear
        ctx.clearRect(0, 0, width, height);
        
        if (!value || value.length === 0) return;

        // Color Scale (Turbo is great for CFD)
        const minVal = Math.min(...value);
        const maxVal = Math.max(...value);
        const colorScale = d3.scaleSequential(d3.interpolateTurbo).domain([minVal, maxVal]);

        // Rendering logic
        // We assume structured grid for simplicity since backend sends grid_size
        const cellW = width / grid_size;
        const cellH = height / grid_size;

        // Create ImageData for speed
        const imgData = ctx.createImageData(width, height);
        
        // Naive rendering: draw rectangles (can be optimized to pixel manipulation)
        // For visual clarity on standard screens, loops are fine for 64x64 grid
        
        for (let i = 0; i < value.length; i++) {
            // Map flat index to 2D grid
            const col = i % grid_size;
            const row = Math.floor(i / grid_size);
            
            // Invert row because Y goes up in math but down in canvas
            const drawRow = (grid_size - 1) - row;
            
            const colorHex = colorScale(value[i]);
            ctx.fillStyle = colorHex;
            // Draw slightly overlapping rects to avoid grid lines
            ctx.fillRect(col * cellW, drawRow * cellH, cellW + 1, cellH + 1);
        }
        
        // Overlay: Airfoil Outline (approximate)
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Simple airfoil shape visual placeholder
        ctx.moveTo(width * 0.1, height * 0.5);
        ctx.quadraticCurveTo(width * 0.4, height * 0.3, width * 0.9, height * 0.5);
        ctx.quadraticCurveTo(width * 0.4, height * 0.6, width * 0.1, height * 0.5);
        ctx.stroke();

    }, [fieldData]);

    return (
        <div style={{ width: '100%', height: '100%', background: '#111', borderRadius: '8px', overflow: 'hidden' }}>
            <canvas ref={canvasRef} width={600} height={300} style={{ width: '100%', height: '100%' }} />
        </div>
    );
}