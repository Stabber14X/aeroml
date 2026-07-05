// frontend/app/metadata.js
// COMPLETE SEO METADATA - NOTHING SKIPPED

export const defaultMetadata = {
  title: 'AeroML - AI-Powered Aerodynamic Design Platform',
  description: 'Design, optimize, and analyze airfoils with Physics-Informed Neural Networks. Get enterprise-grade CFD predictions in milliseconds. Free trial available.',
  keywords: [
    'aerodynamic design',
    'airfoil optimization',
    'CFD alternative',
    'neural network aerodynamics',
    'Physics-Informed Neural Networks',
    'aerospace engineering',
    'wind turbine design',
    'NACA airfoil generator',
    'UIUC airfoil database',
    'online airfoil design',
    'aerodynamic analysis tool'
  ].join(', '),
  authors: [{ name: 'Hassnain Sajid & Abeeha Raza' }],
  robots: 'index, follow',
  openGraph: {
    type: 'website',
    siteName: 'AeroML',
    url: 'https://aeroml.com',
    title: 'AeroML - AI-Powered Aerodynamic Design Platform',
    description: 'Design, optimize, and analyze airfoils with Physics-Informed Neural Networks. Get enterprise-grade CFD predictions in milliseconds.',
    images: [
      {
        url: 'https://aeroml.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'AeroML - AI-Powered Aerodynamic Design Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AeroML - AI-Powered Aerodynamic Design Platform',
    description: 'AI-powered aerodynamic design with Physics-Informed Neural Networks.',
    images: ['https://aeroml.com/og-image.png'],
    site: '@aeroml',
    creator: '@aeroml',
  },
  alternates: {
    canonical: 'https://aeroml.com',
  },
};

export const pageMetadata = {
  home: {
    title: 'AeroML - AI-Powered Aerodynamic Design Platform',
    description: 'Design, optimize, and analyze airfoils with Physics-Informed Neural Networks. Get enterprise-grade CFD predictions in milliseconds. Free trial available.',
  },
  about: {
    title: 'About AeroML - AI Aerodynamic Design Platform',
    description: 'Learn about AeroML, the AI-powered aerodynamic design platform built by engineers for engineers. Our mission, vision, and team.',
  },
  pricing: {
    title: 'AeroML Pricing - Free Trial & Premium Plans',
    description: 'Choose your plan: Free 24-hour trial with full access, or Premium for $19/month with unlimited designs and all features.',
  },
  blog: {
    title: 'AeroML Blog - AI in Aerodynamics & Aerospace Engineering',
    description: 'Explore articles on AI in aerodynamics, optimization techniques, and the future of flight. Written by engineers for engineers.',
  },
  library: {
    title: 'AeroML Airfoil Library - 1600+ UIUC Database',
    description: 'Browse 1600+ airfoils from the UIUC database. NACA, Eppler, Clark Y, and more. Instant CST parameterization and analysis.',
  },
  workbench: {
    title: 'AeroML Workbench - Interactive Airfoil Design & Analysis',
    description: 'Design, optimize, and analyze airfoils in real-time. Physics-Informed Neural Networks, VLM, Panel Methods, and NSGA-II optimization.',
  },
  aerosage: {
    title: 'AeroSAGE - Advanced Panel Method & Boundary Layer Analysis',
    description: 'Hess-Smith panel method, boundary layer analysis, defect injection, and Oracle diagnostics for aerodynamic surface analysis.',
  },
  finiteWing: {
    title: 'Finite Wing Analysis - 3D VLM & Acoustics',
    description: 'Analyze 3D wings with Vortex Lattice Method, spanwise lift distribution, and BPM aeroacoustic predictions.',
  },
  neuralFlow: {
    title: 'Neural Flow - CFD Post-Processing & Field Visualization',
    description: 'Visualize flow fields, pressure contours, turbulence, and boundary layers with DeepONet physics-informed neural networks.',
  },
  flightDynamics: {
    title: 'Flight Dynamics - Mission, Structure & Stochastic Analysis',
    description: 'Comprehensive aircraft performance analysis including mission envelope, structural mechanics, and manufacturing robustness.',
  },
  inverseDesign: {
    title: 'Inverse Design - Gradient-Based Shape Synthesis',
    description: 'Specify target aerodynamic coefficients and let L-BFGS autograd optimize the airfoil geometry automatically.',
  },
  pareto: {
    title: 'Pareto Optimization - NSGA-II Multi-Objective Analysis',
    description: 'Explore the trade-off between lift, drag, and structural properties with NSGA-II genetic algorithm optimization.',
  },
  export: {
    title: 'Export - Manufacturing & CAD Formats',
    description: 'Export airfoil designs in DAT, CSV, DXF, SVG, G-code, STL, and comprehensive blueprint PDF formats.',
  },
  vision: {
    title: 'AeroVision - Optical Geometry Extraction',
    description: 'Extract airfoil geometry from images using computer vision and convert to CST parameters for analysis.',
  },
};