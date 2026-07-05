'use client';
import React from 'react';
import { FiAlertTriangle } from 'react-icons/fi';

export default function StallHUD({ stall }) {
    if (!stall || stall.severity < 0.2) return null;

    const critical = stall.severity > 0.5;
    const borderColor = critical ? '#ef4444' : stall.severity > 0.3 ? '#f59e0b' : '#22c55e';
    const bgColor = critical ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.08)';

    return (
        <div style={{
            position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
            background: bgColor, border: `2px solid ${borderColor}`,
            borderRadius: 8, padding: '12px 24px', zIndex: 50,
            display: 'flex', alignItems: 'center', gap: 16,
            backdropFilter: 'blur(12px)', boxShadow: `0 0 30px ${borderColor}44`,
            animation: critical ? 'stallPulse 1.2s ease-in-out infinite' : 'none',
        }}>
            <FiAlertTriangle size={24} color={borderColor} />
            <div>
                <div style={{ color: borderColor, fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>
                    {critical ? '⚠ STALL DETECTED' : 'STALL PROXIMITY'}
                </div>
                <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2, fontFamily: 'monospace' }}>
                    {stall.type} | Severity {(stall.severity * 100).toFixed(0)}%
                    | Margin {stall.margin_deg?.toFixed(1)}° | x/c = {stall.separation_onset_x?.toFixed(3)}
                </div>
            </div>
            <SeverityMeter severity={stall.severity} color={borderColor} />

            <style jsx>{`
                @keyframes stallPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
            `}</style>
        </div>
    );
}

function SeverityMeter({ severity, color }) {
    return (
        <div style={{
            width: 60, height: 8, background: '#1e293b', borderRadius: 4, overflow: 'hidden',
        }}>
            <div style={{
                width: `${severity * 100}%`, height: '100%',
                background: color, borderRadius: 4,
                transition: 'width 0.3s ease',
            }} />
        </div>
    );
}