'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import styles from './landing.module.css';
import ParticlesCanvas from '@/components/ParticlesCanvas';

// Icons
import {
  FiCpu, FiWind, FiTrendingUp, FiShield, FiZap, FiUsers,
  FiCheckCircle, FiArrowRight, FiGithub, FiTwitter,
  FiLinkedin, FiMail, FiMenu, FiX, FiBox, FiBookOpen,
  FiAward, FiGlobe, FiLayers, FiTarget, FiDatabase
} from 'react-icons/fi';

export default function LandingPage() {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!isMounted) return null;

  // Navigation handlers
  const handleNavigation = (path) => {
    router.push(path);
    setIsMenuOpen(false);
  };

  const handleSocialClick = (platform, url) => {
    window.open(url, '_blank');
  };

  const features = [
    {
      icon: FiCpu,
      title: 'AI-Powered Predictions',
      description: 'Physics-Informed Neural Networks deliver 99% accurate aerodynamic coefficients in milliseconds, matching high-fidelity CFD results.',
      color: '#38bdf8'
    },
    {
      icon: FiWind,
      title: 'Multi-Physics Solver',
      description: 'Integrated panel method, VLM, boundary layer analysis, and structural mechanics in one unified platform.',
      color: '#00f2ff'
    },
    {
      icon: FiTrendingUp,
      title: 'Genetic Optimization',
      description: 'NSGA-II multi-objective optimization explores thousands of designs to find Pareto-optimal airfoil configurations.',
      color: '#a855f7'
    },
    {
      icon: FiShield,
      title: 'Enterprise Security',
      description: 'JWT authentication, session management, and 256-bit encryption protect your intellectual property and designs.',
      color: '#34d399'
    },
    {
      icon: FiZap,
      title: 'Instant Results',
      description: 'Eliminate hours of CFD simulation. Get accurate predictions in under a second, enabling rapid iteration.',
      color: '#f59e0b'
    },
    {
      icon: FiUsers,
      title: '1600+ Airfoil Library',
      description: 'Access the complete UIUC airfoil database with instant CST parameterization and real-time analysis.',
      color: '#f472b6'
    }
  ];

  return (
    <div className={styles.page}>
      <ParticlesCanvas />

      {/* Navbar */}
      <nav className={`${styles.navbar} ${isScrolled ? styles.scrolled : ''}`}>
        <div className={styles.navContainer}>
          <Link href="/" className={styles.logo}>
            <span className={styles.logoIcon}>✈</span>
            <span className={styles.logoText}>AeroML</span>
          </Link>

          <div className={styles.desktopNav}>
            <Link href="/about" className={styles.navLink}>About</Link>
            <Link href="/pricing" className={styles.navLink}>Pricing</Link>
            <Link href="/blog" className={styles.navLink}>Blog</Link>
          </div>

          <div className={styles.navActions}>
            <Link href="/auth/login" className={styles.navLogin}>Log In</Link>
            <Link href="/auth/signup" className={styles.navSignup}>Get Started</Link>
          </div>

          <button 
            className={styles.mobileToggle}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <FiX size={24} /> : <FiMenu size={24} />}
          </button>
        </div>

        {isMenuOpen && (
          <div className={styles.mobileMenu}>
            <Link href="/about" className={styles.mobileLink}>About</Link>
            <Link href="/pricing" className={styles.mobileLink}>Pricing</Link>
            <Link href="/blog" className={styles.mobileLink}>Blog</Link>
            <Link href="/auth/login" className={styles.mobileLogin}>Log In</Link>
            <Link href="/auth/signup" className={styles.mobileSignup}>Get Started</Link>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className={styles.heroBadge}>
              <FiZap size={14} />
              <span>AI-Powered Aerodynamics</span>
            </div>
            
            <h1 className={styles.heroTitle}>
              Master the Flow with<br />
              <span className={styles.heroHighlight}>AI-Powered Aerodynamics</span>
            </h1>

            <p className={styles.heroSubtitle}>
              Design, optimize, and analyze airfoils with Physics-Informed Neural Networks.
              Get enterprise-grade CFD predictions in milliseconds.
            </p>

            <div className={styles.heroActions}>
              <Link href="/auth/signup" className={styles.heroPrimary}>
                Get Started Free
                <FiArrowRight size={20} />
              </Link>
              <Link href="/pricing" className={styles.heroSecondary}>
                View Pricing
              </Link>
            </div>

            <div className={styles.heroStats}>
              <div className={styles.stat}>
                <span className={styles.statNumber}>1600+</span>
                <span className={styles.statLabel}>Airfoils</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statNumber}>99%</span>
                <span className={styles.statLabel}>Accuracy</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statNumber}>&lt;1s</span>
                <span className={styles.statLabel}>Prediction Time</span>
              </div>
            </div>
          </motion.div>
        </div>

        <div className={styles.heroVisual}>
          <motion.div 
            className={styles.previewCard}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className={styles.previewHeader}>
              <span className={styles.previewDot}></span>
              <span className={styles.previewDot}></span>
              <span className={styles.previewDot}></span>
              <span className={styles.previewTitle}>AeroML Studio</span>
            </div>
            <div className={styles.previewBody}>
              <div className={styles.previewAirfoil}>
                <svg viewBox="0 0 500 250" className={styles.airfoilSvg}>
                  <defs>
                    <linearGradient id="airfoilGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#00f2ff" />
                      <stop offset="100%" stopColor="#38bdf8" />
                    </linearGradient>
                    <linearGradient id="airfoilFill" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="rgba(0, 242, 255, 0.15)" />
                      <stop offset="100%" stopColor="rgba(0, 242, 255, 0.02)" />
                    </linearGradient>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="3" result="blur"/>
                      <feMerge>
                        <feMergeNode in="blur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  
                  <g opacity="0.1">
                    {[0, 50, 100, 150, 200].map(y => (
                      <line key={y} x1="0" y1={y} x2="500" y2={y} stroke="#00f2ff" strokeWidth="0.5"/>
                    ))}
                    {[0, 50, 100, 150, 200, 250, 300, 350, 400, 450].map(x => (
                      <line key={x} x1={x} y1="0" x2={x} y2="250" stroke="#00f2ff" strokeWidth="0.5"/>
                    ))}
                  </g>

                  <g opacity="0.15">
                    {[30, 60, 90, 120, 150, 180, 210].map((y, i) => {
                      const offset = 10 + i * 2;
                      return (
                        <path
                          key={i}
                          d={`M 0 ${y + offset} Q 250 ${y + offset + 15}, 500 ${y + offset + 10}`}
                          stroke="#00f2ff"
                          strokeWidth="1.5"
                          fill="none"
                        />
                      );
                    })}
                  </g>

                  <g filter="url(#glow)">
                    <path 
                      d="M 20 125 C 40 95, 80 75, 130 70 C 180 65, 230 68, 280 72 C 330 76, 380 85, 420 100 C 440 108, 460 118, 480 125 C 460 132, 440 142, 420 150 C 380 165, 330 174, 280 178 C 230 182, 180 185, 130 180 C 80 175, 40 155, 20 125 Z"
                      fill="url(#airfoilFill)"
                      stroke="url(#airfoilGrad)"
                      strokeWidth="2.5"
                    />
                    <path 
                      d="M 40 125 C 60 100, 100 82, 140 78 C 190 74, 240 78, 290 82 C 340 86, 400 98, 440 116"
                      stroke="rgba(0, 242, 255, 0.3)"
                      strokeWidth="1"
                      fill="none"
                    />
                  </g>

                  <circle cx="20" cy="125" r="5" fill="#00f2ff" />
                  <text x="10" y="110" fill="#00f2ff" fontSize="10" fontFamily="monospace">LE</text>
                  <circle cx="480" cy="125" r="4" fill="#38bdf8" />
                  <text x="470" y="110" fill="#38bdf8" fontSize="10" fontFamily="monospace">TE</text>

                  <line x1="20" y1="125" x2="480" y2="125" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="6 4"/>

                  <g opacity="0.4">
                    <path 
                      d="M 20 120 C 80 105, 150 100, 250 105 C 350 110, 430 115, 480 120"
                      stroke="#00f2ff"
                      strokeWidth="1.5"
                      fill="none"
                    />
                    <path 
                      d="M 20 130 C 80 145, 150 150, 250 145 C 350 140, 430 135, 480 130"
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                      fill="none"
                    />
                  </g>
                </svg>
              </div>
              
              <div className={styles.previewMetrics}>
                <div className={styles.previewMetric}>
                  <span className={styles.previewMetricLabel}>CL</span>
                  <span className={styles.previewMetricValue}>0.85</span>
                </div>
                <div className={styles.previewMetric}>
                  <span className={styles.previewMetricLabel}>CD</span>
                  <span className={styles.previewMetricValue}>0.0095</span>
                </div>
                <div className={styles.previewMetric}>
                  <span className={styles.previewMetricLabel}>L/D</span>
                  <span className={styles.previewMetricValue}>89.5</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className={styles.features}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>Features</span>
          <h2 className={styles.sectionTitle}>
            Everything You Need for<br />
            <span className={styles.sectionHighlight}>Aerodynamic Design</span>
          </h2>
        </div>

        <div className={styles.featuresGrid}>
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={index}
                className={styles.featureCard}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <div 
                  className={styles.featureIcon}
                  style={{ background: `${feature.color}20`, color: feature.color }}
                >
                  <Icon size={24} />
                </div>
                <h3 className={styles.featureTitle}>{feature.title}</h3>
                <p className={styles.featureDescription}>{feature.description}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Call to Action Section */}
      <section className={styles.cta}>
        <div className={styles.ctaContent}>
          <h2 className={styles.ctaTitle}>Ready to Master the Flow?</h2>
          <p className={styles.ctaSubtitle}>
            Join thousands of engineers using AeroML to design the next generation of aircraft.
          </p>
          <div className={styles.ctaButtons}>
            <Link href="/auth/signup" className={styles.ctaPrimary}>
              Get Started Free
              <FiArrowRight size={20} />
            </Link>
            <Link href="/pricing" className={styles.ctaSecondary}>
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerBrand}>
            <Link href="/" className={styles.footerLogo}>
              <span className={styles.logoIcon}>✈</span>
              <span className={styles.logoText}>AeroML</span>
            </Link>
            <p className={styles.footerDescription}>
              AI-powered aerodynamic design platform.<br />
              Built by Hassnain Sajid & Abeeha Raza.
            </p>
            <div className={styles.footerSocial}>
              <a href="https://github.com/aeroml" target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                <FiGithub size={18} />
              </a>
              <a href="https://twitter.com/aeroml" target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                <FiTwitter size={18} />
              </a>
              <a href="https://linkedin.com/company/aeroml" target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                <FiLinkedin size={18} />
              </a>
              <a href="mailto:hello@aeroml.com" className={styles.socialLink}>
                <FiMail size={18} />
              </a>
            </div>
          </div>

          <div className={styles.footerLinks}>
            <div className={styles.footerColumn}>
              <h4>Company</h4>
              <Link href="/about" className={styles.footerLink}>About</Link>
              <Link href="/blog" className={styles.footerLink}>Blog</Link>
              <Link href="/pricing" className={styles.footerLink}>Pricing</Link>
            </div>
            <div className={styles.footerColumn}>
              <h4>Resources</h4>
              <Link href="/docs" className={styles.footerLink}>Documentation</Link>
              <Link href="/support" className={styles.footerLink}>Support</Link>
            </div>
            <div className={styles.footerColumn}>
              <h4>Legal</h4>
              <Link href="/privacy" className={styles.footerLink}>Privacy Policy</Link>
              <Link href="/terms" className={styles.footerLink}>Terms of Service</Link>
            </div>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <p>© 2026 AeroML. All rights reserved. Built with ❤️ by Hassnain Sajid & Abeeha Raza.</p>
        </div>
      </footer>
    </div>
  );
}