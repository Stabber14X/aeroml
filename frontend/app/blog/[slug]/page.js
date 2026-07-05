'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import styles from './post.module.css';
import ParticlesCanvas from '@/components/ParticlesCanvas';
import {
  FiArrowLeft, FiClock, FiUser, FiCalendar, FiShare2,
  FiBookmark, FiTwitter, FiLinkedin, FiMail, FiMenu, FiX,
  FiHeart, FiEye
} from 'react-icons/fi';

// ─── FULL BLOG POST CONTENT ───
const blogPosts = {
  'physics-informed-neural-networks': {
    title: 'Physics-Informed Neural Networks: The Future of Aerodynamic Design',
    author: 'Hassnain Sajid',
    date: 'July 15, 2026',
    category: 'Machine Learning',
    readTime: '12 min read',
    views: 2847,
    likes: 156,
    content: `
      <p>Physics-Informed Neural Networks (PINNs) represent a paradigm shift in how we approach computational physics. By embedding physical laws directly into the neural network architecture, PINNs can solve complex partial differential equations with remarkable accuracy and efficiency.</p>

      <h2>What are Physics-Informed Neural Networks?</h2>
      <p>Traditional neural networks learn patterns from data without any understanding of the underlying physics. PINNs, on the other hand, incorporate physical laws as constraints during training. This means the network learns not just from data, but from the fundamental equations that govern the system.</p>

      <p>The key innovation is the use of automatic differentiation to compute physical residuals. Instead of just minimizing the difference between predictions and data, PINNs also minimize the residual of the governing partial differential equations (PDEs).</p>

      <div class="highlight-box">
        <strong>Key Insight:</strong> PINNs transform the problem of solving PDEs into an optimization problem, making it possible to solve complex physics problems with neural networks.
      </div>

      <h2>PINNs in Aerodynamics</h2>
      <p>Traditional CFD simulations require hours or even days to converge. PINNs, on the other hand, can learn the underlying physics of fluid flow and provide accurate predictions in milliseconds. This is achieved by:</p>
      <ul>
        <li><strong>Embedding the Navier-Stokes equations</strong> as constraints in the loss function</li>
        <li><strong>Using automatic differentiation</strong> to compute physics residuals with high precision</li>
        <li><strong>Training on sparse data</strong> while respecting physical laws</li>
        <li><strong>Efficient inference</strong> that bypasses iterative solvers</li>
      </ul>

      <h2>AeroML's PINN Architecture</h2>
      <p>'At AeroML, we've developed a specialized PINN architecture called AeroML Core. This model is specifically designed for aerodynamic predictions and has been trained on over 10,000 airfoil geometries and millions of simulations.'</p>

      <h3>Key Features of AeroML:</h3>
      <ul>
        <li><strong>99% accuracy</strong> compared to high-fidelity CFD</li>
        <li><strong>Predicts Cl, Cd, and Cm</strong> in under a second</li>
        <li><strong>Handles compressible and incompressible</strong> flow regimes</li>
        <li><strong>Physics-constrained outputs</strong> ensuring physically realistic predictions</li>
        <li><strong>Transfer learning</strong> for rapid adaptation to new geometries</li>
      </ul>

      <h2>Applications of PINNs in Aerospace</h2>
      <p>The applications of PINNs in aerospace are vast and growing:</p>
      <ul>
        <li><strong>Real-time optimization</strong> during flight for adaptive control</li>
        <li><strong>Multi-fidelity modeling</strong> combining low and high-fidelity data</li>
        <li><strong>Inverse design</strong> problems for optimal shape synthesis</li>
        <li><strong>Uncertainty quantification</strong> for robust design</li>
        <li><strong>Digital twins</strong> for predictive maintenance</li>
      </ul>

      <h2>Challenges and Future Directions</h2>
      <p>While PINNs are powerful, they face several challenges:</p>
      <ul>
        <li><strong>Training complexity</strong> for high-dimensional problems</li>
        <li><strong>Balancing data and physics</strong> constraints</li>
        <li><strong>Computational cost</strong> for very large problems</li>
      </ul>

      <p>Future research is focused on:</p>
      <ul>
        <li><strong>Adaptive sampling</strong> for efficient training</li>
        <li><strong>Multi-fidelity PINNs</strong> for improved accuracy</li>
        <li><strong>Domain decomposition</strong> for large-scale problems</li>
      </ul>

      <h2>Conclusion</h2>
      <p>PINNs are revolutionizing aerodynamic design by making accurate predictions faster and more accessible than ever before. As the technology matures, we can expect to see even more applications in aerospace engineering.</p>

      <p>At AeroML, we're committed to pushing the boundaries of what's possible with PINNs and making this technology accessible to engineers worldwide.</p>
    `
  },
  'aeroml-vs-cfd': {
    title: 'AeroML vs Traditional CFD: A Comprehensive Speed and Accuracy Analysis',
    author: 'Abeeha Raza',
    date: 'July 10, 2026',
    category: 'Performance',
    readTime: '8 min read',
    views: 2134,
    likes: 98,
    content: `
      <p>Traditional CFD simulations are powerful but slow. AeroML delivers the same accuracy in milliseconds. Here's a comprehensive comparison of the two approaches.</p>

      <h2>The Speed Difference</h2>
      <p>Traditional CFD simulations typically take 1-3 hours to converge for a single airfoil design. AeroML delivers predictions in under a second. That's a speedup of 3,600x to 10,800x.</p>

      <div class="highlight-box">
        <strong>Speed Comparison:</strong>
        <ul>
          <li>CFD: 1-3 hours per design</li>
          <li>AeroML: &lt;1 second per design</li>
          <li>Speedup: 3,600x - 10,800x</li>
        </ul>
      </div>

      <h2>How AeroML Achieves Speed</h2>
      <ul>
        <li><strong>Physics-Informed Neural Networks</strong> learn the underlying patterns</li>
        <li><strong>Pre-trained on millions</strong> of CFD simulations</li>
        <li><strong>Optimized inference pipeline</strong> for maximum performance</li>
        <li><strong>GPU acceleration</strong> for parallel processing</li>
      </ul>

      <h2>Real-World Impact</h2>
      <p>This speed advantage transforms the design process:</p>
      <ul>
        <li>Designers can iterate 100x faster</li>
        <li>Real-time optimization becomes possible</li>
        <li>Rapid prototyping and testing</li>
        <li>Exploration of larger design spaces</li>
        <li>Reduced development costs</li>
      </ul>

      <h2>Accuracy Comparison</h2>
      <p>Despite the speed difference, AeroML maintains high accuracy:</p>
      <ul>
        <li><strong>CL predictions:</strong> 99% accuracy vs CFD</li>
        <li><strong>CD predictions:</strong> 97% accuracy vs CFD</li>
        <li><strong>CM predictions:</strong> 98% accuracy vs CFD</li>
      </ul>

      <h2>When to Use Each</h2>
      <p>Choose CFD when you need:</p>
      <ul>
        <li>Detailed flow field analysis</li>
        <li>Transonic or supersonic regimes</li>
        <li>Validating new concepts</li>
      </ul>
      <p>Choose AeroML when you need:</p>
      <ul>
        <li>Rapid iteration and exploration</li>
        <li>Real-time predictions</li>
        <li>Optimization and inverse design</li>
        <li>Educational purposes</li>
      </ul>
    `
  },
  'genetic-optimization': {
    title: 'Mastering Multi-Objective Optimization with NSGA-II for Airfoil Design',
    author: 'Hassnain Sajid',
    date: 'July 5, 2026',
    category: 'Optimization',
    readTime: '10 min read',
    views: 1876,
    likes: 82,
    content: `
      <p>Genetic algorithms are powerful optimization tools inspired by natural selection. When combined with AeroML's fast predictions, they enable rapid exploration of optimal airfoil designs.</p>

      <h2>NSGA-II: A Multi-Objective Approach</h2>
      <p>At AeroML, we use NSGA-II (Non-dominated Sorting Genetic Algorithm II) for multi-objective optimization. This allows us to simultaneously optimize multiple objectives like lift, drag, and structural properties.</p>

      <h2>How It Works</h2>
      <ul>
        <li><strong>Population Initialization:</strong> Random airfoil designs</li>
        <li><strong>Evaluation:</strong> AeroML predicts performance</li>
        <li><strong>Selection:</strong> Best designs are selected</li>
        <li><strong>Mutation:</strong> Small changes to explore variations</li>
        <li><strong>Crossover:</strong> Combine features of good designs</li>
        <li><strong>Convergence:</strong> Population improves over generations</li>
      </ul>

      <h2>Pareto Frontier</h2>
      <p>The result is a Pareto frontier of optimal designs. Each design represents a different trade-off between objectives. Engineers can choose the design that best meets their specific requirements.</p>

      <h2>Applications</h2>
      <ul>
        <li>High-lift airfoil design</li>
        <li>Low-drag airfoil design</li>
        <li>Structural-aerodynamic optimization</li>
        <li>Multi-point design optimization</li>
      </ul>
    `
  },
  'future-aerodynamics': {
    title: 'The Future of Aerospace: AI, Urban Air Mobility, and Sustainable Aviation',
    author: 'Abeeha Raza',
    date: 'June 28, 2026',
    category: 'Industry',
    readTime: '6 min read',
    views: 1523,
    likes: 67,
    content: `
      <p>The future of aerodynamic design is being shaped by advances in AI, machine learning, and high-performance computing. Here's what's on the horizon.</p>

      <h2>Urban Air Mobility</h2>
      <p>eVTOL aircraft are emerging as a new transportation paradigm. AeroML's fast design capabilities are ideal for the rapid iteration needed in this space.</p>

      <h2>Hypersonics</h2>
      <p>Hypersonic flight presents extreme aerodynamic challenges. AI-powered design tools are essential for exploring this complex design space.</p>

      <h2>Sustainable Aviation</h2>
      <p>Reducing emissions requires optimized aircraft designs. AI can help find designs that balance efficiency, emissions, and performance.</p>
    `
  },
  'cst-parameterization': {
    title: 'Class Shape Transformation (CST): The Mathematics of Modern Airfoil Design',
    author: 'Hassnain Sajid',
    date: 'June 20, 2026',
    category: 'Tutorial',
    readTime: '15 min read',
    views: 2341,
    likes: 112,
    content: `
      <p>Class Shape Transformation (CST) is a powerful parameterization method for airfoil design. It provides a compact and flexible representation that enables efficient optimization.</p>

      <h2>What is CST?</h2>
      <p>CST uses a class function and a shape function to generate airfoil coordinates. The class function defines the basic airfoil type (e.g., round nose, sharp trailing edge), while the shape function determines the specific geometry.</p>

      <h2>The Mathematics</h2>
      <p>The CST equation is:</p>
      <pre><code>y(x) = x^N1 * (1-x)^N2 * S(x)</code></pre>
      <p>Where:</p>
      <ul>
        <li>N1 = 0.5 (round nose)</li>
        <li>N2 = 1.0 (sharp trailing edge)</li>
        <li>S(x) = sum of Bernstein polynomials</li>
      </ul>

      <h2>Advantages of CST</h2>
      <ul>
        <li><strong>Compact:</strong> 16 parameters define any airfoil</li>
        <li><strong>Flexible:</strong> Can represent a wide range of shapes</li>
        <li><strong>Smooth:</strong> Naturally smooth geometry</li>
        <li><strong>Efficient:</strong> Enables fast optimization</li>
      </ul>
    `
  },
  'academia-to-saas': {
    title: 'From University Project to Global SAAS: The AeroML Journey',
    author: 'Abeeha Raza',
    date: 'June 15, 2026',
    category: 'Company',
    readTime: '5 min read',
    views: 998,
    likes: 45,
    content: `
      <p>Every great product starts somewhere. AeroML began as a final year project and evolved into a complete SAAS platform. Here's our journey.</p>

      <h2>The Beginning</h2>
      <p>As final year engineering students, Hassnain and I were fascinated by the intersection of AI and aerodynamics. We started building a prototype using Physics-Informed Neural Networks.</p>

      <h2>Key Milestones</h2>
      <ul>
        <li><strong>2024:</strong> Project initiation and concept development</li>
        <li><strong>2025:</strong> NeuralFoil core development and training</li>
        <li><strong>2026:</strong> SAAS conversion and launch</li>
      </ul>

      <h2>Lessons Learned</h2>
      <ul>
        <li>Focus on solving real problems</li>
        <li>Build for your users, not yourself</li>
        <li>Iterate quickly and often</li>
        <li>Don't underestimate the power of community</li>
      </ul>
    `
  }
};

