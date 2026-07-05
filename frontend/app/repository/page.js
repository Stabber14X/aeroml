'use client';

import Link from 'next/link';
import styles from '../content.module.css';

export default function Repository() {
  return (
    <main className={styles.pageContainer}>
      <nav className={styles.navbar}>
        <Link href="/" className={styles.navLogo}>AeroML</Link>
        <div style={{display: 'flex', gap: '10px'}}>
            <Link href="/" className={styles.secondaryBtn}>Back</Link>
        </div>
      </nav>

      <section className={styles.heroSection}>
        <div className={styles.sectionTitle} style={{ justifyContent: 'center' }}>System Architecture</div>
        <h1 className={styles.heroTitle}>Under the Hood</h1>
        <p className={styles.heroSubtitle}>
           AeroML combines modern web technologies with high-fidelity scientific computing.
        </p>
      </section>

      <div className={styles.gridContainer}>

        {/* Tech Stack */}
        <div className={`${styles.hudCard} ${styles.thirdCard}`}>
            <div className={styles.sectionTitle}>Stack // Web</div>
            <ul className={styles.techList}>
                <li className={styles.techItem}>Frontend: React.js / Next.js</li>
                <li className={styles.techItem}>Backend: FastAPI (Python)</li>
                <li className={styles.techItem}>DB: PostgreSQL</li>
                <li className={styles.techItem}>Cloud: AWS EC2</li>
            </ul>
        </div>

        <div className={`${styles.hudCard} ${styles.thirdCard}`}>
            <div className={styles.sectionTitle}>Stack // Scientific</div>
            <ul className={styles.techList}>
                <li className={styles.techItem}>Solvers: XFOIL, OpenFOAM</li>
                <li className={styles.techItem}>ML: PyTorch (PINN)</li>
                <li className={styles.techItem}>Opt: DEAP (Genetic Algo)</li>
                <li className={styles.techItem}>Viz: SHAP, Plotly</li>
            </ul>
        </div>

        <div className={`${styles.hudCard} ${styles.thirdCard}`}>
            <div className={styles.sectionTitle}>Data Sources</div>
            <p className={styles.text} style={{fontSize: '0.9rem'}}>
                Primary data is derived from the <strong>UIUC Airfoil Database</strong>. We generate multi-fidelity datasets covering various angles of attack ($\alpha$) and Reynolds numbers ($Re$). Unstable simulations are automatically filtered.
            </p>
            <div className={styles.metricGrid} style={{marginTop: '10px'}}>
                <div className={styles.metric}>
                    <span className={styles.metricValue}>UIUC</span>
                    <span className={styles.metricLabel}>Base DB</span>
                </div>
            </div>
        </div>

        {/* Methodology */}
        <div className={styles.hudCard}>
            <div className={styles.sectionTitle}>Development Pipeline</div>
            <h2 className={styles.cardHeading}>Agile MLOps Methodology</h2>
            <p className={styles.text}>
                We employ an Agile-Incremental model integrated with MLOps. The process follows five major stages:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginTop: '20px' }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '8px' }}>
                    <strong style={{color: '#38bdf8'}}>01. Data</strong>
                    <p style={{fontSize: '0.9rem', color: '#94a3b8', marginTop: '5px'}}>Acquisition & Preprocessing (CST Parametrization)</p>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '8px' }}>
                    <strong style={{color: '#38bdf8'}}>02. Model</strong>
                    <p style={{fontSize: '0.9rem', color: '#94a3b8', marginTop: '5px'}}>PINN Architecture Design & Training</p>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '8px' }}>
                    <strong style={{color: '#38bdf8'}}>03. Optimize</strong>
                    <p style={{fontSize: '0.9rem', color: '#94a3b8', marginTop: '5px'}}>Active Learning Loop & Optimization Engine</p>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '8px' }}>
                    <strong style={{color: '#38bdf8'}}>04. Deploy</strong>
                    <p style={{fontSize: '0.9rem', color: '#94a3b8', marginTop: '5px'}}>Web Platform & Testing</p>
                </div>
            </div>
        </div>

      </div>
    </main>
  );
}