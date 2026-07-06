'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { D3AirfoilViz } from '@/components/D3AirfoilViz';
import { generateAirfoilCoordinates } from '@/lib/cst_geometry';
import SubscriptionGuard from '@/components/SubscriptionGuard';
import styles from './import.module.css';
import {
  FiUploadCloud, FiActivity, FiCpu, FiWind, FiTarget,
  FiZap, FiCheckCircle, FiAlertTriangle, FiX,
  FiBox, FiDatabase, FiSliders, FiThermometer
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

// ─── MAIN COMPONENT ─────────────────────────────────────────────
function ImportPageContent() {
  const router = useRouter();
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState('IDLE');
  const [result, setResult] = useState(null);
  const [toasts, setToasts] = useState([]);

  // Flight Conditions State
  const [conditions, setConditions] = useState({
    reynolds: 3000000,
    alpha: 5.0
  });

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

  // ─── Generate preview coordinates ────────────────────────────
  const previewCoords = useMemo(() => {
    if (!result || !result.cst) return [];
    return generateAirfoilCoordinates({
      a_upper: result.cst.slice(0, 8),
      a_lower: result.cst.slice(8, 16)
    }, 150);
  }, [result]);

  // ─── Format helper ────────────────────────────────────────────
  const formatNum = (val, digits = 3) => {
    if (val === null || val === undefined || Number.isNaN(val)) return '—';
    try { return Number(val).toFixed(digits); } 
    catch { return String(val); }
  };

  // ─── Drag handlers ────────────────────────────────────────────
  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = async (e) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  // ─── Re-scan when conditions change ──────────────────────────
  useEffect(() => {
    if (conditions.reynolds === '' || conditions.alpha === '' || 
        isNaN(conditions.reynolds) || isNaN(conditions.alpha)) return;

    if (result && result.cst && status === 'DONE') {
      const timer = setTimeout(() => {
        runPrediction(result.cst, result.filename);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [conditions.reynolds, conditions.alpha]);

  // ─── Run prediction ───────────────────────────────────────────
  const runPrediction = async (cst, filename) => {
    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Authentication required', 'error');
      return;
    }

    try {
      const predictRes = await fetch(`${API_BASE_URL}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          cst_coefficients: cst,
          reynolds: Number(conditions.reynolds),
          alpha: Number(conditions.alpha)
        })
      });

      if (!predictRes.ok) {
        setStatus('IDLE');
        const errText = await predictRes.text();
        showToast(`Prediction failed: ${predictRes.status} - ${errText}`, 'error');
        return;
      }

      const physicsData = await predictRes.json();
      const LDRatio = (physicsData && physicsData.cd && physicsData.cd > 0) ? 
        (physicsData.cl / physicsData.cd) : 0;

      setResult({
        filename: filename,
        cst: cst,
        physics: {
          ...physicsData,
          ld_ratio: LDRatio
        }
      });
      setStatus('DONE');
      showToast('Analysis complete!');
    } catch (e) {
      console.error('Prediction Update Failed', e);
      showToast('Prediction error, check console and server status', 'error');
      setStatus('IDLE');
    }
  };

  // ─── Process file upload ──────────────────────────────────────
  const processFile = async (file) => {
    const token = localStorage.getItem('token');
    if (!token) { 
      showToast('Authentication required. Please log in.', 'error');
      return; 
    }

    const allowed = ['.dat', '.txt', '.csv'];
    const nameLower = (file.name || '').toLowerCase();
    if (!allowed.some(ext => nameLower.endsWith(ext))) {
      showToast('Unsupported file type, use .dat, .txt, or .csv', 'error');
      return;
    }

    setStatus('UPLOADING');
    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch(`${API_BASE_URL}/airfoils/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!uploadRes.ok) {
        let errorMsg = uploadRes.statusText;
        try {
          const errorData = await uploadRes.json();
          if (errorData.detail) errorMsg = errorData.detail;
        } catch (e) {
          try {
            errorMsg = await uploadRes.text();
          } catch (e2) {}
        }
        showToast(`Upload failed: ${errorMsg}`, 'error');
        setStatus('IDLE');
        return;
      }

      const fitData = await uploadRes.json();
      if (!fitData || !fitData.cst_coefficients) {
        showToast('Server returned unexpected response.', 'error');
        setStatus('IDLE');
        return;
      }

      setStatus('ANALYZING');
      await runPrediction(fitData.cst_coefficients, fitData.filename || file.name);

    } catch (error) {
      console.error('Error during file upload:', error);
      showToast(`Network error during upload: ${error.message || 'Unknown error'}`, 'error');
      setStatus('IDLE');
    }
  };

  // ─── Deploy to Workbench ──────────────────────────────────────
  const handleDeployToWorkbench = () => {
    if (!result) return;
    const cstString = JSON.stringify(result.cst);
    router.push(`/workbench?importedCST=${encodeURIComponent(cstString)}&name=${encodeURIComponent(result.filename)}&re=${encodeURIComponent(conditions.reynolds)}&alpha=${encodeURIComponent(conditions.alpha)}`);
  };

  // ─── Status helpers ───────────────────────────────────────────
  const isProcessing = status === 'UPLOADING' || status === 'ANALYZING';
  const statusLabel = status === 'UPLOADING' ? 'FITTING POLYNOMIALS...' :
                      status === 'ANALYZING' ? 'RUNNING PINN INFERENCE...' :
                      status === 'DONE' ? 'EXTRACTION SECURE' : '';

  // ─── RENDER ────────────────────────────────────────────────────
  return (
    <div className={styles.masterContainer}>
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <main className={styles.mainContent}>
        {/* ─── HEADER ───────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div>
              <h1 className={styles.title}>
                <span className={styles.titleIcon}>📥</span>
                Data <span className={styles.highlight}>Ingestion Hangar</span>
              </h1>
              <p className={styles.subtitle}>
                Upload physical coordinates to initiate mathematical CST fitting and aerodynamic telemetry.
              </p>
            </div>
            <div className={styles.headerActions}>
              <span className={styles.statusBadge}>
                <span className={styles.statusPulse} />
                {status === 'DONE' ? 'Active' : 'Ready'}
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
              <span className={styles.badge}>Conditions</span>
            </div>

            <div className={styles.leftColumnContent}>
              <div className={styles.controlsSection}>
                <div className={styles.controlGroup}>
                  <div className={styles.controlLabel}>
                    <span>Reynolds Number</span>
                    <span className={styles.controlValue}>{(conditions.reynolds / 1000000).toFixed(2)}M</span>
                  </div>
                  <input
                    type="range"
                    min="50000"
                    max="10000000"
                    step="50000"
                    value={conditions.reynolds}
                    onChange={(e) => setConditions(p => ({ ...p, reynolds: parseFloat(e.target.value) }))}
                    className={styles.sliderInput}
                  />
                </div>

                <div className={styles.controlGroup}>
                  <div className={styles.controlLabel}>
                    <span>Angle of Attack</span>
                    <span className={styles.controlValue}>{conditions.alpha.toFixed(1)}°</span>
                  </div>
                  <input
                    type="range"
                    min="-10"
                    max="20"
                    step="0.5"
                    value={conditions.alpha}
                    onChange={(e) => setConditions(p => ({ ...p, alpha: parseFloat(e.target.value) }))}
                    className={styles.sliderInput}
                  />
                </div>
              </div>

              {/* ─── DROPZONE ────────────────────────────────────── */}
              <label 
                className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                htmlFor="file-upload"
              >
                <input 
                  type="file" 
                  id="file-upload" 
                  className={styles.hiddenInput} 
                  onChange={handleFileInput} 
                  accept=".dat,.txt,.csv" 
                />

                {isProcessing ? (
                  <div className={styles.scannerStatus}>
                    <div className={styles.scannerSpinner} />
                    <span className={styles.scannerText}>{statusLabel}</span>
                    <span className={styles.scannerSub}>
                      {status === 'UPLOADING' ? 'Extracting geometry features...' : 'Running physics inference...'}
                    </span>
                  </div>
                ) : (
                  <>
                    <FiUploadCloud size={48} className={styles.uploadIcon} />
                    <span className={styles.uploadText}>
                      {status === 'DONE' ? 'OVERRIDE GEOMETRY' : 'INGEST DATA FILE'}
                    </span>
                    <span className={styles.uploadSub}>
                      {status === 'DONE' ? 'Drag a new file to replace current.' : 'Click or drop .DAT, .TXT, or .CSV'}
                    </span>
                    <div className={styles.uploadFormats}>
                      <span className={styles.formatPill}>.DAT</span>
                      <span className={styles.formatPill}>.TXT</span>
                      <span className={styles.formatPill}>.CSV</span>
                    </div>
                  </>
                )}
              </label>

              {/* ─── DEPLOY BUTTON ────────────────────────────────── */}
              {status === 'DONE' && result && (
                <button 
                  onClick={handleDeployToWorkbench} 
                  className={styles.deployBtn}
                >
                  <FiBox size={18} />
                  DEPLOY TO WORKBENCH
                  <FiZap size={16} />
                </button>
              )}
            </div>
          </div>

          {/* ─── RIGHT COLUMN: RESULTS ──────────────────────────── */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderIcon} style={{ background: 'rgba(52,211,153,0.08)', color: '#34d399' }}>
                {status === 'DONE' ? <FiCheckCircle size={18} /> : <FiActivity size={18} />}
              </div>
              <h2>Telemetry Data</h2>
              {status === 'DONE' && (
                <span className={styles.badge} style={{ background: 'rgba(52,211,153,0.08)', color: '#34d399', borderColor: 'rgba(52,211,153,0.1)' }}>
                  EXTRACTION SECURE
                </span>
              )}
            </div>

            {!result ? (
              <div className={styles.emptyState}>
                <FiActivity size={48} className={styles.emptyIcon} />
                <p className={styles.emptyTitle}>Awaiting Ingestion</p>
                <p className={styles.emptyDesc}>
                  Telemetry and geometry bounds will render upon successful extraction.
                </p>
              </div>
            ) : (
              <div className={styles.resultPanel}>
                {/* Airfoil Preview - Now properly constrained */}
                <div className={styles.vizWrapper}>
                  <D3AirfoilViz coordinates={previewCoords} />
                </div>

                {/* Metrics Grid */}
                <div className={styles.telemetryGrid}>
                  <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Lift (CL)</span>
                    <span className={`${styles.metricValue} ${styles.blue}`}>
                      {formatNum(result?.physics?.cl, 4)}
                    </span>
                  </div>
                  <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Drag (CD)</span>
                    <span className={`${styles.metricValue} ${styles.orange}`}>
                      {formatNum(result?.physics?.cd, 5)}
                    </span>
                  </div>
                  <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Moment (CM)</span>
                    <span className={`${styles.metricValue} ${styles.pink}`}>
                      {formatNum(result?.physics?.cm, 4)}
                    </span>
                  </div>
                  <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>L/D Ratio</span>
                    <span className={`${styles.metricValue} ${styles.green}`}>
                      {formatNum(result?.physics?.ld_ratio, 2)}
                    </span>
                  </div>
                  <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Top Transition</span>
                    <span className={styles.metricValue}>
                      {formatNum(result?.physics?.top_xtr, 2)}
                    </span>
                  </div>
                  <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Bot Transition</span>
                    <span className={styles.metricValue}>
                      {formatNum(result?.physics?.bot_xtr, 2)}
                    </span>
                  </div>
                  <div className={`${styles.metricCard} ${styles.metricSpan}`}>
                    <span className={styles.metricLabel}>Network Confidence</span>
                    <span className={`${styles.metricValue} ${styles.green}`}>
                      {(result?.physics?.analysis_confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ─── FOOTER ────────────────────────────────────────────── */}
        <div className={styles.footer}>
          <span>AeroML v7.0</span>
          <span>·</span>
          <span>Physics-Informed Neural Networks</span>
          <span>·</span>
          <span>© 2026 AeroML</span>
        </div>
      </main>
    </div>
  );
}

// ─── EXPORT WITH SUBSCRIPTION GUARD ────────────────────────────
export default function ImportPage() {
  return (
    <SubscriptionGuard>
      <ImportPageContent />
    </SubscriptionGuard>
  );
}