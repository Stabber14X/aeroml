'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import styles from './pricing.module.css';
import ParticlesCanvas from '@/components/ParticlesCanvas';
import { paymentAPI } from '@/lib/api';
import {
  FiCheckCircle, FiX, FiArrowRight, FiMenu, FiX as FiClose,
  FiZap, FiUsers, FiBox, FiShield, FiDownload, FiClock,
  FiCpu, FiWind, FiTrendingUp, FiDatabase, FiBookOpen,
  FiGithub, FiTwitter, FiLinkedin, FiMail
} from 'react-icons/fi';

export default function PricingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!isMounted) return null;

  const features = {
    free: [
      '2 designs maximum',
      '1-hour session timeout',
      'All analysis modules',
      'Export .DAT & .CSV',
      'Community support',
      'Access to 1600+ airfoil library',
      'Real-time predictions'
    ],
    premium: [
      'Unlimited designs',
      'No session timeout',
      'All analysis modules',
      'All export formats (DXF, SVG, PDF, G-code, STL)',
      'Priority email support',
      'Early access to new features',
      'Real-time predictions',
      'Batch processing',
      'API access',
      'Premium visualization tools'
    ]
  };

  const allFeatures = [
    { name: '2D Airfoil Analysis', free: true, premium: true },
    { name: '3D Wing Analysis (VLM)', free: true, premium: true },
    { name: 'Field Visualization', free: true, premium: true },
    { name: 'Boundary Layer Analysis', free: true, premium: true },
    { name: 'Structural Analysis', free: true, premium: true },
    { name: 'Mission Analysis', free: true, premium: true },
    { name: 'Genetic Optimization', free: true, premium: true },
    { name: 'Inverse Design', free: true, premium: true },
    { name: 'Airfoil Library (1600+)', free: true, premium: true },
    { name: 'Export .DAT & .CSV', free: true, premium: true },
    { name: 'Export DXF, SVG, PDF', free: false, premium: true },
    { name: 'Export G-code, STL', free: false, premium: true },
    { name: 'Batch Processing', free: false, premium: true },
    { name: 'API Access', free: false, premium: true },
    { name: 'Premium Visualizations', free: false, premium: true },
    { name: 'Priority Support', free: false, premium: true },
    { name: 'Early Access Features', free: false, premium: true }
  ];

  const handleCheckout = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/auth/login';
      return;
    }
    
    setIsProcessing(true);
    try {
      const response = await paymentAPI.createCheckout();
      if (response.checkout_url) {
        window.location.href = response.checkout_url;
      } else {
        alert('Payment initiation failed. Please try again.');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      if (error.message === 'UNAUTHORIZED') {
        window.location.href = '/auth/login';
      } else {
        alert('Payment initiation failed. Please try again.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNavigation = (path) => {
    window.location.href = path;
    setIsMenuOpen(false);
  };

  const handleGetStarted = () => {
    window.location.href = '/auth/signup';
  };

  const handleSocialClick = (platform, url) => {
    window.open(url, '_blank');
  };

  return (
    <div className={styles.page}>
      <ParticlesCanvas />

      <nav className={`${styles.navbar} ${isScrolled ? styles.scrolled : ''}`}>
        <div className={styles.navContainer}>
          <Link href="/" className={styles.logo}>
            <span className={styles.logoIcon}>✈</span>
            <span className={styles.logoText}>AeroML</span>
          </Link>

          <div className={styles.desktopNav}>
            <button 
              onClick={() => handleNavigation('/about')}
              className={styles.navLink}
            >
              About
            </button>
            <button 
              onClick={() => handleNavigation('/pricing')}
              className={`${styles.navLink} ${styles.navLinkActive}`}
            >
              Pricing
            </button>
            <button 
              onClick={() => handleNavigation('/blog')}
              className={styles.navLink}
            >
              Blog
            </button>
          </div>

          <div className={styles.navActions}>
            <button 
              onClick={() => handleNavigation('/auth/login')}
              className={styles.navLogin}
            >
              Log In
            </button>
            <button 
              onClick={handleGetStarted}
              className={styles.navSignup}
            >
              Get Started
            </button>
          </div>

          <button 
            className={styles.mobileToggle}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <FiClose size={24} /> : <FiMenu size={24} />}
          </button>
        </div>

        {isMenuOpen && (
          <div className={styles.mobileMenu}>
            <button onClick={() => handleNavigation('/about')} className={styles.mobileLink}>About</button>
            <button onClick={() => handleNavigation('/pricing')} className={styles.mobileLinkActive}>Pricing</button>
            <button onClick={() => handleNavigation('/blog')} className={styles.mobileLink}>Blog</button>
            <button onClick={() => handleNavigation('/auth/login')} className={styles.mobileLogin}>Log In</button>
            <button onClick={handleGetStarted} className={styles.mobileSignup}>Get Started</button>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className={styles.heroTag}>Pricing</span>
          <h1 className={styles.heroTitle}>
            Choose Your Plan<br />
            <span className={styles.heroHighlight}>Start Free, Scale Premium</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Everything you need to design, optimize, and analyze airfoils.
            Start with our free tier and upgrade when you're ready.
          </p>
        </motion.div>
      </section>

      {/* Billing Toggle */}
      <div className={styles.billingToggle}>
        <span className={billingCycle === 'monthly' ? styles.active : ''}>Monthly</span>
        <button 
          className={styles.toggleSwitch}
          onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
        >
          <div className={`${styles.toggleSlider} ${billingCycle === 'yearly' ? styles.toggled : ''}`} />
        </button>
        <span className={billingCycle === 'yearly' ? styles.active : ''}>
          Yearly <span className={styles.saveBadge}>Save 20%</span>
        </span>
      </div>

      {/* Pricing Cards */}
      <section className={styles.pricing}>
        <div className={styles.pricingGrid}>
          {/* Free Tier */}
          <motion.div
            className={styles.pricingCard}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className={styles.pricingHeader}>
              <div className={styles.pricingIcon} style={{ color: '#00f2ff' }}>
                <FiZap size={24} />
              </div>
              <h3 className={styles.pricingName}>Freemium</h3>
              <div className={styles.pricingPrice}>
                <span className={styles.priceAmount}>$0</span>
                <span className={styles.pricePeriod}>forever</span>
              </div>
              <p className={styles.pricingDescription}>
                Perfect for students and researchers exploring aerodynamics.
              </p>
            </div>

            <ul className={styles.pricingFeatures}>
              {features.free.map((feature, i) => (
                <li key={i}>
                  <FiCheckCircle size={16} />
                  {feature}
                </li>
              ))}
            </ul>

            <button 
              onClick={handleGetStarted} 
              className={`${styles.pricingCTA} ${styles.ctaFree}`}
            >
              Get Started Free
              <FiArrowRight size={18} />
            </button>
          </motion.div>

          {/* Premium Tier */}
          <motion.div
            className={`${styles.pricingCard} ${styles.popular}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className={styles.popularBadge}>Most Popular</div>

            <div className={styles.pricingHeader}>
              <div className={styles.pricingIcon} style={{ color: '#38bdf8' }}>
                <FiCpu size={24} />
              </div>
              <h3 className={styles.pricingName}>Premium</h3>
              <div className={styles.pricingPrice}>
                <span className={styles.priceAmount}>
                  {billingCycle === 'monthly' ? '$19' : '$190'}
                </span>
                <span className={styles.pricePeriod}>
                  {billingCycle === 'monthly' ? '/month' : '/year'}
                </span>
              </div>
              <p className={styles.pricingDescription}>
                For professionals and enterprises who need unlimited design capacity.
              </p>
            </div>

            <ul className={styles.pricingFeatures}>
              {features.premium.map((feature, i) => (
                <li key={i}>
                  <FiCheckCircle size={16} />
                  {feature}
                </li>
              ))}
            </ul>

            <button 
              onClick={handleCheckout}
              disabled={isProcessing}
              className={`${styles.pricingCTA} ${styles.ctaPremium}`}
            >
              {isProcessing ? 'Processing...' : 'Start Premium'}
              <FiArrowRight size={18} />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Feature Comparison */}
      <section className={styles.comparison}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>Compare</span>
          <h2 className={styles.sectionTitle}>
            Everything You Get<br />
            <span className={styles.sectionHighlight}>At a Glance</span>
          </h2>
        </div>

        <div className={styles.comparisonTable}>
          <table>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Freemium</th>
                <th>Premium</th>
              </tr>
            </thead>
            <tbody>
              {allFeatures.map((feature, index) => (
                <tr key={index}>
                  <td>{feature.name}</td>
                  <td>
                    {feature.free ? (
                      <FiCheckCircle className={styles.checkIcon} />
                    ) : (
                      <FiX className={styles.xIcon} />
                    )}
                  </td>
                  <td>
                    {feature.premium ? (
                      <FiCheckCircle className={styles.checkIcon} />
                    ) : (
                      <FiX className={styles.xIcon} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className={styles.faq}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>FAQ</span>
          <h2 className={styles.sectionTitle}>
            Frequently Asked<br />
            <span className={styles.sectionHighlight}>Questions</span>
          </h2>
        </div>

        <div className={styles.faqGrid}>
          <div className={styles.faqItem}>
            <details>
              <summary>What is the difference between Freemium and Premium?</summary>
              <p>
                Freemium allows 2 designs and has a 1-hour session timeout. 
                Premium gives unlimited designs and no session timeout.
              </p>
            </details>
          </div>
          <div className={styles.faqItem}>
            <details>
              <summary>Do I need to install any software?</summary>
              <p>No! AeroML runs entirely in your browser. No installation required.</p>
            </details>
          </div>
          <div className={styles.faqItem}>
            <details>
              <summary>How accurate are the predictions?</summary>
              <p>
                Our AeroML model achieves 99% accuracy compared to high-fidelity CFD 
                and wind tunnel data.
              </p>
            </details>
          </div>
          <div className={styles.faqItem}>
            <details>
              <summary>What payment methods do you accept?</summary>
              <p>We accept all major credit cards via Lemon Squeezy.</p>
            </details>
          </div>
          <div className={styles.faqItem}>
            <details>
              <summary>Can I cancel my Premium subscription?</summary>
              <p>
                Yes, you can cancel anytime. Your access will continue until the end 
                of your current billing period.
              </p>
            </details>
          </div>
          <div className={styles.faqItem}>
            <details>
              <summary>Is there a free trial?</summary>
              <p>
                We offer a Freemium tier that allows you to explore all features 
                with a limit of 2 designs. No credit card required!
              </p>
            </details>
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
              <button onClick={() => handleSocialClick('github', 'https://github.com/aeroml')} className={styles.socialLink}>
                <FiGithub size={18} />
              </button>
              <button onClick={() => handleSocialClick('twitter', 'https://twitter.com/aeroml')} className={styles.socialLink}>
                <FiTwitter size={18} />
              </button>
              <button onClick={() => handleSocialClick('linkedin', 'https://linkedin.com/company/aeroml')} className={styles.socialLink}>
                <FiLinkedin size={18} />
              </button>
              <button onClick={() => window.location.href = 'mailto:hello@aeroml.com'} className={styles.socialLink}>
                <FiMail size={18} />
              </button>
            </div>
          </div>

          <div className={styles.footerLinks}>
            <div className={styles.footerColumn}>
              <h4>Company</h4>
              <button onClick={() => handleNavigation('/about')} className={styles.footerLink}>About</button>
              <button onClick={() => handleNavigation('/blog')} className={styles.footerLink}>Blog</button>
              <button onClick={() => handleNavigation('/pricing')} className={styles.footerLink}>Pricing</button>
            </div>
            <div className={styles.footerColumn}>
              <h4>Resources</h4>
              <button onClick={() => handleNavigation('/docs')} className={styles.footerLink}>Documentation</button>
              <button onClick={() => handleNavigation('/support')} className={styles.footerLink}>Support</button>
            </div>
            <div className={styles.footerColumn}>
              <h4>Legal</h4>
              <button onClick={() => handleNavigation('/privacy')} className={styles.footerLink}>Privacy Policy</button>
              <button onClick={() => handleNavigation('/terms')} className={styles.footerLink}>Terms of Service</button>
            </div>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <p>© 2026 AeroML. All rights reserved. Built by Hassnain Sajid & Abeeha Raza.</p>
        </div>
      </footer>
    </div>
  );
}