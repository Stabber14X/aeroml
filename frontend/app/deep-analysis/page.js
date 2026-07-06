'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { NACA4412_CST } from '@/lib/cst_geometry';
import SubscriptionGuard from '@/components/SubscriptionGuard';
import styles from './deep.module.css';
import { 
  FiDownload, FiTerminal, FiShield, FiSliders, 
  FiZap, FiBox, FiX, FiCheckCircle, FiAlertTriangle,
  FiActivity, FiCpu, FiClock
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

// ─── Get current time for logs (client-side only) ─────────────
function getLogTime() {
  const now = new Date();
  return now.toTimeString().split(' ')[0];
}

// ─── Initial log entries (without timestamps for SSR) ──────────
const INITIAL_LOGS = [
  { type: 'info', msg: 'AEROML V7 SOVEREIGN TERMINAL INITIALIZED.' },
  { type: 'info', msg: 'WAITING FOR COMPILER INSTRUCTIONS...' }
];

// ─── MAIN COMPONENT ──────────────────────────────────────────────
function SovereignDossierContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const terminalEndRef = useRef(null);
  const [isMounted, setIsMounted] = useState(false);
  
  // Mission Parameters
  const [cst, setCst] = useState(NACA4412_CST);
  const [reynolds, setReynolds] = useState(3000000);
  const [alpha, setAlpha] = useState(5.0);
  const [mach, setMach] = useState(0.0);
  const [designName, setDesignName] = useState("NACA_4412_BASELINE");
  
  // System State
  const [isGenerating, setIsGenerating] = useState(false);
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [toasts, setToasts] = useState([]);

  // ─── Mount state to prevent hydration mismatch ────────────────
  useEffect(() => {
    setIsMounted(true);
  }, []);

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

  // ─── Auto-scroll terminal ─────────────────────────────────────
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // ─── Load from URL if routed from Workbench or Pareto ────────
  useEffect(() => {
    const cstStr = searchParams.get('cst');
    if (cstStr) {
      try {
        const parsedCst = JSON.parse(decodeURIComponent(cstStr));
        setCst(parsedCst);
        if (searchParams.get('re')) setReynolds(parseFloat(searchParams.get('re')));
        if (searchParams.get('alpha')) setAlpha(parseFloat(searchParams.get('alpha')));
        if (searchParams.get('mach')) setMach(parseFloat(searchParams.get('mach')));
        if (searchParams.get('name')) setDesignName(decodeURIComponent(searchParams.get('name')));
        
        addLog('info', `EXTERNAL DESIGN LOADED: ${decodeURIComponent(searchParams.get('name') || 'CUSTOM_CST')}`);
        showToast('Design loaded successfully');
      } catch (e) {
        addLog('error', 'FAILED TO PARSE INCOMING TENSOR.');
        showToast('Failed to parse incoming design', 'error');
      }
    }
  }, [searchParams]);

  // ─── Add log entry ────────────────────────────────────────────
  const addLog = (type, msg) => {
    setLogs(prev => [...prev, { type, msg }]);
  };

  // ─── Generate Dossier ─────────────────────────────────────────
  const generateDossier = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      addLog('error', 'SECURITY EXCEPTION: Authentication Token Missing.');
      showToast('Authentication required. Please log in.', 'error');
      return;
    }

    setIsGenerating(true);
    setLogs([
      { type: 'info', msg: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
      { type: 'info', msg: 'COMPILATION SEQUENCE INITIATED' },
      { type: 'info', msg: 'ESTABLISHING SECURE CONNECTION TO SOVEREIGN ENGINE...' }
    ]);

    const sequences = [
      { t: 800, m: 'PHASE 1: Allocating Geometric & Inertial Calculus Tensors...', type: 'info' },
      { t: 2200, m: 'PHASE 2: Solving Inviscid Potential Flow Baseline (Panel Method)...', type: 'info' },
      { t: 3800, m: 'PHASE 3: Engaging NeuralFoil Deep Viscous Approximation...', type: 'info' },
      { t: 5500, m: 'PHASE 4: Executing Multi-Objective Pareto & Flight Mechanics Sweep...', type: 'info' },
      { t: 7800, m: 'PHASE 5: High-Res Matplotlib Rendering: Generating 15x Corporate PNGs...', type: 'info' },
      { t: 10500, m: 'PHASE 6: ReportLab Platypus Engine compiling 100-page Dossier...', type: 'info' }
    ];

    const timeouts = sequences.map(seq => setTimeout(() => addLog(seq.type, seq.m), seq.t));

    try {
      const cstArray = Array.isArray(cst) ? cst : [...cst.a_upper, ...cst.a_lower];
      
      const response = await fetch(`${API_BASE_URL}/deep-analysis/generate-dossier`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          cst_coefficients: cstArray,
          reynolds: reynolds,
          alpha: alpha,
          mach: mach
        })
      });

      timeouts.forEach(clearTimeout);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Server returned ${response.status}`);
      }

      addLog('success', '✓ COMPILATION SUCCESSFUL. RECEIVING BINARY STREAM...');

      const blob = await response.blob();
      let filename = `AeroML_Dossier_${designName}.pdf`;
      const disposition = response.headers.get('Content-Disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="(.+)"/);
        if (match && match[1]) filename = match[1];
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      addLog('success', `✓ DOWNLOAD TRIGGERED: ${filename}`);
      addLog('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      addLog('info', 'SYSTEM STANDBY — READY FOR NEXT JOB');
      showToast(`Dossier generated: ${filename}`);

    } catch (error) {
      timeouts.forEach(clearTimeout);
      addLog('error', `✗ CRITICAL FAILURE: ${error.message}`);
      addLog('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      showToast(`Failed to generate dossier: ${error.message}`, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── Format CST display ───────────────────────────────────────
  const cstArray = Array.isArray(cst) ? cst : [...cst.a_upper, ...cst.a_lower];
  const isCstValid = cstArray && cstArray.length === 16;

  // ─── Terminal status ──────────────────────────────────────────
  const getTerminalStatus = () => {
    if (isGenerating) return { label: 'COMPILING', dot: 'compiling' };
    if (logs.some(l => l.type === 'success' && l.msg.includes('DOWNLOAD'))) return { label: 'COMPLETE', dot: 'done' };
    return { label: 'IDLE', dot: 'idle' };
  };

  const status = getTerminalStatus();

  // ─── Render log with time (client-side only) ──────────────────
  const renderLogs = () => {
    return logs.map((log, i) => (
      <div key={i} className={styles.logLine}>
        <span className={styles.logTime}>
          [{isMounted ? getLogTime() : '--:--:--'}]
        </span>
        <span className={`${styles.logMessage} ${styles[log.type]}`}>
          {log.msg}
        </span>
      </div>
    ));
  };

  return (
    <div className={styles.masterContainer}>
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <main className={styles.mainContent}>
        {/* ─── HEADER ───────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div>
              <h1 className={styles.title}>
                <span className={styles.titleIcon}>📊</span>
                Sovereign <span className={styles.highlight}>Analytics</span>
              </h1>
              <p className={styles.subtitle}>
                High fidelity engineering visuals and metadata — IEEE/AIAA compliant output.
              </p>
            </div>
            <div className={styles.headerActions}>
              <span className={`${styles.statusBadge} ${isGenerating ? styles.statusBadgeCompiling : ''}`}>
                <span className={`${styles.statusPulse} ${isGenerating ? styles.statusPulseCompiling : ''}`} />
                {isGenerating ? 'Compiling' : 'Ready'}
              </span>
              <span className={styles.statusBadge} style={{ background: 'rgba(168,85,247,0.06)', color: '#a855f7', borderColor: 'rgba(168,85,247,0.12)' }}>
                <FiShield size={12} />
                IEEE/AIAA COMPLIANT
              </span>
            </div>
          </div>
        </header>

        {/* ─── GRID ─────────────────────────────────────────────── */}
        <div className={styles.grid}>

          {/* ─── LEFT COLUMN: CONTROLS ──────────────────────────── */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderIcon} style={{ background: 'rgba(56,189,248,0.08)', color: '#38bdf8' }}>
                <FiSliders size={18} />
              </div>
              <h2>Flight Envelope</h2>
              <span className={styles.badge}>Configuration</span>
            </div>

            <div className={styles.leftColumnContent}>
              {/* Design Name Display */}
              <div className={styles.designNameDisplay}>
                <span className={styles.label}>Target Design Profile</span>
                <span className={styles.name}>{designName}</span>
              </div>

              {/* Controls */}
              <div className={styles.controlsSection}>
                <div className={styles.controlGroup}>
                  <div className={styles.controlLabel}>
                    <span>Reynolds Number</span>
                    <span className={styles.controlValue}>{(reynolds / 1000000).toFixed(2)}M</span>
                  </div>
                  <input
                    type="range"
                    min="50000"
                    max="10000000"
                    step="50000"
                    value={reynolds}
                    onChange={(e) => setReynolds(parseFloat(e.target.value))}
                    className={styles.sliderInput}
                    disabled={isGenerating}
                  />
                </div>

                <div className={styles.controlGroup}>
                  <div className={styles.controlLabel}>
                    <span>Angle of Attack (α)</span>
                    <span className={styles.controlValue}>{alpha.toFixed(1)}°</span>
                  </div>
                  <input
                    type="range"
                    min="-5"
                    max="15"
                    step="0.5"
                    value={alpha}
                    onChange={(e) => setAlpha(parseFloat(e.target.value))}
                    className={styles.sliderInput}
                    disabled={isGenerating}
                  />
                </div>

                <div className={styles.controlGroup}>
                  <div className={styles.controlLabel}>
                    <span>Mach Number (M)</span>
                    <span className={styles.controlValue}>{mach.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="0.9"
                    step="0.05"
                    value={mach}
                    onChange={(e) => setMach(parseFloat(e.target.value))}
                    className={styles.sliderInput}
                    disabled={isGenerating}
                  />
                </div>
              </div>

              {/* Generate Button - Matching Dashboard style */}
              <button 
                onClick={generateDossier} 
                className={styles.generateBtn} 
                disabled={isGenerating || !isCstValid}
              >
                {isGenerating ? (
                  <>
                    <span className={styles.spinner} />
                    COMPILING DOSSIER...
                  </>
                ) : (
                  <>
                    <FiDownload size={18} />
                    GENERATE 100-PAGE DOSSIER
                    <FiZap size={16} />
                  </>
                )}
              </button>
            </div>
          </div>

          
          {/* ─── RIGHT COLUMN: TERMINAL ─────────────────────────── */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderIcon} style={{ background: 'rgba(56,189,248,0.08)', color: '#38bdf8' }}>
                <FiTerminal size={18} />
              </div>
              <h2>Compiler Terminal</h2>
              <span className={styles.badge}>Live Output</span>
            </div>

            <div className={styles.terminalPanel}>
              <div className={styles.terminalHeader}>
                <div className={styles.terminalHeaderLeft}>
                  <span className={`${styles.dot} ${styles.red}`} />
                  <span className={`${styles.dot} ${styles.yellow}`} />
                  <span className={`${styles.dot} ${styles.green}`} />
                  <span className={styles.title}>root@aeroml-backend-engine:~</span>
                </div>
                <div className={styles.terminalHeaderRight}>
                  <span className={`${styles.statusDot} ${styles[status.dot]}`} />
                  <span>{status.label}</span>
                  <span style={{ opacity: 0.3, marginLeft: 4 }}>|</span>
                  <span style={{ opacity: 0.5 }}>PID: 49102</span>
                </div>
              </div>

              <div className={styles.terminalBody}>
                {logs.length === 0 ? (
                  <div className={styles.terminalEmpty}>
                    <span className={styles.icon}>⌨</span>
                    <span className={styles.title}>Awaiting Compilation</span>
                    <span className={styles.desc}>Configure flight envelope and click generate to begin.</span>
                  </div>
                ) : (
                  <>
                    {renderLogs()}
                    {isGenerating && (
                      <div className={styles.logLine}>
                        <span className={styles.logTime}>[{isMounted ? getLogTime() : '--:--:--'}]</span>
                        <span className={styles.logCursor} />
                      </div>
                    )}
                    <div ref={terminalEndRef} />
                  </>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* ─── FOOTER ────────────────────────────────────────────── */}
        <div className={styles.footer}>
          <span>AeroML v7.0</span>
          <span>·</span>
          <span>Sovereign Analytics Engine</span>
          <span>·</span>
          <span>© 2026 AeroML</span>
        </div>
      </main>
    </div>
  );
}

// ─── EXPORT WITH SUBSCRIPTION GUARD ────────────────────────────
export default function SovereignDossierPage() {
  return (
    <SubscriptionGuard>
      <SovereignDossierContent />
    </SubscriptionGuard>
  );
}