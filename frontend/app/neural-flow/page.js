'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import FieldViewer from '@/components/AdvancedDeepONetViz';
import { NACA4412_CST, generateAirfoilCoordinates } from '@/lib/cst_geometry';
import SubscriptionGuard from '@/components/SubscriptionGuard';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, ReferenceLine,
  ScatterChart, Scatter, AreaChart, Area, ComposedChart, Bar
} from 'recharts';
import {
  FiWind, FiDatabase, FiUploadCloud, FiFileText,
  FiTarget, FiTrash2, FiDownload, FiSearch, FiX,
  FiBookOpen, FiPlus, FiZap, FiActivity,
  FiCpu, FiLayers, FiSliders, FiThermometer,
  FiTrendingUp, FiRadio, FiAlertTriangle,
  FiCheckCircle, FiGrid, FiVolume2, FiAnchor,
  FiBox
} from 'react-icons/fi';
import styles from './neural-flow.module.css';

const API = 'https://aeroml-production.up.railway.app';

// ═══════════════════════════════════════════════════════════════
// PHYSICS CONSTANTS & UTILITIES
// ═══════════════════════════════════════════════════════════════
const GAMMA = 1.4;
const R_GAS = 287;
const T_REF = 288.15;
const MU_REF = 1.789e-5;
const RHO_REF = 1.225;

const computeSutherlandViscosity = (T) => {
  const S = 110.4;
  return MU_REF * Math.pow(T / T_REF, 1.5) * ((T_REF + S) / (T + S));
};

const computeLocalMach = (velocity, T = T_REF) => {
  const a = Math.sqrt(GAMMA * R_GAS * T);
  return velocity / a;
};

const computeIsentropicRelations = (M) => {
  const g = GAMMA;
  const factor = 1 + ((g - 1) / 2) * M * M;
  return {
    T_T0: 1 / factor,
    p_p0: Math.pow(factor, -g / (g - 1)),
    rho_rho0: Math.pow(factor, -1 / (g - 1)),
  };
};

const criticalMachEstimate = (thickness) => {
  return 1.0 - 0.7 * thickness - 0.1 * thickness * thickness;
};

// ═══════════════════════════════════════════════════════════════
// CUSTOM COMPONENTS
// ═══════════════════════════════════════════════════════════════

function CustomTooltip({ active, payload, label, accent = '#00FFC2', xLabel = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.chartTooltip}>
      <div className={styles.tooltipLabel}>{xLabel}{typeof label === 'number' ? label.toFixed(3) : label}</div>
      {payload.map((p, i) => (
        <div key={i} className={styles.tooltipRow}>
          <span className={styles.tooltipKey}>{p.name}</span>
          <span className={styles.tooltipVal} style={{ color: accent }}>{Number(p.value).toFixed(4)}</span>
        </div>
      ))}
    </div>
  );
}

function ParameterSlider({ label, value, min, max, step, unit = '', color = '#007AFF', onChange, description }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={styles.sliderContainer}>
      <div className={styles.sliderHeader}>
        <span className={styles.sliderLabel}>{label}</span>
        <span className={styles.sliderValue} style={{ color }}>
          {typeof value === 'number' ? value.toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0) : value}{unit}
        </span>
      </div>
      {description && <div className={styles.sliderDesc}>{description}</div>}
      <div className={styles.sliderTrack}>
        <div className={styles.sliderFill} style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}40, ${color})` }} />
        <input
          type="range"
          className={styles.sliderInput}
          min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ '--accent': color }}
        />
      </div>
      <div className={styles.sliderRange}>
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

function ToggleSwitch({ label, active, onToggle, variant = 'cyan', icon: Icon }) {
  const variantStyles = {
    cyan:   { active: styles.toggleCyan,   dot: '#00FFC2' },
    amber:  { active: styles.toggleAmber,  dot: '#f59e0b' },
    red:    { active: styles.toggleRed,    dot: '#ef4444' },
    green:  { active: styles.toggleGreen,  dot: '#10b981' },
    purple: { active: styles.togglePurple, dot: '#a855f7' },
  };
  const v = variantStyles[variant];
  return (
    <button className={`${styles.toggleButton} ${active ? v.active : ''}`} onClick={onToggle}>
      {Icon && <Icon size={11} style={{ color: active ? v.dot : '#4b5563', flexShrink: 0 }} />}
      <span className={styles.toggleLabel}>{label}</span>
      <div className={`${styles.toggleTrack} ${active ? styles.toggleTrackActive : ''}`}>
        <div
          className={styles.toggleDot}
          style={{
            transform: active ? 'translateX(12px)' : 'translateX(0)',
            background: active ? v.dot : '#30363d',
            boxShadow: active ? `0 0 6px ${v.dot}` : 'none'
          }}
        />
      </div>
    </button>
  );
}

function MetricCard({ label, value, unit = '', color = '#00FFC2', trend, subtitle, icon: Icon }) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricAccent} style={{ background: color }} />
      <div className={styles.metricHeader}>
        {Icon && <Icon size={11} style={{ color: '#4b5563' }} />}
        <span className={styles.metricLabel}>{label}</span>
      </div>
      <div className={styles.metricValue} style={{ color }}>
        {value}{unit && <span className={styles.metricUnit}>{unit}</span>}
      </div>
      {trend !== undefined && (
        <div className={`${styles.metricTrend} ${trend >= 0 ? styles.trendUp : styles.trendDown}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
        </div>
      )}
      {subtitle && <div className={styles.metricSubtitle}>{subtitle}</div>}
    </div>
  );
}

