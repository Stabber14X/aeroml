// frontend/app/auth/reset-password/page.js
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ParticlesCanvas from '@/components/ParticlesCanvas';
import { authAPI } from '@/lib/api';
import styles from '../auth.module.css';

// ─── COMPONENT THAT USES useSearchParams ──────────────────────────────
function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [validToken, setValidToken] = useState(true);

  useEffect(() => {
    if (!token) {
      setValidToken(false);
      setError('Invalid or missing reset token');
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setLoading(true);

    try {
      await authAPI.resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => {
        router.push('/auth/login');
      }, 3000);
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (!validToken) {
    return (
      <div className={styles.pageWrapper}>
        <ParticlesCanvas />
        <div className={styles.glassCard}>
          <div className={styles.header}>
            <h1 className={styles.title}>Invalid Link</h1>
            <p className={styles.subtitle}>
              The password reset link is invalid or has expired
            </p>
          </div>
          <Link href="/auth/forgot-password" className={styles.link}>
            Request New Link
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className={styles.pageWrapper}>
        <ParticlesCanvas />
        <div className={styles.glassCard}>
          <div className={styles.header}>
            <h1 className={styles.title}>Password Reset</h1>
            <p className={styles.subtitle}>
              Your password has been reset successfully
            </p>
          </div>
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm p-4 rounded-lg mb-4 text-center">
            ✅ You can now log in with your new password
          </div>
          <Link href="/auth/login" className={styles.link}>
            Log In Now
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageWrapper}>
      <ParticlesCanvas />
      
      <div className={styles.glassCard}>
        <div className={styles.header}>
          <h1 className={styles.title}>Set New Password</h1>
          <p className={styles.subtitle}>
            Enter your new password below
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.label}>New Password</label>
            <input 
              type="password" 
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
              minLength={8}
            />
            <div className="text-xs text-gray-500 mt-1">Must be at least 8 characters</div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Confirm Password</label>
            <input 
              type="password" 
              className={styles.input}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required 
            />
          </div>

          <button type="submit" className={styles.submitButton} disabled={loading}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── MAIN PAGE WITH SUSPENSE BOUNDARY ──────────────────────────────────
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        background: '#0b1116',
        color: '#e2e8f0'
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
          <div style={{ fontSize: '14px', color: '#64748b' }}>Loading...</div>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}