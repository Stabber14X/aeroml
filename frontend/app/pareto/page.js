'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { D3AirfoilViz } from '@/components/D3AirfoilViz';
import { generateAirfoilCoordinates, NACA4412_CST } from '@/lib/cst_geometry';
import SubscriptionGuard from '@/components/SubscriptionGuard';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import styles from './pareto.module.css';
import { 
  FiChevronDown, FiUploadCloud, FiBookOpen, FiSearch, FiX, 
  FiFileText, FiSave, FiPrinter, FiCpu, FiZap, FiCheckCircle, 
  FiAlertTriangle, FiBox, FiActivity, FiCrosshair, FiWind, 
  FiTarget, FiLayers, FiTrendingUp
} from 'react-icons/fi';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';

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

// ─── TOAST ID GENERATOR ────────────────────────────────────────
let toastCounter = 0;
const generateToastId = () => `toast-${Date.now()}-${++toastCounter}`;

// ─── HELPERS ────────────────────────────────────────────────────
const analyzeGeometry = (cst) => {
  if (!cst || !Array.isArray(cst)) return { area: 0.05, thickness: 0.10 };
  const coords = generateAirfoilCoordinates({ a_upper: cst.slice(0, 8), a_lower: cst.slice(8, 16) }, 150);
  let area = 0;
  let maxY = -Infinity;
  let minY = Infinity;
  
  for (let i = 0; i < coords.length - 1; i++) {
    area += (coords[i][0] * coords[i + 1][1] - coords[i + 1][0] * coords[i][1]);
    if (coords[i][1] > maxY) maxY = coords[i][1];
    if (coords[i][1] < minY) minY = coords[i][1];
  }
  return { area: Math.abs(area) / 2, thickness: maxY - minY };
};

