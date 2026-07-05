'use client';
import React from 'react';

export default function ProbeTooltip({ data, position }) {
    if (!data || !position) return null;

    const speed = Math.sqrt(data.ux ** 2 + data.uy ** 2);

    return (
        <div style={{
            position: 'fixed', left: position.x + 18, top: position.y - 10,
            background: 'rgba(15,23,42,0.95)', border: '1px solid #334155',
            borderRadius: 6, padding: '10px 14px', zIndex: 100,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            color: '#e2e8f0', pointerEvents: 'none', backdropFilter: 'blur(8px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)', minWidth: 180,
        }}>
            <Row label="x" value={data.x?.toFixed(4)} color="#64748b" />
            <Row label="y" value={data.y?.toFixed(4)} color="#64748b" />
            <div style={{ borderTop: '1px solid #1e293b', margin: '4px 0' }} />
            <Row label="Ux" value={data.ux?.toFixed(4)} color="#38bdf8" />
            <Row label="Uy" value={data.uy?.toFixed(4)} color="#38bdf8" />
            <Row label="|V|" value={speed.toFixed(4)} color="#00F2FF" />
            <Row label="Cp" value={data.p?.toFixed(4)} color="#f59e0b" />
            <Row label="νt" value={data.nut?.toExponential(2)} color="#a855f7" />
        </div>
    );
}

function Row({ label, value, color }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ color: '#64748b' }}>{label}</span>
            <span style={{ color, fontWeight: 600 }}>{value}</span>
        </div>
    );
}