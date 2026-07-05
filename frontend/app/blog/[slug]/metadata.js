// frontend/app/blog/[slug]/metadata.js

// Blog post metadata map
const blogMetadata = {
  'physics-informed-neural-networks': {
    title: 'Physics-Informed Neural Networks: The Future of Aerodynamic Design - AeroML Blog',
    description: 'Learn how Physics-Informed Neural Networks are revolutionizing aerodynamic design. PINN architectures, training, and aerospace applications.',
  },
  'aeroml-vs-cfd': {
    title: 'AeroML vs Traditional CFD: Speed and Accuracy Analysis - AeroML Blog',
    description: 'Detailed comparison of AeroML AI predictions vs traditional CFD simulations. Speed, accuracy, benchmarks, and real-world performance.',
  },
  'genetic-optimization': {
    title: 'NSGA-II Multi-Objective Optimization for Airfoil Design - AeroML Blog',
    description: 'Learn how NSGA-II genetic algorithms explore thousands of airfoil designs to find Pareto-optimal solutions. Practical optimization guide.',
  },
  'future-aerodynamics': {
    title: 'The Future of Aerospace: AI, Urban Air Mobility, and Sustainable Aviation - AeroML Blog',
    description: 'Explore emerging trends in aerospace engineering including urban air mobility, hypersonic flight, sustainable aviation, and the role of AI.',
  },
  'cst-parameterization': {
    title: 'Class Shape Transformation (CST): The Mathematics of Modern Airfoil Design - AeroML Blog',
    description: 'A comprehensive deep dive into CST parameterization - the mathematical foundation behind efficient airfoil design. Includes derivations and implementation.',
  },
  'academia-to-saas': {
    title: 'From University Project to Global SAAS: The AeroML Journey - AeroML Blog',
    description: 'The inspiring story of how AeroML evolved from a final year university project to a complete SAAS platform serving engineers worldwide.',
  },
  'boundary-layer-physics': {
    title: 'Understanding Boundary Layer Physics for Aerodynamic Design - AeroML Blog',
    description: 'A comprehensive guide to boundary layer theory, transition prediction, separation analysis, and practical implications for airfoil design.',
  },
  'ai-wind-turbine-design': {
    title: 'How AI is Transforming Wind Turbine Blade Design - AeroML Blog',
    description: 'Explore how AI and machine learning are revolutionizing wind energy by enabling faster, more efficient blade designs. Includes case studies.',
  },
  'vortex-lattice-method': {
    title: 'Vortex Lattice Method: Theory and Implementation for 3D Wing Analysis - AeroML Blog',
    description: 'A comprehensive introduction to the Vortex Lattice Method (VLM) for 3D wing analysis. Theoretical foundations and implementation details.',
  },
  'scalable-ml-infrastructure': {
    title: 'Building Scalable ML Infrastructure for Aerospace Applications - AeroML Blog',
    description: 'Lessons learned from building AeroML\'s production machine learning infrastructure. Model deployment, scaling strategies, and best practices.',
  },
  'aeroelasticity-basics': {
    title: 'Aeroelasticity: Understanding the Interaction of Aerodynamics and Structures - AeroML Blog',
    description: 'A comprehensive overview of aeroelastic phenomena including flutter, divergence, and control surface effectiveness in aircraft design.',
  },
  'economics-of-ai-aerospace': {
    title: 'The Economics of AI in Aerospace Engineering - AeroML Blog',
    description: 'An analysis of the economic impact of AI adoption in aerospace engineering. Cost savings, time reduction, and ROI analysis.',
  },
};

export function generateMetadata({ params }) {
  const post = blogMetadata[params.slug];
  
  if (!post) {
    return {
      title: 'Blog Post - AeroML',
      description: 'Read our latest article on AI in aerodynamics and aerospace engineering.',
    };
  }
  
  return {
    title: post.title,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
    },
    twitter: {
      title: post.title,
      description: post.description,
    },
  };
}