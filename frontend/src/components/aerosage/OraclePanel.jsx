'use client';
import React from 'react';
import { FiX, FiShield, FiAlertTriangle, FiInfo, FiAlertCircle } from 'react-icons/fi';
import styles from '@/app/aerosage/aerosage.module.css';

const SEVERITY_CONFIG = {
    WARNING:  { icon: FiAlertTriangle, color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
    CAUTION:  { icon: FiAlertCircle,   color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
    ADVISORY: { icon: FiInfo,          color: '#38bdf8', bg: 'rgba(56,189,248,0.08)' },
    INFO:     { icon: FiShield,        color: '#22c55e', bg: 'rgba(34,197,94,0.08)' },
};

export default function OraclePanel({ open, onClose, diagnostics, summary }) {
    if (!open) return null;

    return (
        <div className={styles.oracleOverlay} onClick={onClose}>
            <div className={styles.oraclePanel} onClick={e => e.stopPropagation()}>
                <div className={styles.oraclePanelHeader}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>
                            🔮 AeroSAGE Oracle
                        </h2>
                        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748b' }}>
                            Senior Aerodynamicist Diagnostic Report
                        </p>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer'
                    }}>
                        <FiX size={20} />
                    </button>
                </div>

                {summary && (
                    <div className={styles.oracleSummary}>
                        <SummaryBadge label="WARNINGS" count={summary.warnings} color="#ef4444" />
                        <SummaryBadge label="CAUTIONS" count={summary.cautions} color="#f59e0b" />
                        <SummaryBadge label="ADVISORIES" count={summary.advisories} color="#38bdf8" />
                        <div style={{
                            marginLeft: 'auto', fontSize: 12, fontWeight: 700,
                            color: summary.airworthy ? '#22c55e' : '#ef4444'
                        }}>
                            {summary.airworthy ? '✓ AIRWORTHY' : '✗ DEGRADED'}
                        </div>
                    </div>
                )}

                <div className={styles.oracleItems}>
                    {diagnostics?.map((item, i) => {
                        const cfg = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.INFO;
                        const Icon = cfg.icon;
                        return (
                            <div key={i} className={styles.oracleItem} style={{
                                borderLeft: `3px solid ${cfg.color}`, background: cfg.bg,
                            }}>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                    <Icon size={16} color={cfg.color} style={{ flexShrink: 0, marginTop: 2 }} />
                                    <div>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <span style={{
                                                fontSize: 9, fontWeight: 800, color: cfg.color,
                                                background: `${cfg.color}22`, padding: '2px 6px',
                                                borderRadius: 3, letterSpacing: 1,
                                            }}>
                                                {item.code}
                                            </span>
                                            <span style={{ fontSize: 9, color: '#64748b' }}>
                                                {item.affected_metric}
                                            </span>
                                        </div>
                                        <h4 style={{ margin: '6px 0 4px', fontSize: 13, color: '#e2e8f0' }}>
                                            {item.title}
                                        </h4>
                                        <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
                                            {item.description}
                                        </p>
                                        <div style={{
                                            marginTop: 8, padding: '8px 10px', borderRadius: 4,
                                            background: 'rgba(0,0,0,0.3)', fontSize: 11, color: '#22c55e',
                                            borderLeft: '2px solid #22c55e',
                                        }}>
                                            <strong>FIX:</strong> {item.recommendation}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {(!diagnostics || diagnostics.length === 0) && (
                        <div style={{ padding: 40, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>
                            Run an analysis first, then request Oracle diagnostics.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function SummaryBadge({ label, count, color }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
                width: 20, height: 20, borderRadius: 4, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 11,
                fontWeight: 800, background: `${color}22`, color,
            }}>
                {count}
            </div>
            <span style={{ fontSize: 9, color: '#64748b', letterSpacing: 0.5 }}>{label}</span>
        </div>
    );
}