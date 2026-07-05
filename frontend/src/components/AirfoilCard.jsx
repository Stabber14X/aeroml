'use client';
import React, { useMemo, useEffect, useRef, useState } from 'react';
import libraryStyles from '@/app/library/library.module.css';
import { generateAirfoilCoordinates } from '@/lib/cst_geometry';

// We need API access to fetch coordinates if they are missing
const API_BASE_URL = 'http://127.0.0.1:8000';

/* ---------------------------- */
/* NACA GENERATOR            */
/* ---------------------------- */
function generateNACA4(code = '0012', n = 140) {
  try {
    const s = code.padStart(4, '0');
    const m = Number(s[0]) / 100;
    const p = Number(s[1]) / 10;
    const t = Number(s.slice(2)) / 100;

    const rows = [];
    for (let i = 0; i <= n; i++) {
      const b = (Math.PI * i) / n;
      const x = 0.5 * (1 - Math.cos(b));
      const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1015 * x * x * x * x);
      let yc = 0, dy = 0;
      if (m > 0) {
        if (x < p) {
          yc = (m / (p * p)) * (2 * p * x - x * x);
          dy = (2 * m) / (p * p) * (p - x);
        } else {
          yc = (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * x - x * x);
          dy = (2 * m) / ((1 - p) * (1 - p)) * (p - x);
        }
      }
      const th = Math.atan(dy);
      rows.push([
        x - yt * Math.sin(th),
        yc + yt * Math.cos(th),
        x + yt * Math.sin(th),
        yc - yt * Math.cos(th),
      ]);
    }
    const contour = [];
    for (let i = 0; i <= n; i++) contour.push([rows[i][0], rows[i][1]]);
    for (let i = n; i >= 0; i--) contour.push([rows[i][2], rows[i][3]]);
    return contour;
  } catch {
    return null;
  }
}

/* ---------------------------- */
/* AIRFOIL TO SVG PATH (smooth)*/
/* ---------------------------- */
function coordsToPath(coords, w, h, pad = 10) {
  if (!coords) return null;
  const xs = coords.map((p) => p[0]);
  const ys = coords.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const mapX = (x) => pad + ((x - minX) / dx) * (w - pad * 2);
  const mapY = (y) => h - (pad + ((y - minY) / dy) * (h - pad * 2));

  let d = '';
  for (let i = 0; i < coords.length; i++) {
    const x = mapX(coords[i][0]);
    const y = mapY(coords[i][1]);
    if (i === 0) d = `M ${x} ${y}`;
    else {
      const px = mapX(coords[i - 1][0]);
      const py = mapY(coords[i - 1][1]);
      const cx = (px + x) / 2;
      const cy = (py + y) / 2;
      d += ` Q ${px} ${py} ${cx} ${cy}`;
    }
  }
  d += ' Z';
  return d;
}

