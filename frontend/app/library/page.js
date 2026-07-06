'use client';



import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './library.module.css';

// ─── ICONS ──────────────────────────────────────────────────────
import {
  FiSearch, FiBookOpen, FiGrid, FiList, FiFilter, FiX,
  FiArrowRight, FiCpu, FiClock, FiDownload
} from 'react-icons/fi';

// ─── API URL ──────────────────────────────────────────────────
const API_BASE_URL = 'https://aeroml-production.up.railway.app';

// ─── AIRFOIL FAMILY COLORS ────────────────────────────────────
const FAMILY_COLORS = {
  'naca': '#38bdf8',
  'eppler': '#a855f7',
  'fx': '#f59e0b',
  'goe': '#34d399',
  'clark': '#f472b6',
  'rae': '#ef4444',
  's': '#8b5cf6',
  'default': '#6b7280'
};

const FAMILY_LABELS = {
  'naca': 'NACA',
  'eppler': 'EPPLER',
  'fx': 'FX',
  'goe': 'GÖ',
  'clark': 'CLARK',
  'rae': 'RAE',
  's': 'S-SERIES',
  'default': 'OTHER'
};

// ─── TOAST SYSTEM ──────────────────────────────────────────────
function ToastContainer({ toasts, removeToast }) {
  return (
    <div className={styles.toastContainer}>
      <AnimatePresence>
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
      </AnimatePresence>
    </div>
  );
}

// ─── GENERATE NACA AIRFOIL ─────────────────────────────────────
function generateNACA4(code, n = 60) {
  try {
    const s = String(code).padStart(4, '0');
    const m = Number(s[0]) / 100;
    const p = Number(s[1]) / 10;
    const t = Number(s.slice(2)) / 100;

    const points = [];
    for (let i = 0; i <= n; i++) {
      const theta = (Math.PI * i) / n;
      const x = 0.5 * (1 - Math.cos(theta));
      
      const yt = 5 * t * (
        0.2969 * Math.sqrt(Math.max(x, 0.0001)) - 
        0.1260 * x - 
        0.3516 * x * x + 
        0.2843 * x * x * x - 
        0.1015 * x * x * x * x
      );
      
      let yc = 0;
      let dyc = 0;
      if (m > 0 && p > 0) {
        if (x <= p) {
          yc = (m / (p * p)) * (2 * p * x - x * x);
          dyc = (2 * m / (p * p)) * (p - x);
        } else {
          yc = (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * x - x * x);
          dyc = (2 * m / ((1 - p) * (1 - p))) * (p - x);
        }
      }
      
      const theta_rad = Math.atan(dyc);
      const xu = x - yt * Math.sin(theta_rad);
      const yu = yc + yt * Math.cos(theta_rad);
      const xl = x + yt * Math.sin(theta_rad);
      const yl = yc - yt * Math.cos(theta_rad);
      
      points.push({ xu, yu, xl, yl });
    }
    
    return points;
  } catch {
    return null;
  }
}

// ─── RENDER AIRFOIL FROM CST COEFFICIENTS ─────────────────────
function renderAirfoilFromCST(ctx, cst, color, isHovered, W, H) {
  if (!cst || cst.length < 16) return false;
  
  try {
    const upper = cst.slice(0, 8);
    const lower = cst.slice(8, 16);
    
    const n = 60;
    const points = [];
    
    for (let i = 0; i <= n; i++) {
      const theta = (Math.PI * i) / n;
      const x = 0.5 * (1 - Math.cos(theta));
      
      const C = Math.sqrt(Math.max(x, 0.0001)) * (1 - x);
      
      let S_upper = 0;
      for (let j = 0; j < 8; j++) {
        const bern = binomial(7, j) * Math.pow(x, j) * Math.pow(1 - x, 7 - j);
        S_upper += upper[j] * bern;
      }
      
      let S_lower = 0;
      for (let j = 0; j < 8; j++) {
        const bern = binomial(7, j) * Math.pow(x, j) * Math.pow(1 - x, 7 - j);
        S_lower += lower[j] * bern;
      }
      
      const yu = C * S_upper;
      const yl = C * S_lower;
      
      points.push({ xu: x, yu, xl: x, yl });
    }
    
    return renderAirfoilPoints(ctx, points, color, isHovered, W, H);
  } catch {
    return false;
  }
}

