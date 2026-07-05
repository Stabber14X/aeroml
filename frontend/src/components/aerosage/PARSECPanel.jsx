'use client';
import React from 'react';
import styles from '@/app/aerosage/aerosage.module.css';

const PARSEC_DEFS = [
    { key: 'r_le', label: 'LE Radius (r_le)', min: 0.002, max: 0.08, step: 0.001, color: '#38bdf8' },
    { key: 'x_up', label: 'Upper Crest X', min: 0.15, max: 0.55, step: 0.01, color: '#00F2FF' },
    { key: 'y_up', label: 'Upper Crest Y', min: 0.02, max: 0.12, step: 0.002, color: '#00F2FF' },
    { key: 'd2y_up', label: 'Upper Curvature', min: -1.5, max: 0.0, step: 0.05, color: '#a855f7' },
    { key: 'x_lo', label: 'Lower Crest X', min: 0.15, max: 0.55, step: 0.01, color: '#f59e0b' },
    { key: 'y_lo', label: 'Lower Crest Y', min: -0.08, max: 0.0, step: 0.002, color: '#f59e0b' },
    { key: 'd2y_lo', label: 'Lower Curvature', min: 0.0, max: 1.5, step: 0.05, color: '#a855f7' },
    { key: 'y_te', label: 'TE Y-offset', min: -0.02, max: 0.02, step: 0.001, color: '#64748b' },
    { key: 'delta_y_te', label: 'TE Thickness', min: 0.0, max: 0.03, step: 0.001, color: '#64748b' },
    { key: 'alpha_te', label: 'TE Direction (rad)', min: -0.3, max: 0.1, step: 0.01, color: '#ef4444' },
    { key: 'beta_te', label: 'TE Wedge (rad)', min: 0.0, max: 0.5, step: 0.01, color: '#ef4444' },
];

export default function PARSECPanel({ params, onChange }) {
    return (
        <div className={styles.parsecGrid}>
            {PARSEC_DEFS.map((def) => (
                <div key={def.key} className={styles.inputGroup}>
                    <div className={styles.labelRow}>
                        <span>{def.label}</span>
                        <span style={{ color: def.color, fontFamily: 'monospace', fontWeight: 'bold' }}>
                            {Number(params[def.key]).toFixed(3)}
                        </span>
                    </div>
                    <input
                        type="range" className={styles.slider}
                        min={def.min} max={def.max} step={def.step}
                        value={params[def.key]}
                        onChange={e => onChange({ ...params, [def.key]: Number(e.target.value) })}
                        style={{ '--slider-color': def.color }}
                    />
                </div>
            ))}
        </div>
    );
}