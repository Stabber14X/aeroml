// frontend/src/components/AcousticsPanel.jsx
'use client';
import React, { useMemo, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';

// ─────────────────────────────────────────────
// A-weighting correction curve (IEC 61672)
// ─────────────────────────────────────────────
function aWeight(f) {
  const f2 = f * f;
  const f4 = f2 * f2;
  const num = 12194 ** 2 * f4;
  const den =
    (f2 + 20.6 ** 2) *
    Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) *
    (f2 + 12194 ** 2);
  const Ra = num / den;
  return 20 * Math.log10(Ra) + 2.0; // dB(A) offset
}

// ─────────────────────────────────────────────
// 1/3-Octave band centre frequencies (Hz)
// ─────────────────────────────────────────────
const OCTAVE_BANDS = [
  100, 125, 160, 200, 250, 315, 400, 500, 630,
  800, 1000, 1250, 1600, 2000, 2500, 3150,
  4000, 5000, 6300, 8000, 10000, 12500, 16000
];

// ─────────────────────────────────────────────
// Custom Tooltip
// ─────────────────────────────────────────────
function AeroTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(11,15,20,0.97)',
      border: '1px solid #30363d',
      borderRadius: '6px',
      padding: '8px 12px',
      fontFamily: '"Consolas",monospace',
      fontSize: '11px',
      minWidth: '140px',
    }}>
      <div style={{ color: '#64748b', marginBottom: '4px', fontSize: '10px' }}>
        {label !== undefined ? `${typeof label === 'number' && label > 999 ? (label / 1000).toFixed(1) + ' kHz' : label + ' Hz'}` : ''}
      </div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || p.stroke, marginBottom: '2px' }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(2) : p.value} dB</strong>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// OASPL Semi-circular gauge