function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result *= (n - i + 1) / i;
  }
  return result;
}

function renderAirfoilPoints(ctx, points, color, isHovered, W, H) {
  if (!points || points.length < 10) return false;
  
  const pad = 15;
  const drawW = W - pad * 2;
  const drawH = H - pad * 2;
  
  let minY = Infinity, maxY = -Infinity;
  points.forEach(p => {
    if (p.yu < minY) minY = p.yu;
    if (p.yu > maxY) maxY = p.yu;
    if (p.yl < minY) minY = p.yl;
    if (p.yl > maxY) maxY = p.yl;
  });
  const yRange = maxY - minY || 0.2;
  const yMid = (maxY + minY) / 2;
  
  const scaleY = drawH / (yRange * 1.4);
  const scaleX = drawW;
  
  const toScreen = (x, y) => [
    pad + x * scaleX,
    pad + drawH / 2 + (yMid - y) * scaleY
  ];
  
  ctx.beginPath();
  points.forEach((p, i) => {
    const [sx, sy] = toScreen(p.xu, p.yu);
    i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
  });
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    const [sx, sy] = toScreen(p.xl, p.yl);
    ctx.lineTo(sx, sy);
  }
  ctx.closePath();
  
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, color + '25');
  grad.addColorStop(0.5, color + '10');
  grad.addColorStop(1, color + '25');
  ctx.fillStyle = grad;
  ctx.fill();
  
  ctx.beginPath();
  points.forEach((p, i) => {
    const [sx, sy] = toScreen(p.xu, p.yu);
    i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
  });
  ctx.strokeStyle = isHovered ? color : color + '90';
  ctx.lineWidth = isHovered ? 2 : 1.4;
  ctx.stroke();
  
  ctx.beginPath();
  points.forEach((p, i) => {
    const [sx, sy] = toScreen(p.xl, p.yl);
    i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
  });
  ctx.strokeStyle = isHovered ? color : color + '70';
  ctx.lineWidth = isHovered ? 2 : 1.4;
  ctx.stroke();
  
  if (isHovered) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    points.forEach((p, i) => {
      const [sx, sy] = toScreen(p.xu, p.yu);
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    });
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      const [sx, sy] = toScreen(p.xl, p.yl);
      ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.strokeStyle = color + '15';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  
  ctx.fillStyle = isHovered ? color : color + '50';
  ctx.beginPath();
  const [leX, leY] = toScreen(0, 0);
  ctx.arc(leX, leY, 2.5, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = isHovered ? color : color + '30';
  const [teX, teY] = toScreen(1, 0);
  ctx.beginPath();
  ctx.arc(teX, teY, 2, 0, Math.PI * 2);
  ctx.fill();
  
  return true;
}

// ─── AIRFOIL PREVIEW COMPONENT ────────────────────────────────
function AirfoilPreview({ name, color, isHovered, cstData, loading }) {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    
    ctx.clearRect(0, 0, W, H);
    
    if (loading) {
      ctx.fillStyle = '#6f7d86';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Loading...', W/2, H/2);
      return;
    }
    
    let rendered = false;
    
    if (cstData && cstData.length === 16) {
      rendered = renderAirfoilFromCST(ctx, cstData, color, isHovered, W, H);
    }
    
    if (!rendered) {
      const nacaMatch = name.toLowerCase().match(/naca\s*(\d{4,5})/);
      if (nacaMatch) {
        const code = nacaMatch[1];
        if (code.length === 4) {
          const points = generateNACA4(code, 55);
          if (points) {
            rendered = renderAirfoilPoints(ctx, points, color, isHovered, W, H);
          }
        }
      }
    }
    
    if (!rendered) {
      ctx.fillStyle = '#6f7d86';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('—', W/2, H/2);
    }
    
  }, [name, color, isHovered, cstData, loading]);
  
  return (
    <canvas 
      ref={canvasRef} 
      width={280} 
      height={90} 
      className={styles.previewCanvas}
    />
  );
}

