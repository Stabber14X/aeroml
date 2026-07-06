'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ParticlesCanvas from '@/components/ParticlesCanvas';
import styles from '../auth.module.css';

function LoginContent() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://aeroml-production.up.railway.app';
      
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('token', data.access_token);
        const userData = {
          email: email,
          is_admin: data.is_admin || false,
          is_premium: data.is_premium || false,
          has_access: data.has_access || false,
          tier: data.is_admin ? 'admin' : (data.is_premium ? 'premium' : 'free')
        };
        localStorage.setItem('user', JSON.stringify(userData));
        
        if (data.is_admin) {
          window.location.href = '/admin';
        } else {
          window.location.href = '/dashboard';
        }
      } else if (response.status === 403) {
        const data = await response.json();
        if (data.error === 'EMAIL_NOT_VERIFIED') {
          setError('Please verify your email before logging in. Check your inbox for the verification link.');
        } else {
          setError(data.detail || 'Access denied.');
        }
      } else {
        const data = await response.json();
        setError(data.detail || 'Login failed');
      }
    } catch (err) {
      setError(`Network error. Please make sure the backend is running on ${API_URL}`);
    }
    
    setLoading(false);
  };

  return (
    <div className={styles.pageWrapper}>
      <ParticlesCanvas />
      <div className={styles.glassCard}>
        <div className={styles.header}>
          <h1 className={styles.title}>Welcome Back</h1>
          <p className={styles.subtitle}>Sign in to continue designing</p>
        </div>
        <form onSubmit={handleLogin}>
          {error && (
            <div className={styles.errorBox}>
              <span>⚠️</span> {error}
              {error.includes('verify your email') && (
                <Link href="/auth/resend-verification" style={{ color: '#38bdf8', marginLeft: '8px' }}>
                  Resend verification
                </Link>
              )}
            </div>
          )}
          <div className={styles.formGroup}>
            <label className={styles.label}>Email</label>
            <input 
              type="email" 
              className={styles.input}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Password</label>
            <input 
              type="password" 
              className={styles.input}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>
          <Link href="/auth/forgot-password" className={styles.forgotLink}>
            Forgot Password?
          </Link>
          <button type="submit" className={styles.submitButton} disabled={loading}>
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
        <div className={styles.footer}>
          New to AeroML? 
          <Link href="/auth/signup" className={styles.link}>Create Account</Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}