// ─────────────────────────────────────────────
function OASPLGauge({ value, max = 120 }) {
  const pct = Math.min(1, Math.max(0, value / max));
  const angle = -210 + pct * 240; // -210° to +30°
  const rad = (angle * Math.PI) / 180;
  const cx = 80, cy = 85, r = 60;
  const nx = cx + r * Math.cos(rad);
  const ny = cy + r * Math.sin(rad);

  const color = value > 85 ? '#ef4444' : value > 70 ? '#f59e0b' : '#00FFC2';

  // Arc path helper
  const arcPath = (startDeg, endDeg, col, strokeW = 8) => {
    const s = (startDeg * Math.PI) / 180;
    const e = (endDeg * Math.PI) / 180;
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return (
      <path
        d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
        fill="none" stroke={col} strokeWidth={strokeW}
        strokeLinecap="round" />
    );
  };

  return (
    <svg width="160" height="110" style={{ overflow: 'visible' }}>
      {/* Track */}
      {arcPath(-210, 30, '#1e2938', 8)}
      {/* Green zone */}
      {arcPath(-210, -210 + 0.5 * 240, '#00FFC2', 8)}
      {/* Yellow zone */}
      {arcPath(-210 + 0.5 * 240, -210 + 0.75 * 240, '#f59e0b', 8)}
      {/* Red zone */}
      {arcPath(-210 + 0.75 * 240, 30, '#ef4444', 8)}
      {/* Fill arc */}
      {arcPath(-210, angle, color, 10)}
      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny}
        stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={4} fill={color} />
      {/* Value */}
      <text x={cx} y={cy + 22} textAnchor="middle"
        fill={color} fontSize="18" fontWeight="900"
        fontFamily='"Consolas",monospace'>
        {value.toFixed(1)}
      </text>
      <text x={cx} y={cy + 35} textAnchor="middle"
        fill="#64748b" fontSize="9" fontFamily='"Consolas",monospace'>
        dB(A) OASPL
      </text>
    </svg>
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function AcousticsPanel({ data }) {
  const [weightingMode, setWeightingMode] = useState('Z'); // Z = unweighted, A = A-weighted
  const [activeView, setActiveView] = useState('SPECTRUM'); // SPECTRUM | OCTAVE | TREND

  // ── Derived data ─────────────────────────
  const { spectrum, octaveBands, oasplA, oasplZ } = useMemo(() => {
    if (!data) return { spectrum: [], octaveBands: [], oasplA: 0, oasplZ: 0 };

    // Full narrowband spectrum with A-weighting option
    const spectrum = data.spectrum_freq.map((freq, i) => {
      const raw = data.spectrum_db[i];
      const weighted = raw + aWeight(freq);
      return {
        freq,
        raw: Number(raw.toFixed(2)),
        aWeighted: Number(weighted.toFixed(2)),
        display: weightingMode === 'A' ? Number(weighted.toFixed(2)) : Number(raw.toFixed(2)),
      };
    });

    // 1/3-Octave band summation
    const octaveBands = OCTAVE_BANDS.map(fc => {
      const fl = fc / Math.pow(2, 1 / 6);
      const fu = fc * Math.pow(2, 1 / 6);
      const inBand = spectrum.filter(s => s.freq >= fl && s.freq < fu);
      if (!inBand.length) return { freq: fc, spl: 0, aWeighted: 0 };
      // Power-sum (dB addition)
      const sumRaw = 10 * Math.log10(inBand.reduce((acc, s) => acc + Math.pow(10, s.raw / 10), 0));
      const sumA = 10 * Math.log10(inBand.reduce((acc, s) => acc + Math.pow(10, s.aWeighted / 10), 0));
      return {
        freq: fc,
        label: fc >= 1000 ? `${fc / 1000}k` : `${fc}`,
        spl: Number(sumRaw.toFixed(1)),
        aWeighted: Number(sumA.toFixed(1)),
        display: weightingMode === 'A' ? Number(sumA.toFixed(1)) : Number(sumRaw.toFixed(1)),
      };
    }).filter(b => b.spl > 0);

    // OASPL
    const oasplZ = 10 * Math.log10(
      spectrum.reduce((acc, s) => acc + Math.pow(10, s.raw / 10), 0)
    );
    const oasplA = 10 * Math.log10(
      spectrum.reduce((acc, s) => acc + Math.pow(10, s.aWeighted / 10), 0)
    );

    return { spectrum, octaveBands, oasplA: Number(oasplA.toFixed(1)), oasplZ: Number(oasplZ.toFixed(1)) };
  }, [data, weightingMode]);

  const peakFreq = data?.peak_frequency_hz ?? 0;
  const displayOASPL = weightingMode === 'A' ? oasplA : oasplZ;

  // ── Noise category ─────────────────────────
  const noiseCategory = displayOASPL > 85 ? { label: 'LOUD — URBAN RESTRICTED', color: '#ef4444' }
    : displayOASPL > 70 ? { label: 'MODERATE — REVIEW REQUIRED', color: '#f59e0b' }
    : { label: 'QUIET — UAM COMPLIANT', color: '#00FFC2' };

  if (!data) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: '12px',
        color: '#64748b', fontFamily: '"Consolas",monospace'
      }}>
        <div style={{ fontSize: '2rem', opacity: 0.3 }}>〜</div>
        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '2px' }}>
          Awaiting Acoustic Simulation
        </div>
        <div style={{ fontSize: '0.65rem', color: '#374151' }}>
          Set velocity &gt; 0 m/s in planform config
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column', gap: '12px',
      fontFamily: '"Consolas",monospace',
    }}>

      {/* ── TOP ROW: Gauge + KPIs ── */}
      <div style={{ display: 'flex', gap: '12px', flexShrink: 0 }}>

        {/* OASPL Gauge */}
        <div style={{
          background: '#0d1117', border: '1px solid #1e2938',
          borderRadius: '8px', padding: '12px 16px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          minWidth: '170px',
        }}>
          <div style={{ fontSize: '0.55rem', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '6px' }}>
            Overall SPL
          </div>
          <OASPLGauge value={displayOASPL} />
          <div style={{
            marginTop: '4px', fontSize: '0.6rem', padding: '3px 8px',
            borderRadius: '4px', background: `${noiseCategory.color}15`,
            border: `1px solid ${noiseCategory.color}40`,
            color: noiseCategory.color, textAlign: 'center',
          }}>
            {noiseCategory.label}
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {[
            { label: 'OASPL (Z)', val: `${oasplZ} dB`, color: '#8b949e' },
            { label: 'OASPL (A)', val: `${oasplA} dB(A)`, color: '#00FFC2' },
            { label: 'PEAK FREQUENCY', val: `${peakFreq >= 1000 ? (peakFreq / 1000).toFixed(1) + ' kHz' : peakFreq + ' Hz'}`, color: '#f59e0b' },
            { label: 'PEAK SPL', val: `${data.overall_spl_db?.toFixed(1)} dB`, color: '#ef4444' },
            { label: 'DOMINANT BAND', val: peakFreq >= 1000 ? 'HIGH-FREQ TE' : 'LOW-FREQ', color: '#a855f7' },
            { label: 'NOISE MODEL', val: 'BPM / TE SELF', color: '#007AFF' },
          ].map((k, i) => (
            <div key={i} style={{
              background: '#0d1117', border: '1px solid #1e2938',
              borderRadius: '6px', padding: '8px 10px',
            }}>
              <div style={{ fontSize: '0.5rem', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '3px' }}>
                {k.label}
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: k.color }}>
                {k.val}
              </div>
            </div>
          ))}
        </div>

        {/* Weighting toggle */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '6px',
          justifyContent: 'center', minWidth: '80px',
        }}>
          <div style={{ fontSize: '0.5rem', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>
            WEIGHTING
          </div>
          {['Z', 'A'].map(w => (
            <button key={w} onClick={() => setWeightingMode(w)} style={{
              background: weightingMode === w ? 'rgba(0,122,255,0.15)' : 'transparent',
              border: `1px solid ${weightingMode === w ? '#007AFF' : '#21262d'}`,
              borderRadius: '4px', color: weightingMode === w ? '#007AFF' : '#4b5563',
              fontFamily: '"Consolas",monospace', fontSize: '0.75rem',
              fontWeight: 700, padding: '6px 0', cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              {w}-WT
            </button>
          ))}
        </div>
      </div>

      {/* ── SUB-TAB BAR ── */}
      <div style={{
        display: 'flex', gap: '2px',
        background: '#0d1117', border: '1px solid #1e2938',
        borderRadius: '6px', padding: '3px', flexShrink: 0,
      }}>
        {['SPECTRUM', 'OCTAVE', 'A-WEIGHT'].map(v => (
          <button key={v} onClick={() => setActiveView(v)} style={{
            flex: 1,
            background: activeView === v ? '#1e2938' : 'transparent',
            border: 'none', borderRadius: '4px',
            color: activeView === v ? '#e2e8f0' : '#4b5563',
            fontFamily: '"Consolas",monospace', fontSize: '0.6rem',
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
            padding: '5px 0', cursor: 'pointer', transition: 'all 0.15s',
          }}>
            {v}
          </button>
        ))}
      </div>

      {/* ── CHARTS ── */}
      <div style={{ flex: 1, minHeight: 0 }}>

        {/* NARROWBAND SPECTRUM */}
        {activeView === 'SPECTRUM' && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spectrum} margin={{ top: 8, right: 16, left: 0, bottom: 30 }}>
              <defs>
                <linearGradient id="specGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
              <XAxis
                dataKey="freq"
                stroke="#4b5563"
                tick={{ fill: '#4b5563', fontSize: 9, fontFamily: '"Consolas",monospace' }}
                tickFormatter={v => v >= 1000 ? `${v / 1000}k` : `${v}`}
                label={{ value: 'Frequency (Hz)', position: 'insideBottom', offset: -20, fill: '#4b5563', fontSize: 10 }}
              />
              <YAxis
                stroke="#4b5563"
                tick={{ fill: '#4b5563', fontSize: 9, fontFamily: '"Consolas",monospace' }}
                domain={[0, 'auto']}
                label={{ value: `SPL dB${weightingMode === 'A' ? '(A)' : ''}`, angle: -90, position: 'insideLeft', fill: '#4b5563', fontSize: 10 }}
              />
              <Tooltip content={<AeroTooltip />} />
              <ReferenceLine x={peakFreq} stroke="rgba(245,158,11,0.6)" strokeDasharray="4 4"
                label={{ value: 'PEAK', fill: '#f59e0b', fontSize: 9, fontFamily: '"Consolas",monospace' }} />
              <Area type="monotone" dataKey="display" name={`SPL dB${weightingMode === 'A' ? '(A)' : ''}`}
                stroke="#ef4444" strokeWidth={1.5} fill="url(#specGrad)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* 1/3-OCTAVE BAR CHART */}
        {activeView === 'OCTAVE' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={octaveBands} margin={{ top: 8, right: 16, left: 0, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
              <XAxis dataKey="label" stroke="#4b5563"
                tick={{ fill: '#4b5563', fontSize: 9, fontFamily: '"Consolas",monospace' }}
                label={{ value: '1/3-Octave Band Centre (Hz)', position: 'insideBottom', offset: -20, fill: '#4b5563', fontSize: 10 }} />
              <YAxis stroke="#4b5563" tick={{ fill: '#4b5563', fontSize: 9, fontFamily: '"Consolas",monospace' }}
                label={{ value: `SPL dB${weightingMode === 'A' ? '(A)' : ''}`, angle: -90, position: 'insideLeft', fill: '#4b5563', fontSize: 10 }} />
              <Tooltip content={<AeroTooltip />} />
              <Bar dataKey="display" name={`SPL dB${weightingMode === 'A' ? '(A)' : ''}`} radius={[2, 2, 0, 0]} isAnimationActive={false}>
                {octaveBands.map((entry, i) => {
                  const v = entry.display;
                  const col = v > 85 ? '#ef4444' : v > 75 ? '#f59e0b' : v > 60 ? '#007AFF' : '#00FFC2';
                  return <Cell key={i} fill={col} fillOpacity={0.85} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* A-WEIGHTING COMPARISON */}
        {activeView === 'A-WEIGHT' && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={octaveBands} margin={{ top: 8, right: 16, left: 0, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
              <XAxis dataKey="label" stroke="#4b5563"
                tick={{ fill: '#4b5563', fontSize: 9, fontFamily: '"Consolas",monospace' }}
                label={{ value: '1/3-Octave Band', position: 'insideBottom', offset: -20, fill: '#4b5563', fontSize: 10 }} />
              <YAxis stroke="#4b5563" tick={{ fill: '#4b5563', fontSize: 9, fontFamily: '"Consolas",monospace' }} />
              <Tooltip content={<AeroTooltip />} />
              <Line type="monotone" dataKey="spl" name="Z-weighted (dB)" stroke="#8b949e" strokeWidth={1.5}
                dot={false} strokeDasharray="5 4" isAnimationActive={false} />
              <Line type="monotone" dataKey="aWeighted" name="A-weighted dB(A)" stroke="#00FFC2" strokeWidth={2.5}
                dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── FOOTNOTE ── */}
      <div style={{ fontSize: '0.55rem', color: '#374151', textAlign: 'center', flexShrink: 0, paddingBottom: '2px' }}>
        * Self-noise modelled via Brooks-Pope-Marcolini (BPM) method — trailing edge, TBL-TE dominant source
        {' · '}A-weighting per IEC 61672-1
      </div>
    </div>
  );
}