/* ---------------------------- */
/* CURVED STREAMLINES GENERATOR*/
/* ---------------------------- */
function computeStreamlines(coords, w, h, count = 14) {
  if (!coords) return [];
  const xs = coords.map((p) => p[0]);
  const ys = coords.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const mapX = (x) => 10 + ((x - minX) / dx) * (w - 20);
  const mapY = (y) => h - (10 + ((y - minY) / dy) * (h - 20));

  const camber = [];
  for (let i = 0; i < coords.length; i += 4) {
    const u = coords[i];
    const l = coords[coords.length - 1 - i];
    if (u && l) {
      const mx = (u[0] + l[0]) / 2;
      const my = (u[1] + l[1]) / 2;
      camber.push([mx, my]);
    }
  }
  const mappedCamber = camber.map(([x, y]) => [mapX(x), mapY(y)]);

  function findClosestCamberPoint(x, y) {
    let best = 0, bestDist = 999999;
    for (let i = 0; i < mappedCamber.length; i++) {
      const dx = mappedCamber[i][0] - x;
      const dy = mappedCamber[i][1] - y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  const lines = [];
  const spacing = (h - 20) / (count + 1);
  for (let i = 0; i < count; i++) {
    const yStart = 10 + spacing * (i + 1);
    const pts = [];
    for (let x = 0; x <= w; x += 10) {
      let y = yStart;
      if (mappedCamber.length > 0) {
        const idx = findClosestCamberPoint(x, yStart);
        const camberY = mappedCamber[idx][1];
        const influence = Math.max(0, 32 - Math.abs(yStart - camberY) * 0.42);
        y -= influence * 0.08;
      }
      pts.push([x, y]);
    }
    lines.push(pts);
  }
  return lines;
}

/* ---------------------------- */
/* RENDER THE ANIMATION   */
/* ---------------------------- */
function CFDPreview({ airfoil, large }) {
  const w = large ? 740 : 300;
  const h = large ? 260 : 120;
  const [fetchedCoords, setFetchedCoords] = useState(null);
  const [isFetching, setIsFetching] = useState(false);

  // 1. Determine Coordinates Logic
  let coords = airfoil?.coords;

  // 2. Client-side NACA generation (Fastest)
  if ((!coords || coords.length === 0) && airfoil?.name) {
    const m = airfoil.name.match(/naca\s*([0-9]{3,4})/i) || airfoil.name.match(/\b([0-9]{3,4})\b/);
    if (m && m[1]) {
      coords = generateNACA4(m[1], large ? 360 : 140);
    }
  }

  // 3. If still no coords (e.g., Clark Y, S1223), fetch from backend
  useEffect(() => {
    // If we already have coords (from props or NACA gen) or already fetched, do nothing
    if ((coords && coords.length > 0) || fetchedCoords || isFetching) return;

    const token = localStorage.getItem('token');
    if (!token || !airfoil.id) return;

    const fetchGeometry = async () => {
      setIsFetching(true);
      try {
        const res = await fetch(`${API_BASE_URL}/airfoils/${airfoil.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          // Prefer cst_coefficients if available to generate smooth coords
          if (data.cst_coefficients) {
             const upper = data.cst_coefficients.slice(0, 8);
             const lower = data.cst_coefficients.slice(8, 16);
             const genCoords = generateAirfoilCoordinates({ a_upper: upper, a_lower: lower }, 140);
             setFetchedCoords(genCoords);
          } else if (data.coordinates) {
             setFetchedCoords(data.coordinates);
          }
        }
      } catch (e) {
        console.error("Failed to fetch airfoil geometry for card", e);
      } finally {
        setIsFetching(false);
      }
    };

    fetchGeometry();
  }, [airfoil.id, airfoil.name, coords]);

  // Use fetched coordinates if prop coordinates were missing
  if (!coords || coords.length === 0) {
    coords = fetchedCoords;
  }

  // 4. Fallback for "Loading" state to ensure consistent UI (Blue lines, no blank box)
  // If we are fetching, or if fetch failed, show a generic shape so the UI looks consistent
  if (!coords || coords.length === 0) {
    coords = generateNACA4('0012', 140); // Placeholder shape
  }

  const path = coordsToPath(coords, w, h);
  const streamlines = useMemo(() => computeStreamlines(coords, w, h, 14), [coords]);
  const animRefs = useRef([]);

  useEffect(() => {
    animRefs.current.forEach((ref) => {
      if (!ref) return;
      let t = Math.random() * 200;
      function animate() {
        t += 0.6;
        if (ref) ref.style.strokeDashoffset = `${-t}`;
        requestAnimationFrame(animate);
      }
      animate();
    });
  }, [streamlines]);

  // Render
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={libraryStyles.previewSVG}>
      <defs>
        <linearGradient id={`af-${airfoil.id || 'gen'}`} x1="0" x2="1">
          <stop offset="0" stopColor="#5b8cff" />
          <stop offset="1" stopColor="#2aa7bf" />
        </linearGradient>
      </defs>

      <path
        d={path}
        fill="rgba(70,100,120,0.08)"
        stroke={`url(#af-${airfoil.id || 'gen'})`}
        strokeWidth={large ? 2.6 : 1.8}
        // Add a subtle pulse opacity if we are currently fetching real data
        style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 0.3s' }}
      />

      {streamlines.map((line, i) => {
        const d = line.map((p, idx) => (idx === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ') + '';
        return (
          <path
            key={i}
            ref={(e) => (animRefs.current[i] = e)}
            d={d}
            stroke="rgba(120,170,200,0.28)"
            strokeWidth="1.1"
            fill="none"
            strokeDasharray="22 50"
          />
        );
      })}
    </svg>
  );
}

/* ---------------------------- */
/* CARD WRAPPER       */
/* ---------------------------- */
export default function AirfoilCard({ airfoil, onLoad, onDownload }) {
  return (
    <div className={libraryStyles.airfoilCard}>
      <div className={libraryStyles.previewWrap}>
        <CFDPreview airfoil={airfoil} />
      </div>

      <div className={libraryStyles.cardBody}>
        <div className={libraryStyles.cardTitleRow}>
          <h3 className={libraryStyles.cardTitle}>{airfoil.name}</h3>
          <span className={libraryStyles.familyPill}>
            {(airfoil.family || 'other').toUpperCase()}
          </span>
        </div>

        <p className={libraryStyles.cardID}>ID {airfoil.id}</p>

        <div className={libraryStyles.cardAction}>
          <button className={libraryStyles.loadButton} onClick={() => onLoad(airfoil)}>
            Load
          </button>
          <button className={libraryStyles.openButton} onClick={() => onDownload(airfoil)}>
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

AirfoilCard.Preview = ({ airfoil, large }) => <CFDPreview airfoil={airfoil} large={large} />;