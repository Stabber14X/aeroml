// frontend/src/components/SubscriptionGuard.jsx
// COMPLETE FIXED IMPLEMENTATION

'use client';
import { useAuth } from '@/context/AuthContext';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SubscriptionGuard({ children, requireAdmin = false }) {
  const { hasAccess, loading, user, subscriptionExpired, isAdmin } = useAuth();
  const router = useRouter();

  // ─── DEBUG LOGGING ──────────────────────────────────────────────────────
  useEffect(() => {
    console.log('🔍 SubscriptionGuard - loading:', loading);
    console.log('🔍 SubscriptionGuard - user:', user);
    console.log('🔍 SubscriptionGuard - requireAdmin:', requireAdmin);
    console.log('🔍 SubscriptionGuard - isAdmin():', isAdmin());
    console.log('🔍 SubscriptionGuard - hasAccess():', hasAccess());
  }, [loading, user, requireAdmin, isAdmin, hasAccess]);

  // ─── CHECK ACCESS ──────────────────────────────────────────────────────

  useEffect(() => {
    // Wait for loading to complete
    if (loading) return;

    // Check if user is authenticated
    if (!user) {
      console.log('🔍 SubscriptionGuard - No user, redirecting to login');
      router.push('/auth/login');
      return;
    }

    // Check admin requirement
    if (requireAdmin) {
      const adminStatus = user.is_admin === true || user.tier === 'admin';
      console.log('🔍 SubscriptionGuard - requireAdmin check, isAdmin:', adminStatus);
      if (!adminStatus) {
        console.log('🔍 SubscriptionGuard - Not admin, redirecting to dashboard');
        router.push('/dashboard');
        return;
      }
    }

    // Check subscription access
    const access = hasAccess();
    if (!access && !user?.is_admin) {
      console.log('🔍 SubscriptionGuard - No access, showing upgrade modal');
      localStorage.setItem('show_upgrade_modal', 'true');
      localStorage.setItem('subscription_status', 'expired');
      localStorage.setItem('subscription_detail', 'Your access has expired');
      
      window.dispatchEvent(new CustomEvent('subscription:expired', {
        detail: { 
          status: 'expired', 
          detail: 'Your access has expired. Please upgrade to continue.'
        }
      }));
    } else {
      console.log('🔍 SubscriptionGuard - Access granted');
    }
  }, [loading, user, hasAccess, isAdmin, requireAdmin, router]);

  // ─── LOADING STATE ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#0b1116',
        color: '#e2e8f0',
        fontFamily: 'monospace'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid #1e293b',
            borderTopColor: '#38bdf8',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px'
          }} />
          <div style={{ fontSize: '14px', color: '#64748b', letterSpacing: '2px' }}>
            LOADING AEROML...
          </div>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  // ─── NO ACCESS - SHOW NOTHING (MODAL WILL APPEAR) ──────────────────

  if (!hasAccess() && !user?.is_admin) {
    return null;
  }

  // ─── ADMIN CHECK ─────────────────────────────────────────────────────

  if (requireAdmin && !isAdmin()) {
    return null;
  }

  // ─── RENDER CHILDREN ─────────────────────────────────────────────────

  return <>{children}</>;
}