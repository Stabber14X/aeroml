'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { generateAirfoilCoordinates, NACA4412_CST } from '@/lib/cst_geometry';
import { D3AirfoilViz } from '@/components/D3AirfoilViz';
import SubscriptionGuard from '@/components/SubscriptionGuard';
import styles from './export.module.css';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import { 
  FiMonitor, FiScissors, FiFileText, FiDatabase, FiTerminal,
  FiBox, FiZap, FiX, FiCheckCircle, FiAlertTriangle,
  FiDownload, FiSliders, FiActivity
} from 'react-icons/fi';

const API_BASE_URL = 'https://aeroml-production.up.railway.app';

// ─── TOAST SYSTEM ──────────────────────────────────────────────
function ToastContainer({ toasts, removeToast }) {
  return (
    <div className={styles.toastContainer}>
      {toasts.map((toast) => (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 50 }}
          className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : styles.toastSuccess}`}
        >
          <span>{toast.message}</span>
          <button onClick={() => removeToast(toast.id)} className={styles.toastClose}>
            <FiX size={14} />
          </button>
        </motion.div>
      ))}
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────
function ExportContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [cst, setCst] = useState(null);
  const [filename, setFilename] = useState("AeroML_Design");
  const [chordScale, setChordScale] = useState(1000); 
  const [isDownloading, setIsDownloading] = useState(false);
  const [toasts, setToasts] = useState([]);

  // ─── Toast System ─────────────────────────────────────────────
  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ─── Load CST from URL or localStorage ────────────────────────
  useEffect(() => {
    const cstStr = searchParams.get('cst');
    const nameStr = searchParams.get('name');

    if (cstStr) {
      try {
        const parsed = JSON.parse(decodeURIComponent(cstStr));
        if (Array.isArray(parsed) && parsed.length === 16) {
          setCst(parsed);
          if (nameStr) setFilename(decodeURIComponent(nameStr));
          showToast('Design loaded successfully');
        }
      } catch (e) {
        console.error("Parse Error", e);
        showToast('Failed to parse design data', 'error');
      }
    } else {
      // Try loading from localStorage
      const savedState = localStorage.getItem('AeroML_Live_State');
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          if (parsed.a_upper && parsed.a_lower) {
            const coeffs = [...parsed.a_upper, ...parsed.a_lower];
            setCst(coeffs);
            const savedName = localStorage.getItem('AeroML_Project_Name');
            if (savedName) setFilename(savedName);
            showToast('Loaded from session');
          }
        } catch(e) {
          console.error("LocalStorage error", e);
        }
      }
      
      // Fallback to NACA 4412
      if (!cst) {
        const coeffs = [...NACA4412_CST.a_upper, ...NACA4412_CST.a_lower];
        setCst(coeffs);
        setFilename("NACA_4412_Default");
      }
    }
  }, [searchParams]);

  // ─── Generate coordinates ─────────────────────────────────────
  const renderCoordinates = useMemo(() => {
    if (!cst) return [];
    const mid = cst.length / 2;
    return generateAirfoilCoordinates({ 
      a_upper: cst.slice(0, mid), 
      a_lower: cst.slice(mid) 
    }, 120);
  }, [cst]);

  const cadCoordinates = useMemo(() => {
    if (!cst) return [];
    const mid = cst.length / 2;
    return generateAirfoilCoordinates({ 
      a_upper: cst.slice(0, mid), 
      a_lower: cst.slice(mid) 
    }, 400);
  }, [cst]);

  // ─── Generate DXF ─────────────────────────────────────────────
  const generateDXF = (coords, scale) => {
    let dxf = "0\nSECTION\n2\nENTITIES\n";
    for (let i = 0; i < coords.length - 1; i++) {
      dxf += "0\nLINE\n8\nProfile\n"; 
      dxf += `10\n${(coords[i][0] * scale).toFixed(6)}\n20\n${(coords[i][1] * scale).toFixed(6)}\n30\n0.0\n`;
      dxf += `11\n${(coords[i+1][0] * scale).toFixed(6)}\n21\n${(coords[i+1][1] * scale).toFixed(6)}\n31\n0.0\n`;
    }
    dxf += "0\nLINE\n8\nProfile\n";
    dxf += `10\n${(coords[coords.length-1][0] * scale).toFixed(6)}\n20\n${(coords[coords.length-1][1] * scale).toFixed(6)}\n30\n0.0\n`;
    dxf += `11\n${(coords[0][0] * scale).toFixed(6)}\n21\n${(coords[0][1] * scale).toFixed(6)}\n31\n0.0\n`;
    dxf += "0\nENDSEC\n0\nEOF\n";
    return dxf;
  };

  // ─── Generate SVG ─────────────────────────────────────────────
  const generateSVG = (coords, scale) => {
    const pts = coords.map(p => ({ x: p[0] * scale, y: -p[1] * scale }));
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    
    const padX = (maxX - minX) * 0.1 || 10;
    const padY = (maxY - minY) * 0.1 || 10;
    
    const w = (maxX - minX) + padX * 2;
    const h = (maxY - minY) + padY * 2;
    const vX = minX - padX;
    const vY = minY - padY;

    let pathData = `M ${pts[0].x.toFixed(4)},${pts[0].y.toFixed(4)} `;
    for(let i = 1; i < pts.length; i++) {
      pathData += `L ${pts[i].x.toFixed(4)},${pts[i].y.toFixed(4)} `;
    }
    pathData += "Z";

    const strokeW = Math.max(scale * 0.002, 0.5).toFixed(4);

    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vX.toFixed(4)} ${vY.toFixed(4)} ${w.toFixed(4)} ${h.toFixed(4)}" width="100%" height="100%">\n    <rect x="${vX.toFixed(4)}" y="${vY.toFixed(4)}" width="${w.toFixed(4)}" height="${h.toFixed(4)}" fill="#ffffff" />\n    <path d="${pathData}" fill="none" stroke="#000000" stroke-width="${strokeW}" stroke-linejoin="round" />\n</svg>`;
  };

  // ─── Handle client-side download ─────────────────────────────
  const handleClientDownload = (format) => {
    if (!cadCoordinates || cadCoordinates.length === 0) {
      showToast('No coordinates to export', 'error');
      return;
    }
    
    let content = '';
    let mimeType = 'text/plain';
    const scale = parseFloat(chordScale) || 1.0;

    if (format === 'dxf') {
      content = generateDXF(cadCoordinates, scale);
    } else if (format === 'svg') {
      content = generateSVG(cadCoordinates, scale);
      mimeType = 'image/svg+xml';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${scale}mm.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    showToast(`Downloaded ${format.toUpperCase()} file`);
  };

  // ─── Handle backend download ──────────────────────────────────
  const handleBackendDownload = async (format) => {
    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Authentication required', 'error');
      return;
    }
    setIsDownloading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/airfoils/export`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          cst_coefficients: cst,
          filename: filename,
          format: format,
          scale_mm: parseFloat(chordScale)
        })
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast(`Downloaded ${format.toUpperCase()} file`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Download failed: ${err.detail || 'Server error'}`, 'error');
      }
    } catch (e) {
      showToast('Network error during download', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  // ─── Generate Blueprint PDF ──────────────────────────────────
  const generateBlueprint = () => {
    if (!cadCoordinates || cadCoordinates.length === 0) {
      showToast('No coordinates to export', 'error');
      return;
    }
    
    setIsDownloading(true);
    setTimeout(() => {
      try {
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pw = pdf.internal.pageSize.getWidth();
        const ph = pdf.internal.pageSize.getHeight();

        // Cover Page
        pdf.setFillColor(11, 15, 20);
        pdf.rect(0, 0, pw, ph, 'F');

        pdf.setTextColor(56, 189, 248);
        pdf.setFontSize(24);
        pdf.setFont('helvetica', 'bold');
        pdf.text("ENGINEERING BLUEPRINT", pw/2, 70, { align: 'center' });
        
        pdf.setTextColor(0, 255, 194);
        pdf.setFontSize(16);
        pdf.text(filename.toUpperCase(), pw/2, 95, { align: 'center' });
        
        pdf.setTextColor(148, 163, 184);
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Generated: ${new Date().toLocaleString()}`, pw/2, 120, { align: 'center' });
        pdf.text(`Scale: ${chordScale} mm chord`, pw/2, 135, { align: 'center' });
        
        pdf.setDrawColor(56, 189, 248);
        pdf.setLineWidth(0.5);
        pdf.line(pw/2 - 50, 150, pw/2 + 50, 150);

        pdf.setTextColor(148, 163, 184);
        pdf.setFontSize(10);
        pdf.text("AeroML v7.0 · Sovereign Export Engine", pw/2, 170, { align: 'center' });

        // Math Formulation Page
        pdf.addPage();
        pdf.setFillColor(11, 15, 20);
        pdf.rect(0, 0, pw, ph, 'F');
        
        pdf.setTextColor(56, 189, 248);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text("1. MATHEMATICAL FORMULATION (CST)", 15, 25);
        
        pdf.setTextColor(148, 163, 184);
        pdf.setFontSize(10);
        pdf.setFont('courier', 'normal');
        pdf.text("Class Shape Transformation (CST) Polynomial Weights.", 15, 35);
        
        const mid = cst.length / 2;
        const tableData = [];
        for(let i=0; i<mid; i++) {
          tableData.push([ 
            `W_Upper_${i}`, cst[i].toFixed(6), 
            `W_Lower_${i}`, cst[mid+i].toFixed(6) 
          ]);
        }

        autoTable(pdf, {
          startY: 45,
          head: [['Upper Surface Weight', 'Value', 'Lower Surface Weight', 'Value']],
          body: tableData,
          theme: 'grid',
          headStyles: { 
            fillColor: [56, 189, 248], 
            textColor: [0, 0, 0], 
            font: 'courier',
            fontSize: 9
          },
          styles: { 
            font: 'courier', 
            fontSize: 8,
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255]
          },
          alternateRowStyles: { fillColor: [15, 23, 42] }
        });

        // Profile Page
        const curY = pdf.lastAutoTable.finalY + 20;
        pdf.setTextColor(56, 189, 248);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text("2. GEOMETRIC PROFILE", 15, curY);

        const bx = 15, by = curY + 10, bw = pw - 30, bh = 80;
        pdf.setDrawColor(51, 65, 85);
        pdf.rect(bx, by, bw, bh);

        // Grid
        pdf.setDrawColor(30, 41, 59);
        for(let i=1; i<10; i++) pdf.line(bx + (bw/10)*i, by, bx + (bw/10)*i, by+bh);
        for(let i=1; i<4; i++) pdf.line(bx, by + (bh/4)*i, bx+bw, by + (bh/4)*i);

        // Center line
        pdf.setDrawColor(148, 163, 184);
        pdf.setLineDashPattern([2, 2], 0);
        pdf.line(bx, by + bh/2, bx+bw, by + bh/2);
        pdf.setLineDashPattern([], 0);

        // Draw airfoil
        const xs = renderCoordinates.map(p => p[0]);
        const ys = renderCoordinates.map(p => p[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);

        const dataW = maxX - minX || 1;
        const dataH = maxY - minY || 0.1;
        const scaleX = bw / dataW;
        const scaleY = (bh / dataH) * 0.4; 

        const mapX = (x) => bx + ((x - minX) * scaleX);
        const mapY = (y) => (by + bh/2) - (y * scaleY);

        pdf.setDrawColor(56, 189, 248);
        pdf.setLineWidth(0.8);
        
        let prevX = mapX(renderCoordinates[0][0]);
        let prevY = mapY(renderCoordinates[0][1]);
        
        for(let i=1; i<renderCoordinates.length; i++) {
          let currX = mapX(renderCoordinates[i][0]);
          let currY = mapY(renderCoordinates[i][1]);
          pdf.line(prevX, prevY, currX, currY);
          prevX = currX; prevY = currY;
        }
        pdf.line(prevX, prevY, mapX(renderCoordinates[0][0]), mapY(renderCoordinates[0][1]));

        // Coordinates Page
        pdf.addPage();
        pdf.setFillColor(11, 15, 20);
        pdf.rect(0, 0, pw, ph, 'F');
        
        pdf.setTextColor(56, 189, 248);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text("3. MANUFACTURE COORDINATES (X/C, Y/C)", 15, 20);

        const coordData = cadCoordinates.map((p, i) => [
          i, 
          p[0].toFixed(6), 
          p[1].toFixed(6)
        ]);
        
        autoTable(pdf, {
          startY: 28,
          head: [['Index', 'X Coordinate', 'Y Coordinate']],
          body: coordData,
          theme: 'striped',
          headStyles: { 
            fillColor: [56, 189, 248], 
            textColor: [0, 0, 0], 
            font: 'courier',
            fontSize: 9
          },
          styles: { 
            font: 'courier', 
            fontSize: 7,
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255],
            cellPadding: 1.5
          },
          alternateRowStyles: { fillColor: [15, 23, 42] }
        });

        pdf.save(`${filename}_Blueprint.pdf`);
        showToast('Blueprint PDF generated successfully');
      } catch (error) {
        console.error(error);
        showToast('Failed to generate PDF blueprint', 'error');
      } finally {
        setIsDownloading(false);
      }
    }, 100);
  };

  if (!cst) return null; 

  return (
    <div className={styles.masterContainer}>
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <main className={styles.mainContent}>
        {/* ─── HEADER ───────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div>
              <h1 className={styles.title}>
                <span className={styles.titleIcon}>📤</span>
                Data <span className={styles.highlight}>Export Control</span>
              </h1>
              <p className={styles.subtitle}>
                Generate manufacturing blueprints, CAD models, and raw physical datasets.
              </p>
            </div>
            <div className={styles.headerActions}>
              <span className={styles.statusBadge}>
                <span className={styles.statusPulse} />
                Ready
              </span>
            </div>
          </div>
        </header>

        {/* ─── GRID ─────────────────────────────────────────────── */}
        <div className={styles.grid}>

          {/* ─── LEFT COLUMN: VISUALIZATION ────────────────────── */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderIcon} style={{ background: 'rgba(56,189,248,0.08)', color: '#38bdf8' }}>
                <FiMonitor size={18} />
              </div>
              <h2>Airfoil Profile</h2>
              <span className={styles.badge}>Geometry Check</span>
            </div>

            <div className={styles.leftColumnContent}>
              {/* Visualization */}
              <div className={styles.vizWrapper}>
                <D3AirfoilViz coordinates={renderCoordinates} />
              </div>

              {/* Metrics */}
              <div className={styles.metricsBar}>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>Identifier</span>
                  <span className={styles.metricValue} title={filename}>
                    {filename.length > 20 ? filename.substring(0, 20) + '...' : filename}
                  </span>
                </div>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>CAD Vertices</span>
                  <span className={`${styles.metricValue} ${styles.blue}`}>400 Pts</span>
                </div>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>Physical Chord</span>
                  <span className={`${styles.metricValue} ${styles.orange}`}>{chordScale} mm</span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── RIGHT COLUMN: CONTROLS ────────────────────────── */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderIcon} style={{ background: 'rgba(245,158,11,0.08)', color: '#f59e0b' }}>
                <FiSliders size={18} />
              </div>
              <h2>Export Configuration</h2>
              <span className={styles.badge}>Controls</span>
            </div>

            <div className={styles.leftColumnContent}>
              {/* Configuration */}
              <div className={styles.configSection}>
                <div className={styles.configRow}>
                  <div className={styles.configGroup}>
                    <span className={styles.configLabel}>File Name</span>
                    <input 
                      type="text" 
                      value={filename} 
                      onChange={(e) => setFilename(e.target.value)} 
                      className={styles.configInput}
                      placeholder="Enter file name"
                    />
                  </div>
                  <div className={styles.configGroup} style={{ flex: '0.6' }}>
                    <span className={styles.configLabel}>Chord Scale (mm)</span>
                    <input 
                      type="number" 
                      value={chordScale} 
                      onChange={(e) => setChordScale(parseFloat(e.target.value) || 0)} 
                      className={styles.configInput}
                      min="1"
                    />
                  </div>
                </div>
              </div>

              {/* Export Buttons */}
              <div className={styles.exportSection}>
                <div className={styles.exportSectionTitle}>
                  <FiDownload size={14} />
                  Client-Side Generation
                </div>
                <div className={styles.exportGrid}>
                  <button 
                    onClick={() => handleClientDownload('dxf')} 
                    className={`${styles.exportBtn} ${styles.dxf}`} 
                    disabled={isDownloading}
                  >
                    <div className={styles.ext} style={{ color: '#f59e0b' }}>
                      <FiScissors size={16} /> .DXF
                    </div>
                    <div className={styles.desc}>AutoCAD / CNC toolpaths</div>
                  </button>

                  <button 
                    onClick={() => handleClientDownload('svg')} 
                    className={`${styles.exportBtn} ${styles.svg}`} 
                    disabled={isDownloading}
                  >
                    <div className={styles.ext} style={{ color: '#ec4899' }}>
                      <FiMonitor size={16} /> .SVG
                    </div>
                    <div className={styles.desc}>Scalable Vector Graphics</div>
                  </button>
                  
                  <button 
                    onClick={generateBlueprint} 
                    className={`${styles.exportBtn} ${styles.fullWidth}`} 
                    disabled={isDownloading}
                  >
                    <div className={styles.ext}>
                      <FiFileText size={16} /> DOCUMENT BLUEPRINT (.PDF)
                    </div>
                    <div className={styles.desc}>Comprehensive engineering dossier</div>
                  </button>
                </div>

                <div className={styles.exportSectionTitle} style={{ marginTop: 4 }}>
                  <FiTerminal size={14} />
                  Server-Side Extraction
                </div>
                <div className={styles.exportGrid}>
                  <button 
                    onClick={() => handleBackendDownload('gcode')} 
                    className={`${styles.exportBtn} ${styles.gcode}`} 
                    disabled={isDownloading}
                  >
                    <div className={styles.ext} style={{ color: '#34d399' }}>
                      <FiTerminal size={16} /> .GCODE
                    </div>
                    <div className={styles.desc}>4-Axis CNC Hot-Wire Toolpath</div>
                  </button>

                  <button 
                    onClick={() => handleBackendDownload('dat')} 
                    className={`${styles.exportBtn} ${styles.data}`} 
                    disabled={isDownloading}
                  >
                    <div className={styles.ext} style={{ color: '#38bdf8' }}>
                      <FiDatabase size={16} /> .DAT
                    </div>
                    <div className={styles.desc}>Selig format for XFOIL</div>
                  </button>

                  <button 
                    onClick={() => handleBackendDownload('csv')} 
                    className={`${styles.exportBtn} ${styles.data}`} 
                    disabled={isDownloading}
                  >
                    <div className={styles.ext} style={{ color: '#38bdf8' }}>
                      <FiDatabase size={16} /> .CSV
                    </div>
                    <div className={styles.desc}>Raw [x, y] coordinates</div>
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* ─── FOOTER ────────────────────────────────────────────── */}
        <div className={styles.footer}>
          <span>AeroML v7.0</span>
          <span>·</span>
          <span>Manufacturing Export Engine</span>
          <span>·</span>
          <span>© 2026 AeroML</span>
        </div>
      </main>
    </div>
  );
}

// ─── EXPORT WITH SUBSCRIPTION GUARD ────────────────────────────
export default function ExportPage() {
  return (
    <SubscriptionGuard>
      <ExportContent />
    </SubscriptionGuard>
  );
}