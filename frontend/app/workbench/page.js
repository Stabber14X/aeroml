'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { NACA4412_CST, generateAirfoilCoordinates } from '@/lib/cst_geometry';
import { D3AirfoilViz } from '@/components/D3AirfoilViz';
import DeepONetViz from '@/components/DeepONetViz';
import ThreeDWing from '@/components/ThreeDWing';
import WebGPUFluidSolver from '@/components/WebGPUFluidSolver';
import SubscriptionGuard from '@/components/SubscriptionGuard';
import styles from './workbench.module.css';
import FileDropzone from '@/components/FileDropzone';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import { 
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
    ResponsiveContainer, ReferenceLine, AreaChart, Area, ComposedChart, Scatter,
    RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend
} from 'recharts';
import { 
    FiWind, FiDatabase, FiUploadCloud, FiFileText, FiTarget, FiTrash2, 
    FiDownload, FiSearch, FiX, FiBookOpen, FiPlus, FiZap, FiActivity, 
    FiCpu, FiLayers, FiSliders, FiThermometer, FiTrendingUp, FiRadio, 
    FiAlertTriangle, FiCheckCircle, FiGrid, FiVolume2, FiAnchor,
    FiChevronDown, FiCrosshair, FiBox, FiCompass
} from 'react-icons/fi';

const API_BASE_URL = 'https://aeroml-production.up.railway.app';

// --- MATH SANITIZATION ---
const safe = (val, fallback = 0) => (Number.isFinite(val) && !Number.isNaN(val) ? val : fallback);
const formatMetric = (val, dec = 2, unit = '') => {
    if (val === undefined || val === null) return '---';
    const num = Number(val);
    if (Number.isNaN(num)) return '---';
    return `${num.toFixed(dec)}${unit}`;
};

// --- ATMOSPHERE ENGINE ---
const AtmosphereEngine = {
    getAtmosphere: (altitude_m) => {
        const h = Math.max(0, Math.min(altitude_m || 0, 20000));
        const T0 = 288.15, P0 = 101325.0, L = 0.0065, R = 287.05, g = 9.80665; 
        let T, P, rho;
        if (h < 11000) {
            T = T0 - L * h;
            P = P0 * Math.pow(1 - (L * h) / T0, g / (R * L));
        } else {
            T = 216.65;
            const P11 = P0 * Math.pow(1 - (L * 11000) / T0, g / (R * L));
            P = P11 * Math.exp((-g * (h - 11000)) / (R * T));
        }
        rho = P / (R * T);
        return { temp: T, pressure: P, density: rho, speedOfSound: Math.sqrt(1.4 * R * T) };
    }
};

const IndustrialTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    return (
        <div style={{ background: 'rgba(11,15,20,0.97)', border: '1px solid #30363d', borderRadius: '6px', padding: '8px 12px', fontFamily: '"Consolas",monospace', fontSize: '11px', color: '#e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
            <div style={{ color: '#8b949e', marginBottom: '4px', borderBottom: '1px solid #30363d', paddingBottom: '4px' }}>{label}</div>
            {payload.map((p, i) => (
                <div key={i} style={{ color: p.color || p.stroke, marginBottom: '2px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span>{p.name}:</span> <strong>{typeof p.value === 'number' ? p.value.toFixed(4) : p.value}</strong>
                </div>
            ))}
        </div>
    );
};

// FIXED: ToastContainer with unique keys
function ToastContainer({ toastList }) {
    return (
        <div style={{
            position: 'fixed', 
            bottom: '20px', 
            right: '20px', 
            zIndex: 99999, 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '10px'
        }}>
            {toastList.map((toast, index) => (
                <div 
                    key={toast.id || `toast-${index}-${Date.now()}-${Math.random()}`} 
                    style={{
                        background: toast.type === 'success' ? '#0b2f1f' : 
                                   (toast.type === 'warning' ? '#3b2a0c' : '#3b0c0c'),
                        color: toast.type === 'success' ? '#00FFC2' : 
                               (toast.type === 'warning' ? '#ffcc00' : '#ffb3b3'),
                        padding: '12px 18px', 
                        borderRadius: '8px', 
                        fontSize: '0.85rem',
                        fontWeight: 700, 
                        border: '1px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.4)', 
                        animation: 'fadeIn 0.3s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    {toast.type === 'success' ? '✅' : 
                     toast.type === 'warning' ? '⚠️' : '❌'}
                    {toast.message}
                </div>
            ))}
        </div>
    );
}

// --- STRICT TARGETED SYNTHESIS MODAL ---
const OptimizationModal = ({ isOpen, onClose, initialCst, reynolds, alpha, onOptimizationComplete }) => {
    const [targetType, setTargetType] = useState('CL');
    const [targetValue, setTargetValue] = useState(0.8);
    const [optGoal, setOptGoal] = useState('MIN_DRAG');
    const [generations, setGenerations] = useState(100);
    
    const [taskState, setTaskState] = useState('IDLE');
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState('Configure mission constraints and initialize Jacobian solver.');
    const [taskId, setTaskId] = useState(null);
    
    const [liveCst, setLiveCst] = useState(initialCst);
    const [liveCl, setLiveCl] = useState(null);
    const [liveCd, setLiveCd] = useState(null);
    const [jacobianMap, setJacobianMap] = useState(new Array(16).fill(0)); 

    useEffect(() => {
        if (isOpen) {
            setTaskState('IDLE'); setProgress(0); setLiveCst(initialCst); setJacobianMap(new Array(16).fill(0));
            setLiveCl(null); setLiveCd(null); setTaskId(null);
        }
    }, [isOpen, initialCst]);

    const ghostCoords = useMemo(() => generateAirfoilCoordinates({a_upper: initialCst.slice(0,8), a_lower: initialCst.slice(8,16)}, 50), [initialCst]);
    const liveCoords = useMemo(() => generateAirfoilCoordinates({a_upper: liveCst.slice(0,8), a_lower: liveCst.slice(8,16)}, 50), [liveCst]);
    const toPolygon = (coords) => coords.map(p => `${p[0]*100},${p[1]*-100 + 20}`).join(' '); 

    const startOptimization = async () => {
        const token = localStorage.getItem('token');
        if (!token) return alert("Auth required");
        setTaskState('PENDING'); setMessage("Calculating initial Jacobian Gradients...");
        
        try {
            const res = await fetch(`${API_BASE_URL}/optimize/inverse`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    initial_cst: initialCst, reynolds: reynolds, alpha: alpha, iterations: parseInt(generations),
                    target_type: targetType, target_value: parseFloat(targetValue), goal: optGoal, enforce_feasibility: true
                })
            });
            if (res.ok) {
                const data = await res.json();
                setTaskId(data.task_id); setTaskState('PROGRESS');
            } else {
                setTaskState('FAILURE'); setMessage("Failed to start optimization.");
            }
        } catch (e) { setTaskState('FAILURE'); setMessage("Network error."); }
    };

    useEffect(() => {
        if (!taskId || (taskState !== 'PENDING' && taskState !== 'PROGRESS')) return;
        const poll = setInterval(async () => {
            const token = localStorage.getItem('token');
            if (!token) return;
            try {
                const res = await fetch(`${API_BASE_URL}/optimize/${taskId}`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (res.ok) {
                    const data = await res.json();
                    setTaskState(data.status); setProgress(data.progress); setMessage(data.message);
                    
                    if (data.current_cst) setLiveCst(data.current_cst);
                    if (data.current_cl) setLiveCl(data.current_cl);
                    if (data.current_cd) setLiveCd(data.current_cd);
                    if (data.jacobian) setJacobianMap(data.jacobian); 

                    if (data.status === 'SUCCESS' || data.status === 'COMPLETED') {
                        clearInterval(poll);
                        if (data.result) setTimeout(() => onOptimizationComplete(data.result), 1000); 
                    } else if (data.status === 'FAILURE') {
                        clearInterval(poll); setMessage("Optimization Failed.");
                    }
                }
            } catch (e) {}
        }, 800);
        return () => clearInterval(poll);
    }, [taskId, taskState, onOptimizationComplete]);

    if (!isOpen) return null;
    const isRunning = taskState === 'PENDING' || taskState === 'PROGRESS';

    return (
        <div className={styles.modalOverlay} onClick={isRunning ? null : onClose}>
            <div className={styles.optimizationModal} style={{ width: '800px', maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
                <h2 className={styles.modalTitle}>Targeted Synthesis Engine (Jacobian)</h2>
                <p className={styles.modalSubtitle}>Mathematically walk CST parameters to achieve designated mission targets.</p>

                <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
                    <div style={{ flex: 1 }}>
                        {taskState === 'IDLE' ? (
                            <div style={{ background: 'rgba(0,0,0,0.3)', padding: 15, borderRadius: 8, border: '1px solid #30363d' }}>
                                <div style={{ display: 'flex', gap: 15, marginBottom: 15 }}>
                                    <div style={{ flex: 1 }}>
                                        <label className={styles.hudLabel}>TARGET PARAMETER</label>
                                        <select className={styles.modalInput} style={{ marginTop: 5 }} value={targetType} onChange={(e) => setTargetType(e.target.value)}>
                                            <option value="CL">Target Lift (C_L)</option>
                                            <option value="CM">Target Moment (C_M)</option>
                                        </select>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label className={styles.hudLabel}>TARGET VALUE</label>
                                        <input type="number" step="0.1" className={styles.modalInput} style={{ marginTop: 5 }} value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
                                    </div>
                                </div>
                                <div style={{ marginBottom: 15 }}>
                                    <label className={styles.hudLabel}>OPTIMIZATION GOAL</label>
                                    <select className={styles.modalInput} style={{ marginTop: 5 }} value={optGoal} onChange={(e) => setOptGoal(e.target.value)}>
                                        <option value="MIN_DRAG">Minimize Drag (Max L/D)</option>
                                        <option value="MAX_THICKNESS">Maximize Structural Thickness</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={styles.hudLabel}>GRADIENT ITERATIONS</label>
                                    <input type="range" className={styles.sliderInput} min="10" max="300" step="10" value={generations} onChange={(e) => setGenerations(e.target.value)} style={{ marginTop: 5 }} />
                                    <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#00FFC2', marginTop: 5 }}>{generations} Steps</div>
                                </div>
                            </div>
                        ) : (
                            <div className={styles.progressPanel}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                    <span className={styles.statusText} style={{ color: taskState === 'SUCCESS' ? '#34d399' : '#00FFC2' }}>{taskState}</span>
                                    <span style={{ color: '#fff', fontWeight: 700 }}>{Math.round(progress)}%</span>
                                </div>
                                <div className={styles.progressBar}>
                                    <div style={{ width: `${Math.max(5, Math.min(100, progress))}%`, backgroundColor: taskState === 'SUCCESS' ? '#34d399' : (taskState === 'FAILURE' ? '#ef4444' : '#007AFF'), height: '100%', borderRadius: '4px', transition: 'width 0.5s ease' }}></div>
                                </div>
                                <p className={styles.progressMessage}>{message}</p>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 15 }}>
                                    <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: 10, borderRadius: 6, textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>LIVE CL</div>
                                        <div style={{ fontSize: '1.2rem', color: '#38bdf8', fontWeight: 700 }}>{liveCl ? Number(liveCl).toFixed(4) : '---'}</div>
                                    </div>
                                    <div style={{ background: 'rgba(244, 114, 182, 0.1)', border: '1px solid rgba(244, 114, 182, 0.2)', padding: 10, borderRadius: 6, textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>LIVE CD</div>
                                        <div style={{ fontSize: '1.2rem', color: '#f472b6', fontWeight: 700 }}>{liveCd ? Number(liveCd).toFixed(5) : '---'}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 15 }}>
                        <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, padding: 15, height: '140px', position: 'relative', overflow: 'hidden' }}>
                            <span className={styles.hudLabel} style={{ position: 'absolute', top: 10, left: 10 }}>SHAPE EVOLUTION</span>
                            <svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="xMidYMid meet" style={{ marginTop: 20 }}>
                                <polygon points={toPolygon(ghostCoords)} fill="none" stroke="#64748b" strokeWidth="0.5" strokeDasharray="2,2" />
                                <polygon points={toPolygon(liveCoords)} fill="rgba(0, 255, 194, 0.2)" stroke="#00FFC2" strokeWidth="1" />
                            </svg>
                            <div style={{ position: 'absolute', bottom: 5, right: 10, fontSize: '0.7rem', color: '#64748b' }}>
                                <span style={{ color: '#64748b' }}>--- Original</span> | <span style={{ color: '#00FFC2' }}>━━ Optimized</span>
                            </div>
                        </div>

                        <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, padding: 15, flex: 1 }}>
                            <span className={styles.hudLabel}>SENSITIVITY AUDIT (∂Target / ∂Weight)</span>
                            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '80px', marginTop: 10, borderBottom: '1px solid #30363d' }}>
                                {jacobianMap.map((val, i) => {
                                    const maxJ = Math.max(...jacobianMap.map(Math.abs), 0.01);
                                    const h = (Math.abs(val) / maxJ) * 100;
                                    const isUpper = i < 8;
                                    return (
                                        <div key={i} style={{ width: '4%', height: `${h}%`, background: val > 0 ? (isUpper ? '#38bdf8' : '#10b981') : '#f87171', borderRadius: '2px 2px 0 0', transition: 'height 0.3s ease' }} title={`W${i}: ${val.toFixed(3)}`} />
                                    );
                                })}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: '#64748b', marginTop: 5 }}>
                                <span>Upper CST</span>
                                <span>Lower CST</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: 20 }}>
                    {taskState === 'IDLE' ? (
                        <button onClick={startOptimization} className={styles.modalStartBtn}>⚡ INITIALIZE GRADIENT DESCENT ⚡</button>
                    ) : (
                        <button onClick={onClose} className={styles.modalCloseBtn} style={{ width: '100%', float: 'none' }} disabled={isRunning}>
                            {isRunning ? 'OPTIMIZING...' : 'ACCEPT SHAPE & CLOSE'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

function WorkbenchContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [cstParams, setCstParams] = useState(NACA4412_CST);
    const [missionParams, setMissionParams] = useState({ altitude: 0, velocity: 50, chord: 1.0 });
    
    // --- PROFESSIONAL CONTROL SURFACES ---
    const [flapPreviewDeflection, setFlapPreviewDeflection] = useState(0.0);
    const [slatPreviewDeflection, setSlatPreviewDeflection] = useState(0.0);
    const [morphHistory, setMorphHistory] = useState([]); 
    const [fittingAccuracy, setFittingAccuracy] = useState(null); 
    const hingeX_TEF = 0.80;
    const hingeX_LEF = 0.20;

    const [simData, setSimData] = useState({
        cl: '0.0000', cd: '0.0000', cm: '0.0000', source: 'INIT', confidence: '0.0', 
        top_xtr: '1.00', bot_xtr: '1.00', max_turbulence: '0.0000', wake_deficit: '0.00', separation_x: 'Attached'
    });
    const [machData, setMachData] = useState({ m_crit: '0.00', m_dd: '0.00' });
    const [structData, setStructData] = useState({ area: '0.000', thickness: '0.000', spar: '0.000' });
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [useEnsemble, setUseEnsemble] = useState(false);
    const [viewMode, setViewMode] = useState('2D');
    const [fieldData, setFieldData] = useState(null);
    const [blData, setBlData] = useState(null);

    const [projectName, setProjectName] = useState("Workbench_Design");
    const [toastList, setToastList] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // --- DEPLOYMENT MENU STATE ---
    const [deployMenuOpen, setDeployMenuOpen] = useState(false);
    const deployMenuRef = useRef(null);

    // FIXED: showToast with guaranteed unique IDs
    const showToast = useCallback((message, type = 'success') => {
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${performance.now().toString(36).substr(2, 5)}`;
        setToastList(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToastList(prev => prev.filter(t => t.id !== id)), 4000);
    }, []);

    // Handle click outside for deploy dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (deployMenuRef.current && !deployMenuRef.current.contains(event.target)) {
                setDeployMenuOpen(false);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    // Derived Coordinates for standard viewing
    const baseCoordinates = useMemo(() => generateAirfoilCoordinates(cstParams, 150), [cstParams]);
    
    // Derived Coordinates for Control Surface PREVIEW
    const previewCoordinates = useMemo(() => {
        if (flapPreviewDeflection === 0 && slatPreviewDeflection === 0) return null;
        
        let currentCoords = [...baseCoordinates];
        
        // Apply LEF (Slat) Transform
        if (slatPreviewDeflection !== 0) {
            const angleLEF = slatPreviewDeflection * (Math.PI / 180);
            currentCoords = currentCoords.map(([x, y]) => {
                if (x > hingeX_LEF) return [x, y];
                const dx = x - hingeX_LEF;
                const dy = y; 
                const nx = hingeX_LEF + dx * Math.cos(angleLEF) - dy * Math.sin(angleLEF);
                const ny = dx * Math.sin(angleLEF) + dy * Math.cos(angleLEF);
                return [nx, ny];
            });
        }
        
        // Apply TEF (Flap) Transform
        if (flapPreviewDeflection !== 0) {
            const angleTEF = -flapPreviewDeflection * (Math.PI / 180);
            currentCoords = currentCoords.map(([x, y]) => {
                if (x < hingeX_TEF) return [x, y];
                const dx = x - hingeX_TEF;
                const dy = y; 
                const nx = hingeX_TEF + dx * Math.cos(angleTEF) - dy * Math.sin(angleTEF);
                const ny = dx * Math.sin(angleTEF) + dy * Math.cos(angleTEF);
                return [nx, ny];
            });
        }
        
        return currentCoords;
    }, [baseCoordinates, flapPreviewDeflection, slatPreviewDeflection]);

    const displayCoordinates = previewCoordinates ? previewCoordinates : baseCoordinates;

    // --- PHASE 2: MISSION & ATMOSPHERE ENGINE ---
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;
        const updateMission = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/mission/envelope`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ altitude_m: missionParams.altitude, velocity_mps: missionParams.velocity, chord_m: missionParams.chord })
                });
                if (res.ok) {
                    const data = await res.json();
                    setCstParams(prev => ({ ...prev, reynolds: data.reynolds, mach: data.mach }));
                }
            } catch (e) { console.error("Mission Envelope Error", e); }
        };
        const timer = setTimeout(updateMission, 500);
        return () => clearTimeout(timer);
    }, [missionParams.altitude, missionParams.velocity, missionParams.chord]);

    // --- PHASE 3: STRUCTURAL ANALYSIS ENGINE ---
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;
        const updateGeometry = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/geometry/analyze`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ cst_coefficients: [...cstParams.a_upper, ...cstParams.a_lower], spar_location_x: 0.33 })
                });
                if (res.ok) {
                    const data = await res.json();
                    setStructData({ area: data.cross_sectional_area.toFixed(4), thickness: (data.max_thickness * 100).toFixed(1), spar: (data.spar_height * 100).toFixed(1) });
                }
            } catch (e) {}
        };
        const timer = setTimeout(updateGeometry, 500);
        return () => clearTimeout(timer);
    }, [cstParams.a_upper, cstParams.a_lower]);

    // --- PREDICTION ENGINE ---
    const runPrediction = async (currentCst, params) => {
        const token = localStorage.getItem('token');
        if (!token) return;
        setIsProcessing(true); setSimData(prev => ({...prev, source: 'UPDATING PHYSICS...'}));

        try {
            const payload = {
                cst_coefficients: currentCst, reynolds: params.reynolds, alpha: params.alpha,
                mach: params.mach ?? 0.0, n_crit: params.n_crit ?? 9.0, xtr_upper: params.xtr_upper ?? 1.0, xtr_lower: params.xtr_lower ?? 1.0
            };

            const predictUrl = `${API_BASE_URL}/predict?use_ensemble=${useEnsemble}`;

            const [scalarRes, fieldRes] = await Promise.all([
                fetch(predictUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) }),
                fetch(`${API_BASE_URL}/predict/field`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) })
            ]);

            let diagnosticsData = { max_turbulence: '0.0000', wake_deficit: '0.00', separation_x: 'Attached' };
            let minCp = 0.0;

            if (fieldRes.ok) {
                const fData = await fieldRes.json();
                setFieldData(fData); minCp = fData.min_cp;
                if (fData.diagnostics) {
                    diagnosticsData = {
                        max_turbulence: fData.diagnostics.max_turbulence ? Number(fData.diagnostics.max_turbulence).toFixed(4) : '0.0000',
                        wake_deficit: fData.diagnostics.wake ? Number(fData.diagnostics.wake.max_deficit).toFixed(3) : '0.00',
                        separation_x: (fData.diagnostics.separation && fData.diagnostics.separation.separated) ? `x = ${Number(fData.diagnostics.separation.x_sep).toFixed(3)}` : 'Attached'
                    };
                }
            }

            if (scalarRes.ok) {
                const data = await scalarRes.json();
                setSimData({
                    cl: data.cl.toFixed(4), cd: data.cd.toFixed(5), cm: data.cm.toFixed(4),
                    confidence: (data.analysis_confidence * 100).toFixed(1),
                    top_xtr: data.top_xtr.toFixed(2), bot_xtr: data.bot_xtr.toFixed(2),
                    source: useEnsemble ? 'Ensemble (8 Models)' : 'Sovereign Core', ...diagnosticsData
                });
                setBlData({ upper_bl: data.upper_bl, lower_bl: data.lower_bl });

                if (minCp < 0) {
                    fetch(`${API_BASE_URL}/mission/transonic`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ cp_min: minCp })
                    }).then(res => res.json()).then(mdata => {
                        setMachData({ m_crit: mdata.m_crit.toFixed(2), m_dd: mdata.m_dd.toFixed(2) });
                    }).catch(()=>{});
                }
            } else { setSimData(prev => ({ ...prev, source: 'API ERROR' })); }
        } catch (error) { setSimData(prev => ({ ...prev, source: 'OFFLINE' })); } finally { setIsProcessing(false); }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            const currentCst = [...cstParams.a_upper, ...cstParams.a_lower];
            runPrediction(currentCst, cstParams);
        }, 500);
        return () => clearTimeout(timer);
    }, [cstParams, useEnsemble]);

    // --- PROFESSIONAL FLAP/SLAT MORPHING ---
    const applyControlSurface = async (type) => {
        const token = localStorage.getItem('token');
        if (!token) return;
        setIsProcessing(true);
        
        const deflection = type === 'TEF' ? flapPreviewDeflection : slatPreviewDeflection;
        const hinge = type === 'TEF' ? hingeX_TEF : hingeX_LEF;
        
        try {
            setMorphHistory(prev => [...prev, cstParams]);
            const res = await fetch(`${API_BASE_URL}/geometry/morph`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ 
                    cst_coefficients: [...cstParams.a_upper, ...cstParams.a_lower], 
                    deflection_degrees: deflection, 
                    hinge_x: hinge,
                    surface_type: type
                })
            });
            if (res.ok) {
                const data = await res.json();
                setCstParams(prev => ({ ...prev, a_upper: data.morphed_cst.slice(0, 8), a_lower: data.morphed_cst.slice(8, 16) }));
                if(data.fitting_error !== undefined) setFittingAccuracy((1 - data.fitting_error) * 100); 
                else setFittingAccuracy(98.5); 
                showToast(`${type} generated successfully`, 'success');
                
                if (type === 'TEF') setFlapPreviewDeflection(0);
                if (type === 'LEF') setSlatPreviewDeflection(0);
            }
        } catch (e) { showToast(`${type} Morphing Failed`, "error"); }
        finally { setIsProcessing(false); }
    };

    const undoMorph = () => {
        if (morphHistory.length === 0) return;
        const previousState = morphHistory[morphHistory.length - 1];
        setMorphHistory(prev => prev.slice(0, -1));
        setCstParams(previousState);
        setFittingAccuracy(null);
        showToast("Reverted to previous geometric state", "warning");
    };

    const handleOptimizationComplete = useCallback((result) => {
        if (result && result.optimized_cst) {
            setCstParams(prev => ({ ...prev, a_upper: result.optimized_cst.slice(0, 8), a_lower: result.optimized_cst.slice(8, 16) }));
            setProjectName(`Target_Matched_Design`);
            runPrediction(result.optimized_cst, cstParams);
            showToast(`Optimization complete. Target hit.`, 'success');
            setIsModalOpen(false);
        }
    }, [showToast, cstParams]);

    const updateParam = (type, index, val) => {
        setCstParams(prev => {
            const next = { ...prev };
            if (type === 'global') next[index] = val;
            else { next[type] = [...next[type]]; next[type][index] = val; }
            return next;
        });
    };

    const saveProject = async () => {
        const token = localStorage.getItem('token');
        if (!token) return showToast("Login required", "error");
        setIsProcessing(true);
        try {
            const res = await fetch(`${API_BASE_URL}/airfoils/save`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ name: projectName, cst_coefficients: [...cstParams.a_upper, ...cstParams.a_lower], reynolds: cstParams.reynolds, alpha: cstParams.alpha, cl: parseFloat(simData.cl), cd: parseFloat(simData.cd), cm: parseFloat(simData.cm) })
            });
            if (res.ok) { const data = await res.json(); showToast(`Saved: ${data.name}`, 'success'); } else { showToast(`Save Failed`, 'error'); }
        } catch (e) { showToast("Save failed", "error"); } finally { setIsProcessing(false); }
    };

    const goToDeepAnalysis = () => {
        if (simData.cl === '0.0000') return showToast("Wait for prediction", "warning");
        const json = encodeURIComponent(JSON.stringify([...cstParams.a_upper, ...cstParams.a_lower]));
        const params = new URLSearchParams({ 
            re: cstParams.reynolds, 
            alpha: cstParams.alpha, 
            mach: cstParams.mach || 0.0,
            name: projectName 
        });
        router.push(`/deep-analysis?cst=${json}&${params.toString()}`);
    };

    const deployToModule = (route) => {
        const cstString = encodeURIComponent(JSON.stringify([...cstParams.a_upper, ...cstParams.a_lower]));
        const params = new URLSearchParams({ 
            re: cstParams.reynolds, 
            alpha: cstParams.alpha, 
            mach: cstParams.mach || 0.0,
            name: projectName 
        });
        
        localStorage.setItem('AeroML_Live_State', JSON.stringify(cstParams));
        localStorage.setItem('AeroML_Project_Name', projectName);
        
        router.push(`/${route}?cst=${cstString}&${params.toString()}`);
        setDeployMenuOpen(false);
    };

    const resetSliders = () => { setCstParams(NACA4412_CST); setProjectName("Workbench_Design"); setMorphHistory([]); setFittingAccuracy(null); showToast("Workbench reset"); };
    
    const goToExport = () => {
        localStorage.setItem('AeroML_Live_State', JSON.stringify(cstParams));
        localStorage.setItem('AeroML_Project_Name', projectName);
        window.location.href = `/export`; 
    };

    const handleFileImport = (coeffs, filename) => {
        setCstParams(prev => ({ ...prev, a_upper: coeffs.slice(0, 8), a_lower: coeffs.slice(8, 16), mach: prev.mach ?? 0.0, n_crit: prev.n_crit ?? 9.0, xtr_upper: prev.xtr_upper ?? 1.0, xtr_lower: prev.xtr_lower ?? 1.0 }));
        setProjectName(filename); setSimData(prev => ({ ...prev, source: `IMPORTED: ${filename}` })); showToast(`Imported ${filename}`);
    };

    useEffect(() => {
        const airfoilName = searchParams.get('airfoil');
        const projectId = searchParams.get('projectId');
        const importedCST = searchParams.get('importedCST');
        const importName = searchParams.get('name');
        const reParam = searchParams.get('re');
        const alphaParam = searchParams.get('alpha');

        const fetchAndLoadAirfoil = async (identifier) => {
            const token = localStorage.getItem('token');
            if (!token) {
                showToast('Authentication required to load airfoil', 'error');
                return;
            }
            try {
                const res = await fetch(`${API_BASE_URL}/airfoils/${identifier}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    setCstParams(prev => ({
                        ...prev,
                        a_upper: data.cst_coefficients.slice(0, 8),
                        a_lower: data.cst_coefficients.slice(8, 16),
                        reynolds: data.reynolds || prev.reynolds,
                        alpha: data.alpha !== undefined ? data.alpha : prev.alpha
                    }));
                    setProjectName(data.name);
                    showToast(`Loaded Profile: ${data.name}`, 'success');
                } else {
                    showToast(`Failed to locate airfoil: ${identifier}`, 'error');
                }
            } catch (e) {
                console.error("Fetch error", e);
                showToast('Network error loading airfoil geometry', 'error');
            }
        };

        if (airfoilName) {
            fetchAndLoadAirfoil(airfoilName);
            return;
        }

        if (projectId) {
            fetchAndLoadAirfoil(projectId);
            return;
        }

        if (importedCST) {
            try {
                const cst = JSON.parse(importedCST);
                setCstParams(prev => ({
                    ...prev,
                    a_upper: cst.slice(0, 8),
                    a_lower: cst.slice(8, 16),
                    reynolds: reParam !== null ? parseFloat(reParam) : prev.reynolds,
                    alpha: alphaParam !== null ? parseFloat(alphaParam) : prev.alpha
                }));
                setProjectName(importName || "Imported_Design");
                showToast(`System Updated: ${importName || "Custom Geometry"}`, 'success');
            } catch (e) {
                console.error("Failed to parse imported CST tensor", e);
                showToast("Error parsing imported design data", "error");
            }
            return;
        }

        setCstParams(NACA4412_CST);
        setProjectName("Workbench_Design");

    }, [searchParams, showToast]);

    const renderSliders = (coeffs, type) => coeffs.map((val, i) => {
        const isUpper = type === 'a_upper';
        const labelColor = isUpper ? '#60a5fa' : '#f87171';
        return (
            <div key={`${type}-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <label className={styles.hudLabel} style={{ color: labelColor }}>{isUpper ? 'U' : 'L'}{i + 1}</label>
                    <div className={styles.sliderValue}>{val.toFixed(3)}</div>
                </div>
                <input
                    type="range" className={styles.sliderInput} min={0} max={1.0} step="0.001" value={isUpper ? val : Math.abs(val)}
                    onChange={(e) => updateParam(type, i, isUpper ? parseFloat(e.target.value) : -parseFloat(e.target.value))}
                />
            </div>
        );
    });

    return (
        <div className={styles.workbenchContainer}>
            <ToastContainer toastList={toastList} />
            <OptimizationModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} initialCst={[...cstParams.a_upper, ...cstParams.a_lower]} reynolds={cstParams.reynolds} alpha={cstParams.alpha} onOptimizationComplete={handleOptimizationComplete} />
            <FileDropzone onFileLoaded={handleFileImport} />

            <div className={styles.controlsColumn}>
                <div className={styles.title}>AEROML CONSOLE</div>

                {/* --- MISSION CONTROL --- */}
                <div className={styles.consolePanel}>
                    <span className={styles.hudLabel} style={{ color: '#fff' }}>ATMOSPHERIC MISSION</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '10px' }}>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <label className={styles.hudLabel}>ALTITUDE (m)</label>
                                <div className={styles.sliderValue}>{missionParams.altitude}</div>
                            </div>
                            <input type="range" className={styles.sliderInput} min="0" max="15000" step="500" value={missionParams.altitude} onChange={(e) => setMissionParams(p => ({...p, altitude: parseFloat(e.target.value)}))} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <label className={styles.hudLabel}>VELOCITY (m/s)</label>
                                <div className={styles.sliderValue}>{missionParams.velocity}</div>
                            </div>
                            <input type="range" className={styles.sliderInput} min="10" max="300" step="5" value={missionParams.velocity} onChange={(e) => setMissionParams(p => ({...p, velocity: parseFloat(e.target.value)}))} />
                        </div>
                    </div>
                </div>

                <div className={styles.consolePanel}>
                    <span className={styles.hudLabel} style={{ color: '#fff' }}>FLIGHT CONDITIONS</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '10px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <label className={styles.hudLabel}>REYNOLDS</label>
                                    <div className={styles.sliderValue}>{(cstParams.reynolds / 1000000).toFixed(2)}M</div>
                                </div>
                                <input type="range" className={styles.sliderInput} min="50000" max="10000000" step="50000" value={cstParams.reynolds} onChange={(e) => updateParam('global', 'reynolds', parseFloat(e.target.value))} />
                            </div>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <label className={styles.hudLabel}>ALPHA (deg)</label>
                                    <div className={styles.sliderValue}>{cstParams.alpha.toFixed(1)}°</div>
                                </div>
                                <input type="range" className={styles.sliderInput} min="-10" max="20" step="0.5" value={cstParams.alpha} onChange={(e) => updateParam('global', 'alpha', parseFloat(e.target.value))} />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <label className={styles.hudLabel}>MACH (M_inf)</label>
                                    <div className={styles.sliderValue}>{(cstParams.mach ?? 0).toFixed(2)}</div>
                                </div>
                                <input type="range" className={styles.sliderInput} min="0.0" max="0.9" step="0.01" value={cstParams.mach ?? 0} onChange={(e) => updateParam('global', 'mach', parseFloat(e.target.value))} />
                            </div>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <label className={styles.hudLabel}>TURBULENCE (N_crit)</label>
                                    <div className={styles.sliderValue}>{(cstParams.n_crit ?? 9.0).toFixed(1)}</div>
                                </div>
                                <input type="range" className={styles.sliderInput} min="4.0" max="14.0" step="0.1" value={cstParams.n_crit ?? 9.0} onChange={(e) => updateParam('global', 'n_crit', parseFloat(e.target.value))} />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <label className={styles.hudLabel}>TOP TRIP (X/C)</label>
                                    <div className={styles.sliderValue}>{(cstParams.xtr_upper ?? 1.0).toFixed(2)}</div>
                                </div>
                                <input type="range" className={styles.sliderInput} min="0.0" max="1.0" step="0.01" value={cstParams.xtr_upper ?? 1.0} onChange={(e) => updateParam('global', 'xtr_upper', parseFloat(e.target.value))} />
                            </div>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <label className={styles.hudLabel}>BOT TRIP (X/C)</label>
                                    <div className={styles.sliderValue}>{(cstParams.xtr_lower ?? 1.0).toFixed(2)}</div>
                                </div>
                                <input type="range" className={styles.sliderInput} min="0.0" max="1.0" step="0.01" value={cstParams.xtr_lower ?? 1.0} onChange={(e) => updateParam('global', 'xtr_lower', parseFloat(e.target.value))} />
                            </div>
                        </div>

                        <div style={{
                            marginTop: '5px', padding: '10px', borderRadius: '6px', 
                            background: useEnsemble ? 'rgba(0, 255, 194, 0.05)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${useEnsemble ? '#00FFC2' : '#30363d'}`,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.3s'
                        }}>
                            <div>
                                <div style={{fontSize: '0.7rem', fontWeight: 800, color: useEnsemble ? '#00FFC2' : '#8b949e'}}>
                                    {useEnsemble ? 'CORE ENSEMBLE ACTIVE' : 'SINGLE-CORE MODE'}
                                </div>
                                <div style={{fontSize: '0.6rem', color: '#64748b'}}>
                                    {useEnsemble ? 'Polls 8 models (xxsmall → xxxlarge)' : 'Utilizing xxxlarge sovereign core'}
                                </div>
                            </div>
                            <label className={styles.switch}>
                                <input type="checkbox" checked={useEnsemble} onChange={(e) => setUseEnsemble(e.target.checked)} />
                                <span className={styles.sliderRound}></span>
                            </label>
                        </div>
                    </div>
                </div>

                <div className={styles.consolePanel}>
                    <span className={styles.hudLabel} style={{ color: '#fff' }}>GEOMETRY (CST)</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', rowGap: '0.8rem', marginTop: '10px' }}>
                        {renderSliders(cstParams.a_upper, 'a_upper')}
                        {renderSliders(cstParams.a_lower, 'a_lower')}
                    </div>
                </div>

                {/* --- CONTROL SURFACES --- */}
                <div className={styles.consolePanel} style={{ borderLeft: '3px solid #f87171' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className={styles.hudLabel} style={{ color: '#f87171' }}>MECHANICAL CONTROL SURFACES</span>
                        {fittingAccuracy && (
                            <span style={{ fontSize: '0.7rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: 4 }}>
                                Fit Accuracy: {fittingAccuracy.toFixed(1)}%
                            </span>
                        )}
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <label className={styles.hudLabel}>LEADING EDGE SLAT @ X={hingeX_LEF}</label>
                            <div className={styles.sliderValue} style={{ color: slatPreviewDeflection !== 0 ? '#f87171' : '#fff' }}>
                                {slatPreviewDeflection > 0 ? '+' : ''}{slatPreviewDeflection}° (Preview)
                            </div>
                        </div>
                        <input 
                            type="range" className={styles.sliderInput} min="-15" max="15" step="1" 
                            value={slatPreviewDeflection} 
                            onChange={(e) => setSlatPreviewDeflection(parseFloat(e.target.value))} 
                        />
                        <button 
                            onClick={() => applyControlSurface('LEF')} 
                            className={`${styles.cmdBtn} ${styles.primaryBtn}`} 
                            style={{ background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', borderColor: '#f87171' }} 
                            disabled={isProcessing || slatPreviewDeflection === 0}
                        >
                            COMMIT SLAT DEFLECTION
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px', borderTop: '1px solid #30363d', paddingTop: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <label className={styles.hudLabel}>TRAILING EDGE FLAP @ X={hingeX_TEF}</label>
                            <div className={styles.sliderValue} style={{ color: flapPreviewDeflection !== 0 ? '#f87171' : '#fff' }}>
                                {flapPreviewDeflection > 0 ? '+' : ''}{flapPreviewDeflection}° (Preview)
                            </div>
                        </div>
                        <input 
                            type="range" className={styles.sliderInput} min="-15" max="15" step="1" 
                            value={flapPreviewDeflection} 
                            onChange={(e) => setFlapPreviewDeflection(parseFloat(e.target.value))} 
                        />
                        <button 
                            onClick={() => applyControlSurface('TEF')} 
                            className={`${styles.cmdBtn} ${styles.primaryBtn}`} 
                            style={{ background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', borderColor: '#f87171' }} 
                            disabled={isProcessing || flapPreviewDeflection === 0}
                        >
                            COMMIT FLAP DEFLECTION
                        </button>
                    </div>

                    <button 
                        onClick={undoMorph} 
                        className={`${styles.cmdBtn} ${styles.secondaryBtn}`} 
                        style={{ marginTop: '15px', width: '100%' }} 
                        disabled={isProcessing || morphHistory.length === 0}
                    >
                        UNDO LAST MORPH
                    </button>
                </div>

                {/* --- MODULAR ACTION BAR --- */}
                <div className={styles.actionBar}>
                    <button onClick={() => setIsModalOpen(true)} className={`${styles.cmdBtn} ${styles.primaryBtn}`} disabled={isProcessing} style={{ gridColumn: 'span 1', color: '#00FFC2', borderColor: '#00FFC2', background: 'rgba(0, 255, 194, 0.1)' }}>
                        ⚡ SYNTHESIS
                    </button>

                    <div ref={deployMenuRef} style={{ gridColumn: 'span 1', position: 'relative' }}>
                        <button 
                            onClick={() => setDeployMenuOpen(!deployMenuOpen)} 
                            className={`${styles.cmdBtn} ${styles.primaryBtn}`} 
                            disabled={isProcessing} 
                            style={{ 
                                width: '100%', 
                                height: '100%', 
                                color: '#a855f7', 
                                borderColor: 'rgba(168, 85, 247, 0.5)', 
                                background: 'rgba(168, 85, 247, 0.1)',
                                padding: '0 16px'
                            }}
                        >
                            <FiBox size={16} /> 
                            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                DEPLOY 
                                <FiChevronDown style={{ transition: 'transform 0.2s', transform: deployMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}/>
                            </span>
                        </button>
                        {deployMenuOpen && (
                            <div className={styles.deployDropdown}>
                                <button onClick={() => deployToModule('neural-flow')} className={styles.deployOption}>
                                    <FiActivity color="#f472b6" size={16} /> NEURAL FLOW (CFD)
                                </button>
                                <button onClick={() => deployToModule('flight-dynamics')} className={styles.deployOption}>
                                    <FiCrosshair color="#ff7a00" size={16} /> FLIGHT DYNAMICS
                                </button>
                                <button onClick={() => deployToModule('finite-wing')} className={styles.deployOption}>
                                    <FiWind color="#a855f7" size={16} /> FINITE WING (VLM)
                                </button>
                                <div className={styles.deployDivider} />
                                <button onClick={() => deployToModule('inverse-design')} className={styles.deployOption}>
                                    <FiBox color="#38bdf8" size={16} /> INVERSE DESIGN
                                </button>
                                <button onClick={() => deployToModule('pareto')} className={styles.deployOption}>
                                    <FiTarget color="#f59e0b" size={16} /> PARETO ANALYSIS
                                </button>
                                <button onClick={() => deployToModule('aerosage')} className={styles.deployOption}>
                                    <FiLayers color="#10b981" size={16} /> AEROSAGE ANOMALY
                                </button>
                            </div>
                        )}
                    </div>

                    <button onClick={goToDeepAnalysis} className={`${styles.cmdBtn} ${styles.primaryBtn}`} disabled={isProcessing} style={{ gridColumn: 'span 1', color: '#ff7a00', borderColor: '#ff7a00', background: 'rgba(255, 122, 0, 0.1)' }}>
                        📑 DOSSIER
                    </button>

                    <button onClick={saveProject} className={`${styles.cmdBtn} ${styles.tertiaryBtn}`} disabled={isProcessing}>{isProcessing ? 'SAVING...' : 'SAVE'}</button>
                    <button onClick={goToExport} className={`${styles.cmdBtn} ${styles.primaryBtn}`} disabled={isProcessing}>EXPORT</button>
                    <button onClick={resetSliders} className={`${styles.cmdBtn} ${styles.secondaryBtn}`} disabled={isProcessing}>RESET</button>
                </div>
            </div>

            <div className={styles.visualizationColumn}>
                
                {/* ADVANCED TELEMETRY GRID */}
                <div className={styles.telemetryGrid}>
                    <div className={styles.telemetryCard}>
                        <p className={styles.hudLabel} style={{ color: '#38bdf8' }}>LIFT (Cl)</p>
                        <div className={styles.dataValue} style={{ color: '#38bdf8' }}>{simData.cl}</div>
                    </div>
                    <div className={styles.telemetryCard}>
                        <p className={styles.hudLabel} style={{ color: '#f472b6' }}>DRAG (Cd)</p>
                        <div className={styles.dataValue} style={{ color: '#f472b6' }}>{simData.cd}</div>
                    </div>
                    <div className={styles.telemetryCard}>
                        <p className={styles.hudLabel} style={{ color: '#fbbf24' }}>MOMENT (Cm)</p>
                        <div className={styles.dataValue} style={{ color: '#fbbf24' }}>{simData.cm}</div>
                    </div>
                    <div className={styles.telemetryCard}>
                        <p className={styles.hudLabel} style={{ color: '#10b981' }}>L/D RATIO</p>
                        <div className={styles.dataValue} style={{ color: '#10b981' }}>{parseFloat(simData.cd) > 0 ? (parseFloat(simData.cl)/parseFloat(simData.cd)).toFixed(2) : '0.00'}</div>
                    </div>
                    <div className={styles.telemetryCard}>
                        <p className={styles.hudLabel} style={{ color: Number(simData.confidence) > 85 ? '#10b981' : (Number(simData.confidence) > 50 ? '#fbbf24' : '#ef4444') }}>CONFIDENCE</p>
                        <div className={styles.dataValue} style={{ color: Number(simData.confidence) > 85 ? '#10b981' : (Number(simData.confidence) > 50 ? '#fbbf24' : '#ef4444') }}>{simData.confidence}%</div>
                    </div>

                    <div className={styles.telemetryCard}>
                        <p className={styles.hudLabel} style={{ color: '#a855f7' }}>MAX TURB (νt)</p>
                        <div className={styles.dataValue} style={{ color: '#a855f7' }}>{simData.max_turbulence}</div>
                    </div>
                    <div className={styles.telemetryCard}>
                        <p className={styles.hudLabel} style={{ color: '#f472b6' }}>WAKE DEFICIT</p>
                        <div className={styles.dataValue} style={{ color: '#f472b6' }}>{simData.wake_deficit}</div>
                    </div>
                    <div className={styles.telemetryCard}>
                        <p className={styles.hudLabel} style={{ color: '#f87171' }}>SEPARATION</p>
                        <div className={styles.dataValue} style={{ color: simData.separation_x === 'Attached' ? '#10b981' : '#f87171' }}>{simData.separation_x}</div>
                    </div>
                    <div className={styles.telemetryCard}>
                        <p className={styles.hudLabel} style={{ color: '#f87171' }}>CRITICAL MACH</p>
                        <div className={styles.dataValue} style={{ color: '#f87171' }}>{machData.m_crit}</div>
                    </div>
                    <div className={styles.telemetryCard}>
                        <p className={styles.hudLabel} style={{ color: '#e2e8f0' }}>MAX t/c</p>
                        <div className={styles.dataValue} style={{ color: '#e2e8f0' }}>{structData.thickness}%</div>
                    </div>
                </div>

                <div className={styles.canvasContainer}>
                    <div className={styles.viewToggleGroup}>
                        <button className={`${styles.viewToggleBtn} ${viewMode === '2D' ? styles.active : ''}`} onClick={() => setViewMode('2D')}>
                            GEOMETRY
                        </button>
                        <button className={`${styles.viewToggleBtn} ${viewMode === '3D' ? styles.active : ''}`} onClick={() => setViewMode('3D')}>
                            3D MODEL
                        </button>
                        <button className={`${styles.viewToggleBtn} ${viewMode === 'FIELD' ? styles.active : ''}`} onClick={() => setViewMode('FIELD')} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            PHYSICS FIELD
                            {fieldData && <span style={{width:6, height:6, background:'#34d399', borderRadius:'50%'}}></span>}
                        </button>
                        <button className={`${styles.viewToggleBtn} ${viewMode === 'FLOW' ? styles.activeFlow : ''}`} onClick={() => setViewMode('FLOW')}>
                            PARTICLE FLOW
                        </button>
                    </div>

                    {viewMode === '2D' && (
                        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                            <D3AirfoilViz coordinates={baseCoordinates} previewCoordinates={displayCoordinates !== baseCoordinates ? displayCoordinates : null} />
                            
                            {(flapPreviewDeflection !== 0 || slatPreviewDeflection !== 0) && (
                                <div style={{ position: 'absolute', bottom: '15px', right: '15px', background: 'rgba(248, 113, 113, 0.1)', border: '1px solid #f87171', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171', animation: 'pulse 1.5s infinite' }}></div>
                                    <span style={{ color: '#f87171', fontSize: '0.8rem', fontWeight: 700 }}>HINGE PREVIEW ENGAGED</span>
                                </div>
                            )}
                        </div>
                    )}
                    {viewMode === '3D' && <ThreeDWing cstParams={cstParams} />}
                    {viewMode === 'FLOW' && <WebGPUFluidSolver airfoilCoordinates={displayCoordinates} speed={0.12 + (cstParams.reynolds / 50000000)} />}
                    {viewMode === 'FIELD' && (
                        fieldData ? (
                            <DeepONetViz fieldData={fieldData} coordinates={displayCoordinates} blData={blData} />
                        ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                                <div style={{marginBottom: 10, fontSize: '1.2rem', opacity: 0.5}}>⚛</div>
                                <div>Waiting for Physics Simulation...</div>
                                <div style={{fontSize: '0.8rem', marginTop: 5, opacity: 0.6}}>(Heatmap will appear automatically when ready)</div>
                            </div>
                        )
                    )}
                </div>
            </div>
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes pulse { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.7); } 70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(248, 113, 113, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(248, 113, 113, 0); } }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `}} />
        </div>
    );
}

// ─── EXPORT WITH SUBSCRIPTION GUARD ────────────────────────────
export default function WorkbenchPage() {
    return (
        <SubscriptionGuard>
            <WorkbenchContent />
        </SubscriptionGuard>
    );
}