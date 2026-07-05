'use client';

import Link from 'next/link';
import styles from '../content.module.css';

export default function Subscription() {
  return (
    <main className={styles.pageContainer}>
      <nav className={styles.navbar}>
        <Link href="/" className={styles.navLogo}>AeroML</Link>
        <Link href="/pricing" className={styles.secondaryBtn}>View Plans</Link>
      </nav>

      <section className={styles.heroSection}>
        <div className={styles.sectionTitle} style={{ justifyContent: 'center' }}>Value Proposition</div>
        <h1 className={styles.heroTitle}>The ROI of Aerodynamics</h1>
        <p className={styles.heroSubtitle}>
          Reduce design time from weeks to seconds. 
        </p>
      </section>

      <div className={styles.gridContainer}>

        {/* Quantitative Impact */}
        <div className={styles.hudCard}>
          <div className={styles.sectionTitle}>Performance Metrics</div>
          <h2 className={styles.cardHeading}>AeroML vs Conventional CFD</h2>
          
          <div style={{ overflowX: 'auto', marginTop: '20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#cbd5e1', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: '15px', color: '#64748b', textTransform: 'uppercase', fontSize: '0.8rem' }}>Metric</th>
                  <th style={{ padding: '15px', color: '#64748b', textTransform: 'uppercase', fontSize: '0.8rem' }}>Standard CFD</th>
                  <th style={{ padding: '15px', color: '#38bdf8', textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: '800' }}>AeroML</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '20px 15px', fontWeight: '600' }}>Simulation Time</td>
                  <td style={{ padding: '20px 15px' }}>1 – 3 Hours</td>
                  <td style={{ padding: '20px 15px', color: '#38bdf8', fontWeight: '700' }}>&lt; 1 Second</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '20px 15px', fontWeight: '600' }}>Design Iterations</td>
                  <td style={{ padding: '20px 15px' }}>~50 Feasible</td>
                  <td style={{ padding: '20px 15px', color: '#38bdf8', fontWeight: '700' }}>10,000+ Feasible</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '20px 15px', fontWeight: '600' }}>Exploration Space</td>
                  <td style={{ padding: '20px 15px' }}>Limited</td>
                  <td style={{ padding: '20px 15px', color: '#38bdf8', fontWeight: '700' }}>200x Broader</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Market Data */}
        <div className={`${styles.hudCard} ${styles.halfCard}`}>
            <div className={styles.sectionTitle}>Market Potential</div>
            <p className={styles.text}>
                The market for aerodynamic simulation was estimated at <strong>$16.8 billion</strong> (2024) and is projected to reach <strong>$26.6 billion</strong> by 2035.
            </p>
            <p className={styles.text}>
                Even 3–5% improvement in lift-to-drag ratio saves millions in fuel. AeroML empowers you to capture this value.
            </p>
        </div>

        <div className={`${styles.hudCard} ${styles.halfCard}`}>
            <div className={styles.sectionTitle}>Target Industries</div>
            <ul className={styles.techList}>
                <li className={styles.techItem}>
                    <span style={{color: '#fff', fontWeight: '600'}}>Aerospace:</span> Rapid UAV optimization.
                </li>
                <li className={styles.techItem}>
                    <span style={{color: '#fff', fontWeight: '600'}}>Wind Energy:</span> Blade cross-section efficiency.
                </li>
                <li className={styles.techItem}>
                    <span style={{color: '#fff', fontWeight: '600'}}>Automotive:</span> Drag reduction (range extension).
                </li>
            </ul>
        </div>

      </div>
    </main>
  );
}