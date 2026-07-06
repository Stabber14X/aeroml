'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ParticlesCanvas from '@/components/ParticlesCanvas';
import styles from '../auth.module.css';
import { FiCheck, FiZap, FiClock } from 'react-icons/fi';

function SignupContent() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('freemium');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL ||
        'https://aeroml-production.up.railway.app';

      const response = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          plan: selectedPlan,
        }),
      });

      if (response.ok) {
        router.push(`/auth/verify-notice?email=${encodeURIComponent(email)}`);
      } else {
        const data = await response.json();
        setError(data.detail || 'Signup failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    }

    setLoading(false);
  };

  return (
    <div className={styles.pageWrapper}>
      <ParticlesCanvas />

      <div className={styles.glassCard}>
        <div className={styles.header}>
          <h1 className={styles.title}>Create Account</h1>
          <p className={styles.subtitle}>
            Choose your plan to get started
          </p>
        </div>

        <form onSubmit={handleSignup}>
          <div className={styles.planToggle}>
            <button
              type="button"
              onClick={() => setSelectedPlan('freemium')}
              className={`${styles.planBtn} ${
                selectedPlan === 'freemium' ? styles.activePlan : ''
              }`}
            >
              <span className={styles.planBtnIcon}>🎯</span>

              <div>
                <div className={styles.planBtnName}>Freemium</div>
                <div className={styles.planBtnPrice}>Free</div>
                <div className={styles.planBtnDesc}>24-hour trial</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedPlan('premium')}
              className={`${styles.planBtn} ${
                selectedPlan === 'premium' ? styles.activePlan : ''
              }`}
            >
              <span className={styles.planBtnIcon}>🚀</span>

              <div>
                <div className={styles.planBtnName}>Premium</div>
                <div className={styles.planBtnPrice}>$29/mo</div>
                <div className={styles.planBtnDesc}>Full access</div>
              </div>
            </button>
          </div>

          {selectedPlan === 'freemium' && (
            <div className={styles.planInfo}>
              <div className={styles.planFeature}>
                <FiClock />
                <span>24-hour free trial</span>
              </div>

              <div className={styles.planFeature}>
                <FiCheck />
                <span>Access all core AeroML features</span>
              </div>
            </div>
          )}

          {selectedPlan === 'premium' && (
            <div className={styles.planInfo}>
              <div className={styles.planFeature}>
                <FiZap />
                <span>Unlimited access</span>
              </div>

              <div className={styles.planFeature}>
                <FiCheck />
                <span>All premium AeroML features</span>
              </div>
            </div>
          )}

          {error && (
            <div className={styles.errorBox}>
              <span>⚠️</span> {error}
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
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Confirm Password</label>

            <input
              type="password"
              className={styles.input}
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className={styles.submitButton}
            disabled={loading}
          >
            {loading
              ? 'Creating Account...'
              : selectedPlan === 'freemium'
              ? 'Start Free Trial'
              : 'Start Premium'}
          </button>
        </form>

        <div className={styles.footer}>
          Already have an account?{' '}
          <Link href="/auth/login" className={styles.link}>
            Log In
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            background: '#0b1116',
            color: '#e2e8f0',
          }}
        >
          Loading...
        </div>
      }
    >
      <SignupContent />
    </Suspense>
  );
}