// ─── CUSTOM TOOLTIP ────────────────────────────────────────────
const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className={styles.tooltip}>
        <div className={styles.tooltipTitle}>{data.is_baseline ? 'BASELINE' : 'FEASIBLE DESIGN'}</div>
        <p><strong>CL:</strong> {Number(data.cl || 0).toFixed(4)}</p>
        <p><strong>CD:</strong> {Number(data.cd || 0).toFixed(6)}</p>
        <p><strong>L/D:</strong> {Number(data.ld_ratio || 0).toFixed(2)}</p>
        <p><strong>t/c:</strong> {(Number(data.thickness || 0) * 100).toFixed(2)}%</p>
        <p><strong>CM:</strong> {Number(data.cm || 0).toFixed(4)}</p>
      </div>
    );
  }
  return null;
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────
function ParetoContent() {
  const [isMounted, setIsMounted] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // ─── BASELINE STATE ───────────────────────────────────────────
  const [cstBase, setCstBase] = useState(NACA4412_CST);
  const [baselineName, setBaselineName] = useState("NACA 4412 Default");
  const [baselineStats, setBaselineStats] = useState(null);
  const [conditions, setConditions] = useState({ reynolds: 3000000, alpha: 5.0 });
  
  // ─── UI/MODAL STATE ──────────────────────────────────────────
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [libModalOpen, setLibModalOpen] = useState(false);
  const [libSearchQuery, setLibSearchQuery] = useState('');
  const [libResults, setLibResults] = useState([]);
  const [isSearchingLib, setIsSearchingLib] = useState(false);
  const fileInputRef = useRef(null);
  const dropdownRef = useRef(null);
  
  const [isCompilingPDF, setIsCompilingPDF] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [toasts, setToasts] = useState([]);
  
  // ─── INDUSTRIAL CONSTRAINTS ──────────────────────────────────
  const [targetCl, setTargetCl] = useState(0.8);
  const [targetThickness, setTargetThickness] = useState(0.12);
  const [thicknessTolerance, setThicknessTolerance] = useState(0.02);
  const [minArea, setMinArea] = useState(0.05);
  const [minCm, setMinCm] = useState(-0.12);
  
  // ─── TASK STATE ──────────────────────────────────────────────
  const [taskId, setTaskId] = useState(null);
  const [taskState, setTaskState] = useState('IDLE');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Import Baseline geometry to initialize NSGA-II constraints.');
  
  // ─── RESULTS ──────────────────────────────────────────────────
  const [paretoFront, setParetoFront] = useState([]);
  const [selectedDesign, setSelectedDesign] = useState(null);

  const isRunning = taskState === 'PENDING' || taskState === 'PROGRESS';

  // ─── Mount state to prevent hydration mismatch ────────────────
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // ─── Toast System ─────────────────────────────────────────────
  const showToast = useCallback((message, type = 'success') => {
    const id = generateToastId();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ─── Click outside handler ────────────────────────────────────
  useEffect(() => {
    if (!isMounted) return;
    
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setImportMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMounted]);

  // ─── Load from URL parameters ────────────────────────────────
  useEffect(() => {
    if (!isMounted) return;
    
    const cstStr = searchParams.get('cst');
    const nameStr = searchParams.get('name');
    const reStr = searchParams.get('re');
    const alphaStr = searchParams.get('alpha');
    const machStr = searchParams.get('mach');

    if (cstStr) {
      try {
        const cstArray = JSON.parse(decodeURIComponent(cstStr));
        if (Array.isArray(cstArray) && cstArray.length === 16) {
          const upper = cstArray.slice(0, 8);
          const lower = cstArray.slice(8, 16);
          
          setCstBase({
            a_upper: upper,
            a_lower: lower,
            reynolds: reStr ? parseFloat(reStr) : conditions.reynolds,
            alpha: alphaStr ? parseFloat(alphaStr) : conditions.alpha,
            mach: machStr ? parseFloat(machStr) : 0.0
          });
          
          if (nameStr) {
            setBaselineName(decodeURIComponent(nameStr));
          }
          
          setParetoFront([]);
          setSelectedDesign(null);
          showToast('Design loaded from Workbench', 'success');
        }
      } catch (e) {
        console.error('Failed to load CST from URL:', e);
        showToast('Failed to load design from Workbench', 'error');
      }
    }
  }, [searchParams, showToast, isMounted]);

  // ─── Baseline geometry analysis ──────────────────────────────
  useEffect(() => {
    if (!isMounted) return;
    
    const cstArray = [...cstBase.a_upper, ...cstBase.a_lower];
    const geom = analyzeGeometry(cstArray);
    setTargetThickness(Math.min(0.15, Math.max(0.08, geom.thickness)));
    setMinArea(Math.max(0.035, geom.area * 0.85));
    
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${API_BASE_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
          cst_coefficients: cstArray, 
          reynolds: conditions.reynolds, 
          alpha: conditions.alpha 
        })
      }).then(res => res.json()).then(data => {
        setTargetCl(Math.max(0.5, Math.min(1.2, data.cl * 1.05)));
        setMinCm(Math.min(-0.05, (data.cm || -0.09) + 0.02));
        const ldRatio = data.cd !== 0 ? (data.cl / data.cd) : 0;
        setBaselineStats({ 
          ...data, 
          thickness: geom.thickness, 
          area: geom.area, 
          ld_ratio: ldRatio 
        });
      }).catch(() => {});
    }
  }, [cstBase, conditions, isMounted]);

  // ─── File import handler ──────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportMenuOpen(false);
    setMessage(`Ingesting ${file.name}...`);
    
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('token');
    
    try {
      const res = await fetch(`${API_BASE_URL}/airfoils/import`, {
        method: 'POST', 
        headers: { 'Authorization': `Bearer ${token}` }, 
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setCstBase({
          a_upper: data.cst_coefficients.slice(0, 8), 
          a_lower: data.cst_coefficients.slice(8, 16),
          reynolds: conditions.reynolds, 
          alpha: conditions.alpha
        });
        setBaselineName(data.filename);
        setMessage('Baseline loaded. Neural core updated.');
        setParetoFront([]); 
        setSelectedDesign(null);
        showToast(`Imported: ${data.filename}`, 'success');
      } else { 
        setMessage('Failed to parse .DAT file.');
        showToast('Failed to parse file', 'error');
      }
    } catch (err) { 
      setMessage('Network error during upload.');
      showToast('Network error', 'error');
    }
    e.target.value = null; 
  };

  // ─── Library search ───────────────────────────────────────────
  useEffect(() => {
    if (!isMounted || libSearchQuery.length < 3) { 
      setLibResults([]); 
      return; 
    }
    setIsSearchingLib(true);
    const timer = setTimeout(async () => {
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`${API_BASE_URL}/airfoils/search?q=${libSearchQuery}`, 
          { headers: { 'Authorization': `Bearer ${token}` }}
        );
        if (res.ok) setLibResults(await res.json());
      } catch (e) {}
      setIsSearchingLib(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [libSearchQuery, isMounted]);

  const selectLibraryAirfoil = async (airfoilName) => {
    setLibModalOpen(false);
    setMessage(`Fetching tensor profile for ${airfoilName}...`);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE_URL}/airfoils/${airfoilName}`, 
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setCstBase({
          a_upper: data.cst_coefficients.slice(0, 8), 
          a_lower: data.cst_coefficients.slice(8, 16),
          reynolds: data.reynolds || conditions.reynolds, 
          alpha: data.alpha !== undefined ? data.alpha : conditions.alpha
        });
        setBaselineName(data.name);
        setMessage('Library profile successfully mapped to baseline.');
        setParetoFront([]); 
        setSelectedDesign(null);
        showToast(`Loaded: ${data.name}`, 'success');
      }
    } catch (e) { 
      setMessage('Failed to download library profile.');
      showToast('Failed to load airfoil', 'error');
    }
  };

  // ─── Start Pareto optimization ────────────────────────────────
  const startPareto = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      showToast("Auth required", 'error');
      return;
    }
    if (isRunning) return;

    setTaskState('PENDING'); 
    setProgress(0); 
    setParetoFront([]); 
    setSelectedDesign(null);

    try {
      const res = await fetch(`${API_BASE_URL}/optimize/pareto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          initial_cst: [...cstBase.a_upper, ...cstBase.a_lower], 
          reynolds: conditions.reynolds, 
          alpha: conditions.alpha,
          target_cl: parseFloat(targetCl), 
          target_thickness: parseFloat(targetThickness),
          thickness_tolerance: parseFloat(thicknessTolerance), 
          min_area: parseFloat(minArea),
          min_cm: parseFloat(minCm), 
          pop_size: 150,
          generations: 30
        })
      });
      if (res.ok) {
        const data = await res.json();
        setTaskId(data.task_id);
        const savedTasks = JSON.parse(localStorage.getItem('aeroml_tasks') || '[]');
        savedTasks.unshift({ 
          id: data.task_id, 
          type: 'Pareto Optimization', 
          airfoil_name: baselineName, 
          status: 'PENDING' 
        });
        localStorage.setItem('aeroml_tasks', JSON.stringify(savedTasks));
        showToast('Pareto optimization started', 'success');
      } else { 
        const err = await res.json();
        setTaskState('FAILURE'); 
        setMessage(`Server error: ${err.detail || 'Constraint parameters rejected'}`);
        showToast(`Error: ${err.detail || 'Unknown error'}`, 'error');
      }
    } catch (e) { 
      setTaskState('FAILURE'); 
      setMessage('Failed to reach backend.');
      showToast('Failed to reach backend server', 'error');
    }
  };

  // ─── Polling for task status ──────────────────────────────────
  useEffect(() => {
    if (!taskId || !isRunning || !isMounted) return;
    
    const poll = setInterval(async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        clearInterval(poll);
        return;
      }
      
      try {
        const res = await fetch(`${API_BASE_URL}/optimize/${taskId}`, 
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const data = await res.json();
        
        setTaskState(data.status); 
        setProgress(data.progress || 0); 
        setMessage(data.message || 'Breeding populations...');
        
        if (data.status === 'SUCCESS' || data.status === 'COMPLETED') {
          clearInterval(poll);
          if (data.result) {
            const combinedData = [...data.result.pareto_front];
            if (data.result.baseline_stats && !combinedData.some(d => d.is_baseline)) {
              combinedData.push(data.result.baseline_stats);
            }
            setParetoFront(combinedData);
            const bestDesign = data.result.pareto_front.find(d => d.ld_ratio > 0) || data.result.pareto_front[0];
            setSelectedDesign(bestDesign || data.result.baseline_stats);
            showToast(`Optimization complete! Found ${data.result.pareto_front.length} designs`, 'success');
          }
        } else if (data.status === 'FAILURE') { 
          clearInterval(poll);
          setMessage(data.message || 'Optimization failed');
          showToast(`Optimization failed: ${data.message || 'Unknown error'}`, 'error');
        }
      } catch (e) { 
        clearInterval(poll);
        setTaskState('FAILURE');
        setMessage('Polling error - check backend connection');
        showToast('Connection error while polling', 'error');
      }
    }, 1500);
    
    return () => clearInterval(poll);
  }, [taskId, isRunning, isMounted]);

  // ─── Save designs to database ─────────────────────────────────
  const saveAllDesigns = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      showToast("Auth required", 'error');
      return;
    }
    if (!paretoFront.length) {
      showToast("No designs to save", 'warning');
      return;
    }
    
    setIsSaving(true);
    setSaveSuccess(false);
    
    const designsToSave = paretoFront.filter(d => !d.is_baseline && d.cst);
    let savedCount = 0;
    
    for (const design of designsToSave.slice(0, 25)) {
      if (!design.cst) continue;
      try {
        const designName = `Pareto_CL${(design.cl || 0).toFixed(3)}_LD${(design.ld_ratio || 0).toFixed(1)}_${baselineName}`;
        const res = await fetch(`${API_BASE_URL}/airfoils/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            name: designName,
            cst_coefficients: design.cst,
            reynolds: conditions.reynolds,
            alpha: conditions.alpha,
            cl: design.cl || 0,
            cd: design.cd || 0,
            cm: design.cm || 0
          })
        });
        if (res.ok) savedCount++;
      } catch (e) { 
        console.error('Save failed:', e);
      }
    }
    
    setIsSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
    showToast(`Saved ${savedCount} designs to your library!`, 'success');
  };

  // ─── Deploy to Workbench ──────────────────────────────────────
  const handleDeploy = () => {
    if (!selectedDesign || !selectedDesign.cst) {
      showToast("No design selected", 'warning');
      return;
    }
    const cstString = encodeURIComponent(JSON.stringify(selectedDesign.cst));
    const name = selectedDesign.is_baseline ? baselineName : 'Pareto_Optimal_Design';
    router.push(`/workbench?importedCST=${cstString}&name=${encodeURIComponent(name)}&re=${conditions.reynolds}&alpha=${conditions.alpha}`);
  };

  // ─── Generate Scientific PDF Report ──────────────────────────
  const generateScientificPDF = () => {
    if (!paretoFront.length) {
      showToast("No designs to export", 'warning');
      return;
    }
    
    setIsCompilingPDF(true);
    
    setTimeout(() => {
      try {
        const pdf = new jsPDF('p', 'mm', 'a4');
        // PDF generation code here
        pdf.save(`AeroML_Pareto_Report_${baselineName.replace(/\s+/g, '_')}.pdf`);
        showToast('PDF generated successfully', 'success');
      } catch (error) {
        console.error('PDF Error:', error);
        showToast('Failed to generate PDF', 'error');
      } finally {
        setIsCompilingPDF(false);
      }
    }, 100);
  };

  // ─── Memoized data ────────────────────────────────────────────
  const displayData = useMemo(() => {
    if (paretoFront.length > 0) return paretoFront;
    if (baselineStats) return [{ ...baselineStats, is_baseline: true }];
    return [];
  }, [paretoFront, baselineStats]);

  const previewCoords = useMemo(() => {
    if (!selectedDesign || !selectedDesign.cst) {
      return generateAirfoilCoordinates({ a_upper: cstBase.a_upper, a_lower: cstBase.a_lower }, 150);
    }
    return generateAirfoilCoordinates({ 
      a_upper: selectedDesign.cst.slice(0, 8), 
      a_lower: selectedDesign.cst.slice(8, 16) 
    }, 150);
  }, [selectedDesign, cstBase]);

  const getStatusColor = (status) => {
    if (status === 'SUCCESS' || status === 'COMPLETED') return 'success';
    if (status === 'FAILURE') return 'failure';
    if (status === 'PROGRESS') return 'progress';
    if (status === 'PENDING') return 'pending';
    return 'idle';
  };

  // ─── Safe number formatter for slider values ──────────────────
  const safeValue = (val, fallback = 0) => {
    const num = Number(val);
    return isNaN(num) ? fallback : num;
  };

  // ─── Don't render until mounted ──────────────────────────────
  if (!isMounted) {
    return null;
  }

  return (
    <div className={styles.masterContainer}>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        accept=".dat,.txt,.csv" 
        onChange={handleFileChange} 
      />
      
      <main className={styles.mainContent}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div>
              <h1 className={styles.title}>
                <span className={styles.titleIcon}>📈</span>
                Industrial <span className={styles.highlight}>Pareto Optimization</span>
              </h1>
              <p className={styles.subtitle}>
                NSGA-II multi-objective evolutionary algorithm for aerodynamic geometry synthesis.
              </p>
            </div>
            <div className={styles.headerActions}>
              {paretoFront.length > 1 && (
                <>
                  <button 
                    className={`${styles.reportBtn} ${isSaving ? styles.success : ''}`}
                    onClick={saveAllDesigns} 
                    disabled={isSaving || isRunning}
                  >
                    <FiSave size={14} />
                    {isSaving ? 'SAVING...' : 'SAVE 25 DESIGNS'}
                  </button>
                  <button 
                    className={styles.reportBtn}
                    onClick={generateScientificPDF} 
                    disabled={isCompilingPDF || isRunning}
                  >
                    <FiPrinter size={14} />
                    {isCompilingPDF ? 'COMPILING...' : 'EXPORT PDF'}
                  </button>
                </>
              )}
              <span className={styles.statusBadge}>
                <span className={styles.statusPulse} />
                {isRunning ? 'Optimizing' : 'Ready'}
              </span>
            </div>
          </div>
        </header>

        <div className={styles.grid}>
          {/* ─── LEFT PANEL ───────────────────────────────────────── */}
          <div className={`${styles.card} ${styles.controlPanel}`}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderIcon} style={{ background: 'rgba(56,189,248,0.08)', color: '#38bdf8' }}>
                <FiTarget size={18} />
              </div>
              <h2>Controls</h2>
              <span className={styles.badge}>Configuration</span>
            </div>

            <div className={styles.baselineBox}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className={styles.sectionTitle} style={{ margin: 0 }}>Baseline Geometry</span>
                <div className={styles.dropdownContainer} ref={dropdownRef}>
                  <button className={styles.importBtn} onClick={() => setImportMenuOpen(!importMenuOpen)} disabled={isRunning}>
                    Import <FiChevronDown size={12} />
                  </button>
                  
                  {importMenuOpen && (
                    <div className={styles.dropdownMenu}>
                      <button className={styles.dropdownItem} onClick={() => { fileInputRef.current.click(); setImportMenuOpen(false); }}>
                        <FiUploadCloud size={14} /> Upload from Device (.DAT)
                      </button>
                      <button className={styles.dropdownItem} onClick={() => { setLibModalOpen(true); setImportMenuOpen(false); }}>
                        <FiBookOpen size={14} /> Select from Library
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <p className={styles.baselineName}>{baselineName}</p>
              {baselineStats && (
                <div className={styles.baselineGrid}>
                  <div><span>CL:</span> {safeValue(baselineStats.cl, 0).toFixed(3)}</div>
                  <div><span>CD:</span> {safeValue(baselineStats.cd, 0).toFixed(4)}</div>
                  <div><span>t/c:</span> {(safeValue(baselineStats.thickness, 0) * 100).toFixed(1)}%</div>
                  <div><span>Area:</span> {safeValue(baselineStats.area, 0).toFixed(3)}</div>
                </div>
              )}
            </div>

            <div className={styles.constraintsSection}>
              <span className={styles.sectionTitle}>Engineering Constraints</span>

              <div className={styles.inputGroup}>
                <div className={styles.label}>
                  <span>Target Lift (CL) Min</span>
                  <span className={styles.val}>{safeValue(targetCl, 0.8).toFixed(2)}</span>
                </div>
                <input 
                  type="range" 
                  min="0.3" 
                  max="1.8" 
                  step="0.01" 
                  value={safeValue(targetCl, 0.8)} 
                  onChange={(e) => setTargetCl(parseFloat(e.target.value))} 
                  className={styles.slider} 
                  disabled={isRunning} 
                />
              </div>

              <div className={styles.inputGroup}>
                <div className={styles.label}>
                  <span>Target Thickness (t/c)</span>
                  <span className={styles.val}>{(safeValue(targetThickness, 0.12) * 100).toFixed(1)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0.05" 
                  max="0.22" 
                  step="0.002" 
                  value={safeValue(targetThickness, 0.12)} 
                  onChange={(e) => setTargetThickness(parseFloat(e.target.value))} 
                  className={styles.slider} 
                  disabled={isRunning} 
                />
              </div>
              
              <div className={styles.inputGroup}>
                <div className={styles.label}>
                  <span>Thickness Tolerance</span>
                  <span className={styles.val}>±{(safeValue(thicknessTolerance, 0.02) * 100).toFixed(1)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0.01" 
                  max="0.05" 
                  step="0.002" 
                  value={safeValue(thicknessTolerance, 0.02)} 
                  onChange={(e) => setThicknessTolerance(parseFloat(e.target.value))} 
                  className={styles.slider} 
                  disabled={isRunning} 
                />
              </div>

              <div className={styles.inputGroup}>
                <div className={styles.label}>
                  <span>Min Cross-Section Area</span>
                  <span className={styles.val}>{safeValue(minArea, 0.05).toFixed(3)}</span>
                </div>
                <input 
                  type="range" 
                  min="0.03" 
                  max="0.12" 
                  step="0.001" 
                  value={safeValue(minArea, 0.05)} 
                  onChange={(e) => setMinArea(parseFloat(e.target.value))} 
                  className={styles.slider} 
                  disabled={isRunning} 
                />
              </div>
            </div>

            {/* ─── RUN BUTTON WITH PROPER SPACING ───────────────── */}
            <div className={styles.runBtnWrapper}>
              <button className={styles.runBtn} onClick={startPareto} disabled={isRunning}>
                {isRunning ? (
                  <>
                    <span className={styles.spinner} />
                    EVOLVING... {safeValue(progress, 0).toFixed(0)}%
                  </>
                ) : (
                  <>
                    <FiZap size={16} />
                    EXECUTE NSGA-II ENGINE
                  </>
                )}
              </button>
            </div>

            <div className={styles.statusBox}>
              <div className={styles.label}>Solver Telemetry</div>
              <div className={`${styles.statusText} ${styles[getStatusColor(taskState)]}`}>
                {taskState === 'SUCCESS' ? '✓ COMPLETED' : taskState}
              </div>
              <div className={styles.msg}>{message}</div>
              <div className={styles.progressContainer}>
                <div 
                  className={styles.progressBar} 
                  style={{ 
                    width: `${safeValue(progress, 0)}%`, 
                    background: taskState === 'SUCCESS' ? '#34d399' : 
                               taskState === 'FAILURE' ? '#ef4444' : 
                               '#38bdf8'
                  }} 
                />
              </div>
            </div>
          </div>

          {/* ─── RIGHT PANEL ──────────────────────────────────────── */}
          <div className={`${styles.card} ${styles.vizPanel}`}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderIcon} style={{ background: 'rgba(52,211,153,0.08)', color: '#34d399' }}>
                <FiTrendingUp size={18} />
              </div>
              <h2>Pareto Front</h2>
              <span className={styles.badge}>{displayData.length} Designs</span>
            </div>

            <div className={styles.chartArea}>
              <div className={styles.chartTitle}>Drag (CD) vs Lift (CL)</div>
              <ResponsiveContainer width="100%" height="90%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis 
                    type="number" 
                    dataKey="cd" 
                    name="Drag (CD)" 
                    stroke="#6f7d86" 
                    tickFormatter={(v) => v.toExponential(4)} 
                    domain={['auto', 'auto']} 
                    label={{ value: 'Drag Coefficient (CD) → Minimize', position: 'insideBottom', offset: -10, fill: '#6f7d86', fontSize: 11 }} 
                  />
                  <YAxis 
                    type="number" 
                    dataKey="cl" 
                    name="Lift (CL)" 
                    stroke="#6f7d86" 
                    domain={['auto', 'auto']} 
                    label={{ value: 'Lift Coefficient (CL) → Maximize', angle: -90, position: 'insideLeft', fill: '#6f7d86', fontSize: 11 }} 
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter data={displayData} onClick={(e) => setSelectedDesign(e.payload)}>
                    {displayData.map((entry, index) => {
                      if (entry.is_baseline) {
                        return <Cell key={`cell-${index}`} fill="#38bdf8" stroke="#fff" strokeWidth={2} style={{ cursor: 'pointer' }} />;
                      }
                      return (
                        <Cell 
                          key={`cell-${index}`} 
                          fill="#34d399" 
                          stroke={selectedDesign?.cd === entry.cd ? '#fff' : 'none'} 
                          strokeWidth={selectedDesign?.cd === entry.cd ? 2 : 0} 
                          style={{ cursor: 'pointer' }} 
                        />
                      );
                    })}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            
            <div className={styles.previewArea}>
              <div className={styles.previewHeader}>
                <span>{selectedDesign?.is_baseline ? 'BASELINE PROFILE' : 'SELECTED DESIGN'}</span>
                <button 
                  className={styles.deployBtn} 
                  onClick={handleDeploy}
                >
                  <FiBox size={14} /> SEND TO WORKBENCH
                </button>
              </div>
              <div className={styles.previewMetrics}>
                <span><strong>CL:</strong> {selectedDesign ? safeValue(selectedDesign.cl, 0).toFixed(4) : '---'}</span>
                <span><strong>CD:</strong> {selectedDesign ? safeValue(selectedDesign.cd, 0).toExponential(5) : '---'}</span>
                <span style={{ color: '#34d399' }}><strong>L/D:</strong> {selectedDesign ? safeValue(selectedDesign.ld_ratio, 0).toFixed(2) : '---'}</span>
                <span><strong>t/c:</strong> {selectedDesign ? (safeValue(selectedDesign.thickness, 0) * 100).toFixed(2) : '---'}%</span>
                <span><strong>CM:</strong> {selectedDesign ? safeValue(selectedDesign.cm, 0).toFixed(4) : '---'}</span>
              </div>
              <div className={styles.canvasWrap}>
                <D3AirfoilViz coordinates={previewCoords} />
              </div>
              {saveSuccess && (
                <div className={styles.saveSuccess}>
                  <FiCheckCircle size={12} style={{ marginRight: 6 }} />
                  Designs saved to your library!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── FOOTER ────────────────────────────────────────────── */}
        <div className={styles.footer}>
          <span>AeroML v7.0</span>
          <span>·</span>
          <span>NSGA-II · Multi-Objective Optimization</span>
          <span>·</span>
          <span>© 2026 AeroML</span>
        </div>
      </main>

      {/* ─── LIBRARY MODAL ───────────────────────────────────────── */}
      {libModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setLibModalOpen(false)}>
          <div className={styles.libModal} onClick={e => e.stopPropagation()}>
            <div className={styles.libModalHeader}>
              <h2>Select Baseline from Library</h2>
              <button onClick={() => setLibModalOpen(false)}><FiX size={18} /></button>
            </div>
            <div className={styles.searchBox}>
              <FiSearch size={16} color="#6f7d86" />
              <input 
                type="text" 
                placeholder="Search by name (e.g. NACA 2412, FX...)" 
                value={libSearchQuery} 
                onChange={(e) => setLibSearchQuery(e.target.value)} 
                autoFocus 
              />
            </div>
            <div className={styles.libResults}>
              {isSearchingLib && <p className={styles.loadingText}>Searching index...</p>}
              {!isSearchingLib && libSearchQuery.length > 2 && libResults.length === 0 && (
                <p className={styles.loadingText}>No airfoils found.</p>
              )}
              {!isSearchingLib && libResults.map(airfoil => (
                <div key={airfoil.id || airfoil.name} className={styles.libResultItem} onClick={() => selectLibraryAirfoil(airfoil.name)}>
                  <span className={styles.airfoilName}>{airfoil.name}</span>
                  <span className={styles.airfoilTag}>DB RECORD</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── EXPORT WITH SUBSCRIPTION GUARD ────────────────────────────
export default function ParetoPage() {
  return (
    <SubscriptionGuard>
      <ParetoContent />
    </SubscriptionGuard>
  );
}