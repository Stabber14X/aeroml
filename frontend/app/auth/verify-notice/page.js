// frontend/app/auth/verify-notice/page.js
'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import ParticlesCanvas from '@/components/ParticlesCanvas';
import styles from '../auth.module.css';
import { FiMail, FiCheckCircle, FiArrowRight } from 'react-icons/fi';

// ─── COMPONENT THAT USES useSearchParams ──────────────────────────────
function VerifyNoticeContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || 'your email';

  return (
    <div className={styles.pageWrapper}>
      <ParticlesCanvas />
      
      <div className={styles.glassCard}>
        <div className={styles.header}>
          <div style={{ 
            width: '64px', 
            height: '64px', 
            borderRadius: '50%', 
            background: 'rgba(56, 189, 248, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <FiMail size={32} color="#38bdf8" />
          </div>
          <h1 className={styles.title}>Check Your Email</h1>
          <p className={styles.subtitle}>
            We've sent a verification link to <strong>{email}</strong>
          </p>
        </div>

        <div style={{
          background: 'rgba(56, 189, 248, 0.05)',
          border: '1px solid rgba(56, 189, 248, 0.1)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
          textAlign: 'center'
        }}>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>
            <FiCheckCircle size={16} color="#34d399" style={{ display: 'inline', marginRight: '8px' }} />
            Click the link in the email to verify your account.
          </p>
          <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '8px' }}>
            The link expires in 24 hours.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Link href="/auth/login" className={styles.submitButton}>
            Go to Login
            <FiArrowRight size={18} style={{ marginLeft: '8px' }} />
          </Link>
          
          <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
            Didn't receive the email?{' '}
            <Link href="/auth/resend-verification" className={styles.link}>
              Resend verification
            </Link>
          </p>
        </div>

        <div className={styles.footer} style={{ marginTop: '24px' }}>
          <Link href="/auth/signup" className={styles.link}>
            Back to Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE WITH SUSPENSE BOUNDARY ──────────────────────────────────
export default function VerifyNoticePage() {
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
      <VerifyNoticeContent />
    </Suspense>
  );
}