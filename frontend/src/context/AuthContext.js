// frontend/src/context/AuthContext.js
// COMPLETE FIXED IMPLEMENTATION

'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI, api } from '@/lib/api';
import { useRouter } from 'next/navigation';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState(null);
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();

  // ─── LOAD USER ──────────────────────────────────────────────────────────

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      setUser(null);
      return;
    }

    try {
      const userData = await authAPI.getMe();
      
      const userWithAdmin = {
        ...userData,
        is_admin: userData.is_admin === true || userData.tier === 'admin',
        tier: userData.tier || 'free'
      };
      
      setUser(userWithAdmin);
      localStorage.setItem('user', JSON.stringify(userWithAdmin));
      
      try {
        const subData = await authAPI.checkSubscription();
        setSubscription(subData);
        
        const isExpired = !userWithAdmin.is_admin && !subData?.subscription?.is_active;
        
        if (isExpired) {
          localStorage.setItem('show_upgrade_modal', 'true');
          localStorage.setItem('subscription_status', subData?.subscription?.status || 'expired');
          localStorage.setItem('subscription_detail', subData?.subscription?.type || 'Subscription expired');
          setSubscriptionExpired(true);
          
          window.dispatchEvent(new CustomEvent('subscription:expired', {
            detail: { 
              status: subData?.subscription?.status || 'expired',
              detail: subData?.subscription?.type || 'Subscription expired'
            }
          }));
        } else {
          localStorage.removeItem('show_upgrade_modal');
          localStorage.removeItem('subscription_status');
          localStorage.removeItem('subscription_detail');
          setSubscriptionExpired(false);
        }
      } catch (subError) {
        console.error('Failed to load subscription:', subError);
        if (!userWithAdmin.is_admin) {
          localStorage.setItem('show_upgrade_modal', 'true');
          setSubscriptionExpired(true);
        }
      }
      
    } catch (error) {
      console.error('Failed to load user:', error);
      
      if (error.message === 'SUBSCRIPTION_EXPIRED' || error.message === 'UNAUTHORIZED') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        setSubscription(null);
        if (error.message === 'SUBSCRIPTION_EXPIRED') {
          setSubscriptionExpired(true);
        }
      } else {
        setUser(null);
        setSubscription(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── LISTEN FOR EXPIRY EVENTS ─────────────────────────────────────────

  useEffect(() => {
    const handleExpired = (event) => {
      localStorage.setItem('show_upgrade_modal', 'true');
      setSubscriptionExpired(true);
      loadUser();
    };
    
    window.addEventListener('subscription:expired', handleExpired);
    return () => window.removeEventListener('subscription:expired', handleExpired);
  }, [loadUser]);

  // ─── INITIAL LOAD ──────────────────────────────────────────────────────

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // ─── LOGIN ─────────────────────────────────────────────────────────────

  const login = async (email, password) => {
    setError(null);
    try {
      const data = await authAPI.login(email, password);
      localStorage.setItem('token', data.access_token);
      
      if (data.user) {
        localStorage.setItem('user', JSON.stringify(data.user));
        setUser(data.user);
      }
      
      if (data.has_access === false) {
        localStorage.setItem('show_upgrade_modal', 'true');
        localStorage.setItem('subscription_status', 'expired');
        localStorage.setItem('subscription_detail', 'Your access has expired');
        setSubscriptionExpired(true);
      } else {
        localStorage.removeItem('show_upgrade_modal');
        localStorage.removeItem('subscription_status');
        localStorage.removeItem('subscription_detail');
        setSubscriptionExpired(false);
      }
      
      await loadUser();
      return { success: true, isAdmin: data.is_admin };
    } catch (error) {
      setError(error.message || 'Login failed');
      return { success: false, error: error.message };
    }
  };

  // ─── SIGNUP ────────────────────────────────────────────────────────────

  const signup = async (email, password, plan) => {
    setError(null);
    try {
      const data = await authAPI.signup(email, password, plan);
      return { success: true, data };
    } catch (error) {
      setError(error.message || 'Signup failed');
      return { success: false, error: error.message };
    }
  };

  // ─── LOGOUT ────────────────────────────────────────────────────────────

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('show_upgrade_modal');
    localStorage.removeItem('subscription_status');
    localStorage.removeItem('subscription_detail');
    setUser(null);
    setSubscription(null);
    setSubscriptionExpired(false);
    router.push('/auth/login');
  };

  // ─── HAS ACCESS CHECK ─────────────────────────────────────────────────

  const hasAccess = useCallback(() => {
    if (!user) return false;
    if (user.is_admin) return true;
    if (subscriptionExpired) return false;
    if (!subscription) return false;
    return subscription?.subscription?.is_active || false;
  }, [user, subscription, subscriptionExpired]);

  // ─── IS ADMIN CHECK ──────────────────────────────────────────────────

  const isAdmin = useCallback(() => {
    if (!user) return false;
    return user.is_admin === true || user.tier === 'admin';
  }, [user]);

  // ─── REFRESH SUBSCRIPTION ────────────────────────────────────────────

  const refreshSubscription = async () => {
    try {
      const subData = await authAPI.checkSubscription();
      setSubscription(subData);
      
      const isExpired = !user?.is_admin && !subData?.subscription?.is_active;
      if (isExpired) {
        localStorage.setItem('show_upgrade_modal', 'true');
        setSubscriptionExpired(true);
      } else {
        localStorage.removeItem('show_upgrade_modal');
        setSubscriptionExpired(false);
      }
      
      return subData;
    } catch (error) {
      console.error('Failed to refresh subscription:', error);
      return null;
    }
  };

  // ─── CONTEXT VALUE ────────────────────────────────────────────────────

  const value = {
    user,
    subscription,
    loading,
    error,
    subscriptionExpired,
    login,
    signup,
    logout,
    loadUser,
    hasAccess,
    isAdmin,
    refreshSubscription,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── USE AUTH HOOK ──────────────────────────────────────────────────────

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}