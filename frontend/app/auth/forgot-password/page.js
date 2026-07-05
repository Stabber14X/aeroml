'use client';

// frontend/src/app/auth/forgot-password/page.js

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ParticlesCanvas from '@/components/ParticlesCanvas';
import { authAPI } from '@/lib/api';
import styles from '../auth.module.css';

export default function ForgotPassword() {
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
      await authAPI.forgotPassword(email);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={styles.pageWrapper}>
        <ParticlesCanvas />
        <div className={styles.glassCard}>
          <div className={styles.header}>
            <h1 className={styles.title}>Check Your Email</h1>
            <p className={styles.subtitle}>
              We've sent a password reset link to {email}
            </p>
          </div>
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm p-4 rounded-lg mb-4 text-center">
            ✉️ If you don't see the email, check your spam folder.
          </div>
          <Link href="/auth/login" className={styles.link}>
            Return to Login
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
          <h1 className={styles.title}>Reset Password</h1>
          <p className={styles.subtitle}>
            Enter your email and we'll send you a reset link
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.label}>Email Address</label>
            <input 
              type="email" 
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>

          <button type="submit" className={styles.submitButton} disabled={loading}>
            {loading ? 'Sending...' : 'Send Reset Link'}
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