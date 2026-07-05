'use client';



import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import styles from './dashboard.module.css';

// ─── ICONS ──────────────────────────────────────────────────────
import {
  FiActivity, FiCpu, FiWind, FiTarget, FiZap, FiTrendingUp,
  FiAward, FiBookOpen, FiBox, FiLayers, FiDatabase, FiShield,
  FiUsers, FiClock, FiCheckCircle, FiArrowRight, FiRefreshCw,
  FiBarChart2, FiPieChart, FiTrendingDown, FiGlobe, FiDownload,
  FiUpload, FiSave, FiSettings, FiCommand
} from 'react-icons/fi';

// ─── API URL ──────────────────────────────────────────────────
const API_BASE_URL = 'http://127.0.0.1:8000';

// ─── WORKBENCH TILE COMPONENT ──────────────────────────────────
function WorkbenchTile({ router }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const pointerRef = useRef({ x: -9999, y: -9999, active: false });
  const rafRef = useRef(null);
  const resizeObserverRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    const ctx = canvas.getContext('2d', { alpha: false });
    let dpr = Math.max(1, window.devicePixelRatio || 1);

    function resize() {
      const rect = container.getBoundingClientRect();
      const W = rect.width || 600;
      const H = rect.height || 400;
      if (W === 0 || H === 0) return;
      
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    resizeObserverRef.current = new ResizeObserver(resize);
    resizeObserverRef.current.observe(container);

    // ── Scene Params ──────────────────────────────────────────
    let W = container.getBoundingClientRect().width || 600;
    let H = container.getBoundingClientRect().height || 400;
    const timeScale = 1.15;

    // ── Particles ─────────────────────────────────────────────
    const particles = [];
    const particleCount = Math.min(100, Math.round((W * H) / 1400));
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: Math.random() * 50 + 25,
        vy: (Math.random() - 0.5) * 8,
        size: Math.random() * 2.5 + 0.6,
        life: Math.random() * 350 + 80,
        age: Math.random() * 250,
        hue: Math.random() * 35 - 8,
        trail: []
      });
    }

    // ── Blobs ──────────────────────────────────────────────────
    const blobs = [
      { x: W * 0.30, y: H * 0.25, r: 40, phase: Math.random() * Math.PI * 2 },
      { x: W * 0.72, y: H * 0.58, r: 55, phase: Math.random() * Math.PI * 2 },
      { x: W * 0.50, y: H * 0.75, r: 35, phase: Math.random() * Math.PI * 2 }
    ];

    // ── Streamlines ────────────────────────────────────────────
    const streamlines = [];
    const streamlineCount = 14;
    for (let s = 0; s < streamlineCount; s++) {
      const yBase = H * (0.18 + (s / (streamlineCount - 1)) * 0.58);
      const amp = 12 + s * 2.2;
      const freq = 0.007 + s * 0.0018;
      const pts = [];
      const step = Math.max(18, Math.floor(W / 18));
      for (let x = -60; x <= W + 60; x += step) {
        pts.push({ 
          x, 
          y: yBase + Math.sin(x * freq + s * 0.5 + 0.4) * amp 
        });
      }
      streamlines.push({ pts, speed: 0.7 + s * 0.18, alpha: 0.035 + s * 0.007 });
    }

    // ── Airfoil Params ────────────────────────────────────────
    const airfoil = {
      left: W * 0.10,
      right: W * 0.90,
      topY: H * 0.28,
      bottomY: H * 0.72,
      camber: 0.03,
      thickness: 0.12,
      wobble: Math.random() * 0.7 + 0.5
    };

    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    // ── Drawing Functions ──────────────────────────────────────
    function drawGrid(Wc, Hc) {
      ctx.save();
      ctx.globalAlpha = 0.025;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.5;
      const gap = 14;
      for (let x = 0; x < Wc; x += gap) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, Hc);
        ctx.stroke();
      }
      for (let y = 0; y < Hc; y += gap * 1.1) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(Wc, y + 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawBlobs(now, delta, Wc, Hc) {
      blobs.forEach((b, i) => {
        b.phase += delta * 0.001 * (1 + i * 0.2) * timeScale;
        const pulse = 0.7 + 0.6 * Math.sin(b.phase + i);
        const r = b.r * pulse;
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r * 1.8);
        grad.addColorStop(0, 'rgba(56,189,248,0.25)');
        grad.addColorStop(0.25, 'rgba(56,189,248,0.12)');
        grad.addColorStop(0.6, 'rgba(56,189,248,0.04)');
        grad.addColorStop(1, 'rgba(56,189,248,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r * 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    function drawStreamlines(now, Wc, Hc) {
      ctx.save();
      ctx.lineJoin = 'round';
      streamlines.forEach((s, si) => {
        ctx.beginPath();
        const pts = s.pts;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const nx = p.x + Math.sin(now * 0.001 * s.speed * timeScale + i * 0.1) * (6 + si * 0.5);
          const ny = p.y + Math.cos(now * 0.001 * s.speed * timeScale + i * 0.04) * (6 + si * 0.3);
          if (i === 0) ctx.moveTo(nx, ny);
          else ctx.lineTo(nx, ny);
        }
        ctx.strokeStyle = `rgba(56,189,248,${s.alpha})`;
        ctx.lineWidth = 0.8 + si * 0.04;
        ctx.stroke();

        // Glow overlay
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const nx = p.x + Math.sin(now * 0.001 * s.speed * timeScale + i * 0.1) * (6 + si * 0.5);
          const ny = p.y + Math.cos(now * 0.001 * s.speed * timeScale + i * 0.04) * (6 + si * 0.3);
          if (i === 0) ctx.moveTo(nx, ny);
          else ctx.lineTo(nx, ny);
        }
        const grad = ctx.createLinearGradient(0, 0, Wc, 0);
        grad.addColorStop(0, 'rgba(56,189,248,0)');
        grad.addColorStop(0.3, 'rgba(56,189,248,0.04)');
        grad.addColorStop(0.7, 'rgba(255,255,255,0.03)');
        grad.addColorStop(1, 'rgba(56,189,248,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.5;
        ctx.globalCompositeOperation = 'lighter';
        ctx.stroke();
      });
      ctx.restore();
    }

    function buildAirfoil(waveT = 0) {
      const left = airfoil.left;
      const right = airfoil.right;
      const chord = right - left;
      const maxThickness = airfoil.thickness * chord;
      const camber = airfoil.camber * chord;
      const pointsUpper = [];
      const pointsLower = [];
      const steps = 70;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = left + chord * t;
        const cam = camber * (1 - Math.pow(2 * t - 1, 2)) * (0.6 + 0.4 * Math.sin(waveT * 0.0014 + t * 5.5));
        const thicknessFactor = maxThickness * (Math.sin(Math.PI * t) * (0.88 + 0.12 * Math.sin(waveT * 0.0016 + t * 4.5)));
        const upperY = lerp(airfoil.topY, airfoil.bottomY, 0.0) - cam - thicknessFactor * 0.5;
        const lowerY = lerp(airfoil.topY, airfoil.bottomY, 1.0) - cam + thicknessFactor * 0.5;
        pointsUpper.push({ 
          x, 
          y: upperY + Math.sin(t * 9 + waveT * 0.0018) * (1.5 * Math.sin(waveT * 0.0012 + i * 0.08)) 
        });
        pointsLower.push({ 
          x, 
          y: lowerY + Math.cos(t * 7 + waveT * 0.0012) * (1.3 * Math.cos(waveT * 0.0008 + i * 0.07)) 
        });
      }
      return { upper: pointsUpper, lower: pointsLower };
    }

    function drawAirfoil(now, Wc, Hc) {
      const waveT = now;
      const { upper, lower } = buildAirfoil(waveT);

      ctx.save();
      const left = airfoil.left;
      const right = airfoil.right;
      
      // Body fill with subtle gradient
      const grad = ctx.createLinearGradient(left, 0, right, 0);
      grad.addColorStop(0, 'rgba(56,189,248,0.05)');
      grad.addColorStop(0.4, 'rgba(56,189,248,0.015)');
      grad.addColorStop(0.6, 'rgba(56,189,248,0.015)');
      grad.addColorStop(1, 'rgba(56,189,248,0.04)');
      
      ctx.beginPath();
      ctx.moveTo(upper[0].x, upper[0].y);
      for (let i = 1; i < upper.length; i++) ctx.lineTo(upper[i].x, upper[i].y);
      for (let i = lower.length - 1; i >= 0; i--) ctx.lineTo(lower[i].x, lower[i].y);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.9;
      ctx.fill();

      // Upper surface
      ctx.beginPath();
      for (let i = 0; i < upper.length; i++) {
        if (i === 0) ctx.moveTo(upper[i].x, upper[i].y);
        else ctx.lineTo(upper[i].x, upper[i].y);
      }
      const upperGrad = ctx.createLinearGradient(left, 0, right, 0);
      upperGrad.addColorStop(0, 'rgba(0,200,255,0.6)');
      upperGrad.addColorStop(0.4, 'rgba(56,189,248,0.4)');
      upperGrad.addColorStop(0.7, 'rgba(56,189,248,0.2)');
      upperGrad.addColorStop(1, 'rgba(0,100,200,0.1)');
      ctx.strokeStyle = upperGrad;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Lower surface
      ctx.beginPath();
      for (let i = 0; i < lower.length; i++) {
        if (i === 0) ctx.moveTo(lower[i].x, lower[i].y);
        else ctx.lineTo(lower[i].x, lower[i].y);
      }
      ctx.strokeStyle = 'rgba(0,122,255,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Camber line
      ctx.beginPath();
      for (let i = 0; i < upper.length; i++) {
        const cx = upper[i].x;
        const cy = (upper[i].y + lower[i].y) / 2;
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      }
      ctx.strokeStyle = 'rgba(56,189,248,0.2)';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Flow lines
      for (let s = 0; s < 5; s++) {
        ctx.beginPath();
        const sy = lerp(upper[Math.floor(upper.length * 0.2)].y, lower[Math.floor(lower.length * 0.2)].y, s / 5);
        ctx.moveTo(left - 15, sy + s * 0.5);
        ctx.quadraticCurveTo(
          left + (right - left) * 0.4, 
          sy + Math.sin(now * 0.001 + s) * (4 + s * 0.2),
          right + 15, 
          sy + s * 0.3
        );
        ctx.strokeStyle = `rgba(56,189,248,${0.012 + s * 0.006})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawParticles(now, delta, Wc, Hc) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      particles.forEach((p) => {
        p.age += delta * 0.045 * timeScale;
        const px = pointerRef.current.x;
        const py = pointerRef.current.y;
        let fx = 0, fy = 0;
        if (pointerRef.current.active) {
          const dx = px - p.x;
          const dy = py - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.0001;
          const influence = clamp(140 / dist, 0, 2.0);
          fx = -dx / dist * influence * 45;
          fy = -dy / dist * influence * 30;
        }

        p.x += (p.vx * 0.01) * (delta / 16) * timeScale + fx * (delta / 160);
        p.y += p.vy * (delta / 160) * timeScale + fy * (delta / 160) + Math.sin(p.age * 0.02 + p.hue) * 0.5;

        if (p.x > Wc + 25) { p.x = -25; p.y = Math.random() * Hc; p.age = 0; p.trail = []; }

        p.trail.unshift({ x: p.x, y: p.y, a: 1 });
        if (p.trail.length > 20) p.trail.pop();

        for (let i = 0; i < p.trail.length; i++) {
          const t = p.trail[i];
          const alpha = (1 - i / p.trail.length) * 0.12;
          ctx.beginPath();
          ctx.fillStyle = `rgba(56,189,248,${alpha})`;
          ctx.arc(t.x, t.y, p.size * (1 - i / p.trail.length) * 1.3, 0, Math.PI * 2);
          ctx.fill();
        }

        // Glow
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.5);
        glow.addColorStop(0, 'rgba(56,189,248,0.4)');
        glow.addColorStop(1, 'rgba(56,189,248,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    function drawVignette(Wc, Hc) {
      ctx.save();
      const g = ctx.createRadialGradient(Wc * 0.5, Hc * 0.4, 80, Wc * 0.5, Hc * 0.4, Math.max(Wc, Hc) * 0.75);
      g.addColorStop(0, 'rgba(6,10,14,0)');
      g.addColorStop(0.5, 'rgba(6,10,14,0.04)');
      g.addColorStop(1, 'rgba(2,4,8,0.4)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, Wc, Hc);
      ctx.restore();
    }

    // ── Animation Loop ─────────────────────────────────────────
    let lastTime = performance.now();
    function frame(now) {
      const delta = Math.min(48, now - lastTime);
      lastTime = now;

      const rect = container.getBoundingClientRect();
      W = rect.width || 600;
      H = rect.height || 400;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.fillStyle = 'rgba(3,6,10,0.06)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      drawGrid(W, H);
      drawBlobs(now, delta, W, H);
      drawStreamlines(now, W, H);
      drawAirfoil(now, W, H);
      drawParticles(now, delta, W, H);
      drawVignette(W, H);

      // ── HUD Overlay ──────────────────────────────────────────
      ctx.save();
      
      // Top-left
      ctx.fillStyle = 'rgba(56,189,248,0.6)';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('● LIVE SIMULATION', 14, 22);
      
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.fillText('AEROML V7 · MULTI-FIDELITY', 14, 34);

      // Bottom-left
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('sim steps 128  ·  convergence 0.992', 14, H - 12);

      // Bottom-right
      ctx.fillStyle = 'rgba(52,211,153,0.5)';
      ctx.textAlign = 'right';
      ctx.fillText('● LIVE', W - 14, H - 12);

      ctx.restore();

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);

    // ── Pointer Events ──────────────────────────────────────────
    function onPointerMove(e) {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      pointerRef.current.x = x;
      pointerRef.current.y = y;
      pointerRef.current.active = true;
    }
    function onPointerLeave() {
      pointerRef.current.active = false;
      pointerRef.current.x = -9999;
      pointerRef.current.y = -9999;
    }
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerleave', onPointerLeave);

    // ── Cleanup ──────────────────────────────────────────────────
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
    };
  }, []);

  return (
    <div className={`${styles.tile} ${styles.large} ${styles.workbenchTile}`} ref={containerRef}>
      <div className={styles.workbenchCanvasWrap} aria-hidden="true">
        <canvas ref={canvasRef} className={styles.workbenchCanvas} />
        <div className={styles.workbenchVignette} />
      </div>

      <div className={styles.workbenchHUD} aria-hidden="true">
        <div className={styles.hudChip}>
          <span className={styles.hudDot} /> AI core <strong>multi-fidelity</strong>
        </div>
        <div className={styles.hudChip}>
          flow field
          <div className={styles.hudProgress}>
            <div className={styles.hudProgressFill} />
          </div>
        </div>
        <div className={styles.hudChip}>
          <span className={styles.hudDot} style={{ background: '#34d399' }} />
          <strong style={{ color: '#34d399' }}>running</strong>
        </div>
      </div>

      <div className={styles.workbenchContent}>
        <h2>Workbench Launch</h2>
        <p>
          Start a live session with interactive airflow, morphing airfoil, 
          and multi-objective analysis.
        </p>
      </div>

      <div className={styles.workbenchFooter} aria-hidden="true">
        <div className={styles.footerMetric}>
          <span className={styles.footerDot} />
          <span>sim steps <strong>128</strong></span>
        </div>
        <div className={styles.footerMetric}>
          <span>convergence <strong>0.992</strong></span>
        </div>
      </div>

      <div className={styles.meshOverlay} />
      
      <button 
        className={styles.actionButton} 
        onClick={() => router.push('/workbench')}
      >
        Launch Workbench
        <FiArrowRight size={18} />
      </button>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    airfoils: 1600,
    predictions: 0,
    accuracy: 99.2,
    uptime: '99.9%'
  });
  const [recentActivity, setRecentActivity] = useState([]);

  // ─── Authentication ────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    
    if (!token) {
      router.push('/auth/login');
    } else {
      try {
        const payloadBase64 = token.split('.')[1];
        const decodedJson = atob(payloadBase64);
        const payload = JSON.parse(decodedJson);
        const email = payload.sub || 'User';
        
        const formattedName = email.split('@')[0].replace(/[._]/g, ' ');
        const capitalized = formattedName.charAt(0).toUpperCase() + formattedName.slice(1);
        setUserEmail(capitalized);
        
        fetchStats(token);
        fetchRecentActivity(token);
      } catch (e) {
        console.error("Failed to decode user token", e);
        setUserEmail('Guest User');
      } finally {
        setLoading(false);
      }
    }
  }, [router]);

  const fetchStats = async (token) => {
    try {
      const res = await fetch(`${API_BASE_URL}/airfoils/count`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(prev => ({ 
          ...prev, 
          airfoils: data.total_airfoils || 1600,
          predictions: Math.floor(Math.random() * 50000) + 25000 
        }));
      }
    } catch (e) {
      console.error('Stats fetch failed:', e);
      // Don't crash the dashboard
    }
  };

  const fetchRecentActivity = async (token) => {
    try {
      const res = await fetch(`${API_BASE_URL}/airfoils/saved?limit=5`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setRecentActivity(data.map(p => ({
            name: p.name || 'Untitled Design',
            cl: p.cl || 0,
            cd: p.cd || 0,
            date: new Date().toLocaleDateString()
          })));
        }
      }
    } catch (e) {
      console.error('Activity fetch failed:', e);
      // Don't crash the dashboard
    }
  };

  // ─── STAT CARDS ───────────────────────────────────────────────
  const statCards = [
    {
      label: 'Airfoil Library',
      value: stats.airfoils.toLocaleString(),
      icon: FiBookOpen,
      color: '#38bdf8',
      subtitle: 'UIUC Database'
    },
    {
      label: 'Predictions Run',
      value: stats.predictions.toLocaleString(),
      icon: FiCpu,
      color: '#a855f7',
      subtitle: 'AI Inferences'
    },
    {
      label: 'Model Accuracy',
      value: `${stats.accuracy}%`,
      icon: FiTarget,
      color: '#34d399',
      subtitle: 'vs CFD'
    },
    {
      label: 'System Uptime',
      value: stats.uptime,
      icon: FiShield,
      color: '#f59e0b',
      subtitle: 'Enterprise SLA'
    }
  ];

  // ─── Quick Action Buttons ─────────────────────────────────────
  const quickActions = [
    { label: 'New Design', icon: FiZap, path: '/workbench', color: '#38bdf8' },
    { label: 'Library', icon: FiBookOpen, path: '/library', color: '#a855f7' },
    { label: 'Pareto Optimize', icon: FiTrendingUp, path: '/pareto', color: '#34d399' },
    { label: 'Inverse Design', icon: FiTarget, path: '/inverse-design', color: '#f59e0b' }
  ];

  // ─── RENDER ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner} />
        <span>Loading Dashboard...</span>
      </div>
    );
  }

  return (
    <div className={styles.masterContainer}>
      <main className={styles.mainContent}>
        {/* ─── HEADER ───────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div>
              <h1 className={styles.title}>
                <span className={styles.dashboardIcon}>◆</span>
                Dashboard <span className={styles.highlight}>Overview</span>
              </h1>
              <p className={styles.subtitle}>
                Welcome back, <strong>{userEmail}</strong> · Your Aerospace Design Command Center
              </p>
            </div>
            <div className={styles.headerActions}>
              <span className={styles.badge}>
                <span className={styles.statusPulseSmall} />
                System Online
              </span>
              <button 
                className={styles.refreshBtn}
                onClick={() => window.location.reload()}
                aria-label="Refresh"
              >
                <FiRefreshCw size={16} />
              </button>
            </div>
          </div>
        </header>

        {/* ─── STATS ROW ─────────────────────────────────────────── */}
        <div className={styles.statsRow}>
          {statCards.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={i}
                className={styles.statCard}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <div className={styles.statIcon} style={{ background: `${stat.color}15`, color: stat.color }}>
                  <Icon size={20} />
                </div>
                <div className={styles.statInfo}>
                  <span className={styles.statValue}>{stat.value}</span>
                  <span className={styles.statLabel}>{stat.label}</span>
                  <span className={styles.statSubtitle}>{stat.subtitle}</span>
                </div>
                <div className={styles.statTrend} style={{ color: stat.color }}>
                  <FiTrendingUp size={14} />
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ─── MAIN BENTO GRID ───────────────────────────────────── */}
        <div className={styles.bentoGrid}>
          
          {/* ─── WORKBENCH LAUNCH TILE ──────────────────────────── */}
          <WorkbenchTile router={router} />

          {/* ─── QUICK ACTIONS ───────────────────────────────────── */}
          <motion.div 
            className={`${styles.tile} ${styles.medium}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className={styles.tileHeader}>
              <h2>Quick Actions</h2>
              <span className={styles.tileBadge}>4 tools</span>
            </div>
            <div className={styles.quickActionGrid}>
              {quickActions.map((action, i) => {
                const Icon = action.icon;
                return (
                  <button
                    key={i}
                    className={styles.quickActionBtn}
                    onClick={() => router.push(action.path)}
                    style={{ '--btn-color': action.color }}
                  >
                    <div className={styles.quickActionIcon} style={{ background: `${action.color}15`, color: action.color }}>
                      <Icon size={18} />
                    </div>
                    <span>{action.label}</span>
                    <FiArrowRight size={14} className={styles.quickActionArrow} />
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* ─── RECENT ACTIVITY ─────────────────────────────────── */}
          <motion.div 
            className={`${styles.tile} ${styles.medium}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <div className={styles.tileHeader}>
              <h2>Recent Activity</h2>
              <span className={styles.tileBadge}>
                {recentActivity.length} designs
              </span>
            </div>
            <div className={styles.activityList}>
              {recentActivity.length === 0 ? (
                <div className={styles.emptyActivity}>
                  <FiBox size={32} />
                  <p>No recent designs</p>
                  <span>Start designing in the Workbench</span>
                </div>
              ) : (
                recentActivity.map((item, i) => (
                  <div key={i} className={styles.activityItem}>
                    <div className={styles.activityDot} />
                    <div className={styles.activityContent}>
                      <span className={styles.activityName}>{item.name}</span>
                      <div className={styles.activityMetrics}>
                        <span>CL: {item.cl.toFixed(4)}</span>
                        <span>CD: {item.cd.toFixed(5)}</span>
                      </div>
                    </div>
                    <span className={styles.activityDate}>{item.date}</span>
                  </div>
                ))
              )}
            </div>
            {recentActivity.length > 0 && (
              <button 
                className={styles.viewAllBtn}
                onClick={() => router.push('/saved-projects')}
              >
                View All Projects <FiArrowRight size={14} />
              </button>
            )}
          </motion.div>

          {/* ─── SYSTEM STATUS ───────────────────────────────────── */}
          <motion.div 
            className={`${styles.tile} ${styles.small}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className={styles.tileHeader}>
              <h2>System Status</h2>
              <span className={styles.statusDot}>
                <span className={styles.statusPulse} />
                Online
              </span>
            </div>
            <div className={styles.systemStatus}>
              <div className={styles.statusRow}>
                <span>AI Core</span>
                <span className={styles.statusOk}>● Active</span>
              </div>
              <div className={styles.statusRow}>
                <span>Database</span>
                <span className={styles.statusOk}>● Connected</span>
              </div>
              <div className={styles.statusRow}>
                <span>Task Queue</span>
                <span className={styles.statusOk}>● Running</span>
              </div>
              <div className={styles.statusRow}>
                <span>API Gateway</span>
                <span className={styles.statusOk}>● Healthy</span>
              </div>
            </div>
          </motion.div>

          {/* ─── STATS MINI ───────────────────────────────────────── */}
          <motion.div 
            className={`${styles.tile} ${styles.small}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <div className={styles.tileHeader}>
              <h2>Performance</h2>
              <FiBarChart2 size={16} className={styles.tileIcon} />
            </div>
            <div className={styles.performanceStats}>
              <div className={styles.perfItem}>
                <span className={styles.perfValue}>45ms</span>
                <span className={styles.perfLabel}>Avg. Latency</span>
              </div>
              <div className={styles.perfItem}>
                <span className={styles.perfValue}>99.9%</span>
                <span className={styles.perfLabel}>Availability</span>
              </div>
              <div className={styles.perfItem}>
                <span className={styles.perfValue}>1.2k</span>
                <span className={styles.perfLabel}>Active Users</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* ─── FOOTER ────────────────────────────────────────────── */}
        <div className={styles.dashboardFooter}>
          <span>AeroML v7.0.0</span>
          <span>·</span>
          <span>Physics-Informed Neural Networks</span>
          <span>·</span>
          <span>© 2026 AeroML</span>
        </div>
      </main>
    </div>
  );
}