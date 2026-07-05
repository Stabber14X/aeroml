// frontend/src/components/Sidebar.jsx
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import styles from './Sidebar.module.css';

import {
  FiGrid, FiBookOpen, FiUploadCloud, FiTool, FiBox, 
  FiTarget, FiSave, FiDownloadCloud, FiClock, FiCheckCircle,  
  FiShield, FiWind, FiActivity, FiCrosshair, FiCpu, 
  FiLogOut, FiChevronLeft, FiChevronRight, FiLayers, FiCamera  
} from 'react-icons/fi';

const iconMap = {
  'Dashboard': FiGrid,
  'Library': FiBookOpen,
  'Import': FiUploadCloud,
  'AeroVision': FiCamera,
  'Workbench': FiTool,
  'Inverse Design': FiBox,
  'Pareto Analysis': FiTarget,
  'Finite Wing': FiWind, 
  'Neural Flow': FiActivity, 
  'Flight Dynamics': FiCrosshair,
  'AeroSAGE Anomaly': FiLayers,
  'Saved Projects': FiSave,
  'Sovereign Dossier': FiShield,
  'Export': FiDownloadCloud,
  'Async Tasks': FiClock,
  'Admin': FiShield,
};

const allNavItems = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Library', href: '/library' },
  { name: 'Import', href: '/import' },
  { name: 'AeroVision', href: '/vision' },
  { name: 'Workbench', href: '/workbench' },
  { name: 'Inverse Design', href: '/inverse-design' },
  { name: 'Pareto Analysis', href: '/pareto' },
  { name: 'Finite Wing', href: '/finite-wing' },
  { name: 'Neural Flow', href: '/neural-flow' }, 
  { name: 'Flight Dynamics', href: '/flight-dynamics' },
  { name: 'AeroSAGE Anomaly', href: '/aerosage' }, 
  { name: 'Saved Projects', href: '/saved-projects' },
  { name: 'Sovereign Dossier', href: '/deep-analysis' },
  { name: 'Export', href: '/export' },
  { name: 'Async Tasks', href: '/tasks' },
  { name: 'Admin', href: '/admin' },
];

export default function Sidebar({ isExpanded, toggleSidebar }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();
  
  const [localExpanded, setLocalExpanded] = useState(true);
  const effectiveExpanded = isExpanded !== undefined ? isExpanded : localExpanded;
  const handleToggle = toggleSidebar || (() => setLocalExpanded(!localExpanded));
  const effectiveWidth = effectiveExpanded ? '240px' : '65px';

  const [displayName, setDisplayName] = useState('User');
  const [initials, setInitials] = useState('U');
  const [userAdminStatus, setUserAdminStatus] = useState(false);

  // Get user info from token
  useEffect(() => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const payloadBase64 = token.split('.')[1];
        const payload = JSON.parse(atob(payloadBase64));
        const email = payload.sub || 'User';
        const namePart = email.split('@')[0];
        const formatted = namePart.replace(/[._]/g, ' ').split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        setDisplayName(formatted);
        setInitials(formatted.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase());
      }
    } catch (e) {
      console.error('Failed to decode user token', e);
    }
  }, []);

  // Check admin status whenever user or loading changes
  useEffect(() => {
    if (!loading) {
      const adminStatus = user?.is_admin === true || user?.tier === 'admin';
      setUserAdminStatus(adminStatus);
      console.log('🔍 Sidebar: user =', user);
      console.log('🔍 Sidebar: isAdmin =', adminStatus);
    }
  }, [loading, user]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('show_upgrade_modal');
    router.push('/auth/login');
  };

  // Filter nav items - SHOW ADMIN if user is admin
  const navItems = allNavItems.filter(item => {
    if (item.name === 'Admin') {
      return userAdminStatus || user?.is_admin === true || user?.tier === 'admin';
    }
    return true;
  });

  const ToggleIcon = effectiveExpanded ? FiChevronLeft : FiChevronRight;

  if (loading) {
    return (
      <nav className={styles.sidebar} style={{ width: effectiveWidth }}>
        <div className={styles.header}>
          <div className={styles.branding}>
            <span className={styles.logoIcon}>✈</span>
            <span className={styles.logoText}>AeroML</span>
            <span className={styles.logoBadge}>v7</span>
          </div>
        </div>
        <div className={styles.navLinksScroll}>
          <div style={{ padding: '20px', color: '#4b5563', textAlign: 'center', fontSize: '12px' }}>
            Loading...
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className={styles.sidebar} style={{ width: effectiveWidth }}>
      <div className={styles.header}>
        <div className={styles.branding}>
          <span className={styles.logoIcon}>✈</span>
          <span className={styles.logoText}>AeroML</span>
          <span className={styles.logoBadge}>v7</span>
        </div>
        <button className={styles.toggleButton} onClick={handleToggle} aria-label="Toggle sidebar">
          <ToggleIcon size={18} />
        </button>
      </div>

      <div className={styles.navLinksScroll}>
        {navItems.map((item) => {
          const IconComponent = iconMap[item.name];
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.name} 
              href={item.href} 
              className={`${styles.navLink} ${isActive ? styles.active : ''}`}
            >
              {IconComponent && <IconComponent size={20} />}
              <span className={styles.linkText}>{item.name}</span>
              {!effectiveExpanded && <span className={styles.tooltip}>{item.name}</span>}
            </Link>
          );
        })}
      </div>

      <div className={styles.footer}>
        {effectiveExpanded && (
          <div className={styles.userInfo}>
            <div className={styles.userAvatar}>{initials}</div>
            <div className={styles.userDetails}>
              <span className={styles.userName}>{displayName}</span>
              <span className={styles.userStatus}>
                {userAdminStatus ? '🛡️ Admin' : 'Online'}
              </span>
            </div>
          </div>
        )}
        
        <button onClick={handleLogout} className={styles.logoutButton}>
          <FiLogOut size={18} />
          <span>Sign Out</span>
          {!effectiveExpanded && <span className={styles.tooltip}>Sign Out</span>}
        </button>
      </div>
    </nav>
  );
}