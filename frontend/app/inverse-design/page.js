'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { D3AirfoilViz } from '@/components/D3AirfoilViz';
import ThreeDWing from '@/components/ThreeDWing';
import { NACA4412_CST, generateAirfoilCoordinates } from '@/lib/cst_geometry';
import SubscriptionGuard from '@/components/SubscriptionGuard';
import styles from './inverse.module.css';
import { 
  FiCpu, FiTarget, FiZap, FiBox, FiX, FiCheckCircle, 
  FiAlertTriangle, FiActivity, FiSliders, FiTrendingUp,
  FiDownload, FiCamera, FiMaximize2, FiMinimize2
} from 'react-icons/fi';

const API_BASE_URL = 'http://127.0.0.1:8000';

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

// ─── INITIAL PREDICTION FETCH ──────────────────────────────────
const fetchInitialPrediction = async (cstParams) => {
  const token = localStorage.getItem('token');
  if (!token) return 0.4;
  try {
    const cst_coefficients = [...cstParams.a_upper, ...cstParams.a_lower];
    const response = await fetch(`${API_BASE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        cst_coefficients,
        reynolds: cstParams.reynolds,
        alpha: cstParams.alpha
      })
    });
    if (response.ok) {
      const data = await response.json();
      return data.cl;
    }
  } catch (e) {
    console.error("Initial prediction failed:", e);
  }
  return 0.4;
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────
function InverseDesignContent() {
  const [isMounted, setIsMounted] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialCST = useMemo(() => ({ ...NACA4412_CST }), []);

  const [cstParams, setCstParams] = useState(initialCST);
  const [targetCl, setTargetCl] = useState(1.2);
  const [targetCd, setTargetCd] = useState(0.015);
  const [targetCm, setTargetCm] = useState(-0.1);
  const [iterations, setIterations] = useState(40);
  const [enforceFeasibility, setEnforceFeasibility] = useState(true);
  
  const [taskState, setTaskState] = useState('IDLE');
  const [taskId, setTaskId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Ready to calculate shape.');
  const [currentCl, setCurrentCl] = useState(0.4);
  const [startTime, setStartTime] = useState(null);
  const [lastOptimizedCST, setLastOptimizedCST] = useState(null);
  const [toasts, setToasts] = useState([]);

  const [focusedStage, setFocusedStage] = useState('3d');
  const [fullscreenStage, setFullscreenStage] = useState(null);
  
  const isRunning = taskState === 'PENDING' || taskState === 'PROGRESS';
  
  const threeRef = useRef(null);
  const twoRef = useRef(null);
  
  const coordinates = useMemo(() => generateAirfoilCoordinates(cstParams, 300), [cstParams]);

  // ─── Mount state to prevent hydration mismatch ────────────────
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // ─── Toast System ─────────────────────────────────────────────
  const showToast = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ─── Load from URL ────────────────────────────────────────────
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
          
          setCstParams(prev => ({
            ...prev,
            a_upper: upper,
            a_lower: lower,
            reynolds: reStr ? parseFloat(reStr) : prev.reynolds,
            alpha: alphaStr ? parseFloat(alphaStr) : prev.alpha,
            mach: machStr ? parseFloat(machStr) : prev.mach || 0.0
          }));
          
          if (nameStr) {
            setCstParams(prev => ({ ...prev, name: decodeURIComponent(nameStr) }));
          }
          
          setLastOptimizedCST(cstArray);
          
          setTimeout(async () => {
            const cl = await fetchInitialPrediction({
              a_upper: upper,
              a_lower: lower,
              reynolds: reStr ? parseFloat(reStr) : initialCST.reynolds,
              alpha: alphaStr ? parseFloat(alphaStr) : initialCST.alpha
            });
            if (cl) setCurrentCl(cl);
          }, 300);
          
          showToast('Design loaded from Workbench', 'success');
        }
      } catch (e) {
        console.error('Failed to load CST from URL:', e);
        showToast('Failed to load design from Workbench', 'error');
      }
    }
  }, [searchParams, showToast, initialCST, isMounted]);

  // ─── Load initial data ────────────────────────────────────────
  useEffect(() => {
    if (!isMounted) return;
    
    const loadInitialData = async () => {
      const initialClValue = await fetchInitialPrediction(initialCST);
      setCurrentCl(initialClValue);
      setLastOptimizedCST([...initialCST.a_upper, ...initialCST.a_lower]);
    };
    loadInitialData();
  }, [initialCST, isMounted]);

  // ─── ETA calculation ──────────────────────────────────────────
  useEffect(() => {
    if (taskState === 'PROGRESS' && !startTime) setStartTime(Date.now());
    if (taskState !== 'PROGRESS') setStartTime(null);
  }, [taskState, startTime]);

  const estimatedETA = useMemo(() => {
    if (!startTime || !Number.isFinite(progress) || progress <= 0) return null;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = progress / Math.max(elapsed, 1e-3);
    if (rate <= 0) return null;
    const remaining = (100 - progress) / rate;
    return Math.max(0, Math.round(remaining));
  }, [startTime, progress]);

  const clDelta = useMemo(() => {
    if (!Number.isFinite(currentCl) || !Number.isFinite(targetCl)) return 0;
    return Number((targetCl - currentCl).toFixed(4));
  }, [currentCl, targetCl]);

  // ─── Apply optimized CST ──────────────────────────────────────
  const applyOptimizedCST = useCallback((optimizedCST) => {
    const upper = optimizedCST.slice(0, 8);
    const lower = optimizedCST.slice(8, 16);
    setCstParams(prev => ({
      ...prev,
      a_upper: upper.length === 8 ? upper : prev.a_upper,
      a_lower: lower.length === 8 ? lower : prev.a_lower,
    }));
    setLastOptimizedCST(optimizedCST);
    fetchInitialPrediction({ ...cstParams, a_upper: upper, a_lower: lower })
      .then(finalCl => {
        if (Number.isFinite(finalCl)) setCurrentCl(finalCl);
      });
  }, [cstParams]);

  // ─── Start Inverse Design ─────────────────────────────────────
  const startInverseDesign = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Authentication required. Please log in.', 'error');
      return;
    }
    if (isRunning) return;
    
    setTaskState('PENDING');
    setProgress(0);
    setMessage('Dispatching job to L-BFGS solver.');
    setStartTime(Date.now());
    
    const initialCoeffs = [...cstParams.a_upper, ...cstParams.a_lower];

    const payload = {
      initial_cst: initialCoeffs,
      reynolds: cstParams.reynolds,
      alpha: cstParams.alpha,
      target_cl: parseFloat(targetCl),
      target_cd: parseFloat(targetCd),
      target_cm: parseFloat(targetCm),
      iterations: parseInt(iterations, 10),
      enforce_feasibility: enforceFeasibility
    };
    
    try {
      const res = await fetch(`${API_BASE_URL}/optimize/inverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        const data = await res.json();
        setTaskId(data.task_id);
        setTaskState('PROGRESS');
        setMessage('Solver started, monitoring progress.');
        
        const saved = JSON.parse(localStorage.getItem('aeroml_tasks') || '[]');
        const record = { 
          id: data.task_id, 
          type: `Inverse (CL=${targetCl})`, 
          airfoil_name: `ID_Target_CL${targetCl}`, 
          status: 'PENDING' 
        };
        if (!saved.some(s => s.id === data.task_id)) {
          localStorage.setItem('aeroml_tasks', JSON.stringify([record, ...saved]));
        }
        showToast('Inverse Design job queued.', 'success');
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage(`API Error: ${err.detail || 'unknown error'}`);
        setTaskState('FAILURE');
        setStartTime(null);
        showToast(`Inverse Design Failed: ${err.detail || 'unknown error'}`, 'error');
      }
    } catch (error) {
      setMessage('Network connection error.');
      setTaskState('FAILURE');
      setStartTime(null);
      showToast('Network connection error. Check backend.', 'error');
    }
  };

  // ─── Poll task status ─────────────────────────────────────────
  useEffect(() => {
    if (!taskId || taskState !== 'PROGRESS') return;
    const poll = setInterval(async () => {
      const token = localStorage.getItem('token');
      if (!token) { clearInterval(poll); return; }
      
      try {
        const res = await fetch(`${API_BASE_URL}/optimize/${taskId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('poll error');
        
        const data = await res.json();
        setTaskState(data.status);
        setProgress(typeof data.progress === 'number' ? data.progress : 0);
        setMessage(data.message || '');
        
        if (data.status === 'PROGRESS' && data.current_cl !== undefined) {
          setCurrentCl(data.current_cl);
        }
        
        if (data.status === 'SUCCESS' || data.status === 'COMPLETED') {
          clearInterval(poll);
          const result = data.result || {};
          const optimized = Array.isArray(result.optimized_cst) ? result.optimized_cst : [];
          if (optimized.length === 16) applyOptimizedCST(optimized);
          if (result.final_cl !== undefined) setCurrentCl(result.final_cl);
          setMessage(`Converged, final CL: ${result.final_cl ?? currentCl}`);
          setTaskState('SUCCESS');
          setStartTime(null);
          showToast('Inverse Design Completed successfully!', 'success');
        } else if (data.status === 'FAILURE') {
          clearInterval(poll);
          setMessage(`Failed: ${data.message || 'solver failure'}`);
          setTaskState('FAILURE');
          setStartTime(null);
          showToast('Inverse Design Failed.', 'error');
        }
      } catch (error) {
        clearInterval(poll);
        setTaskState('FAILURE');
        setMessage('Failed to poll task status.');
        setStartTime(null);
        showToast('Failed to poll task status.', 'error');
      }
    }, 1000);
    return () => clearInterval(poll);
  }, [taskId, taskState, applyOptimizedCST, showToast, currentCl]);

  // ─── Handlers ──────────────────────────────────────────────────
  const onChangeTargetCl = (e) => setTargetCl(Number(e.target.value || 0));
  const onChangeTargetCd = (e) => setTargetCd(Number(e.target.value || 0));
  const onChangeTargetCm = (e) => setTargetCm(Number(e.target.value || 0));
  const onChangeIterations = (e) => {
    const v = parseInt(e.target.value, 10);
    if (Number.isNaN(v)) return setIterations(1);
    setIterations(Math.max(1, Math.min(100, v)));
  };
  const onChangeAlpha = (e) => {
    const v = parseFloat(e.target.value);
    setCstParams(p => ({ ...p, alpha: Number.isFinite(v) ? v : p.alpha }));
  };
  const onChangeReynolds = (e) => {
    const v = parseFloat(e.target.value);
    setCstParams(p => ({ ...p, reynolds: Number.isFinite(v) ? v : p.reynolds }));
  };

  // ─── Snapshot ──────────────────────────────────────────────────
  const snapshotStage = useCallback((which) => {
    const container = which === '3d' ? threeRef.current : twoRef.current;
    if (!container) return showToast('Renderer not mounted yet.', 'error');
    const canvas = container.querySelector('canvas');
    if (canvas && typeof canvas.toDataURL === 'function') {
      const data = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = data;
      a.download = `${which}_snapshot.png`;
      a.click();
      return showToast('Snapshot taken (Check Downloads)', 'success');
    }
    const svg = container.querySelector('svg');
    if (svg) {
      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(svg);
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${which}_snapshot.svg`;
      a.click();
      URL.revokeObjectURL(url);
      return showToast('Snapshot taken (Check Downloads)', 'success');
    }
    showToast('Snapshot failed: renderer has no canvas or svg.', 'error');
  }, [showToast]);

  const toggleFullscreen = useCallback((which) => {
    setFullscreenStage(prev => (prev === which ? null : which));
  }, []);

  // ─── Actions ───────────────────────────────────────────────────
  const copyCST = () => {
    const cstString = JSON.stringify([...cstParams.a_upper, ...cstParams.a_lower]);
    navigator.clipboard?.writeText(cstString).catch(() => {});
    showToast('Current CST copied to clipboard.', 'success');
  };

  const goToDeepAnalysis = () => {
    const cstToUse = lastOptimizedCST;
    if (!cstToUse || cstToUse.length !== 16) {
      return showToast("Cannot analyze: No optimized CST available.", 'error');
    }
    const airfoilName = `INVERSE_CL${Number(targetCl).toFixed(4).replace('.', '_')}`;
    const urlParams = new URLSearchParams({
      cst: JSON.stringify(cstToUse),
      re: cstParams.reynolds,
      alpha: cstParams.alpha,
      name: airfoilName
    });
    router.push(`/deep-analysis?${urlParams.toString()}`);
  };

  const handleOpenInWorkbench = () => {
    const cstToUse = lastOptimizedCST;
    if (!cstToUse || cstToUse.length !== 16) {
      return showToast("Cannot open: Optimization not complete.", 'error');
    }
    const finalClName = Number(currentCl).toFixed(4).replace('.', '_');
    const airfoilName = `INVERSE_CL${finalClName}_Re${cstParams.reynolds}`;
    const cstString = encodeURIComponent(JSON.stringify(cstToUse));
    router.push(`/workbench?importedCST=${cstString}&name=${encodeURIComponent(airfoilName)}&re=${cstParams.reynolds}&alpha=${cstParams.alpha}`);
  };

  const getStatusColor = (status) => {
    if (status === 'SUCCESS' || status === 'COMPLETED') return 'success';
    if (status === 'FAILURE' || status === 'NETWORK_ERROR') return 'failure';
    if (status === 'PROGRESS' || status === 'PENDING') return 'progress';
    return 'idle';
  };

  // ─── Don't render until mounted to prevent hydration mismatch ──
  if (!isMounted) {
    return null;
  }

  return (
    <div className={styles.masterContainer}>
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <main className={styles.mainContent}>
        {/* ─── HEADER ───────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div>
              <h1 className={styles.title}>
                <span className={styles.titleIcon}>🎯</span>
                Inverse <span className={styles.highlight}>Design Studio</span>
              </h1>
              <p className={styles.subtitle}>
                Specify exact flight parameters and let L-BFGS autograd shape the airfoil.
              </p>
            </div>
            <div className={styles.headerActions}>
              <span className={`${styles.statusBadge} ${isRunning ? styles.statusBadgeCompiling : ''}`}>
                <span className={`${styles.statusPulse} ${isRunning ? styles.statusPulseCompiling : ''}`} />
                {isRunning ? 'Solving' : 'Ready'}
              </span>
            </div>
          </div>
        </header>

        {/* ─── STAGE GRID ────────────────────────────────────────── */}
        <div className={styles.stageGrid}>
          {/* 3D View */}
          <div className={styles.stagePanel}>
            <div className={styles.stageHeader}>
              <span className={styles.stageTitle}>3D Wing View</span>
              <div className={styles.stageToolbar}>
                <button className={styles.toolbarBtn} onClick={() => snapshotStage('3d')}>
                  <FiCamera size={12} /> Snap
                </button>
                <button className={styles.toolbarBtn} onClick={() => toggleFullscreen('3d')}>
                  {fullscreenStage === '3d' ? <FiMinimize2 size={12} /> : <FiMaximize2 size={12} />}
                </button>
              </div>
            </div>
            <div className={styles.stageCanvasWrapper} ref={threeRef}>
              <ThreeDWing cstParams={cstParams} />
            </div>
          </div>

          {/* 2D View */}
          <div className={styles.stagePanel}>
            <div className={styles.stageHeader}>
              <span className={styles.stageTitle}>2D Engineering Profile</span>
              <div className={styles.stageToolbar}>
                <button className={styles.toolbarBtn} onClick={() => snapshotStage('2d')}>
                  <FiCamera size={12} /> Snap
                </button>
                <button className={styles.toolbarBtn} onClick={() => toggleFullscreen('2d')}>
                  {fullscreenStage === '2d' ? <FiMinimize2 size={12} /> : <FiMaximize2 size={12} />}
                </button>
              </div>
            </div>
            <div className={styles.stageCanvasWrapper} ref={twoRef}>
              <D3AirfoilViz coordinates={coordinates} />
            </div>
          </div>
        </div>

        {/* ─── CONTROLS ROW ──────────────────────────────────────── */}
        <div className={styles.controlsRow}>
          {/* Left: Control Card */}
          <div className={styles.controlCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '0.85rem', color: '#38bdf8', fontWeight: 700 }}>
                Target & Conditions
              </h3>
              <button className={styles.smallBtn} onClick={copyCST}>Copy CST</button>
            </div>

            <div className={styles.controlGrid}>
              <div>
                <span className={styles.hudLabel}>Target Lift (CL)</span>
                <input
                  className={styles.input}
                  type="number"
                  step="0.01"
                  value={targetCl}
                  onChange={onChangeTargetCl}
                  disabled={isRunning}
                />
              </div>
              <div>
                <span className={styles.hudLabel}>Max Iterations</span>
                <input
                  className={styles.input}
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  value={iterations}
                  onChange={onChangeIterations}
                  disabled={isRunning}
                />
              </div>
              <div>
                <span className={styles.hudLabel}>Target Drag (CD)</span>
                <input
                  className={styles.input}
                  type="number"
                  step="0.001"
                  value={targetCd}
                  onChange={onChangeTargetCd}
                  disabled={isRunning}
                />
              </div>
              <div>
                <span className={styles.hudLabel}>Angle of Attack α</span>
                <input
                  className={styles.input}
                  type="number"
                  step="0.1"
                  value={cstParams.alpha}
                  onChange={onChangeAlpha}
                  disabled={isRunning}
                />
              </div>
              <div>
                <span className={styles.hudLabel}>Target Moment (CM)</span>
                <input
                  className={styles.input}
                  type="number"
                  step="0.01"
                  value={targetCm}
                  onChange={onChangeTargetCm}
                  disabled={isRunning}
                />
              </div>
              <div>
                <span className={styles.hudLabel}>Reynolds (Re)</span>
                <input
                  className={styles.input}
                  type="number"
                  step="100000"
                  value={cstParams.reynolds}
                  onChange={onChangeReynolds}
                  disabled={isRunning}
                />
              </div>
            </div>

            <div className={styles.toggleWrapper}>
              <label htmlFor="feasibilitySwitch" className={styles.toggleLabel}>
                Enforce Physical Feasibility
              </label>
              <input
                type="checkbox"
                id="feasibilitySwitch"
                checked={enforceFeasibility}
                onChange={(e) => setEnforceFeasibility(e.target.checked)}
                className={styles.checkboxInput}
                disabled={isRunning}
              />
            </div>

            <button
              className={styles.solveButton}
              onClick={startInverseDesign}
              disabled={isRunning || Number(targetCl) === 0}
            >
              {isRunning ? (
                <>
                  <span style={{ 
                    width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite', display: 'inline-block'
                  }} />
                  SOLVING... {Number.isFinite(progress) ? progress.toFixed(0) : 0}%
                </>
              ) : (
                <>
                  <FiZap size={18} />
                  START INVERSE SOLVER
                </>
              )}
            </button>
          </div>

          {/* Right: Metrics Card */}
          <div className={styles.metricsCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '0.75rem', color: '#9aa8b2', fontWeight: 600 }}>
                Solver Status
              </h4>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className={styles.smallBtn} onClick={handleOpenInWorkbench} disabled={isRunning || !lastOptimizedCST}>
                  Workbench
                </button>
                <button 
                  className={styles.smallBtn} 
                  onClick={goToDeepAnalysis} 
                  disabled={isRunning || !lastOptimizedCST}
                  style={{ background: 'rgba(56,189,248,0.08)', borderColor: 'rgba(56,189,248,0.15)', color: '#38bdf8' }}
                >
                  Dossier
                </button>
              </div>
            </div>

            <div>
              <div className={`${styles.statusColor} ${styles[getStatusColor(taskState)]}`} style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                {taskState}
              </div>
              <div className={styles.progressBar}>
                <div 
                  className={styles.progressBarFill} 
                  style={{ 
                    width: `${Math.max(0, Math.min(100, progress))}%`,
                    background: taskState === 'SUCCESS' ? '#34d399' : 
                               taskState === 'FAILURE' ? '#ef4444' : 
                               '#38bdf8'
                  }} 
                />
              </div>
              <p className={styles.progressMessage}>{message}</p>
            </div>

            <div className={styles.metricRow}>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>Target CL</span>
                <span className={`${styles.metricValue} ${styles.blue}`}>
                  {Number(targetCl).toFixed(4)}
                </span>
              </div>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>Current CL</span>
                <span className={`${styles.metricValue} ${styles.green}`}>
                  {Number(currentCl).toFixed(4)}
                </span>
              </div>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>Delta CL</span>
                <span className={`${styles.metricValue} ${clDelta >= 0 ? styles.green : styles.orange}`}>
                  {clDelta >= 0 ? `+${clDelta}` : clDelta}
                </span>
              </div>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>ETA</span>
                <span className={`${styles.metricValue} ${styles.blue}`}>
                  {estimatedETA === null ? '--' : `${estimatedETA}s`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── FOOTER ────────────────────────────────────────────── */}
        <div className={styles.footer}>
          <span>AeroML v7.0</span>
          <span>·</span>
          <span>Inverse Design · L-BFGS Autograd</span>
          <span>·</span>
          <span>© 2026 AeroML</span>
        </div>
      </main>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── EXPORT WITH SUBSCRIPTION GUARD ────────────────────────────
export default function InverseDesignPage() {
  return (
    <SubscriptionGuard>
      <InverseDesignContent />
    </SubscriptionGuard>
  );
}