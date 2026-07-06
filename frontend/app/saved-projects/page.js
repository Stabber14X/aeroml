'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { generateAirfoilCoordinates } from '@/lib/cst_geometry';
import SubscriptionGuard from '@/components/SubscriptionGuard';
import styles from '../dashboard/dashboard.module.css';
import libraryStyles from './saved.module.css';

const API_BASE_URL = 'https://aeroml-production.up.railway.app';

// FIXED: Use counter-based unique ID generator (no Math.random for hydration)
let toastCounter = 0;
const generateUniqueId = () => {
    return `toast-${Date.now()}-${++toastCounter}`;
};

// ─── PROJECT CARD COMPONENT ──────────────────────────────────────────────
function ProjectCard({ project, onSelect, onDelete, isDeleting }) {
  const previewCoords = useMemo(() => {
    try {
      const cst = project.cst_coefficients;
      if (!cst || cst.length < 16) return null;
      
      const upper = cst.slice(0, 8).map(Number);
      const lower = cst.slice(8, 16).map(Number);
      const coords = generateAirfoilCoordinates({ a_upper: upper, a_lower: lower }, 180);
      return coords;
    } catch (e) {
      return null;
    }
  }, [project.cst_coefficients]);

  const hasCoords = previewCoords && previewCoords.length > 0;

  return (
    <article className={libraryStyles.card}>
      <div className={libraryStyles.cardHeader}>
        <div>
          <h4 className={libraryStyles.cardTitle}>{project.name || 'Untitled'}</h4>
          <div className={libraryStyles.cardMeta}>
            <span className={libraryStyles.metaItem}>ID {project.id}</span>
            {typeof project.reynolds !== 'undefined' && (
              <span className={libraryStyles.metaItem}>Re {Number(project.reynolds).toLocaleString()}</span>
            )}
            {typeof project.alpha !== 'undefined' && (
              <span className={libraryStyles.metaItem}>α {project.alpha}°</span>
            )}
          </div>
        </div>

        <div className={libraryStyles.actions}>
          <button className={libraryStyles.iconBtn} onClick={onSelect} title="Restore to Workbench">
            Restore
          </button>
          <button className={libraryStyles.iconBtnDanger} onClick={onDelete} title="Delete project">
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      <div className={libraryStyles.previewWrap}>
        {hasCoords ? (
          <FastPreview coords={previewCoords} id={project.id} />
        ) : (
          <div className={libraryStyles.previewEmpty}>
            <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
              <path d="M10 30 L20 20 L30 25 L40 15 L50 20 L50 40 L40 35 L30 42 L20 32 L10 40 Z" 
                stroke="#30363d" strokeWidth="1.5" fill="none" />
              <text x="30" y="55" textAnchor="middle" fill="#30363d" fontSize="10" fontFamily="monospace">
                No preview
              </text>
            </svg>
          </div>
        )}
      </div>

      <div className={libraryStyles.cardFooter}>
        <div className={libraryStyles.stats}>
          <span className={libraryStyles.statLabel}>Cl</span>
          <span className={libraryStyles.statValue}>
            {(project.cl || 0).toFixed(4)}
          </span>
        </div>
        <div className={libraryStyles.stats}>
          <span className={libraryStyles.statLabel}>Cd</span>
          <span className={libraryStyles.statValue}>
            {(project.cd || 0).toFixed(5)}
          </span>
        </div>
        <div className={libraryStyles.stats}>
          <span className={libraryStyles.statLabel}>Cm</span>
          <span className={libraryStyles.statValue}>
            {(project.cm || 0).toFixed(4)}
          </span>
        </div>
      </div>
    </article>
  );
}

