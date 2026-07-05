'use client';
import React from 'react';

const COLORMAPS = {
    VELOCITY: ['#000004', '#420a68', '#932667', '#dd513a', '#fca50a', '#fcffa4'],
    PRESSURE: ['#30123b', '#4662d7', '#36aab8', '#1ae4b6', '#72fe5e', '#d0ee11', '#f0f921'],
    TURBULENCE: ['#0d0887', '#6a00a8', '#b12a90', '#e16462', '#fca636', '#f0f921'],
};

export default function ColorbarLegend({ mode = 'VELOCITY', min = 0, max = 1, unit = '' }) {
    const colors = COLORMAPS[mode] || COLORMAPS.VELOCITY;
    const gradient = colors.map((c, i) => `${c} ${(i / (colors.length - 1)) * 100}%`).join(', ');

    return (
        <div style={{
            position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            background: 'rgba(0,0,0,0.7)', borderRadius: 6, padding: '10px 8px',
            border: '1px solid #30363d', backdropFilter: 'blur(8px)', zIndex: 20,
        }}>
            <span style={{ fontSize: 9, color: '#8b949e', fontWeight: 700, letterSpacing: 1 }}>
                {mode}
            </span>
            <span style={{ fontSize: 10, color: '#e2e8f0', fontFamily: 'monospace' }}>
                {max.toFixed(3)}{unit}
            </span>
            <div style={{
                width: 14, height: 180, borderRadius: 3,
                background: `linear-gradient(to bottom, ${colors.slice().reverse().map((c, i) =>
                    `${c} ${(i / (colors.length - 1)) * 100}%`).join(', ')})`,
                border: '1px solid #30363d',
            }} />
            <span style={{ fontSize: 10, color: '#e2e8f0', fontFamily: 'monospace' }}>
                {min.toFixed(3)}{unit}
            </span>
        </div>
    );
}