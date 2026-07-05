'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import styles from './about.module.css';
import ParticlesCanvas from '@/components/ParticlesCanvas';
import {
  FiCpu, FiWind, FiTrendingUp, FiShield, FiZap, FiUsers,
  FiAward, FiBookOpen, FiGitBranch, FiGlobe, FiBox, FiDatabase,
  FiArrowRight, FiMenu, FiX, FiGithub, FiLinkedin, FiMail,
  FiCalendar, FiTarget, FiLayers, FiAperture, FiCheckCircle,
  FiTwitter, FiSend, FiCode, FiLayout, FiServer, FiMonitor
} from 'react-icons/fi';

export default function AboutPage() {
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

  // ─── Navigation Handlers ───
  const handleNavigation = (path) => {
    router.push(path);
    setIsMenuOpen(false);
  };

  const handleGetStarted = () => {
    router.push('/auth/signup');
  };

  const handleReadBlog = () => {
    router.push('/blog');
  };

  const handleViewPricing = () => {
    router.push('/pricing');
  };

  const handleContact = () => {
    window.location.href = 'mailto:hello@aeroml.com';
  };

  const handleSocialClick = (platform, url) => {
    window.open(url, '_blank');
  };

  // ─── Updated Team Data ───
  const team = [
    {
      name: 'Hassnain Sajid',
      role: 'Co-Founder & Backend Engineer',
      bio: 'Software Engineer with deep interest in Aerospace Engineering. Built the complete backend infrastructure, AeroML models, and physics engines. Passionate about combining AI with aerodynamics.',
      avatar: 'HS',
      github: 'https://github.com/hassnain',
      linkedin: 'https://linkedin.com/in/hassnain',
      email: 'mailto:hassnain@aeroml.com',
      expertise: ['Python', 'PyTorch', 'FastAPI', 'CFD', 'PINNs']
    },
    {
      name: 'Abeeha Raza',
      role: 'Co-Founder & Frontend Engineer',
      bio: 'Software Engineer with deep interest in Aerospace Engineering. Designed and built the complete frontend, UI/UX, and visualizations. Passionate about creating intuitive, beautiful, and powerful engineering tools.',
      avatar: 'AR',
      github: 'https://github.com/abeeha',
      linkedin: 'https://linkedin.com/in/abeeha',
      email: 'mailto:abeeha@aeroml.com',
      expertise: ['React', 'Next.js', 'Three.js', 'UI/UX', 'D3.js']
    }
  ];

  const milestones = [
    {
      year: '2024',
      title: 'Project Initiation',
      description: 'Started building AeroML as a final year project combining AI with aerodynamics.',
      icon: FiAward
    },
    {
      year: '2024',
      title: 'AeroML Core Engine',
      description: 'Developed the AeroML model achieving 99% accuracy in aerodynamic predictions.',
      icon: FiCpu
    },
    {
      year: '2025',
      title: 'Platform Launch',
      description: 'Launched AeroML with 1600+ airfoil library and real-time predictions.',
      icon: FiGlobe
    },
    {
      year: '2026',
      title: 'SAAS Conversion',
      description: 'Transformed AeroML into a complete SAAS platform with enterprise features.',
      icon: FiTarget
    }
  ];

  const techStack = [
    { name: 'FastAPI', icon: FiServer, color: '#38bdf8', desc: 'High-performance Python API' },
    { name: 'PyTorch', icon: FiCpu, color: '#a855f7', desc: 'Deep Learning Framework' },
    { name: 'Next.js', icon: FiGlobe, color: '#00f2ff', desc: 'React Framework' },
    { name: 'PostgreSQL', icon: FiDatabase, color: '#34d399', desc: 'Relational Database' },
    { name: 'Redis', icon: FiGitBranch, color: '#f59e0b', desc: 'Caching & Queue' },
    { name: 'Three.js', icon: FiLayers, color: '#f472b6', desc: '3D Visualization' }
  ];

  const values = [
    {
      title: 'Innovation',
      description: 'Pushing the boundaries of what\'s possible with AI in aerodynamics.',
      icon: FiZap
    },
    {
      title: 'Accessibility',
      description: 'Making advanced aerodynamic tools available to everyone.',
      icon: FiUsers
    },
    {
      title: 'Excellence',
      description: 'Delivering enterprise-grade accuracy and reliability.',
      icon: FiAward
    },
    {
      title: 'Community',
      description: 'Building a community of engineers and researchers.',
      icon: FiBookOpen
    }
  ];

  return (
    <div className={styles.page}>
      <ParticlesCanvas />

      {/* ─── NAVBAR ─── */}
      <nav className={`${styles.navbar} ${isScrolled ? styles.scrolled : ''}`}>
        <div className={styles.navContainer}>
          <Link href="/" className={styles.logo}>
            <span className={styles.logoIcon}>✈</span>
            <span className={styles.logoText}>AeroML</span>
          </Link>

          <div className={styles.desktopNav}>
            <button 
              onClick={() => handleNavigation('/about')}
              className={`${styles.navLink} ${styles.navLinkActive}`}
            >
              About
            </button>
            <button 
              onClick={() => handleNavigation('/pricing')}
              className={styles.navLink}
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
            {isMenuOpen ? <FiX size={24} /> : <FiMenu size={24} />}
          </button>
        </div>

        {isMenuOpen && (
          <div className={styles.mobileMenu}>
            <button onClick={() => handleNavigation('/about')} className={styles.mobileLinkActive}>About</button>
            <button onClick={() => handleNavigation('/pricing')} className={styles.mobileLink}>Pricing</button>
            <button onClick={() => handleNavigation('/blog')} className={styles.mobileLink}>Blog</button>
            <button onClick={() => handleNavigation('/auth/login')} className={styles.mobileLogin}>Log In</button>
            <button onClick={handleGetStarted} className={styles.mobileSignup}>Get Started</button>
          </div>
        )}
      </nav>

      {/* ─── HERO SECTION ─── */}
      <section className={styles.hero}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className={styles.heroContent}
        >
          <span className={styles.heroTag}>About AeroML</span>
          <h1 className={styles.heroTitle}>
            Built by Engineers,<br />
            <span className={styles.heroHighlight}>For Engineers</span>
          </h1>
          <p className={styles.heroSubtitle}>
            AeroML was born from a simple idea: make aerodynamic design accessible to everyone.
            What started as a final year project has grown into a complete SAAS platform used by 
            engineers worldwide.
          </p>
          <div className={styles.heroButtons}>
            <button onClick={handleGetStarted} className={styles.heroPrimary}>
              Get Started
              <FiArrowRight size={20} />
            </button>
            <button onClick={handleViewPricing} className={styles.heroSecondary}>
              View Pricing
            </button>
          </div>
        </motion.div>
      </section>

      {/* ─── STATS SECTION ─── */}
      <section className={styles.stats}>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statNumber}>1600+</span>
            <span className={styles.statLabel}>Airfoils in Library</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statNumber}>99%</span>
            <span className={styles.statLabel}>Prediction Accuracy</span>
          </div>
          <div className={styles.statCard}>
  <span className={styles.statNumber}>8</span>
  <span className={styles.statLabel}>Ensemble Models</span>