// ─── FAST PREVIEW COMPONENT ──────────────────────────────────────────────
function FastPreview({ coords, id }) {
  const width = 340;
  const height = 120;
  
  const computePath = () => {
    if (!coords || coords.length < 2) return '';
    
    const xs = coords.map(p => p[0]);
    const ys = coords.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const dx = maxX - minX || 1;
    const dy = maxY - minY || 1;
    const pad = 10;
    
    const mapX = (x) => pad + ((x - minX) / dx) * (width - pad * 2);
    const mapY = (y) => height - (pad + ((y - minY) / dy) * (height - pad * 2));
    
    let d = '';
    for (let i = 0; i < coords.length; i++) {
      const x = mapX(coords[i][0]);
      const y = mapY(coords[i][1]);
      if (i === 0) d = `M ${x} ${y}`;
      else {
        const px = mapX(coords[i - 1][0]);
        const py = mapY(coords[i - 1][1]);
        const cx = (px + x) / 2;
        const cy = (py + y) / 2;
        d += ` Q ${px} ${py} ${cx} ${cy}`;
      }
    }
    d += ' Z';
    return d;
  };

  const pathD = computePath();

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={libraryStyles.previewSvg}>
      <defs>
        <linearGradient id={`g-${id || 'preview'}`} x1="0" x2="1">
          <stop offset="0%" stopColor="#00d1ff" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#007AFF" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#003a8c" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <path 
        d={pathD} 
        fill={`url(#g-${id || 'preview'})`} 
        stroke="#00d1ff" 
        strokeWidth="0.9" 
        strokeOpacity="0.9" 
        fillOpacity="0.14" 
      />
      <path 
        d={pathD} 
        fill="none" 
        stroke="#00d1ff" 
        strokeWidth="0.6" 
        strokeOpacity="0.25" 
      />
    </svg>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────
function SavedProjectsContent() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toastList, setToastList] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null, name: '' });
  const [deletingId, setDeletingId] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const router = useRouter();
  const observerRef = useRef(null);
  const projectsRef = useRef([]);

  // FIXED: pushToast with guaranteed unique IDs (no Math.random)
  const pushToast = useCallback((message, type = 'success') => {
    const id = generateUniqueId();
    setToastList(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToastList(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  // OPTIMIZATION: Fetch only user-saved projects (NOT library airfoils)
  const fetchProjects = useCallback(async (reset = true) => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth/login');
      return;
    }

    if (reset) {
      setLoading(true);
      setProjects([]);
      setPage(0);
      setHasMore(true);
      projectsRef.current = [];
    }

    try {
      const currentPage = reset ? 0 : page;
      const limit = 20;
      const offset = currentPage * limit;

      const res = await fetch(`${API_BASE_URL}/airfoils/saved?limit=${limit}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        if (res.status === 401) router.push('/auth/login');
        throw new Error('Failed to fetch saved projects');
      }

      const data = await res.json();
      
      // Data already filtered to exclude library airfoils by backend
      const userProjects = Array.isArray(data) ? data : [];

      if (reset) {
        projectsRef.current = userProjects;
        setProjects(userProjects);
        setHasMore(userProjects.length === limit);
        setPage(1);
      } else {
        const newProjects = [...projectsRef.current, ...userProjects];
        projectsRef.current = newProjects;
        setProjects(newProjects);
        setHasMore(userProjects.length === limit);
        setPage(prev => prev + 1);
      }
    } catch (e) {
      pushToast('Failed to load saved projects', 'error');
      console.error(e);
    } finally {
      if (reset) setLoading(false);
      setLoadingMore(false);
    }
  }, [page, router, pushToast]);

  // Initial load
  useEffect(() => {
    fetchProjects(true);
  }, []);

  // Infinite scroll
  const lastProjectRef = useCallback((node) => {
    if (loading || loadingMore) return;
    if (observerRef.current) observerRef.current.disconnect();
    
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) {
        setLoadingMore(true);
        fetchProjects(false);
      }
    }, { threshold: 0.1 });
    
    if (node) observerRef.current.observe(node);
  }, [loading, loadingMore, hasMore, fetchProjects]);

  const handleSelectProject = (projectId, projectName) => {
    router.push(`/workbench?projectId=${projectId}&name=${encodeURIComponent(projectName)}`);
  };

  const askDelete = (id, name) => setConfirmDelete({ open: true, id, name });
  const cancelDelete = () => setConfirmDelete({ open: false, id: null, name: '' });

  const confirmDeleteNow = async () => {
    const id = confirmDelete.id;
    if (!id) return;
    setDeletingId(id);
    const token = localStorage.getItem('token');

    const removeFromUI = () => {
      projectsRef.current = projectsRef.current.filter(p => (p.id ?? p.airfoil_id) !== id);
      setProjects(projectsRef.current);
    };

    try {
      let res = await fetch(`${API_BASE_URL}/airfoils/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res || !res.ok) {
        try {
          res = await fetch(`${API_BASE_URL}/airfoils/${id}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'X-HTTP-Method-Override': 'DELETE',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ force: true })
          });
        } catch (e) {}
      }

      if (res && res.ok) {
        removeFromUI();
        pushToast('Project deleted', 'success');
      } else {
        let errMsg = 'Delete failed';
        try {
          if (res) {
            const j = await res.json().catch(() => null);
            if (j && j.detail) errMsg = `Delete failed: ${j.detail}`;
          }
        } catch (e) {}
        pushToast(errMsg, 'error');
      }
    } catch (error) {
      console.error('Delete attempt failed', error);
      pushToast('Network error while deleting project', 'error');
    } finally {
      setDeletingId(null);
      cancelDelete();
    }
  };

  // Render projects with lazy loading
  const renderProject = (project, index) => {
    const isLast = index === projects.length - 1;
    const id = project.id ?? project.airfoil_id;
    
    return (
      <div
        key={`${id}-${index}`}
        ref={isLast ? lastProjectRef : null}
      >
        <ProjectCard
          project={project}
          onSelect={() => handleSelectProject(id, project.name)}
          onDelete={() => askDelete(id, project.name)}
          isDeleting={deletingId === id}
        />
      </div>
    );
  };

  return (
    <div className={styles.masterContainer}>
      <main className={styles.mainContent}>
        <header className={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <h1 className={styles.title}>Saved <span className={styles.highlight}>Projects</span></h1>
            <div className={libraryStyles.badgeCount}>{projects.length}</div>
          </div>
          <p className={styles.subtitle}>Your saved designs, previews and quick actions. Click a card to restore, or remove a project you no longer need.</p>
        </header>

        <section className={libraryStyles.wrapper}>
          {loading && (
            <div className={libraryStyles.loadingIndicator}>
              <div className={libraryStyles.spinner} />
              Loading saved projects…
            </div>
          )}

          {!loading && projects.length === 0 && (
            <div className={libraryStyles.emptyState}>
              <h3>No saved projects yet</h3>
              <p>Create and save a design in the Workbench, or save optimized designs from the Pareto page to show them here.</p>
            </div>
          )}

          {!loading && projects.length > 0 && (
            <div className={libraryStyles.grid}>
              {projects.map((project, index) => renderProject(project, index))}
            </div>
          )}

          {loadingMore && (
            <div className={libraryStyles.loadingMore}>
              <div className={libraryStyles.spinnerSmall} />
              Loading more…
            </div>
          )}

          {!loading && !loadingMore && !hasMore && projects.length > 0 && (
            <div className={libraryStyles.endMessage}>— All projects loaded —</div>
          )}
        </section>
      </main>

      {/* Confirm Delete Modal */}
      {confirmDelete.open && (
        <div className={libraryStyles.modalOverlay} onClick={cancelDelete}>
          <div className={libraryStyles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3>Delete project</h3>
            <p>Are you sure you want to permanently delete <strong>{confirmDelete.name || 'this project'}</strong>? This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
              <button className={libraryStyles.btnGhost} onClick={cancelDelete}>Cancel</button>
              <button className={libraryStyles.btnDanger} onClick={confirmDeleteNow}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts with stable keys */}
      <div className={libraryStyles.toastContainer}>
        {toastList.map((t, index) => (
          <div 
            key={t.id || `toast-${index}`} 
            className={`${libraryStyles.toast} ${t.type === 'error' ? libraryStyles.toastError : libraryStyles.toastOk}`}
          >
            {t.type === 'error' ? '❌' : '✅'} {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── EXPORT WITH SUBSCRIPTION GUARD ────────────────────────────
export default function SavedProjectsPage() {
  return (
    <SubscriptionGuard>
      <SavedProjectsContent />
    </SubscriptionGuard>
  );
}