function TabButton({ active, onClick, children, badge }) {
  return (
    <button
      className={`${styles.tabButton} ${active ? styles.tabButtonActive : ''}`}
      onClick={onClick}
    >
      {children}
      {badge && <span className={styles.tabBadge}>{badge}</span>}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
function NeuralFlowContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const vizRef = useRef(null);
  const fileRef = useRef(null);

  // ── Geometry State ──────────────────────────────────────────
  const [cst, setCst] = useState(NACA4412_CST);
  const [name, setName] = useState('NACA 4412');

  // ── Flow Conditions ─────────────────────────────────────────
  const [conditions, setConditions] = useState({
    reynolds: 3e6,
    alpha: 5.0,
    mach: 0.0,
    altitude: 0,
    temperature: 288.15,
  });

  // ── Field Data ──────────────────────────────────────────────
  const [field, setField] = useState(null);
  const [scalar, setScalar] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  // ── Visualization Settings ──────────────────────────────────
  const [activeLayer, setActiveLayer] = useState('velocity');
  const [colormap, setColormap] = useState('Turbo');
  const [activeTool, setActiveTool] = useState('PROBE');
  const [showContours, setShowContours] = useState(false);
  const [showQCriterion, setShowQCriterion] = useState(false);
  const [showAPG, setShowAPG] = useState(false);
  const [showControlVolume, setShowControlVolume] = useState(false);
  const [showShockMap, setShowShockMap] = useState(false);
  const [showStreamlines, setShowStreamlines] = useState(true);
  const [showTransition, setShowTransition] = useState(false);
  const [showSkinFriction, setShowSkinFriction] = useState(false);
  const [sliceX, setSliceX] = useState(1.2);

  // ── Interaction Data ────────────────────────────────────────
  const [probes, setProbes] = useState([]);
  const [tracers, setTracers] = useState([]);

  // ── Physics Analysis ────────────────────────────────────────
  const [physics, setPhysics] = useState({
    formDrag: 0, lift: 0, wakeDrag: 0, cvDrag: 0,
    surfaceData: [], wakeProfile: [], userSliceProfile: [],
    blNormal: null, apgZones: [], lsbZones: [],
    transitionPoint: { upper: 1.0, lower: 1.0 },
    separationBubble: null,
    skinFriction: [],
    blThickness: [],
    acousticPower: 0,
    maxLocalMach: 0,
    stagnationPoint: { x: 0, y: 0 },
    energyDissipation: 0,
    enstrophy: 0,
  });

  // ── Polar Data ──────────────────────────────────────────────
  const [polarData, setPolarData] = useState([]);
  const [sweeping, setSweeping] = useState(false);

  // ── UI State ────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState('FIELD');
  const [analysisTab, setAnalysisTab] = useState('FORCES');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryResults, setLibraryResults] = useState([]);
  const [deployMenuOpen, setDeployMenuOpen] = useState(false);
  const deployMenuRef = useRef(null);

  // ── Computed Properties ─────────────────────────────────────
  const coords = useMemo(() => generateAirfoilCoordinates(cst, 200), [cst]);

  const airfoilMetrics = useMemo(() => {
    if (!coords.length) return { thickness: 0, camber: 0, area: 0 };
    let maxThickness = 0, maxCamber = 0;
    const upperPts = coords.filter(p => p[1] >= 0);
    const lowerPts = coords.filter(p => p[1] < 0);
    for (let i = 0; i < upperPts.length; i++) {
      const x = upperPts[i][0];
      const yUpper = upperPts[i][1];
      const lower = lowerPts.find(p => Math.abs(p[0] - x) < 0.01);
      if (lower) {
        const thickness = yUpper - lower[1];
        const camber = (yUpper + lower[1]) / 2;
        if (thickness > maxThickness) maxThickness = thickness;
        if (Math.abs(camber) > Math.abs(maxCamber)) maxCamber = camber;
      }
    }
    let area = 0;
    for (let i = 0; i < coords.length; i++) {
      const j = (i + 1) % coords.length;
      area += coords[i][0] * coords[j][1] - coords[j][0] * coords[i][1];
    }
    area = Math.abs(area) / 2;
    return { thickness: maxThickness, camber: maxCamber, area };
  }, [coords]);

  const liftToDrag = useMemo(() => {
    if (!scalar || scalar.cd === 0) return null;
    return scalar.cl / scalar.cd;
  }, [scalar]);

  const machCritical = useMemo(() => criticalMachEstimate(airfoilMetrics.thickness), [airfoilMetrics.thickness]);

  const confidence = useMemo(() => {
    return Math.max(45, Math.min(99.5, 100 - Math.abs(conditions.alpha) * 0.8 - conditions.mach * 15));
  }, [conditions.alpha, conditions.mach]);

  const bestPolarPoint = useMemo(() => {
    if (!polarData.length) return null;
    return polarData.reduce((best, r) => Math.abs(r.ld) > Math.abs(best.ld) ? r : best, polarData[0]);
  }, [polarData]);

  // ── URL Params ──────────────────────────────────────────────
  useEffect(() => {
    const cstStr = searchParams.get('cst');
    if (cstStr) {
      try {
        const c = JSON.parse(decodeURIComponent(cstStr));
        setCst(p => ({ ...p, a_upper: c.slice(0, 8), a_lower: c.slice(8, 16) }));
        setName(searchParams.get('name') || 'Imported');
      } catch (_) {}
    }
    if (searchParams.get('re')) setConditions(p => ({ ...p, reynolds: parseFloat(searchParams.get('re')) }));
    if (searchParams.get('alpha')) setConditions(p => ({ ...p, alpha: parseFloat(searchParams.get('alpha')) }));
    if (searchParams.get('mach')) setConditions(p => ({ ...p, mach: parseFloat(searchParams.get('mach')) }));
  }, [searchParams]);

  // ── Fetch Physics Data ──────────────────────────────────────
  const fetchPhysics = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setFetching(true);
    const payload = {
      cst_coefficients: [...cst.a_upper, ...cst.a_lower],
      reynolds: conditions.reynolds,
      alpha: conditions.alpha,
      mach: conditions.mach,
      xtr_upper: cst.xtr_upper ?? 1.0,
      xtr_lower: cst.xtr_lower ?? 1.0,
    };
    try {
      const [fieldRes, scalarRes] = await Promise.all([
  fetch(`${API}/predict/field`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }),
  fetch(`${API}/predict/`, {  // <-- FIXED: added trailing slash
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }),
]);
      if (fieldRes.ok) setField(await fieldRes.json());
      if (scalarRes.ok) setScalar(await scalarRes.json());
    } catch (err) {
      console.error('Physics fetch error:', err);
    } finally {
      setFetching(false);
    }
  }, [cst, conditions]);

  useEffect(() => {
    const timer = setTimeout(fetchPhysics, 350);
    return () => clearTimeout(timer);
  }, [fetchPhysics]);

  // ── Open in Workbench ──────────────────────────────────────
  const openInWorkbench = () => {
    const cstArray = [...cst.a_upper, ...cst.a_lower];
    const cstString = encodeURIComponent(JSON.stringify(cstArray));
    router.push(`/workbench?importedCST=${cstString}&name=${encodeURIComponent(name)}&re=${conditions.reynolds}&alpha=${conditions.alpha}&mach=${conditions.mach}`);
  };

  // ── File Import ─────────────────────────────────────────────
  const handleFileImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/airfoils/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setCst(p => ({ ...p, a_upper: data.cst_coefficients.slice(0, 8), a_lower: data.cst_coefficients.slice(8, 16) }));
        setName(data.filename);
        setProbes([]);
        setTracers([]);
      }
    } catch (err) { console.error('Import error:', err); }
    e.target.value = null;
  };

  // ── Library Search ──────────────────────────────────────────
  useEffect(() => {
    if (libraryQuery.length < 3) { setLibraryResults([]); return; }
    const timer = setTimeout(async () => {
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`${API}/airfoils/search?q=${libraryQuery}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setLibraryResults(await res.json());
      } catch (_) {}
    }, 300);
    return () => clearTimeout(timer);
  }, [libraryQuery]);

  const selectLibraryAirfoil = async (airfoilName) => {
    setLibraryOpen(false); setLibraryQuery(''); setLibraryResults([]);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/airfoils/${airfoilName}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setCst(p => ({ ...p, a_upper: data.cst_coefficients.slice(0, 8), a_lower: data.cst_coefficients.slice(8, 16) }));
        setName(data.name); setProbes([]); setTracers([]);
      }
    } catch (_) {}
  };

  // ── Polar Sweep ─────────────────────────────────────────────
  const runPolarSweep = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setSweeping(true);
    const alphas = [-4, -2, 0, 2, 4, 6, 8, 10, 12, 14, 16];
    const results = [];
    for (const alpha of alphas) {
      try {
        const res = await fetch(`${API}/predict/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ cst_coefficients: [...cst.a_upper, ...cst.a_lower], reynolds: conditions.reynolds, alpha, mach: conditions.mach, xtr_upper: cst.xtr_upper ?? 1.0, xtr_lower: cst.xtr_lower ?? 1.0 }),
        });
        if (res.ok) {
          const data = await res.json();
          results.push({ alpha, cl: data.cl, cd: data.cd, cm: data.cm, ld: data.cd !== 0 ? data.cl / data.cd : 0, cl2_cd: data.cd !== 0 ? (data.cl * data.cl * data.cl) / (data.cd * data.cd) : 0, cl15_cd: data.cd !== 0 ? Math.pow(data.cl, 1.5) / data.cd : 0 });
        }
      } catch (_) {}
    }
    setPolarData(results); setSweeping(false); setAnalysisTab('POLAR');
  };

  // ── Trip Wire ───────────────────────────────────────────────
  const addTripWire = (x, surface) => {
    const clampedX = Math.max(0.01, Math.min(0.99, x));
    setCst(p => ({ ...p, [surface === 'upper' ? 'xtr_upper' : 'xtr_lower']: clampedX }));
  };

  // ── Export: CSV Sensors ─────────────────────────────────────
  const exportSensorsCSV = () => {
    if (!probes.length) return;
    let csv = 'ID,X/C,Y/C,Cp,U,V,|V|,nut,LocalMach\n';
    probes.forEach((p, i) => {
      const velocity = Math.sqrt(p.u ** 2 + p.v ** 2);
      const localMach = computeLocalMach(velocity * 340);
      csv += `S${i + 1},${p.fx.toFixed(5)},${p.fy.toFixed(5)},${p.cp.toFixed(5)},${p.u.toFixed(5)},${p.v.toFixed(5)},${velocity.toFixed(5)},${p.nut.toFixed(6)},${localMach.toFixed(4)}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `sensors_${name.replace(/\s+/g, '_')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPolarCSV = () => {
    if (!polarData.length) return;
    let csv = 'Alpha,CL,CD,CM,L/D,CL^3/CD^2,CL^1.5/CD\n';
    polarData.forEach(r => { csv += `${r.alpha},${r.cl.toFixed(5)},${r.cd.toFixed(6)},${r.cm.toFixed(5)},${r.ld.toFixed(2)},${r.cl2_cd.toFixed(2)},${r.cl15_cd.toFixed(2)}\n`; });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `polar_${name.replace(/\s+/g, '_')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    if (!scalar || !field) return;
    setPdfBusy(true);
    setTimeout(() => {
      try {
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pw = pdf.internal.pageSize.getWidth();
        pdf.setFillColor(4, 7, 12); pdf.rect(0, 0, pw, 297, 'F');
        pdf.setTextColor(0, 255, 194); pdf.setFontSize(16); pdf.setFont('helvetica', 'bold');
        pdf.text('NEURAL FLOW — CFD ANALYSIS REPORT', 15, 25);
        pdf.setTextColor(200, 215, 230); pdf.setFontSize(10); pdf.setFont('helvetica', 'normal');
        pdf.text(`Profile: ${name}`, 15, 38);
        pdf.text(`Reynolds: ${(conditions.reynolds / 1e6).toFixed(2)} × 10⁶`, 15, 45);
        pdf.text(`Angle of Attack: ${conditions.alpha}°`, 15, 52);
        pdf.text(`Mach Number: ${conditions.mach.toFixed(3)}`, 15, 59);
        pdf.setDrawColor(0, 122, 255); pdf.setLineWidth(0.5); pdf.line(15, 66, pw - 15, 66);
        pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.text('AERODYNAMIC COEFFICIENTS', 15, 76);
        autoTable(pdf, {
          startY: 81,
          head: [['CL', 'CD', 'CM', 'L/D', 'Wake Drag', 'CV Drag']],
          body: [[scalar.cl.toFixed(4), scalar.cd.toFixed(5), scalar.cm.toFixed(4), liftToDrag?.toFixed(1) ?? '—', physics.wakeDrag.toFixed(5), physics.cvDrag.toFixed(5)]],
          theme: 'grid',
          headStyles: { fillColor: [0, 80, 200], textColor: [255, 255, 255], fontSize: 9 },
          styles: { fontSize: 10, fillColor: [8, 14, 24], textColor: [190, 210, 230] },
        });
        if (vizRef.current) {
          const img = vizRef.current.getCanvasDataURL();
          if (img) { const y0 = pdf.lastAutoTable.finalY + 12; pdf.text('FIELD VISUALIZATION', 15, y0); pdf.addImage(img, 'PNG', 15, y0 + 5, pw - 30, 80); }
        }
        if (polarData.length > 0) {
          pdf.addPage(); pdf.setFillColor(4, 7, 12); pdf.rect(0, 0, pw, 297, 'F');
          pdf.setTextColor(200, 215, 230); pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.text('AERODYNAMIC POLAR', 15, 20);
          autoTable(pdf, { startY: 25, head: [['α (deg)', 'CL', 'CD', 'CM', 'L/D', 'CL³/CD²']], body: polarData.map(r => [r.alpha, r.cl.toFixed(4), r.cd.toFixed(5), r.cm.toFixed(4), r.ld.toFixed(1), r.cl2_cd.toFixed(1)]), theme: 'striped', headStyles: { fillColor: [0, 122, 255], textColor: [0, 0, 0], fontSize: 8 }, styles: { fontSize: 8, fillColor: [8, 14, 24], textColor: [190, 210, 230] }, alternateRowStyles: { fillColor: [14, 22, 38] } });
        }
        if (probes.length > 0) {
          pdf.addPage(); pdf.setFillColor(4, 7, 12); pdf.rect(0, 0, pw, 297, 'F');
          pdf.setTextColor(200, 215, 230); pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.text('VIRTUAL SENSOR ARRAY', 15, 20);
          autoTable(pdf, { startY: 25, head: [['ID', 'X/C', 'Y/C', 'Cp', '|V|', 'νt']], body: probes.map((p, i) => [`S${i + 1}`, p.fx.toFixed(4), p.fy.toFixed(4), p.cp.toFixed(4), Math.sqrt(p.u ** 2 + p.v ** 2).toFixed(4), p.nut.toFixed(5)]), theme: 'striped', headStyles: { fillColor: [0, 122, 255], textColor: [0, 0, 0], fontSize: 8 }, styles: { fontSize: 8, fillColor: [8, 14, 24], textColor: [190, 210, 230] }, alternateRowStyles: { fillColor: [14, 22, 38] } });
        }
        pdf.save(`CFD_Report_${name.replace(/\s+/g, '_')}.pdf`);
      } catch (err) { console.error('PDF export error:', err); }
      finally { setPdfBusy(false); }
    }, 400);
  };

  // ── Confidence Color ────────────────────────────────────────
  const confColor = confidence > 90 ? '#10b981' : confidence > 70 ? '#f59e0b' : '#ef4444';

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div className={styles.workbench}>
      <input type="file" ref={fileRef} style={{ display: 'none' }} accept=".dat,.txt,.csv" onChange={handleFileImport} />

      {/* ══════════════════════════════════════════════════════
          LEFT SIDEBAR
      ══════════════════════════════════════════════════════ */}
      <aside className={styles.sidebar}>
        {/* Header */}
        <div className={styles.sidebarHeader}>
          <div className={styles.logoContainer}>
            <FiWind size={16} />
          </div>
          <div className={styles.headerText}>
            <h1 className={styles.brandTitle}>NeuralFlow</h1>
            <span className={styles.brandSubtitle}>CFD Post-Processor</span>
          </div>
          <div className={styles.statusIndicator}>
            <div className={`${styles.statusDot} ${fetching ? styles.statusFetching : styles.statusLive}`} />
            <span className={fetching ? styles.statusTextFetching : styles.statusTextLive}>
              {fetching ? 'SYNC' : 'LIVE'}
            </span>
          </div>
        </div>

        <div className={styles.sidebarContent}>

          {/* Active Profile Card */}
          <div className={styles.profileCard}>
            <div className={styles.profileHeader}>
              <span className={styles.profileLabel}>Active Profile</span>
              <span className={styles.profileConfidence} style={{ color: confColor }}>
                {confidence.toFixed(0)}% CONF
              </span>
            </div>
            <h2 className={styles.profileName}>{name}</h2>
            <div className={styles.profileMetrics}>
              <div className={styles.profileMetric}>
                <span className={styles.profileMetricLabel}>t/c</span>
                <span className={styles.profileMetricValue}>{(airfoilMetrics.thickness * 100).toFixed(1)}%</span>
              </div>
              <div className={styles.profileMetric}>
                <span className={styles.profileMetricLabel}>camber</span>
                <span className={styles.profileMetricValue}>{(airfoilMetrics.camber * 100).toFixed(2)}%</span>
              </div>
              <div className={styles.profileMetric}>
                <span className={styles.profileMetricLabel}>M_crit</span>
                <span className={styles.profileMetricValue}>{machCritical.toFixed(2)}</span>
              </div>
            </div>
            <div className={styles.profileTags}>
              <span className={styles.profileTag}>Re {(conditions.reynolds / 1e6).toFixed(1)}M</span>
              <span className={styles.profileTag}>α {conditions.alpha}°</span>
              <span className={styles.profileTag}>M {conditions.mach}</span>
              {(cst.xtr_upper < 1.0 || cst.xtr_lower < 1.0) && (
                <span className={`${styles.profileTag} ${styles.profileTagActive}`}>TRIPPED</span>
              )}
            </div>
          </div>

          {/* Quick Results */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <FiActivity size={10} />
              <span>Aero Coefficients</span>
            </div>
            <div className={styles.quickResults}>
              <div className={styles.quickResult}>
                <span className={styles.quickResultLabel}>CL</span>
                <span className={styles.quickResultValue} style={{ color: '#38bdf8' }}>{scalar?.cl.toFixed(4) ?? '—'}</span>
              </div>
              <div className={styles.quickResult}>
                <span className={styles.quickResultLabel}>CD</span>
                <span className={styles.quickResultValue} style={{ color: '#f472b6' }}>{scalar?.cd.toFixed(5) ?? '—'}</span>
              </div>
              <div className={styles.quickResult}>
                <span className={styles.quickResultLabel}>CM</span>
                <span className={styles.quickResultValue} style={{ color: '#fbbf24' }}>{scalar?.cm.toFixed(4) ?? '—'}</span>
              </div>
              <div className={styles.quickResult}>
                <span className={styles.quickResultLabel}>L/D</span>
                <span className={styles.quickResultValue} style={{ color: '#00FFC2' }}>{liftToDrag?.toFixed(1) ?? '—'}</span>
              </div>
            </div>
          </div>

          {/* Flow Conditions */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <FiSliders size={10} />
              <span>Flow Conditions</span>
            </div>
            <div className={styles.slidersContainer}>
              <ParameterSlider label="Reynolds Number" value={conditions.reynolds} min={50000} max={10000000} step={50000} color="#38bdf8" description="Re = ρVc/μ" onChange={v => setConditions(p => ({ ...p, reynolds: v }))} />
              <ParameterSlider label="Alpha (deg)" value={conditions.alpha} min={-5} max={20} step={0.5} unit="°" color="#00FFC2" description="Geometric incidence" onChange={v => setConditions(p => ({ ...p, alpha: v }))} />
              <ParameterSlider label="Mach Number" value={conditions.mach} min={0} max={0.85} step={0.01} color="#f59e0b" description="V∞/a∞" onChange={v => setConditions(p => ({ ...p, mach: v }))} />
            </div>
          </div>

          {/* Forced Transition */}
          {(cst.xtr_upper < 1.0 || cst.xtr_lower < 1.0) && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <FiZap size={10} />
                <span>Forced Transition</span>
              </div>
              <div className={styles.transitionInfo}>
                {cst.xtr_upper < 1.0 && <div className={styles.transitionRow}>Upper Trip: x/c = {cst.xtr_upper.toFixed(3)}</div>}
                {cst.xtr_lower < 1.0 && <div className={styles.transitionRow}>Lower Trip: x/c = {cst.xtr_lower.toFixed(3)}</div>}
                <button className={styles.clearTripButton} onClick={() => setCst(p => ({ ...p, xtr_upper: 1.0, xtr_lower: 1.0 }))}>
                  Clear Trips
                </button>
              </div>
            </div>
          )}

          {/* Visualization Options */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <FiLayers size={10} />
              <span>Visualization</span>
            </div>
            <div className={styles.colormapSelect}>
              <label className={styles.selectLabel}>Colormap</label>
              <select className={styles.selectInput} value={colormap} onChange={e => setColormap(e.target.value)}>
                <option value="Turbo">Turbo — CFD Standard</option>
                <option value="Magma">Magma — High Contrast</option>
                <option value="Plasma">Plasma — Perceptual</option>
                <option value="Viridis">Viridis — Scientific</option>
                <option value="Inferno">Inferno — Thermal</option>
                <option value="Cividis">Cividis — Accessible</option>
              </select>
            </div>
            <div className={styles.toggleGrid}>
              <ToggleSwitch label="Iso-Contours" active={showContours} onToggle={() => setShowContours(p => !p)} variant="cyan" icon={FiGrid} />
              <ToggleSwitch label="Adverse ∂p/∂x" active={showAPG} onToggle={() => setShowAPG(p => !p)} variant="amber" icon={FiAlertTriangle} />
              <ToggleSwitch label="Control Volume" active={showControlVolume} onToggle={() => setShowControlVolume(p => !p)} variant="green" icon={FiAnchor} />
              <ToggleSwitch label="Shock Map" active={showShockMap} onToggle={() => setShowShockMap(p => !p)} variant="red" icon={FiZap} />
              <ToggleSwitch label="Streamlines" active={showStreamlines} onToggle={() => setShowStreamlines(p => !p)} variant="cyan" icon={FiWind} />
              <ToggleSwitch label="Transition" active={showTransition} onToggle={() => setShowTransition(p => !p)} variant="purple" icon={FiRadio} />
            </div>
          </div>

          <div style={{ flex: 1 }} />
        </div>

        {/* Footer Actions */}
        <div className={styles.sidebarFooter}>
          <div className={styles.actionGrid}>
            <button className={styles.actionButton} onClick={() => setLibraryOpen(true)}>
              <FiDatabase size={14} />
              <span>UIUC</span>
            </button>
            <button className={styles.actionButton} onClick={() => fileRef.current.click()}>
              <FiUploadCloud size={14} />
              <span>Import</span>
            </button>
            <button className={styles.actionButton} onClick={runPolarSweep} disabled={fetching || sweeping}>
              {sweeping ? <><div className={styles.spinner} /><span>Sweep</span></> : <><FiPlus size={14} /><span>Polar</span></>}
            </button>
          </div>
          <button className={styles.exportButton} onClick={exportPDF} disabled={fetching || pdfBusy || !field}>
            <FiFileText size={14} />
            {pdfBusy ? 'COMPILING...' : 'EXPORT PDF REPORT'}
          </button>
          {/* ─── OPEN IN WORKBENCH BUTTON ─── */}
          <button 
            onClick={openInWorkbench}
            className={styles.exportButton}
            style={{ 
              marginTop: '8px',
              borderColor: '#007AFF',
              color: '#007AFF',
              background: 'rgba(0,122,255,0.08)'
            }}
          >
            <FiBox size={14} /> OPEN IN WORKBENCH
          </button>
        </div>
      </aside>

      {/* ══════════════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════════════ */}
      <main className={styles.mainContent}>

        {/* Top Metrics Bar */}
        <div className={styles.metricsBar}>
          <MetricCard label="Lift (CL)" value={scalar?.cl.toFixed(4) ?? '—'} color="#38bdf8" subtitle={scalar?.cl > 0 ? 'upward' : 'downward'} icon={FiTrendingUp} />
          <MetricCard label="Drag (CD)" value={scalar?.cd.toFixed(5) ?? '—'} color="#f472b6" subtitle={scalar ? `${(scalar.cd * 1e4).toFixed(1)} cts` : ''} icon={FiWind} />
          <MetricCard label="Moment (CM)" value={scalar?.cm.toFixed(4) ?? '—'} color="#fbbf24" subtitle="about c/4" icon={FiActivity} />
          <MetricCard label="L/D Ratio" value={liftToDrag?.toFixed(1) ?? '—'} color="#00FFC2" subtitle={liftToDrag > 60 ? 'excellent' : liftToDrag > 40 ? 'good' : 'moderate'} icon={FiTarget} />
          <MetricCard label="Pressure Drag" value={physics.formDrag.toFixed(5)} color="#00F2FF" subtitle="form drag" icon={FiThermometer} />
          <MetricCard label="Confidence" value={`${confidence.toFixed(0)}%`} color={confColor} subtitle="neural net" icon={FiCpu} />
        </div>

        {/* Workspace */}
        <div className={styles.workspace}>

          {/* Canvas Area */}
          <div className={styles.canvasArea}>
            <div className={styles.canvasTabBar}>
              <TabButton active={mainTab === 'FIELD'} onClick={() => setMainTab('FIELD')}>Field Map</TabButton>
              <TabButton active={mainTab === 'Cp'} onClick={() => setMainTab('Cp')}>Surface Cp</TabButton>
              <TabButton active={mainTab === 'WAKE'} onClick={() => setMainTab('WAKE')}>Wake Survey</TabButton>
              <TabButton active={mainTab === 'BL'} onClick={() => setMainTab('BL')}>Boundary Layer</TabButton>
              <TabButton active={mainTab === 'Cf'} onClick={() => setMainTab('Cf')}>Skin Friction</TabButton>
            </div>

            <div className={styles.canvasFrame}>
              {mainTab === 'FIELD' && (
                field ? (
                  <FieldViewer
                    ref={vizRef}
                    fieldData={field} coordinates={coords} activeLayer={activeLayer} colormapName={colormap}
                    interactionMode={activeTool} machMode={showShockMap} freestreamMach={conditions.mach}
                    showAPG={showAPG} showContours={showContours} showQCriterion={showQCriterion}
                    showControlVolume={showControlVolume} showStreamlines={showStreamlines}
                    showTransition={showTransition} sliceX={sliceX} onSliceMove={setSliceX}
                    probes={probes} tracers={tracers}
                    onProbeAdd={p => setProbes(prev => [...prev, p])}
                    onTracerAdd={t => setTracers(prev => [...prev, t])}
                    onDataExtract={setPhysics} onTripAdd={addTripWire}
                    setActiveLayer={setActiveLayer} setShowQCriterion={setShowQCriterion}
                    setInteractionMode={setActiveTool}
                    clearProbes={() => { setProbes([]); setTracers([]); }}
                  />
                ) : (
                  <div className={styles.canvasPlaceholder}>
                    <FiCpu className={styles.placeholderIcon} style={{ fontSize: 40, color: '#21262d', animation: 'spin 3s linear infinite' }} />
                    <span className={styles.placeholderText}>Awaiting Inference Server</span>
                    <span className={styles.placeholderSubtext}>Connect to begin analysis</span>
                  </div>
                )
              )}

              {mainTab === 'Cp' && (
                <div className={styles.chartContainer}>
                  {physics.surfaceData.length > 0 ? (
                    <>
                      <div className={styles.chartTitle}>Surface Pressure Distribution — Cp vs x/c</div>
                      <ResponsiveContainer width="100%" height="70%">
                        <LineChart data={physics.surfaceData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                          <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.03)" />
                          <XAxis dataKey="x" type="number" domain={[0, 1]} stroke="rgba(255,255,255,0.08)" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas' }} tickFormatter={v => v.toFixed(1)} label={{ value: 'x/c', position: 'insideBottomRight', fill: '#4b5563', fontSize: 10 }} />
                          <YAxis reversed stroke="rgba(255,255,255,0.08)" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas' }} tickFormatter={v => v.toFixed(1)} label={{ value: '-Cp', angle: -90, position: 'insideLeft', fill: '#4b5563', fontSize: 10 }} />
                          <Tooltip content={<CustomTooltip accent="#00FFC2" xLabel="x/c: " />} />
                          <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                          <Line type="monotone" dataKey="cp" name="Cp" stroke="#00FFC2" strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                      <div className={styles.chartMetrics}>
                        <div className={styles.chartMetric}><span className={styles.chartMetricLabel}>Pressure Drag</span><span className={styles.chartMetricValue} style={{ color: '#00FFC2' }}>{physics.formDrag.toFixed(5)}</span></div>
                        <div className={styles.chartMetric}><span className={styles.chartMetricLabel}>Integrated Lift</span><span className={styles.chartMetricValue} style={{ color: '#38bdf8' }}>{physics.lift.toFixed(4)}</span></div>
                        <div className={styles.chartMetric}><span className={styles.chartMetricLabel}>NeuralFoil CL</span><span className={styles.chartMetricValue} style={{ color: '#4b5563' }}>{scalar?.cl.toFixed(4) ?? '—'}</span></div>
                      </div>
                    </>
                  ) : (
                    <div className={styles.emptyState}><FiActivity className={styles.emptyIcon} /><span className={styles.emptyText}>No surface data available</span><span className={styles.emptySubtext}>Load a field map to view pressure distribution</span></div>
                  )}
                </div>
              )}

              {mainTab === 'WAKE' && (
                <div className={styles.chartContainer}>
                  {physics.wakeProfile.length > 0 ? (
                    <>
                      <div className={styles.chartTitle}>Wake Velocity Deficit — y/c at x = 1.40c</div>
                      <ResponsiveContainer width="100%" height="65%">
                        <LineChart data={physics.wakeProfile} layout="vertical" margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                          <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.03)" />
                          <XAxis type="number" stroke="rgba(255,255,255,0.08)" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas' }} domain={['auto', 'auto']} label={{ value: '|V|/V∞', position: 'insideBottomRight', fill: '#4b5563', fontSize: 10 }} />
                          <YAxis type="number" dataKey="y" stroke="rgba(255,255,255,0.08)" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas' }} domain={[-0.4, 0.4]} label={{ value: 'y/c', angle: -90, position: 'insideLeft', fill: '#4b5563', fontSize: 10 }} />
                          <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                          <Tooltip content={<CustomTooltip accent="#f472b6" />} />
                          <Line type="monotone" dataKey="velocity" name="|V|" stroke="#f472b6" strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                      <div className={styles.chartMetrics}>
                        <div className={styles.chartMetric}><span className={styles.chartMetricLabel}>Jones-Betz Wake Drag</span><span className={styles.chartMetricValue} style={{ color: '#f472b6' }}>{physics.wakeDrag.toFixed(5)}</span></div>
                        <div className={styles.chartMetric}><span className={styles.chartMetricLabel}>CV Momentum Flux</span><span className={styles.chartMetricValue} style={{ color: '#00FFC2' }}>{physics.cvDrag.toFixed(5)}</span></div>
                        <div className={styles.chartMetric}><span className={styles.chartMetricLabel}>NeuralFoil CD</span><span className={styles.chartMetricValue} style={{ color: '#4b5563' }}>{scalar?.cd.toFixed(5) ?? '—'}</span></div>
                      </div>
                    </>
                  ) : (
                    <div className={styles.emptyState}><FiWind className={styles.emptyIcon} /><span className={styles.emptyText}>No wake data available</span><span className={styles.emptySubtext}>Load a field map to analyze wake</span></div>
                  )}
                </div>
              )}

              {mainTab === 'BL' && (
                <div className={styles.chartContainer}>
                  {physics.blNormal ? (
                    <>
                      <div className={styles.chartTitle}>Boundary Layer Profile — U/Ue vs η</div>
                      <ResponsiveContainer width="100%" height="65%">
                        <AreaChart data={physics.blNormal.points} layout="vertical" margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                          <defs>
                            <linearGradient id="blGradient" x1="1" y1="0" x2="0" y2="0">
                              <stop offset="0%" stopColor="#a855f7" stopOpacity={0.4} />
                              <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.03)" />
                          <XAxis type="number" domain={[0, 'auto']} stroke="rgba(255,255,255,0.08)" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas' }} label={{ value: 'U/Ue', position: 'insideBottomRight', fill: '#4b5563', fontSize: 10 }} />
                          <YAxis type="number" dataKey="dist" domain={[0, 0.12]} stroke="rgba(255,255,255,0.08)" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas' }} label={{ value: 'η (y/c)', angle: -90, position: 'insideLeft', fill: '#4b5563', fontSize: 10 }} />
                          <Tooltip content={<CustomTooltip accent="#a855f7" />} />
                          <Area type="monotone" dataKey="u" name="U/Ue" stroke="#a855f7" fill="url(#blGradient)" strokeWidth={2} isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                      <div className={styles.chartMetrics}>
                        <div className={styles.chartMetric}><span className={styles.chartMetricLabel}>Root x/c</span><span className={styles.chartMetricValue} style={{ color: '#a855f7' }}>{physics.blNormal.root[0].toFixed(3)}</span></div>
                        <div className={styles.chartMetric}><span className={styles.chartMetricLabel}>Normal dx</span><span className={styles.chartMetricValue} style={{ color: '#a855f7' }}>{physics.blNormal.normal[0].toFixed(4)}</span></div>
                        <div className={styles.chartMetric}><span className={styles.chartMetricLabel}>Normal dy</span><span className={styles.chartMetricValue} style={{ color: '#a855f7' }}>{physics.blNormal.normal[1].toFixed(4)}</span></div>
                      </div>
                    </>
                  ) : (
                    <div className={styles.emptyState}><FiLayers className={styles.emptyIcon} /><span className={styles.emptyText}>No boundary layer data</span><span className={styles.emptySubtext}>Use BL_NORMAL tool on Field Map, then click surface</span></div>
                  )}
                </div>
              )}

              {mainTab === 'Cf' && (
                <div className={styles.chartContainer}>
                  {physics.skinFriction?.length > 0 ? (
                    <>
                      <div className={styles.chartTitle}>Skin Friction Coefficient — Cf vs x/c</div>
                      <ResponsiveContainer width="100%" height="65%">
                        <LineChart data={physics.skinFriction} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                          <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.03)" />
                          <XAxis dataKey="x" type="number" domain={[0, 1]} stroke="rgba(255,255,255,0.08)" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas' }} label={{ value: 'x/c', position: 'insideBottomRight', fill: '#4b5563', fontSize: 10 }} />
                          <YAxis stroke="rgba(255,255,255,0.08)" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas' }} tickFormatter={v => v.toFixed(4)} label={{ value: 'Cf', angle: -90, position: 'insideLeft', fill: '#4b5563', fontSize: 10 }} />
                          <ReferenceLine y={0} stroke="rgba(239,68,68,0.25)" strokeDasharray="3 3" />
                          <Tooltip content={<CustomTooltip accent="#10b981" xLabel="x/c: " />} />
                          <Line type="monotone" dataKey="cf" name="Cf" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                      <div className={styles.chartMetrics}>
                        <div className={styles.chartMetric}><span className={styles.chartMetricLabel}>Friction Drag</span><span className={styles.chartMetricValue} style={{ color: '#10b981' }}>{physics.skinFriction.reduce((s, p) => s + Math.max(0, p.cf) * 0.005, 0).toFixed(5)}</span></div>
                        <div className={styles.chartMetric}><span className={styles.chartMetricLabel}>Separation</span><span className={styles.chartMetricValue} style={{ color: physics.skinFriction.some(p => p.cf < 0) ? '#ef4444' : '#10b981' }}>{physics.skinFriction.some(p => p.cf < 0) ? 'DETECTED' : 'NONE'}</span></div>
                        <div className={styles.chartMetric}><span className={styles.chartMetricLabel}>Transition</span><span className={styles.chartMetricValue} style={{ color: '#f59e0b' }}>x/c ≈ {physics.transitionPoint?.upper.toFixed(2) ?? '—'}</span></div>
                      </div>
                    </>
                  ) : (
                    <div className={styles.emptyState}><FiActivity className={styles.emptyIcon} /><span className={styles.emptyText}>Skin friction not computed</span><span className={styles.emptySubtext}>Enable skin friction visualization in sidebar</span></div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Analysis Panel */}
          <div className={styles.analysisPanel}>
            <div className={styles.panelTabs}>
              <TabButton active={analysisTab === 'FORCES'} onClick={() => setAnalysisTab('FORCES')}>Forces</TabButton>
              <TabButton active={analysisTab === 'POLAR'} onClick={() => setAnalysisTab('POLAR')} badge={polarData.length || null}>Polar</TabButton>
              <TabButton active={analysisTab === 'SENSORS'} onClick={() => setAnalysisTab('SENSORS')} badge={probes.length || null}>Sensors</TabButton>
              <TabButton active={analysisTab === 'DIAGNOSTICS'} onClick={() => setAnalysisTab('DIAGNOSTICS')}>Flow</TabButton>
            </div>

            {/* Forces Panel */}
            {analysisTab === 'FORCES' && (
              <div className={styles.panelContent}>
                <div className={styles.analysisCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardIndicator} style={{ background: '#007AFF' }} />
                    <span className={styles.cardTitle}>Coefficient Summary</span>
                  </div>
                  <div className={styles.cardContent}>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>CL</span><span className={styles.dataValue} style={{ color: '#38bdf8' }}>{scalar?.cl.toFixed(4) ?? '—'}</span></div>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>CD</span><span className={styles.dataValue} style={{ color: '#f472b6' }}>{scalar?.cd.toFixed(5) ?? '—'}</span></div>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>CM</span><span className={styles.dataValue} style={{ color: '#fbbf24' }}>{scalar?.cm.toFixed(4) ?? '—'}</span></div>
                    <div className={styles.dataRowDivider} />
                    <div className={styles.dataRow}><span className={styles.dataLabel}>L/D Ratio</span><span className={styles.dataValue} style={{ color: '#00FFC2' }}>{liftToDrag?.toFixed(1) ?? '—'}</span></div>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>CL³/CD²</span><span className={styles.dataValue} style={{ color: '#38bdf8' }}>{scalar && scalar.cd !== 0 ? ((scalar.cl ** 3) / (scalar.cd ** 2)).toFixed(1) : '—'}</span></div>
                  </div>
                </div>
                <div className={styles.analysisCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardIndicator} style={{ background: '#00FFC2' }} />
                    <span className={styles.cardTitle}>Integrated Forces</span>
                  </div>
                  <div className={styles.cardContent}>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>Pressure Drag</span><span className={styles.dataValue} style={{ color: '#00FFC2' }}>{physics.formDrag.toFixed(5)}</span></div>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>Integrated Lift</span><span className={styles.dataValue} style={{ color: '#00FFC2' }}>{physics.lift.toFixed(4)}</span></div>
                    <div className={styles.dataRowDivider} />
                    <div className={styles.dataRow}><span className={styles.dataLabel}>Wake Drag (Jones)</span><span className={styles.dataValue} style={{ color: '#f472b6' }}>{physics.wakeDrag.toFixed(5)}</span></div>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>CV Momentum Flux</span><span className={styles.dataValue} style={{ color: '#00FFC2' }}>{physics.cvDrag.toFixed(5)}</span></div>
                  </div>
                </div>
                <div className={styles.analysisCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardIndicator} style={{ background: '#a855f7' }} />
                    <span className={styles.cardTitle}>Performance Factors</span>
                  </div>
                  <div className={styles.cardContent}>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>Endurance (CL¹·⁵/CD)</span><span className={styles.dataValue} style={{ color: '#a855f7' }}>{scalar && scalar.cd !== 0 ? (Math.pow(scalar.cl, 1.5) / scalar.cd).toFixed(1) : '—'}</span></div>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>Range (CL/CD)</span><span className={styles.dataValue} style={{ color: '#a855f7' }}>{liftToDrag?.toFixed(1) ?? '—'}</span></div>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>Climb (CL³/CD²)</span><span className={styles.dataValue} style={{ color: '#a855f7' }}>{scalar && scalar.cd !== 0 ? ((scalar.cl ** 3) / (scalar.cd ** 2)).toFixed(1) : '—'}</span></div>
                  </div>
                </div>
              </div>
            )}

            {/* Polar Panel */}
            {analysisTab === 'POLAR' && (
              <div className={styles.panelContent}>
                {polarData.length > 0 ? (
                  <>
                    <div className={styles.analysisCard}>
                      <div className={styles.cardHeader}>
                        <div className={styles.cardIndicator} style={{ background: '#38bdf8' }} />
                        <span className={styles.cardTitle}>CL vs α</span>
                        <div className={styles.cardActions}>
                          <button className={styles.smallButton} onClick={exportPolarCSV}><FiDownload size={10} /> CSV</button>
                          <button className={`${styles.smallButton} ${styles.smallButtonDanger}`} onClick={() => setPolarData([])}><FiTrash2 size={10} /></button>
                        </div>
                      </div>
                      <div className={styles.miniChart}>
                        <ResponsiveContainer width="100%" height={130}>
                          <LineChart data={polarData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.03)" />
                            <XAxis dataKey="alpha" stroke="rgba(255,255,255,0.08)" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas' }} />
                            <YAxis stroke="rgba(255,255,255,0.08)" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas' }} />
                            <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
                            <Tooltip content={<CustomTooltip accent="#38bdf8" />} />
                            <Line type="monotone" dataKey="cl" name="CL" stroke="#38bdf8" strokeWidth={2} dot={{ fill: '#38bdf8', r: 3 }} isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className={styles.analysisCard}>
                      <div className={styles.cardHeader}>
                        <div className={styles.cardIndicator} style={{ background: '#f472b6' }} />
                        <span className={styles.cardTitle}>Drag Polar — CD vs CL</span>
                      </div>
                      <div className={styles.miniChart}>
                        <ResponsiveContainer width="100%" height={120}>
                          <LineChart data={[...polarData].sort((a, b) => a.cl - b.cl)} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.03)" />
                            <XAxis dataKey="cd" stroke="rgba(255,255,255,0.08)" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas' }} tickFormatter={v => v.toFixed(3)} />
                            <YAxis dataKey="cl" stroke="rgba(255,255,255,0.08)" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas' }} />
                            <Tooltip content={<CustomTooltip accent="#f472b6" />} />
                            <Line type="monotone" dataKey="cl" name="CL" stroke="#f472b6" strokeWidth={2} dot={{ fill: '#f472b6', r: 3 }} isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className={styles.analysisCard} style={{ flex: 1, overflow: 'hidden' }}>
                      <div className={styles.cardHeader}>
                        <div className={styles.cardIndicator} style={{ background: '#00FFC2' }} />
                        <span className={styles.cardTitle}>Polar Table</span>
                        {bestPolarPoint && <span className={styles.cardBadge}>Best L/D: {bestPolarPoint.ld.toFixed(1)} @ α={bestPolarPoint.alpha}°</span>}
                      </div>
                      <div className={styles.tableContainer}>
                        <table className={styles.dataTable}>
                          <thead><tr><th>α°</th><th>CL</th><th>CD</th><th>CM</th><th>L/D</th></tr></thead>
                          <tbody>
                            {polarData.map(r => (
                              <tr key={r.alpha} className={bestPolarPoint && r.alpha === bestPolarPoint.alpha ? styles.highlightRow : ''}>
                                <td>{r.alpha}</td><td>{r.cl.toFixed(4)}</td><td>{r.cd.toFixed(5)}</td><td>{r.cm.toFixed(4)}</td><td>{r.ld.toFixed(1)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className={styles.emptyState}><FiActivity className={styles.emptyIcon} /><span className={styles.emptyText}>No polar data</span><span className={styles.emptySubtext}>Click "+ Polar" to run α sweep from -4° to 16°</span></div>
                )}
              </div>
            )}

            {/* Sensors Panel */}
            {analysisTab === 'SENSORS' && (
              <div className={styles.panelContent}>
                <div className={styles.analysisCard} style={{ flex: 1, overflow: 'hidden' }}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardIndicator} style={{ background: '#00FFC2' }} />
                    <span className={styles.cardTitle}>Virtual Probes {probes.length > 0 && <span style={{ color: '#007AFF', marginLeft: 6 }}>{probes.length}</span>}</span>
                    <div className={styles.cardActions}>
                      <button className={styles.smallButton} onClick={exportSensorsCSV} disabled={!probes.length}><FiDownload size={10} /> CSV</button>
                      <button className={`${styles.smallButton} ${styles.smallButtonDanger}`} onClick={() => { setProbes([]); setTracers([]); }}><FiTrash2 size={10} /></button>
                    </div>
                  </div>
                  {probes.length > 0 ? (
                    <div className={styles.tableContainer}>
                      <table className={styles.dataTable}>
                        <thead><tr><th>ID</th><th>x/c</th><th>y/c</th><th>Cp</th><th>|V|</th><th>νt</th></tr></thead>
                        <tbody>
                          {probes.map((p, i) => (
                            <tr key={i}>
                              <td style={{ color: '#00FFC2' }}>S{i + 1}</td>
                              <td>{p.fx.toFixed(4)}</td><td>{p.fy.toFixed(4)}</td>
                              <td style={{ color: '#00FFC2' }}>{p.cp.toFixed(4)}</td>
                              <td style={{ color: '#f472b6' }}>{Math.sqrt(p.u ** 2 + p.v ** 2).toFixed(4)}</td>
                              <td style={{ color: '#a855f7' }}>{p.nut.toFixed(5)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={styles.emptyState}><FiTarget className={styles.emptyIcon} /><span className={styles.emptyText}>No probes deployed</span><span className={styles.emptySubtext}>Use PROBE tool, click field to place sensors</span></div>
                  )}
                </div>
                {probes.length > 1 && (
                  <div className={styles.analysisCard}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardIndicator} style={{ background: '#00FFC2' }} />
                      <span className={styles.cardTitle}>Cp Distribution (Probes)</span>
                    </div>
                    <div className={styles.miniChart}>
                      <ResponsiveContainer width="100%" height={100}>
                        <ScatterChart margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.03)" />
                          <XAxis dataKey="fx" name="x/c" stroke="rgba(255,255,255,0.08)" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas' }} tickFormatter={v => v.toFixed(2)} />
                          <YAxis dataKey="cp" name="Cp" stroke="rgba(255,255,255,0.08)" tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'Consolas' }} />
                          <Tooltip content={<CustomTooltip accent="#00FFC2" />} />
                          <Scatter data={probes} fill="#00FFC2" r={5} />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Diagnostics Panel */}
            {analysisTab === 'DIAGNOSTICS' && (
              <div className={styles.panelContent}>
                <div className={styles.analysisCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardIndicator} style={{ background: '#f59e0b' }} />
                    <span className={styles.cardTitle}>Flow Diagnostics</span>
                  </div>
                  <div className={styles.cardContent}>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>APG Zones (upper)</span><span className={styles.dataValue} style={{ color: physics.apgZones.length > 0 ? '#f59e0b' : '#10b981' }}>{physics.apgZones.length}</span></div>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>Separation Bubble</span><span className={styles.dataValue} style={{ color: physics.lsbZones.length > 0 ? '#ef4444' : '#10b981' }}>{physics.lsbZones.length > 0 ? `YES (${physics.lsbZones.length} pts)` : 'NONE'}</span></div>
                    <div className={styles.dataRowDivider} />
                    <div className={styles.dataRow}><span className={styles.dataLabel}>Trip Wire (upper)</span><span className={styles.dataValue} style={{ color: cst.xtr_upper < 1.0 ? '#f59e0b' : '#4b5563' }}>{cst.xtr_upper < 1.0 ? `x/c = ${cst.xtr_upper.toFixed(3)}` : 'NATURAL'}</span></div>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>Trip Wire (lower)</span><span className={styles.dataValue} style={{ color: cst.xtr_lower < 1.0 ? '#f59e0b' : '#4b5563' }}>{cst.xtr_lower < 1.0 ? `x/c = ${cst.xtr_lower.toFixed(3)}` : 'NATURAL'}</span></div>
                  </div>
                </div>
                <div className={styles.analysisCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardIndicator} style={{ background: '#ef4444' }} />
                    <span className={styles.cardTitle}>Compressibility</span>
                  </div>
                  <div className={styles.cardContent}>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>Freestream Mach</span><span className={styles.dataValue} style={{ color: '#ef4444' }}>{conditions.mach.toFixed(3)}</span></div>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>Critical Mach</span><span className={styles.dataValue} style={{ color: '#fbbf24' }}>{machCritical.toFixed(3)}</span></div>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>Shock Formation</span><span className={styles.dataValue} style={{ color: conditions.mach > machCritical ? '#ef4444' : '#10b981' }}>{conditions.mach > machCritical ? 'LIKELY' : 'NONE'}</span></div>
                  </div>
                </div>
                <div className={styles.analysisCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardIndicator} style={{ background: '#38bdf8' }} />
                    <span className={styles.cardTitle}>Model Quality</span>
                  </div>
                  <div className={styles.cardContent}>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>AI Confidence</span><span className={styles.dataValue} style={{ color: '#38bdf8' }}>{confidence.toFixed(1)}%</span></div>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>Reynolds Regime</span><span className={styles.dataValue} style={{ color: '#38bdf8' }}>{conditions.reynolds < 5e5 ? 'LOW' : conditions.reynolds < 3e6 ? 'MODERATE' : 'HIGH'}</span></div>
                    <div className={styles.dataRow}><span className={styles.dataLabel}>Angle Range</span><span className={styles.dataValue} style={{ color: Math.abs(conditions.alpha) > 12 ? '#f59e0b' : '#38bdf8' }}>{Math.abs(conditions.alpha) > 12 ? 'EXTRAPOLATION' : 'NOMINAL'}</span></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════
          LIBRARY MODAL
      ══════════════════════════════════════════════════════ */}
      {libraryOpen && (
        <div className={styles.modalOverlay} onClick={() => setLibraryOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderLeft}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(0,122,255,0.15)', border: '1px solid rgba(0,122,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#007AFF' }}>
                  <FiDatabase size={14} />
                </div>
                <div>
                  <h3 className={styles.modalTitle}>UIUC Airfoil Database</h3>
                  <p className={styles.modalSubtitle}>1,600+ profiles with CST parameterization</p>
                </div>
              </div>
              <button className={styles.modalClose} onClick={() => setLibraryOpen(false)}><FiX size={14} /></button>
            </div>
            <div className={styles.modalSearch}>
              <FiSearch size={14} style={{ color: '#4b5563' }} />
              <input className={styles.modalSearchInput} type="text" placeholder="Search — NACA 2412, Clark Y, Eppler 423..." value={libraryQuery} onChange={e => setLibraryQuery(e.target.value)} autoFocus />
              {libraryQuery && <button className={styles.modalSearchClear} onClick={() => { setLibraryQuery(''); setLibraryResults([]); }}><FiX size={12} /></button>}
            </div>
            <div className={styles.modalResults}>
              {libraryResults.length > 0 ? (
                libraryResults.map(airfoil => (
                  <button key={airfoil.id || airfoil.name} className={styles.modalResultItem} onClick={() => selectLibraryAirfoil(airfoil.name)}>
                    <span className={styles.modalResultName}>{airfoil.name}</span>
                    <span className={styles.modalResultBadge}>UIUC</span>
                  </button>
                ))
              ) : (
                <div className={styles.modalEmpty}>
                  {libraryQuery.length < 3 ? <><FiSearch size={22} style={{ opacity: 0.2 }} /><span>Type 3+ characters to search</span></> : <><FiX size={22} style={{ opacity: 0.2 }} /><span>No results for "{libraryQuery}"</span></>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── EXPORT WITH SUBSCRIPTION GUARD ────────────────────────────
export default function NeuralFlowPage() {
  return (
    <SubscriptionGuard>
      <NeuralFlowContent />
    </SubscriptionGuard>
  );
}