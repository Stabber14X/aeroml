'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { FiCamera, FiUploadCloud, FiCpu, FiCheckCircle, FiTool, FiArrowRight, FiBox, FiZap, FiActivity, FiX } from 'react-icons/fi';
import SubscriptionGuard from '@/components/SubscriptionGuard';
import styles from './vision.module.css';

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
function VisionPageContent() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState('IDLE'); 
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
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

  // ─── Drag handlers ────────────────────────────────────────────
  const handleDrag = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  // ─── Process image ────────────────────────────────────────────
  const processImage = async (file) => {
    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Authentication required. Please log in.', 'error');
      return;
    }
    
    setStatus('SCANNING');
    setErrorMsg('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE_URL}/vision/extract`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data);
        setStatus('SUCCESS');
        showToast('Geometry extracted successfully!');
      } else {
        let errorDetail = 'Extraction failed.';
        try {
          const err = await res.json();
          errorDetail = err.detail || errorDetail;
        } catch (e) {}
        setErrorMsg(errorDetail);
        setStatus('ERROR');
        showToast(errorDetail, 'error');
      }
    } catch (e) {
      setErrorMsg('System connection failed.');
      setStatus('ERROR');
      showToast('Network error. Please check backend connection.', 'error');
    }
  };

  // ─── Drop handler ─────────────────────────────────────────────
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) processImage(e.dataTransfer.files[0]);
  };

  // ─── Deploy to Workbench ──────────────────────────────────────
  const deployToWorkbench = () => {
    if (!result) return;
    const cstString = encodeURIComponent(JSON.stringify(result.cst_coefficients));
    const filename = encodeURIComponent(`SCAN_${result.filename.split('.')[0]}`);
    router.push(`/workbench?importedCST=${cstString}&name=${filename}`);
  };

  // ─── Status helpers ───────────────────────────────────────────
  const isProcessing = status === 'SCANNING';
  const statusLabel = status === 'SCANNING' ? 'MAPPING GEOMETRIC PIXELS...' :
                      status === 'SUCCESS' ? 'EXTRACTION SECURE' : '';

  return (
    <div className={styles.masterContainer}>
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <main className={styles.mainContent}>
        {/* ─── HEADER ───────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div>
              <h1 className={styles.title}>
                <span className={styles.titleIcon}>👁</span>
                Aero<span className={styles.highlight}>Vision</span>
              </h1>
              <p className={styles.subtitle}>
                Optical asset geometry extraction & CST reconstruction engine.
              </p>
            </div>
            <div className={styles.headerActions}>
              <span className={styles.statusBadge}>
                <span className={styles.statusPulse} />
                {status === 'SUCCESS' ? 'Active' : 'Ready'}
              </span>
            </div>
          </div>
        </header>

        {/* ─── GRID ─────────────────────────────────────────────── */}
        <div className={styles.grid}>

          {/* ─── LEFT COLUMN: INPUT ────────────────────────────── */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderIcon} style={{ background: 'rgba(56,189,248,0.08)', color: '#38bdf8' }}>
                <FiCamera size={18} />
              </div>
              <h2>Optical Source</h2>
              <span className={styles.badge}>Image Input</span>
            </div>

            <div className={styles.leftColumnContent}>
              {/* ─── DROPZONE ────────────────────────────────────── */}
              <label 
                className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                htmlFor="vision-upload"
              >
                <input 
                  type="file" 
                  id="vision-upload" 
                  className={styles.hiddenInput} 
                  accept="image/*" 
                  onChange={(e) => e.target.files?.[0] && processImage(e.target.files[0])} 
                />

                {isProcessing ? (
                  <div className={styles.scannerStatus}>
                    <div className={styles.scannerSpinner} />
                    <span className={styles.scannerText}>{statusLabel}</span>
                    <span className={styles.scannerSub}>Processing optical data...</span>
                  </div>
                ) : (
                  <>
                    <FiUploadCloud size={48} className={styles.uploadIcon} />
                    <span className={styles.uploadText}>
                      {status === 'SUCCESS' ? 'OVERRIDE IMAGE' : 'UPLOAD COMPONENT PHOTO'}
                    </span>
                    <span className={styles.uploadSub}>
                      {status === 'SUCCESS' ? 'Drag a new image to replace current.' : 'SIDE-PROFILE .PNG / .JPG REQUIRED'}
                    </span>
                    <div className={styles.uploadFormats}>
                      <span className={styles.formatPill}>.PNG</span>
                      <span className={styles.formatPill}>.JPG</span>
                      <span className={styles.formatPill}>.JPEG</span>
                    </div>
                  </>
                )}
              </label>

              {/* ─── IMAGE PREVIEW ───────────────────────────────── */}
              {result?.overlay_image && (
                <div className={styles.imagePreviewContainer}>
                  <img src={result.overlay_image} alt="Extracted Geometry Overlay" className={styles.previewImage} />
                </div>
              )}
            </div>
          </div>

          {/* ─── RIGHT COLUMN: DATA ────────────────────────────── */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderIcon} style={{ background: 'rgba(168,85,247,0.08)', color: '#a855f7' }}>
                <FiCpu size={18} />
              </div>
              <h2>Tensor Data</h2>
              {status === 'SUCCESS' && (
                <span className={styles.badge} style={{ background: 'rgba(52,211,153,0.08)', color: '#34d399', borderColor: 'rgba(52,211,153,0.1)' }}>
                  <FiCheckCircle size={12} style={{ marginRight: 4 }} /> EXTRACTION SECURE
                </span>
              )}
            </div>

            {!result ? (
              <div className={styles.emptyState}>
                <FiActivity size={48} className={styles.emptyIcon} />
                <p className={styles.emptyTitle}>Awaiting Optical Input</p>
                <p className={styles.emptyDesc}>
                  Upload a side-profile image of your airfoil component to begin geometry extraction.
                </p>
              </div>
            ) : (
              <div className={styles.resultPanel}>
                {/* Metrics Grid */}
                <div className={styles.metricsGrid}>
                  <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Detected Width</span>
                    <span className={`${styles.metricValue} ${styles.blue}`}>
                      {result.metrics.detected_chord_px.toFixed(0)} PX
                    </span>
                  </div>
                  <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>T/C Estimate</span>
                    <span className={`${styles.metricValue} ${styles.orange}`}>
                      {(result.metrics.estimated_thickness * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* CST Coefficients */}
                <div className={styles.cstContainer}>
                  <span className={styles.metricLabel}>Fitted CST Weights (16-DIM)</span>
                  <div className={styles.cstGrid}>
                    {result.cst_coefficients.map((val, i) => (
                      <div key={i} className={styles.cstItem}>
                        <span className={styles.cstLabel}>{i < 8 ? `U${i+1}` : `L${i-7}`}</span>
                        <span className={styles.cstValue}>{val.toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Deploy Button */}
                <button className={styles.deployBtn} onClick={deployToWorkbench}>
                  <FiBox size={18} />
                  INJECT TO WORKBENCH
                  <FiArrowRight size={16} />
                </button>
              </div>
            )}
          </div>

        </div>

        {/* ─── FOOTER ────────────────────────────────────────────── */}
        <div className={styles.footer}>
          <span>AeroML v7.0</span>
          <span>·</span>
          <span>Computer Vision · Optical Geometry Extraction</span>
          <span>·</span>
          <span>© 2026 AeroML</span>
        </div>
      </main>
    </div>
  );
}

// ─── EXPORT WITH SUBSCRIPTION GUARD ────────────────────────────
export default function VisionPage() {
  return (
    <SubscriptionGuard>
      <VisionPageContent />
    </SubscriptionGuard>
  );
}