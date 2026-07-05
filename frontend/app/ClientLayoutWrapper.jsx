// frontend/app/ClientLayoutWrapper.jsx
'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Head from 'next/head';

export default function ClientLayoutWrapper({ children }) {
    const pathname = usePathname();
    const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const publicPaths = [
        '/',
        '/about',
        '/pricing',
        '/blog',
        '/blog/',
        '/repository',
        '/subscription',
        '/privacy',
        '/terms',
        '/auth/login',
        '/auth/signup',
        '/auth/forgot-password',
        '/auth/reset-password',
        '/auth/verify-email',
        '/auth/verify-notice',
        '/upgrade',
    ];

    const isPublicRoute = publicPaths.some(path => 
        pathname === path || pathname.startsWith('/auth/') || pathname.startsWith('/blog/')
    );

    const contentMarginLeft = isPublicRoute ? '0px' : (isSidebarExpanded ? '240px' : '60px');

    if (!isMounted) {
        return (
            <div style={{ minHeight: '100vh' }}>
                {children}
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>AeroML - AI-Powered Aerodynamic Design Platform</title>
                <meta name="title" content="AeroML - AI-Powered Aerodynamic Design Platform" />
                <meta name="description" content="Design, optimize, and analyze airfoils with Physics-Informed Neural Networks. Get enterprise-grade CFD predictions in milliseconds. Free trial available." />
                <meta name="keywords" content="aerodynamic design, airfoil optimization, CFD alternative, neural network aerodynamics, Physics-Informed Neural Networks, aerospace engineering, wind turbine design, NACA airfoil generator" />
                <meta name="robots" content="index, follow" />
                <meta name="author" content="Hassnain Sajid & Abeeha Raza" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <meta charSet="UTF-8" />
                
                {/* Open Graph */}
                <meta property="og:type" content="website" />
                <meta property="og:url" content="https://aeroml.com/" />
                <meta property="og:title" content="AeroML - AI-Powered Aerodynamic Design Platform" />
                <meta property="og:description" content="Design, optimize, and analyze airfoils with Physics-Informed Neural Networks. Get enterprise-grade CFD predictions in milliseconds." />
                <meta property="og:image" content="https://aeroml.com/og-image.png" />
                <meta property="og:image:width" content="1200" />
                <meta property="og:image:height" content="630" />
                <meta property="og:site_name" content="AeroML" />
                <meta property="og:locale" content="en_US" />

                {/* Twitter */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:url" content="https://aeroml.com/" />
                <meta name="twitter:title" content="AeroML - AI-Powered Aerodynamic Design Platform" />
                <meta name="twitter:description" content="AI-powered aerodynamic design with Physics-Informed Neural Networks." />
                <meta name="twitter:image" content="https://aeroml.com/og-image.png" />
                <meta name="twitter:site" content="@aeroml" />
                <meta name="twitter:creator" content="@aeroml" />

                {/* Canonical */}
                <link rel="canonical" href="https://aeroml.com/" />

                {/* Schema.org */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            "@context": "https://schema.org",
                            "@type": "SoftwareApplication",
                            "name": "AeroML",
                            "applicationCategory": "EngineeringApplication",
                            "operatingSystem": "All",
                            "description": "AI-powered aerodynamic design platform with Physics-Informed Neural Networks.",
                            "offers": {
                                "@type": "Offer",
                                "price": "19",
                                "priceCurrency": "USD"
                            },
                            "author": {
                                "@type": "Person",
                                "name": "Hassnain Sajid"
                            },
                            "creator": {
                                "@type": "Person",
                                "name": "Abeeha Raza"
                            }
                        })
                    }}
                />

                {/* Favicon */}
                <link rel="icon" href="/favicon.ico" sizes="any" />
                <link rel="apple-touch-icon" href="/favicon.ico" />
            </Head>

            {!isPublicRoute && (
                <Sidebar 
                    isExpanded={isSidebarExpanded}
                    toggleSidebar={() => setIsSidebarExpanded(!isSidebarExpanded)}
                />
            )}
            <div 
                style={{ 
                    position: 'relative', 
                    zIndex: 10,
                    marginLeft: contentMarginLeft, 
                    transition: 'margin-left 0.3s ease',
                    minHeight: '100vh',
                }} 
            >
                {children}
            </div>
        </>
    );
}