// ─── AIRFOIL CARD ──────────────────────────────────────────────
function AirfoilCard({ airfoil, onLoad, onDownload }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cstData, setCstData] = useState(null);
  const [loadingCst, setLoadingCst] = useState(false);
  
  const family = useMemo(() => {
    const name = airfoil.name.toLowerCase();
    if (name.startsWith('naca')) return 'naca';
    if (name.startsWith('e')) return 'eppler';
    if (name.startsWith('fx')) return 'fx';
    if (name.startsWith('goe')) return 'goe';
    if (name.startsWith('clark')) return 'clark';
    if (name.startsWith('rae')) return 'rae';
    if (name.startsWith('s')) return 's';
    return 'default';
  }, [airfoil.name]);

  const color = FAMILY_COLORS[family] || FAMILY_COLORS.default;
  const familyLabel = FAMILY_LABELS[family] || FAMILY_LABELS.default;

  useEffect(() => {
    const loadCst = async () => {
      if (loadingCst || cstData) return;
      
      const token = localStorage.getItem('token');
      if (!token) return;
      
      setLoadingCst(true);
      try {
        const res = await fetch(`${API_BASE_URL}/airfoils/${encodeURIComponent(airfoil.name)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.cst_coefficients && data.cst_coefficients.length === 16) {
            setCstData(data.cst_coefficients);
          }
        }
      } catch (err) {
        console.error('Failed to load CST for:', airfoil.name);
      } finally {
        setLoadingCst(false);
      }
    };
    
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        loadCst();
        observer.disconnect();
      }
    }, { threshold: 0.1 });
    
    const cardElement = document.getElementById(`card-${airfoil.id}`);
    if (cardElement) {
      observer.observe(cardElement);
    }
    
    return () => observer.disconnect();
  }, [airfoil.id, airfoil.name, cstData, loadingCst]);

  const handleLoad = async () => {
    setIsLoading(true);
    await onLoad(airfoil);
    setIsLoading(false);
  };

  return (
    <motion.div
      id={`card-${airfoil.id}`}
      className={styles.airfoilCard}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{ y: -6 }}
      transition={{ duration: 0.3 }}
    >
      <div className={styles.cardAccent} style={{ background: color }} />
      
      <div className={styles.cardHeader}>
        <div className={styles.cardNameSection}>
          <span className={styles.cardName}>{airfoil.name}</span>
          <span className={styles.cardFamily} style={{ background: `${color}18`, color }}>
            {familyLabel}
          </span>
        </div>
      </div>

      <div className={styles.cardPreview}>
        <AirfoilPreview 
          name={airfoil.name} 
          color={color} 
          isHovered={isHovered}
          cstData={cstData}
          loading={loadingCst}
        />
      </div>

      <div className={styles.cardFooter}>
        <div className={styles.cardMetrics}>
          <span className={styles.cardMetric}>
            <FiCpu size={12} />
            <span>READY</span>
          </span>
          <span className={styles.cardMetric}>
            <FiClock size={12} />
            <span>INSTANT</span>
          </span>
        </div>
        <div className={styles.cardActions}>
          <button 
            className={styles.cardLoadBtn}
            onClick={handleLoad}
            disabled={isLoading}
            style={{ '--btn-color': color }}
          >
            {isLoading ? 'LOADING...' : 'LOAD'}
            <FiArrowRight size={14} />
          </button>
          <button 
            className={styles.cardDownloadBtn}
            onClick={() => onDownload(airfoil)}
          >
            <FiDownload size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── SEARCH BAR ──────────────────────────────────────────────────
function SearchBar({ query, setQuery, loading, totalResults }) {
  const inputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={styles.searchBar}>
      <div className={styles.searchInputWrapper}>
        <FiSearch className={styles.searchIcon} size={18} />
        <input
          ref={inputRef}
          type="text"
          className={styles.searchInput}
          placeholder="Search airfoil database... (Ctrl+K)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button 
            className={styles.searchClear}
            onClick={() => setQuery('')}
          >
            <FiX size={16} />
          </button>
        )}
        {loading && <div className={styles.searchSpinner} />}
      </div>
      {totalResults > 0 && (
        <span className={styles.searchResults}>{totalResults} results</span>
      )}
    </div>
  );
}

// ─── COMPLETE AIRFOIL LIST ─────────────────────────────────────
const FALLBACK_AIRFOILS = [
  'NACA 2412', 'NACA 4412', 'NACA 0015', 'NACA 2415',
  'NACA 4415', 'NACA 0006', 'NACA 0010', 'NACA 0018', 'NACA 0024',
  'NACA 1408', 'NACA 1412', 'NACA 23012', 'NACA 23015', 'NACA 2408',
  'NACA 6412', 'NACA 64A010', 'Clark Y', 'Clark W', 'E193', 'E214',
  'E387', 'E423', 'E473', 'FX 63-137', 'FX 74-CL5-140', 'GOE 387',
  'GOE 417A', 'GOE 435', 'M6', 'S1223', 'S8036', 'S8037', 'RAE 2822',
  'S1091', 'Eppler E193', 'Eppler E214', 'Eppler E387', 'NACA 23012'
];

// ─── MAIN PAGE ──────────────────────────────────────────────────
export default function LibraryPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [allAirfoils, setAllAirfoils] = useState([]);
  const [displayedAirfoils, setDisplayedAirfoils] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [viewMode, setViewMode] = useState('grid');
  const [filterFamily, setFilterFamily] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const pageSize = 30;
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef(null);

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

  // ─── Load Library ──────────────────────────────────────────────
  useEffect(() => {
    const loadLibrary = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/auth/login');
        return;
      }

      setLoading(true);
      try {
        let names = [];
        let success = false;
        
        // Try the search endpoint with empty query to get all airfoils
        try {
          const res = await fetch(`${API_BASE_URL}/airfoils/search?q=`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              names = data.map(item => item.name || item);
              success = true;
            }
          }
        } catch (e) {
          console.log('Search endpoint failed, trying saved projects...');
        }
        
        // If search failed, try saved projects
        if (!success) {
          try {
            const res = await fetch(`${API_BASE_URL}/airfoils/saved?limit=1000`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data) && data.length > 0) {
                names = data.map(item => item.name || 'Unknown');
                success = true;
              }
            }
          } catch (e) {
            console.log('Saved endpoint failed, using fallback...');
          }
        }
        
        // Use fallback list if API calls failed or returned empty
        if (!success || names.length === 0) {
          names = FALLBACK_AIRFOILS;
        }
        
        // Remove duplicates and empty entries
        const uniqueNames = [...new Set(names)].filter(name => name && name.trim().length > 0);
        
        const airfoils = uniqueNames.map((name, index) => ({
          id: `lib_${index}`,
          name: typeof name === 'string' ? name.trim() : String(name),
          is_library: true
        }));

        setAllAirfoils(airfoils);
        setDisplayedAirfoils(airfoils.slice(0, pageSize));
        setHasMore(airfoils.length > pageSize);
        setPage(1);
      } catch (err) {
        console.error('Library load error:', err);
        // Use fallback list
        const airfoils = FALLBACK_AIRFOILS.filter(name => name && name.trim().length > 0).map((name, index) => ({
          id: `lib_${index}`,
          name: name,
          is_library: true
        }));
        setAllAirfoils(airfoils);
        setDisplayedAirfoils(airfoils.slice(0, pageSize));
        setHasMore(airfoils.length > pageSize);
        setPage(1);
      } finally {
        setLoading(false);
      }
    };

    loadLibrary();
  }, [router, showToast]);

  // ─── Search & Filter ──────────────────────────────────────────
  useEffect(() => {
    if (!allAirfoils.length) return;

    let filtered = allAirfoils;

    if (query.trim()) {
      const searchTerm = query.toLowerCase().trim();
      filtered = filtered.filter(af => 
        af.name.toLowerCase().includes(searchTerm)
      );
    }

    if (filterFamily !== 'all') {
      filtered = filtered.filter(af => {
        const name = af.name.toLowerCase();
        if (filterFamily === 'naca') return name.startsWith('naca');
        if (filterFamily === 'eppler') return name.startsWith('e');
        if (filterFamily === 'fx') return name.startsWith('fx');
        if (filterFamily === 'goe') return name.startsWith('goe');
        if (filterFamily === 'clark') return name.startsWith('clark');
        if (filterFamily === 'rae') return name.startsWith('rae');
        return true;
      });
    }

    setDisplayedAirfoils(filtered.slice(0, pageSize));
    setHasMore(filtered.length > pageSize);
    setPage(1);
  }, [query, filterFamily, allAirfoils]);

  // ─── Load More ──────────────────────────────────────────────────
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;

    let filtered = allAirfoils;
    if (query.trim()) {
      const searchTerm = query.toLowerCase().trim();
      filtered = filtered.filter(af => af.name.toLowerCase().includes(searchTerm));
    }
    if (filterFamily !== 'all') {
      filtered = filtered.filter(af => {
        const name = af.name.toLowerCase();
        if (filterFamily === 'naca') return name.startsWith('naca');
        if (filterFamily === 'eppler') return name.startsWith('e');
        if (filterFamily === 'fx') return name.startsWith('fx');
        if (filterFamily === 'goe') return name.startsWith('goe');
        if (filterFamily === 'clark') return name.startsWith('clark');
        if (filterFamily === 'rae') return name.startsWith('rae');
        return true;
      });
    }

    setLoadingMore(true);
    const start = page * pageSize;
    const end = start + pageSize;
    const nextBatch = filtered.slice(start, end);
    
    if (nextBatch.length > 0) {
      setDisplayedAirfoils(prev => [...prev, ...nextBatch]);
      setPage(prev => prev + 1);
      setHasMore(end < filtered.length);
    } else {
      setHasMore(false);
    }
    setLoadingMore(false);
  }, [page, hasMore, query, filterFamily, allAirfoils, loadingMore]);

  // ─── Infinite Scroll ──────────────────────────────────────────
  const lastItemRef = useCallback((node) => {
    if (loading || loadingMore) return;
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) {
        loadMore();
      }
    }, { threshold: 0.1, rootMargin: '100px' });

    if (node) observerRef.current.observe(node);
  }, [loading, loadingMore, hasMore, loadMore]);

  // ─── Handlers ──────────────────────────────────────────────────
  const handleLoadAirfoil = async (airfoil) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
      const res = await fetch(`${API_BASE_URL}/airfoils/${encodeURIComponent(airfoil.name)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.cst_coefficients) {
          const cstString = encodeURIComponent(JSON.stringify(data.cst_coefficients));
          router.push(`/workbench?importedCST=${cstString}&name=${encodeURIComponent(data.name)}`);
          showToast(`Loaded ${data.name}`);
        } else {
          router.push(`/workbench?airfoil=${encodeURIComponent(airfoil.name)}`);
          showToast(`Loading ${airfoil.name}`);
        }
      } else {
        router.push(`/workbench?airfoil=${encodeURIComponent(airfoil.name)}`);
        showToast(`Loading ${airfoil.name}`);
      }
    } catch (err) {
      router.push(`/workbench?airfoil=${encodeURIComponent(airfoil.name)}`);
      showToast(`Loading ${airfoil.name}`);
    }
  };

  const handleDownloadAirfoil = (airfoil) => {
    const content = `# ${airfoil.name}\n# UIUC Airfoil Database\n# Load in workbench to export full coordinates`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${airfoil.name.replace(/\s+/g, '_')}.dat`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${airfoil.name}`);
  };

  const families = [
    { id: 'all', label: 'All Families' },
    { id: 'naca', label: 'NACA' },
    { id: 'eppler', label: 'Eppler' },
    { id: 'fx', label: 'FX' },
    { id: 'goe', label: 'Gö' },
    { id: 'clark', label: 'Clark' },
    { id: 'rae', label: 'RAE' },
  ];

  const totalResults = displayedAirfoils.length;

  return (
    <div className={styles.masterContainer}>
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <main className={styles.mainContent}>
        {/* ─── HEADER ───────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div>
              <h1 className={styles.title}>
                <span className={styles.titleIcon}>📚</span>
                Airfoil <span className={styles.highlight}>Library</span>
              </h1>
              <p className={styles.subtitle}>
                {allAirfoils.length.toLocaleString()} profiles · UIUC Database
              </p>
            </div>
            <div className={styles.headerActions}>
              <button 
                className={styles.viewToggle}
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              >
                {viewMode === 'grid' ? <FiList size={18} /> : <FiGrid size={18} />}
              </button>
              <button 
                className={`${styles.filterToggle} ${showFilters ? styles.filterToggleActive : ''}`}
                onClick={() => setShowFilters(!showFilters)}
              >
                <FiFilter size={16} />
                <span>Filters</span>
                {filterFamily !== 'all' && <span className={styles.filterBadge} />}
              </button>
            </div>
          </div>
        </header>

        <SearchBar 
          query={query} 
          setQuery={setQuery} 
          loading={loading}
          totalResults={totalResults}
        />

        <AnimatePresence>
          {showFilters && (
            <motion.div 
              className={styles.filtersPanel}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className={styles.filtersContent}>
                <div className={styles.filterGroup}>
                  <span className={styles.filterLabel}>Family</span>
                  <div className={styles.filterOptions}>
                    {families.map(f => (
                      <button
                        key={f.id}
                        className={`${styles.filterOption} ${filterFamily === f.id ? styles.filterOptionActive : ''}`}
                        onClick={() => setFilterFamily(f.id)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <section className={styles.resultsSection}>
          {loading ? (
            <div className={styles.loadingGrid}>
              {[...Array(12)].map((_, i) => (
                <div key={i} className={styles.skeletonCard}>
                  <div className={styles.skeletonPreview} />
                  <div className={styles.skeletonLine} style={{ width: '60%' }} />
                  <div className={styles.skeletonLine} style={{ width: '40%' }} />
                  <div className={styles.skeletonLine} style={{ width: '80%' }} />
                </div>
              ))}
            </div>
          ) : displayedAirfoils.length === 0 ? (
            <div className={styles.emptyState}>
              <FiBookOpen size={48} />
              <h3>No Results</h3>
              <p>No airfoils match your search criteria</p>
              <button 
                className={styles.emptyResetBtn}
                onClick={() => { setQuery(''); setFilterFamily('all'); }}
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className={viewMode === 'grid' ? styles.gridView : styles.listView}>
              {displayedAirfoils.map((airfoil, index) => {
                const isLast = index === displayedAirfoils.length - 1;
                return (
                  <div 
                    key={airfoil.id || airfoil.name} 
                    ref={isLast ? lastItemRef : null}
                  >
                    <AirfoilCard 
                      airfoil={airfoil}
                      onLoad={handleLoadAirfoil}
                      onDownload={handleDownloadAirfoil}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {loadingMore && (
            <div className={styles.loadingMore}>
              <div className={styles.spinner} />
              <span>Loading...</span>
            </div>
          )}

          {!loading && !loadingMore && !hasMore && displayedAirfoils.length > 0 && (
            <div className={styles.endMessage}>
              {allAirfoils.length.toLocaleString()} profiles loaded
            </div>
          )}
        </section>

        <div className={styles.libraryFooter}>
          <span>UIUC Airfoil Database</span>
          <span>·</span>
          <span>{allAirfoils.length.toLocaleString()} profiles</span>
          <span>·</span>
          <span>v1.0</span>
        </div>
      </main>
    </div>
  );
}