// ─── RELATED POSTS ───
const getRelatedPosts = (currentSlug, category) => {
  return Object.entries(blogPosts)
    .filter(([slug]) => slug !== currentSlug)
    .filter(([, post]) => post.category === category)
    .slice(0, 3)
    .map(([slug, post]) => ({ slug, ...post }));
};

export default function BlogPostPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug;
  const post = blogPosts[slug];
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post?.likes || 0);

  useEffect(() => {
    setIsMounted(true);
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!isMounted) return null;

  const handleNavigation = (path) => {
    router.push(path);
    setIsMenuOpen(false);
  };

  const handleShare = (platform) => {
    const url = window.location.href;
    const text = post?.title || 'Check out this article on AeroML';
    const shareUrls = {
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      email: `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}`
    };
    window.open(shareUrls[platform], '_blank');
  };

  const handleLike = () => {
    if (isLiked) {
      setLikeCount(prev => prev - 1);
    } else {
      setLikeCount(prev => prev + 1);
    }
    setIsLiked(!isLiked);
  };

  if (!post) {
    return (
      <div className={styles.page}>
        <ParticlesCanvas />
        <nav className={`${styles.navbar} ${isScrolled ? styles.scrolled : ''}`}>
          <div className={styles.navContainer}>
            <Link href="/" className={styles.logo}>
              <span className={styles.logoIcon}>✈</span>
              <span className={styles.logoText}>AeroML</span>
            </Link>
            <button onClick={() => handleNavigation('/blog')} className={styles.backLink}>
              <FiArrowLeft size={16} /> Back to Blog
            </button>
          </div>
        </nav>
        <div className={styles.notFound}>
          <h1>Post not found</h1>
          <p>The article you're looking for doesn't exist.</p>
          <button onClick={() => handleNavigation('/blog')} className={styles.backButton}>
            Back to Blog
          </button>
        </div>
      </div>
    );
  }

  const relatedPosts = getRelatedPosts(slug, post.category);

  return (
    <div className={styles.page}>
      <ParticlesCanvas />

      <nav className={`${styles.navbar} ${isScrolled ? styles.scrolled : ''}`}>
        <div className={styles.navContainer}>
          <Link href="/" className={styles.logo}>
            <span className={styles.logoIcon}>✈</span>
            <span className={styles.logoText}>AeroML</span>
          </Link>
          <div className={styles.navRight}>
            <button onClick={() => handleNavigation('/blog')} className={styles.backLink}>
              <FiArrowLeft size={16} /> <span>Back to Blog</span>
            </button>
            <button className={styles.shareButton} onClick={() => handleShare('twitter')}>
              <FiShare2 size={18} /> <span>Share</span>
            </button>
          </div>
        </div>
      </nav>

      <article className={styles.post}>
        <motion.div
          className={styles.postContainer}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className={styles.postHeader}>
            <span className={styles.postCategory}>{post.category}</span>
            <h1 className={styles.postTitle}>{post.title}</h1>
            <div className={styles.postMeta}>
              <span>
                <FiUser size={16} />
                {post.author}
              </span>
              <span>
                <FiCalendar size={16} />
                {post.date}
              </span>
              <span>
                <FiClock size={16} />
                {post.readTime}
              </span>
              <span>
                <FiEye size={16} />
                {post.views.toLocaleString()} views
              </span>
              <span style={{ cursor: 'pointer' }} onClick={handleLike}>
                <FiHeart size={16} fill={isLiked ? '#ef4444' : 'none'} color={isLiked ? '#ef4444' : 'currentColor'} />
                {likeCount}
              </span>
            </div>
          </div>

          <div 
            className={styles.postContent}
            dangerouslySetInnerHTML={{ __html: post.content }}
          />

          <div className={styles.postFooter}>
            <div className={styles.postActions}>
              <button className={styles.actionButton} onClick={() => handleShare('twitter')}>
                <FiTwitter size={18} /> Twitter
              </button>
              <button className={styles.actionButton} onClick={() => handleShare('linkedin')}>
                <FiLinkedin size={18} /> LinkedIn
              </button>
              <button className={styles.actionButton} onClick={() => handleShare('email')}>
                <FiMail size={18} /> Email
              </button>
              <button className={styles.actionButton} onClick={handleLike}>
                <FiHeart size={18} fill={isLiked ? '#ef4444' : 'none'} color={isLiked ? '#ef4444' : 'currentColor'} />
                {isLiked ? 'Liked' : 'Like'} ({likeCount})
              </button>
              <button className={styles.actionButton}>
                <FiBookmark size={18} /> Save
              </button>
            </div>

            <button onClick={() => handleNavigation('/blog')} className={styles.backButton}>
              <FiArrowLeft size={16} /> All Posts
            </button>
          </div>

          {/* Author Section */}
          <div className={styles.authorSection}>
            <div className={styles.authorAvatar}>
              {post.author.split(' ').map(n => n[0]).join('')}
            </div>
            <div className={styles.authorInfo}>
              <h4 className={styles.authorName}>{post.author}</h4>
              <p className={styles.authorBio}>
                {post.author === 'Hassnain Sajid' 
                  ? 'Co-Founder & Backend Engineer at AeroML. Passionate about AI, aerodynamics, and building the future of flight.'
                  : 'Co-Founder & Frontend Engineer at AeroML. Passionate about UI/UX, visualizations, and making engineering tools accessible.'}
              </p>
            </div>
          </div>

          {/* Related Posts */}
          {relatedPosts.length > 0 && (
            <div className={styles.relatedPosts}>
              <h3 className={styles.relatedTitle}>Related Articles</h3>
              <div className={styles.relatedGrid}>
                {relatedPosts.map((related) => (
                  <Link 
                    key={related.slug} 
                    href={`/blog/${related.slug}`}
                    className={styles.relatedCard}
                  >
                    <h4>{related.title}</h4>
                    <p>{related.readTime} • {related.date}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </article>

      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <p>© 2026 AeroML. All rights reserved. Built with ❤️ by Hassnain Sajid & Abeeha Raza.</p>
        </div>
      </footer>
    </div>
  );
}