'use client';
import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

export default function SensitivityChart({ sweepData }) {
    const chartData = useMemo(() => {
        if (!sweepData?.results || sweepData.results.length < 3) return null;
        const r = sweepData.results;
        const midIdx = Math.floor(r.length / 2);
        const baseline = r[midIdx];

        return r.map((pt) => ({
            param: pt.param_value.toFixed(3),
            delta_cl: (pt.cl - baseline.cl) * 100,
            delta_cd: (pt.cd - baseline.cd) * 10000,
            ld: pt.ld,
        }));
    }, [sweepData]);

    if (!chartData) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: '#4b5563', fontFamily: 'monospace', fontSize: 13
            }}>
                Run a sensitivity sweep to view tornado analysis
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 15 }}>
            <div style={{ fontSize: 12, color: '#38bdf8', fontWeight: 700, marginBottom: 10 }}>
                SENSITIVITY — {sweepData.sweep_param?.toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
                <ResponsiveContainer width="100%" height="48%">
                    <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="param" tick={{ fill: '#64748b', fontSize: 9 }}
                               label={{ value: sweepData.sweep_param, fill: '#8b949e', fontSize: 10, dy: 15 }} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 9 }}
                               label={{ value: 'ΔCL (×100)', angle: -90, fill: '#38bdf8', fontSize: 10, dx: -10 }} />
                        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #30363d', fontSize: 11 }} />
                        <ReferenceLine y={0} stroke="#334155" />
                        <Bar dataKey="delta_cl" name="ΔCL" radius={[3, 3, 0, 0]}>
                            {chartData.map((entry, i) => (
                                <Cell key={i} fill={entry.delta_cl >= 0 ? '#22c55e' : '#ef4444'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height="48%">
                    <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="param" tick={{ fill: '#64748b', fontSize: 9 }} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 9 }}
                               label={{ value: 'ΔCD (×10⁴)', angle: -90, fill: '#f59e0b', fontSize: 10, dx: -10 }} />
                        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #30363d', fontSize: 11 }} />
                        <ReferenceLine y={0} stroke="#334155" />
                        <Bar dataKey="delta_cd" name="ΔCD" radius={[3, 3, 0, 0]}>
                            {chartData.map((entry, i) => (
                                <Cell key={i} fill={entry.delta_cd <= 0 ? '#22c55e' : '#ef4444'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}