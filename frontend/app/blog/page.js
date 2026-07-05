'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import styles from './blog.module.css';
import ParticlesCanvas from '@/components/ParticlesCanvas';
import {
  FiClock, FiUser, FiTag, FiArrowRight, FiMenu, FiX,
  FiBookOpen, FiZap, FiCpu, FiTrendingUp, FiShield,
  FiSearch, FiCalendar, FiEye, FiHeart, FiShare2,
  FiGithub, FiTwitter, FiLinkedin, FiMail
} from 'react-icons/fi';

// ─── COMPLETE BLOG POSTS DATA ───
const blogPosts = [
  {
    id: 1,
    title: 'Physics-Informed Neural Networks: The Future of Aerodynamic Design',
    excerpt: 'Discover how Physics-Informed Neural Networks are revolutionizing aerodynamic design by combining the power of deep learning with fundamental physics laws. Learn about PINN architectures, training methodologies, and real-world applications in aerospace engineering.',
    author: 'Hassnain Sajid',
    date: 'July 15, 2026',
    category: 'Machine Learning',
    readTime: '12 min read',
    slug: 'physics-informed-neural-networks',
    image: '🔬',
    featured: true,
    views: 2847,
    likes: 156,
    tags: ['PINNs', 'Deep Learning', 'CFD', 'Aerodynamics']
  },
  {
    id: 2,
    title: 'AeroML vs Traditional CFD: A Comprehensive Speed and Accuracy Analysis',
    excerpt: 'A detailed comparison between AeroML\'s AI-powered predictions and traditional CFD simulations. Explore real-world benchmarks, accuracy metrics, and performance analysis across various airfoil geometries and flow conditions.',
    author: 'Abeeha Raza',
    date: 'July 10, 2026',
    category: 'Performance',
    readTime: '8 min read',
    slug: 'aeroml-vs-cfd',
    image: '⚡',
    featured: false,
    views: 2134,
    likes: 98,
    tags: ['CFD', 'Benchmarking', 'Performance', 'AI']
  },
  {
    id: 3,
    title: 'Mastering Multi-Objective Optimization with NSGA-II for Airfoil Design',
    excerpt: 'Learn how NSGA-II genetic algorithms can explore thousands of airfoil designs to find Pareto-optimal solutions. A practical guide with examples, implementation details, and real optimization results from industrial applications.',
    author: 'Hassnain Sajid',
    date: 'July 5, 2026',
    category: 'Optimization',
    readTime: '10 min read',
    slug: 'genetic-optimization',
    image: '🧬',
    featured: false,
    views: 1876,
    likes: 82,
    tags: ['Optimization', 'NSGA-II', 'Pareto', 'Algorithms']
  },
  {
    id: 4,
    title: 'The Future of Aerospace: AI, Urban Air Mobility, and Sustainable Aviation',
    excerpt: 'Explore emerging trends in aerospace engineering including urban air mobility (eVTOL), hypersonic flight, sustainable aviation, and the role of AI in shaping the future of flight and transportation.',
    author: 'Abeeha Raza',
    date: 'June 28, 2026',
    category: 'Industry',
    readTime: '6 min read',
    slug: 'future-aerodynamics',
    image: '🚀',
    featured: false,
    views: 1523,
    likes: 67,
    tags: ['Future', 'eVTOL', 'Sustainability', 'Innovation']
  },
  {
    id: 5,
    title: 'Class Shape Transformation (CST): The Mathematics of Modern Airfoil Design',
    excerpt: 'A comprehensive deep dive into CST parameterization - the mathematical foundation behind efficient airfoil design. Includes derivations, implementation details, and practical applications in modern aerospace engineering.',
    author: 'Hassnain Sajid',
    date: 'June 20, 2026',
    category: 'Tutorial',
    readTime: '15 min read',
    slug: 'cst-parameterization',
    image: '📐',
    featured: false,
    views: 2341,
    likes: 112,
    tags: ['CST', 'Geometry', 'Mathematics', 'Parameterization']
  },
  {
    id: 6,
    title: 'From University Project to Global SAAS: The AeroML Journey',
    excerpt: 'The inspiring story of how AeroML evolved from a final year university project to a complete SAAS platform serving engineers worldwide. Learn about the challenges, breakthroughs, and lessons learned along the way.',
    author: 'Abeeha Raza',
    date: 'June 15, 2026',
    category: 'Company',
    readTime: '5 min read',
    slug: 'academia-to-saas',
    image: '🌟',
    featured: false,
    views: 998,
    likes: 45,
    tags: ['Startup', 'Journey', 'Entrepreneurship', 'Story']
  },
  {
    id: 7,
    title: 'Understanding Boundary Layer Physics for Aerodynamic Design',
    excerpt: 'A comprehensive guide to boundary layer theory, transition prediction, separation analysis, and practical implications for airfoil design. Includes worked examples, visualization techniques, and engineering applications.',
    author: 'Hassnain Sajid',
    date: 'June 8, 2026',
    category: 'Tutorial',
    readTime: '14 min read',
    slug: 'boundary-layer-physics',
    image: '🌊',
    featured: false,
    views: 1678,
    likes: 76,
    tags: ['Boundary Layer', 'Fluid Dynamics', 'Transition', 'Separation']
  },
  {
    id: 8,
    title: 'How AI is Transforming Wind Turbine Blade Design',
    excerpt: 'Explore how AI and machine learning are revolutionizing wind energy by enabling faster, more efficient blade designs. Includes case studies, success stories, and the future potential of AI in renewable energy.',
    author: 'Abeeha Raza',
    date: 'June 1, 2026',
    category: 'Industry',
    readTime: '7 min read',
    slug: 'ai-wind-turbine-design',
    image: '💨',
    featured: false,
    views: 1234,
    likes: 54,
    tags: ['Wind Energy', 'Renewable', 'AI', 'Blades']
  },
  {
    id: 9,
    title: 'Vortex Lattice Method: Theory and Implementation for 3D Wing Analysis',
    excerpt: 'A comprehensive introduction to the Vortex Lattice Method (VLM) for 3D wing analysis. Covers theoretical foundations, implementation details, and practical applications in aircraft design and optimization.',
    author: 'Hassnain Sajid',
    date: 'May 25, 2026',
    category: 'Tutorial',
    readTime: '11 min read',
    slug: 'vortex-lattice-method',
    image: '🌀',
    featured: false,
    views: 1456,
    likes: 63,
    tags: ['VLM', '3D Wing', 'Aerodynamics', 'Implementation']
  },
  {
    id: 10,
    title: 'Building Scalable ML Infrastructure for Aerospace Applications',
    excerpt: 'Lessons learned from building AeroML\'s production machine learning infrastructure. Covers model deployment, scaling strategies, CI/CD pipelines, and best practices for ML in aerospace engineering.',
    author: 'Abeeha Raza',
    date: 'May 18, 2026',
    category: 'Machine Learning',
    readTime: '9 min read',
    slug: 'scalable-ml-infrastructure',
    image: '🏗️',
    featured: false,
    views: 876,
    likes: 34,
    tags: ['ML Infrastructure', 'Production', 'Scaling', 'Best Practices']
  },
  {
    id: 11,
    title: 'Aeroelasticity: Understanding the Interaction of Aerodynamics and Structures',
    excerpt: 'A comprehensive overview of aeroelastic phenomena including flutter, divergence, and control surface effectiveness. Practical implications for aircraft design and certification requirements.',
    author: 'Hassnain Sajid',
    date: 'May 10, 2026',
    category: 'Tutorial',
    readTime: '13 min read',
    slug: 'aeroelasticity-basics',
    image: '🔄',
    featured: false,
    views: 1098,
    likes: 48,
    tags: ['Aeroelasticity', 'Flutter', 'Structures', 'Design']
  },
  {
    id: 12,
    title: 'The Economics of AI in Aerospace Engineering',
    excerpt: 'An analysis of the economic impact of AI adoption in aerospace engineering. Cost savings, time reduction, ROI analysis for companies adopting AI-powered design tools, and market growth projections.',
    author: 'Abeeha Raza',
    date: 'May 3, 2026',
    category: 'Industry',
    readTime: '6 min read',
    slug: 'economics-of-ai-aerospace',
    image: '💰',
    featured: false,
    views: 765,
    likes: 29,
    tags: ['Economics', 'ROI', 'Adoption', 'Strategy']
  }
];

