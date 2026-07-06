'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ParticlesCanvas from '@/components/ParticlesCanvas';
import styles from '../auth.module.css';
import { FiMail, FiArrowRight } from 'react-icons/fi';

function ResendVerificationContent() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://aeroml-production.up.railway.app';
      const response = await fetch(${API_URL}/auth/resend-verification, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (response.ok) {
        setSuccess(true);
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to resend verification email.');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div className={styles.pageWrapper}>
        <ParticlesCanvas />
        <div className={styles.glassCard}>
          <div className={styles.header}>
            <div style={{ 
              width: '64px', 
              height: '64px', 
              borderRadius: '50%', 
              background: 'rgba(52, 211, 153, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <FiMail size={32} color="#34d399" />
            </div>
            <h1 className={styles.title}>Email Sent!</h1>
            <p className={styles.subtitle}>
              A new verification link has been sent to <strong>{email}</strong>
            </p>
          </div>
          
          <div style={{
            background: 'rgba(52, 211, 153, 0.05)',
            border: '1px solid rgba(52, 211, 153, 0.1)',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
            textAlign: 'center'
          }}>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>
              Please check your inbox and click the verification link.
            </p>
          </div>

          <Link href="/auth/login" className={styles.submitButton}>
            Go to Login
            <FiArrowRight size={18} style={{ marginLeft: '8px' }} />
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
          <h1 className={styles.title}>Resend Verification</h1>
          <p className={styles.subtitle}>
            Enter your email to receive a new verification link
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className={styles.errorBox}>
              <span>⚠️</span> {error}
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.label}>Email Address</label>
            <input 
              type="email" 
              className={styles.input}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>

          <button type="submit" className={styles.submitButton} disabled={loading}>
            {loading ? 'Sending...' : 'Resend Verification Email'}
          </button>
        </form>

        <div className={styles.footer}>
          Remember your password? 
          <Link href="/auth/login" className={styles.link}>
            Log In
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResendVerificationPage() {
  return (
    <Suspense fallback={<div style={{display:'flex',justifyContent:'center',alignItems:'center',minHeight:'100vh',background:'#0b1116',color:'#e2e8f0'}}>Loading...</div>}>
      <ResendVerificationContent />
    </Suspense>
  );
}
