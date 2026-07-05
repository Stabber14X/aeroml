'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ParticlesCanvas from '@/components/ParticlesCanvas';
import styles from '../auth.module.css';
import { FiCheckCircle, FiXCircle, FiLoader } from 'react-icons/fi';

export default function VerifyEmail() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid verification link. No token provided.');
      return;
    }

    const verifyEmail = async () => {
      try {
        const response = await fetch('http://127.0.0.1:8000/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });

        if (response.ok) {
          setStatus('success');
          setMessage('Your email has been verified successfully!');
          // Redirect to login after 3 seconds
          setTimeout(() => {
            router.push('/auth/login');
          }, 3000);
        } else {
          const data = await response.json();
          setStatus('error');
          setMessage(data.detail || 'Verification failed. The link may have expired.');
        }
      } catch (error) {
        setStatus('error');
        setMessage('Network error. Please try again.');
      }
    };

    verifyEmail();
  }, [token, router]);

  return (
    <div className={styles.pageWrapper}>
      <ParticlesCanvas />
      
      <div className={styles.glassCard}>
        <div className={styles.header}>
          {status === 'loading' && (
            <div style={{ textAlign: 'center' }}>
              <FiLoader size={48} color="#38bdf8" style={{ animation: 'spin 1s linear infinite' }} />
              <h1 className={styles.title} style={{ marginTop: '16px' }}>Verifying...</h1>
              <p className={styles.subtitle}>Please wait while we verify your email.</p>
            </div>
          )}

          {status === 'success' && (
            <div style={{ textAlign: 'center' }}>
              <FiCheckCircle size={48} color="#34d399" />
              <h1 className={styles.title} style={{ marginTop: '16px', color: '#34d399' }}>Verified!</h1>
              <p className={styles.subtitle}>{message}</p>
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Redirecting to login...</p>
            </div>
          )}

          {status === 'error' && (
            <div style={{ textAlign: 'center' }}>
              <FiXCircle size={48} color="#ef4444" />
              <h1 className={styles.title} style={{ marginTop: '16px', color: '#ef4444' }}>Verification Failed</h1>
              <p className={styles.subtitle}>{message}</p>
            </div>
          )}
        </div>

        {status === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Link href="/auth/login" className={styles.submitButton}>
              Go to Login
            </Link>
            <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
              Need a new verification link?{' '}
              <Link href="/auth/resend-verification" className={styles.link}>
                Resend
              </Link>
            </p>
          </div>
        )}

        {status === 'success' && (
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <Link href="/auth/login" className={styles.link}>
              Login Now
            </Link>
          </div>
        )}

        <style jsx>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}