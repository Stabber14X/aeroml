'use client';
import React, { useEffect, useRef } from 'react';
import styles from '@/app/library/library.module.css';

/**
 * Structural Aero Grid Background (New Design)
 * Simulates a high-tension field and velocity nodes.
 */
export default function AeroStreamBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const c = canvas.getContext('2d');

    // Setup dimensions and event listeners
    let w, h;
    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize(); // Initial sizing
    
    let time = 0;
    const nodeCount = 80;
    const velocityNodes = [];
    const gridSize = 40; // Spacing for the background grid

    /* --- Particle Class: Velocity Node --- */
    class VelocityNode {
      constructor() {
        this.reset();
        // Start position is randomized within the entire view
        this.x = Math.random() * w; 
        this.y = Math.random() * h;
      }

      reset() {
        // Z-axis for depth (0 = far, 1 = near)
        this.z = Math.random(); 
        
        // Calculated properties based on Z
        this.speed = 1.0 + this.z * 5.0; // Very fast when close
        this.size = 0.5 + this.z * 1.5;
        this.alpha = 0.05 + this.z * 0.15; 
        
        // Randomly reset position to one of the four edges (entering the screen)
        const edge = Math.floor(Math.random() * 4);
        
        // Reset X and Y based on edge (always coming from outside the view)
        switch (edge) {
            case 0: // Left
                this.x = -50;
                this.y = Math.random() * h;
                break;
            case 1: // Right
                this.x = w + 50;
                this.y = Math.random() * h;
                break;
            case 2: // Top
                this.x = Math.random() * w;
                this.y = -50;
                break;
            case 3: // Bottom
                this.x = Math.random() * w;
                this.y = h + 50;
                break;
        }
        
        // Calculate the direction vector towards a central area (w/2, h/2)
        const targetX = w / 2 + (Math.random() - 0.5) * w * 0.2; // Central 20% width
        const targetY = h / 2 + (Math.random() - 0.5) * h * 0.2; // Central 20% height
        
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        this.dirX = dx / dist;
        this.dirY = dy / dist;
      }

      update() {
        this.x += this.dirX * this.speed;
        this.y += this.dirY * this.speed;

        // Reset if node moves outside the screen boundaries
        if (this.x < -100 || this.x > w + 100 || this.y < -100 || this.y > h + 100) {
          this.reset();
        }
      }

      draw() {
        c.fillStyle = `rgba(100, 200, 255, ${this.alpha})`;
        c.beginPath();
        // Draw a small, bright node
        c.arc(this.x, this.y, this.size, 0, Math.PI * 2); 
        c.fill();
        
        // Draw a short, directional trail (line segment)
        c.strokeStyle = `rgba(100, 200, 255, ${this.alpha * 0.6})`;
        c.lineWidth = this.size * 0.6;
        c.beginPath();
        c.moveTo(this.x, this.y);
        c.lineTo(this.x - this.dirX * 10 * this.z, this.y - this.dirY * 10 * this.z);
        c.stroke();
      }
    }

    // Initialize nodes
    for (let i = 0; i < nodeCount; i++) {
      velocityNodes.push(new VelocityNode());
    }

    /* --- Drawing Functions --- */
    function drawGrid() {
        c.strokeStyle = 'rgba(255, 255, 255, 0.02)'; // Very faint white grid
        c.lineWidth = 0.5;
        
        const centerX = w / 2;
        const centerY = h / 2;
        
        // Grid distortion based on time (subtle pulse)
        const distortionFactor = Math.sin(time * 0.1) * 2; 

        // Draw Vertical Lines
        for (let i = 0; i <= w / gridSize; i++) {
            let x = i * gridSize;
            let distortY = distortionFactor * Math.sin(x * 0.05 + time); // Wave distortion
            
            c.beginPath();
            c.moveTo(x, 0);
            c.lineTo(x, h + distortY);
            c.stroke();
        }

        // Draw Horizontal Lines
        for (let j = 0; j <= h / gridSize; j++) {
            let y = j * gridSize;
            let distortX = distortionFactor * Math.cos(y * 0.05 + time); // Wave distortion
            
            c.beginPath();
            c.moveTo(0, y);
            c.lineTo(w + distortX, y);
            c.stroke();
        }
    }
    
    // Main animation loop
    function draw() {
      // Clear the canvas, making sure to use a dark color for contrast
      c.fillStyle = '#10141a'; // Deep charcoal/blue background
      c.fillRect(0, 0, w, h);

      time += 0.03;

      drawGrid();
      
      // Update and draw all velocity nodes
      for (let p of velocityNodes) {
        p.update();
        p.draw();
      }
      
      requestAnimationFrame(draw);
    }

    // Start the animation
    draw();

    // Cleanup function
    return () => {
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.globalAeroStream} />;
}