</div>
          <div className={styles.statCard}>
            <span className={styles.statNumber}>&lt;1s</span>
            <span className={styles.statLabel}>Inference Time</span>
          </div>
        </div>
      </section>

      {/* ─── MISSION & VISION ─── */}
      <section className={styles.mission}>
        <div className={styles.missionGrid}>
          <motion.div 
            className={styles.missionCard}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            viewport={{ once: true }}
          >
            <div className={styles.missionIcon} style={{ color: '#00f2ff' }}>
              <FiTarget size={32} />
            </div>
            <h3>Our Mission</h3>
            <p>
              Democratize aerodynamic design by making advanced computational tools 
              accessible, affordable, and intuitive for engineers, researchers, and 
              students worldwide.
            </p>
          </motion.div>
          <motion.div 
            className={styles.missionCard}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            viewport={{ once: true }}
          >
            <div className={styles.missionIcon} style={{ color: '#38bdf8' }}>
              <FiAperture size={32} />
            </div>
            <h3>Our Vision</h3>
            <p>
              Create a future where every engineer can design and optimize aircraft 
              in real-time, accelerating innovation in aerospace, wind energy, and 
              automotive industries.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ─── CORE VALUES ─── */}
      <section className={styles.values}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>Values</span>
          <h2 className={styles.sectionTitle}>
            Our Core<br />
            <span className={styles.sectionHighlight}>Principles</span>
          </h2>
        </div>

        <div className={styles.valuesGrid}>
          {values.map((value, index) => {
            const Icon = value.icon;
            return (
              <motion.div
                key={index}
                className={styles.valueCard}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <div className={styles.valueIcon}>
                  <Icon size={24} />
                </div>
                <h4>{value.title}</h4>
                <p>{value.description}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ─── TEAM SECTION ─── */}
      <section className={styles.team}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>Team</span>
          <h2 className={styles.sectionTitle}>
            The People Behind<br />
            <span className={styles.sectionHighlight}>AeroML</span>
          </h2>
        </div>

        <div className={styles.teamGrid}>
          {team.map((member, index) => (
            <motion.div
              key={index}
              className={styles.teamCard}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              viewport={{ once: true }}
            >
              <div className={styles.teamAvatar}>{member.avatar}</div>
              <h3 className={styles.teamName}>{member.name}</h3>
              <p className={styles.teamRole}>{member.role}</p>
              <p className={styles.teamBio}>{member.bio}</p>
              <div className={styles.teamExpertise}>
                {member.expertise.map((skill, i) => (
                  <span key={i} className={styles.expertiseTag}>{skill}</span>
                ))}
              </div>
              <div className={styles.teamSocial}>
                <button 
                  onClick={() => handleSocialClick('github', member.github)}
                  className={styles.socialLink}
                  aria-label={`${member.name} GitHub`}
                >
                  <FiGithub size={16} />
                </button>
                <button 
                  onClick={() => handleSocialClick('linkedin', member.linkedin)}
                  className={styles.socialLink}
                  aria-label={`${member.name} LinkedIn`}
                >
                  <FiLinkedin size={16} />
                </button>
                <button 
                  onClick={handleContact}
                  className={styles.socialLink}
                  aria-label={`Email ${member.name}`}
                >
                  <FiMail size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── TECH STACK ─── */}
      <section className={styles.tech}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>Technology</span>
          <h2 className={styles.sectionTitle}>
            Modern Stack for<br />
            <span className={styles.sectionHighlight}>Modern Aerodynamics</span>
          </h2>
        </div>

        <div className={styles.techGrid}>
          {techStack.map((tech, index) => {
            const Icon = tech.icon;
            return (
              <motion.div
                key={index}
                className={styles.techCard}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <div 
                  className={styles.techIcon}
                  style={{ color: tech.color }}
                >
                  <Icon size={32} />
                </div>
                <h4 className={styles.techName}>{tech.name}</h4>
                <p className={styles.techDesc}>{tech.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ─── TIMELINE ─── */}
      <section className={styles.timeline}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>Journey</span>
          <h2 className={styles.sectionTitle}>
            Our<br />
            <span className={styles.sectionHighlight}>Milestones</span>
          </h2>
        </div>

        <div className={styles.timelineGrid}>
          {milestones.map((milestone, index) => {
            const Icon = milestone.icon;
            return (
              <motion.div
                key={index}
                className={styles.timelineItem}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <div className={styles.timelineDot} />
                <div className={styles.timelineContent}>
                  <div className={styles.timelineHeader}>
                    <span className={styles.timelineYear}>{milestone.year}</span>
                    <Icon size={20} className={styles.timelineIcon} />
                  </div>
                  <h4 className={styles.timelineTitle}>{milestone.title}</h4>
                  <p className={styles.timelineDescription}>{milestone.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ─── CTA SECTION ─── */}
      <section className={styles.cta}>
        <div className={styles.ctaContent}>
          <h2 className={styles.ctaTitle}>Join the AeroML Community</h2>
          <p className={styles.ctaSubtitle}>
            Start designing airfoils today. Free tier available.
          </p>
          <button onClick={handleGetStarted} className={styles.ctaButton}>
            Get Started
            <FiArrowRight size={20} />
          </button>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
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
              <button onClick={handleContact} className={styles.socialLink}>
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
          <p>© 2026 AeroML. All rights reserved. Built with ❤️ by Hassnain Sajid & Abeeha Raza.</p>
        </div>
      </footer>
    </div>
  );
}