'use client';
import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

export function D3AirfoilViz({ coordinates, previewCoordinates }) {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const gContentRef = useRef(null); 
    const xAxisRef = useRef(null); 
    const yAxisRef = useRef(null); 
    const zoomBehaviorRef = useRef(null); 

    // Theming: Deep Sci-Fi / Aerospace Palette
    const COLORS = {
        bg: '#0B0F14',
        grid: '#1A2332', 
        axisText: '#64748b', 
        chord: '#F59E0B', 
        ac: '#00F2FF',
        crosshair: '#38bdf8',
        readoutBg: 'rgba(11, 15, 20, 0.8)'
    };

    const draw = () => {
        if (!svgRef.current || !containerRef.current || !coordinates || coordinates.length === 0) return;
        
        const { width, height } = containerRef.current.getBoundingClientRect();
        if (width === 0 || height === 0) return;

        const svg = d3.select(svgRef.current);
        
        // --- 1. SVG DEFS (Holographic Glows & Gradients) ---
        if (svg.select('defs#holographic-defs').empty()) {
            const defs = svg.append('defs').attr('id', 'holographic-defs');
            
            // Cyan Glow for Main Airfoil
            const filter = defs.append('filter').attr('id', 'cyan-glow').attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
            filter.append('feGaussianBlur').attr('stdDeviation', '5').attr('result', 'blur');
            filter.append('feComposite').attr('in', 'SourceGraphic').attr('in2', 'blur').attr('operator', 'over');

            // Red Glow for Preview
            const redFilter = defs.append('filter').attr('id', 'red-glow').attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
            redFilter.append('feGaussianBlur').attr('stdDeviation', '5').attr('result', 'blur');
            redFilter.append('feComposite').attr('in', 'SourceGraphic').attr('in2', 'blur').attr('operator', 'over');

            // Surface Fill Gradient
            const grad = defs.append('linearGradient').attr('id', 'surface-fill').attr('x1', '0%').attr('y1', '0%').attr('x2', '0%').attr('y2', '100%');
            grad.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(0, 242, 255, 0.20)');
            grad.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(0, 122, 255, 0.02)');
        }

        // --- 2. LAYOUT & MARGINS ---
        const margin = { top: 30, right: 30, bottom: 40, left: 50 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        let mainGroup = svg.select('g.main-group');
        if (mainGroup.empty()) {
            mainGroup = svg.append('g').attr('class', 'main-group')
                .attr('transform', `translate(${margin.left},${margin.top})`);
            
            // Add clipping path so the glowing geometry stays within the axes
            mainGroup.append('defs').append('clipPath').attr('id', 'plot-clip')
                .append('rect').attr('width', innerWidth).attr('height', innerHeight);

            // Groups for axes and content
            mainGroup.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${innerHeight})`);
            mainGroup.append('g').attr('class', 'y-axis');
            mainGroup.append('g').attr('class', 'content').attr('clip-path', 'url(#plot-clip)');
            
            // Interactive UI Layer (Crosshairs & Readouts)
            const uiLayer = mainGroup.append('g').attr('class', 'ui-layer');
            uiLayer.append('line').attr('class', 'crosshair-x').style('display', 'none')
                .attr('stroke', COLORS.crosshair).attr('stroke-width', 0.5).attr('stroke-dasharray', '3 3').attr('pointer-events', 'none');
            uiLayer.append('line').attr('class', 'crosshair-y').style('display', 'none')
                .attr('stroke', COLORS.crosshair).attr('stroke-width', 0.5).attr('stroke-dasharray', '3 3').attr('pointer-events', 'none');
            
            const readout = uiLayer.append('g').attr('class', 'coord-readout').style('display', 'none');
            readout.append('rect').attr('fill', COLORS.readoutBg).attr('rx', 4).attr('stroke', '#1A2332').attr('stroke-width', 1);
            readout.append('text').attr('fill', '#00F2FF').style('font-family', 'monospace').style('font-size', '10px')
                .attr('x', 8).attr('y', 14);
        }

        // CRITICAL FIX: Update the clip-path and axis positions dynamically on every resize
        svg.select('#plot-clip rect').attr('width', innerWidth).attr('height', innerHeight);
        svg.select('g.x-axis').attr('transform', `translate(0,${innerHeight})`);
        if (zoomBehaviorRef.current) {
            zoomBehaviorRef.current.extent([[0, 0], [innerWidth, innerHeight]]);
        }

        gContentRef.current = mainGroup.select('g.content').node();
        xAxisRef.current = mainGroup.select('g.x-axis').node();
        yAxisRef.current = mainGroup.select('g.y-axis').node();

        // --- 3. BOUNDS & SCALING (Fixed Zoom Level) ---
        let minX = 0, maxX = 1.0, minY = -0.15, maxY = 0.15;
        coordinates.forEach(p => {
            const px = p.x !== undefined ? p.x : p[0];
            const py = p.y !== undefined ? p.y : p[1];
            if (px < minX) minX = px; if (px > maxX) maxX = px;
            if (py < minY) minY = py; if (py > maxY) maxY = py;
        });

        // Ensure Y bounds are symmetric around 0
        const maxAbsY = Math.max(Math.abs(minY), Math.abs(maxY), 0.1);
        minY = -maxAbsY; maxY = maxAbsY;

        // Add padding to explicitly zoom out the default view (15% padding)
        const xPad = (maxX - minX) * 0.15;
        minX -= xPad;
        maxX += xPad;

        const yPad = (maxY - minY) * 0.15;
        minY -= yPad;
        maxY += yPad;

        let dataW = maxX - minX;
        let dataH = maxY - minY;

        // Enforce a perfect 1:1 geometric aspect ratio 
        // by expanding the domain to fit the screen dimensions
        const screenAspect = innerWidth / innerHeight;
        const dataAspect = dataW / dataH;

        if (dataAspect > screenAspect) {
            // Expand Y domain to match screen aspect
            const newH = dataW / screenAspect;
            const diff = newH - dataH;
            minY -= diff / 2;
            maxY += diff / 2;
        } else {
            // Expand X domain to match screen aspect
            const newW = dataH * screenAspect;
            const diff = newW - dataW;
            minX -= diff / 2;
            maxX += diff / 2;
        }

        // Now map directly to the full innerWidth/innerHeight
        const xScale = d3.scaleLinear().domain([minX, maxX]).range([0, innerWidth]);
        const yScale = d3.scaleLinear().domain([minY, maxY]).range([innerHeight, 0]);

        // Remove any old translations from previous versions
        d3.select(gContentRef.current).attr('transform', `translate(0, 0)`);

        // Update Axes Functions
        const xAxis = d3.axisBottom(xScale).ticks(10).tickSizeInner(-innerHeight).tickSizeOuter(0).tickPadding(10);
        const yAxis = d3.axisLeft(yScale).ticks(6).tickSizeInner(-innerWidth).tickSizeOuter(0).tickPadding(10);

        // Function to style axes cleanly (Floating HUD look)
        const styleAxes = () => {
            svg.selectAll('.tick line')
                .attr('stroke', COLORS.grid)
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '4 4') 
                .attr('vector-effect', 'non-scaling-stroke');
            svg.selectAll('.tick text')
                .attr('fill', COLORS.axisText)
                .style('font-size', '10px')
                .style('font-family', 'ui-monospace, monospace');
            svg.selectAll('.domain').remove(); 
        };

        d3.select(xAxisRef.current).call(xAxis);
        d3.select(yAxisRef.current).call(yAxis);
        styleAxes();

        // --- 4. DRAWING FUNCTION ---
        const drawContent = (currentXScale, currentYScale) => {
            const gContent = d3.select(gContentRef.current);
            gContent.selectAll('.aerodynamics').remove(); 

            const line = d3.line()
                .x(d => currentXScale(d.x !== undefined ? d.x : d[0]))
                .y(d => currentYScale(d.y !== undefined ? d.y : d[1]))
                .curve(d3.curveCatmullRom.alpha(0.5)); 

            // Center Chord Line (0 to 1 explicitly)
            gContent.append('line').attr('class', 'aerodynamics')
                .attr('x1', currentXScale(0)).attr('y1', currentYScale(0))
                .attr('x2', currentXScale(1)).attr('y2', currentYScale(0))
                .attr('stroke', COLORS.chord).attr('stroke-width', 1.5).attr('stroke-dasharray', '8 4').attr('vector-effect', 'non-scaling-stroke');

            // LE / TE Anchor Nodes
            gContent.append('circle').attr('class', 'aerodynamics non-scaling-marker')
                .attr('cx', currentXScale(0)).attr('cy', currentYScale(0))
                .attr('r', 3).attr('fill', COLORS.bg).attr('stroke', COLORS.chord).attr('stroke-width', 1.5).attr('vector-effect', 'non-scaling-stroke');
            gContent.append('circle').attr('class', 'aerodynamics non-scaling-marker')
                .attr('cx', currentXScale(1)).attr('cy', currentYScale(0))
                .attr('r', 3).attr('fill', COLORS.bg).attr('stroke', COLORS.chord).attr('stroke-width', 1.5).attr('vector-effect', 'non-scaling-stroke');

            // Aerodynamic Center (c/4)
            const acX = 0.25;
            gContent.append('circle').attr('class', 'aerodynamics non-scaling-marker')
                .attr('cx', currentXScale(acX)).attr('cy', currentYScale(0))
                .attr('r', 4).attr('fill', COLORS.bg).attr('stroke', COLORS.ac).attr('stroke-width', 1.5).attr('vector-effect', 'non-scaling-stroke');

            gContent.append('text').attr('class', 'aerodynamics non-scaling-text')
                .attr('x', currentXScale(acX)).attr('y', currentYScale(0) - 12)
                .attr('text-anchor', 'middle').attr('fill', COLORS.ac)
                .style('font-family', 'monospace').style('font-size', '10px').style('pointer-events', 'none')
                .text('c/4 (AC)');

            // Hinge Preview (Red Glow)
            if (previewCoordinates && previewCoordinates.length > 0) {
                gContent.append('path').datum(previewCoordinates).attr('class', 'aerodynamics')
                    .attr('d', line)
                    .attr('fill', 'rgba(248, 113, 113, 0.05)')
                    .attr('stroke', '#f87171')
                    .attr('stroke-width', 2)
                    .attr('stroke-dasharray', '6 6')
                    .attr('filter', 'url(#red-glow)')
                    .attr('vector-effect', 'non-scaling-stroke');
            }

            // Main Airfoil (Cyan Glow)
            gContent.append('path').datum(coordinates).attr('class', 'aerodynamics')
                .attr('d', line)
                .attr('fill', 'url(#surface-fill)')
                .attr('stroke', '#00F2FF')
                .attr('stroke-width', 2.5)
                .attr('stroke-linejoin', 'round')
                .attr('filter', 'url(#cyan-glow)')
                .attr('vector-effect', 'non-scaling-stroke');
        };

        // --- 5. ZOOM BEHAVIOR & INTERACTIVITY ---
        let currentZoomXScale = xScale;
        let currentZoomYScale = yScale;

        zoomBehaviorRef.current = d3.zoom()
            .scaleExtent([0.5, 100])
            .extent([[0, 0], [innerWidth, innerHeight]])
            .on("zoom", (event) => {
                currentZoomXScale = event.transform.rescaleX(xScale);
                currentZoomYScale = event.transform.rescaleY(yScale);

                d3.select(xAxisRef.current).call(xAxis.scale(currentZoomXScale));
                d3.select(yAxisRef.current).call(yAxis.scale(currentZoomYScale));
                styleAxes();

                drawContent(currentZoomXScale, currentZoomYScale);

                // Inverse scaling for markers/text
                d3.select(gContentRef.current).selectAll('.non-scaling-text').style('font-size', `${10 / event.transform.k}px`);
                d3.select(gContentRef.current).selectAll('.non-scaling-marker').attr('r', 4 / event.transform.k).attr('stroke-width', 1.5 / event.transform.k);
            });

        // Reset zoom state on new draw to avoid getting stuck
        svg.call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
        drawContent(xScale, yScale); // Initial Draw

        // --- 6. HUD CROSSHAIR LOGIC ---
        const uiLayer = svg.select('g.ui-layer');
        const crosshairX = uiLayer.select('.crosshair-x');
        const crosshairY = uiLayer.select('.crosshair-y');
        const readout = uiLayer.select('.coord-readout');
        const readoutText = readout.select('text');
        const readoutBg = readout.select('rect');

        svg.on('mousemove', (event) => {
            const [mx, my] = d3.pointer(event, svg.select('g.main-group').node());
            
            if (mx >= 0 && mx <= innerWidth && my >= 0 && my <= innerHeight) {
                // Determine exact data coordinates from mouse position
                const dataX = currentZoomXScale.invert(mx);
                const dataY = currentZoomYScale.invert(my);

                crosshairX.style('display', null).attr('x1', mx).attr('x2', mx).attr('y1', 0).attr('y2', innerHeight);
                crosshairY.style('display', null).attr('x1', 0).attr('x2', innerWidth).attr('y1', my).attr('y2', my);

                const textStr = `X:${dataX.toFixed(4)} Y:${dataY.toFixed(4)}`;
                readoutText.text(textStr);
                
                const boxW = textStr.length * 6.5 + 16;
                readoutBg.attr('width', boxW).attr('height', 22);
                readout.style('display', null).attr('transform', `translate(10, 10)`);
            } else {
                crosshairX.style('display', 'none');
                crosshairY.style('display', 'none');
                readout.style('display', 'none');
            }
        });

        svg.on('mouseleave', () => {
            crosshairX.style('display', 'none');
            crosshairY.style('display', 'none');
            readout.style('display', 'none');
        });

    };

    useEffect(() => {
        draw();
        const resizeObserver = new ResizeObserver(() => draw());
        if (containerRef.current) resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, [coordinates, previewCoordinates]);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: '300px', overflow: 'hidden', background: '#0B0F14', borderRadius: '6px' }}>
            <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }} />
        </div>
    );
}