const categories = [
  'All',
  'Machine Learning',
  'Performance',
  'Optimization',
  'Industry',
  'Tutorial',
  'Company'
];

export default function BlogPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

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
    window.location.href = path;
    setIsMenuOpen(false);
  };

  const handleSocialClick = (platform, url) => {
    window.open(url, '_blank');
  };

  const filteredPosts = blogPosts.filter(post => {
    const matchesCategory = activeCategory === 'All' || post.category === activeCategory;
    const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          post.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          post.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const featuredPost = blogPosts.find(p => p.featured);

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
            <button onClick={() => handleNavigation('/about')} className={styles.navLink}>
              About
            </button>
            <button onClick={() => handleNavigation('/pricing')} className={styles.navLink}>
              Pricing
            </button>
            <button onClick={() => handleNavigation('/blog')} className={`${styles.navLink} ${styles.navLinkActive}`}>
              Blog
            </button>
          </div>

          <div className={styles.navActions}>
            <button onClick={() => handleNavigation('/auth/login')} className={styles.navLogin}>
              Log In
            </button>
            <button onClick={() => handleNavigation('/auth/signup')} className={styles.navSignup}>
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
            <button onClick={() => handleNavigation('/about')} className={styles.mobileLink}>
              About
            </button>
            <button onClick={() => handleNavigation('/pricing')} className={styles.mobileLink}>
              Pricing
            </button>
            <button onClick={() => handleNavigation('/blog')} className={`${styles.mobileLink} ${styles.mobileLinkActive}`}>
              Blog
            </button>
            <button onClick={() => handleNavigation('/auth/login')} className={styles.mobileLogin}>
              Log In
            </button>
            <button onClick={() => handleNavigation('/auth/signup')} className={styles.mobileSignup}>
              Get Started
            </button>
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
          <span className={styles.heroTag}>Blog</span>
          <h1 className={styles.heroTitle}>
            Insights &<br />
            <span className={styles.heroHighlight}>Aerodynamics</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Explore in-depth articles on AI in aerodynamics, optimization techniques,
            and the future of flight. Written by engineers, for engineers.
          </p>
        </motion.div>
      </section>

      {/* ─── SEARCH & FILTERS ─── */}
      <section className={styles.filters}>
        <div className={styles.filterContainer}>
          <div className={styles.searchWrapper}>
            <FiSearch className={styles.searchIcon} size={18} />
            <input
              type="text"
              placeholder="Search articles by title, topic, or tags..."
              className={styles.searchInput}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button 
                className={styles.clearSearch}
                onClick={() => setSearchQuery('')}
              >
                <FiX size={18} />
              </button>
            )}
          </div>
          <div className={styles.categoryWrapper}>
            {categories.map((category) => (
              <button
                key={category}
                className={`${styles.categoryBtn} ${activeCategory === category ? styles.active : ''}`}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURED POST ─── */}
      {featuredPost && activeCategory === 'All' && !searchQuery && (
        <section className={styles.featured}>
          <Link href={`/blog/${featuredPost.slug}`} className={styles.featuredLink}>
            <motion.div
              className={styles.featuredCard}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className={styles.featuredBadge}>Featured</div>
              <div className={styles.featuredImage}>{featuredPost.image}</div>
              <div className={styles.featuredContent}>
                <span className={styles.featuredCategory}>{featuredPost.category}</span>
                <h2 className={styles.featuredTitle}>{featuredPost.title}</h2>
                <p className={styles.featuredExcerpt}>{featuredPost.excerpt}</p>
                <div className={styles.featuredMeta}>
                  <span className={styles.featuredAuthor}>
                    <FiUser size={14} /> {featuredPost.author}
                  </span>
                  <span className={styles.featuredDate}>
                    <FiCalendar size={14} /> {featuredPost.date}
                  </span>
                  <span className={styles.featuredReadTime}>
                    <FiClock size={14} /> {featuredPost.readTime}
                  </span>
                  <span className={styles.featuredViews}>
                    <FiEye size={14} /> {featuredPost.views.toLocaleString()}
                  </span>
                </div>
                <div className={styles.featuredTags}>
                  {featuredPost.tags.map((tag, i) => (
                    <span key={i} className={styles.featuredTag}>#{tag}</span>
                  ))}
                </div>
              </div>
            </motion.div>
          </Link>
        </section>
      )}

      {/* ─── BLOG GRID ─── */}
      <section className={styles.blogGrid}>
        <div className={styles.gridContainer}>
          {filteredPosts.length === 0 ? (
            <div className={styles.noResults}>
              <FiBookOpen size={48} />
              <h3>No articles found</h3>
              <p>Try adjusting your search or filter criteria.</p>
            </div>
          ) : (
            filteredPosts.map((post, index) => (
              <motion.article
                key={post.id}
                className={styles.postCard}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: (index % 6) * 0.05 }}
                viewport={{ once: true }}
              >
                <Link href={`/blog/${post.slug}`} className={styles.postLink}>
                  <div className={styles.postImage}>
                    <span className={styles.postEmoji}>{post.image}</span>
                    {!post.featured && (
                      <span className={styles.postCategoryBadge}>{post.category}</span>
                    )}
                  </div>
                  <div className={styles.postContent}>
                    <div className={styles.postMeta}>
                      <span className={styles.postCategory}>{post.category}</span>
                      <span className={styles.postDate}>
                        <FiClock size={12} />
                        {post.date}
                      </span>
                    </div>
                    <h3 className={styles.postTitle}>{post.title}</h3>
                    <p className={styles.postExcerpt}>{post.excerpt}</p>
                    <div className={styles.postTags}>
                      {post.tags.slice(0, 2).map((tag, i) => (
                        <span key={i} className={styles.postTag}>#{tag}</span>
                      ))}
                      {post.tags.length > 2 && (
                        <span className={styles.postTagMore}>+{post.tags.length - 2}</span>
                      )}
                    </div>
                    <div className={styles.postFooter}>
                      <span className={styles.postAuthor}>
                        <FiUser size={12} />
                        {post.author}
                      </span>
                      <span className={styles.postReadTime}>{post.readTime}</span>
                    </div>
                  </div>
                </Link>
              </motion.article>
            ))
          )}
        </div>
      </section>

      {/* ─── NEWSLETTER CTA ─── */}
      <section className={styles.newsletter}>
        <div className={styles.newsletterContent}>
          <h2 className={styles.newsletterTitle}>Subscribe to Our Newsletter</h2>
          <p className={styles.newsletterSubtitle}>
            Get the latest articles, tutorials, and insights delivered to your inbox.
            No spam, unsubscribe anytime.
          </p>
          <div className={styles.newsletterForm}>
            <input
              type="email"
              placeholder="Enter your email address"
              className={styles.newsletterInput}
            />
            <button className={styles.newsletterButton}>
              Subscribe
              <FiArrowRight size={20} />
            </button>
          </div>
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
          <p>© 2026 AeroML. All rights reserved. Built with ❤️ by Hassnain Sajid & Abeeha Raza.</p>
        </div>
      </footer>
    </div>
  );
}