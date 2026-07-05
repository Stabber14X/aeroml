 'use client';

import React, { useRef, useEffect } from 'react';
import { generateAirfoilCoordinates } from '@/lib/cst_geometry';
import styles from './TwoDProfile.module.css';

/**
 * Draws the airfoil profile, chord line, and grid.
 * @param {Array} coordinates - Array of [x, y] points.
 */
function drawAirfoil(ctx, coordinates, width, height) {
    if (!coordinates || coordinates.length === 0) return;

    ctx.clearRect(0, 0, width, height);

    // --- SETUP: Coordinate Scaling ---
    const padding = 50;
    const drawingWidth = width - 2 * padding;
    const drawingHeight = height - 2 * padding;
    
    // Assume x ranges from 0 to 1. Y typically ranges from -0.2 to 0.2 for airfoils.
    const xScale = drawingWidth;
    const yScale = drawingHeight / 2.5; // Scale Y more aggressively for visibility
    const xOffset = padding;
    const yOffset = height / 2; // Center the Y-axis

    // --- DRAW GRID ---
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    
    // Draw center chord line (X-axis)
    ctx.beginPath();
    ctx.moveTo(xOffset, yOffset);
    ctx.lineTo(xOffset + drawingWidth, yOffset);
    ctx.stroke();

    // Draw vertical grid lines (every 0.2 chord length)
    for (let i = 0.2; i < 1.0; i += 0.2) {
        const xPos = xOffset + i * xScale;
        ctx.beginPath();
        ctx.moveTo(xPos, yOffset - 5);
        ctx.lineTo(xPos, yOffset + 5);
        ctx.stroke();
    }

    // --- DRAW AIRFOIL PROFILE ---
    ctx.strokeStyle = 'var(--accent-cyan)';
    ctx.fillStyle = 'rgba(0, 242, 255, 0.1)'; // Subtle fill
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    
    // Move to leading edge (0, 0)
    ctx.moveTo(xOffset + coordinates[0][0] * xScale, yOffset - coordinates[0][1] * yScale);

    // Draw the curve
    coordinates.forEach(([x, y]) => {
        // Transform (0-1) to screen coordinates
        const screenX = xOffset + x * xScale;
        const screenY = yOffset - y * yScale; // Y is inverted on canvas
        ctx.lineTo(screenX, screenY);
    });

    // Close the shape back to the leading edge (0,0)
    ctx.closePath();
    
    ctx.fill();
    ctx.stroke();
    
    // --- DRAW LEADING EDGE FOCUS ---
    ctx.fillStyle = 'var(--accent-cyan)';
    ctx.beginPath();
    ctx.arc(xOffset, yOffset, 5, 0, 2 * Math.PI); // Center at (0, 0)
    ctx.fill();
}


export default function TwoDProfile({ cstParams }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        // Calculate coordinates based on live CST parameters
        const coordinates = generateAirfoilCoordinates(cstParams);
        
        // Draw
        drawAirfoil(ctx, coordinates, canvas.width, canvas.height);

    }, [cstParams]);

    return (
        <div className={styles.viewerContainer}>
            <canvas ref={canvasRef} width={600} height={300} className={styles.canvas} />
        </div>
    );
}