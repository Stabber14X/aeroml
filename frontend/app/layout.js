// frontend/app/layout.js
// COMPLETE WITH SCHEMA.ORG STRUCTURED DATA

import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import UpgradeModal from '@/components/UpgradeModal';
import { defaultMetadata } from './metadata';
import ClientLayoutWrapper from './ClientLayoutWrapper';

// ✅ Export metadata from Server Component
export const metadata = defaultMetadata;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Schema.org Structured Data - SoftwareApplication */}
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
                "priceCurrency": "USD",
                "priceValidUntil": "2027-12-31",
                "availability": "https://schema.org/InStock"
              },
              "author": {
                "@type": "Person",
                "name": "Hassnain Sajid"
              },
              "creator": {
                "@type": "Person",
                "name": "Abeeha Raza"
              },
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": "4.8",
                "ratingCount": "127"
              }
            })
          }}
        />
      </head>
      <body>
        <AuthProvider>
          <ClientLayoutWrapper>
            {children}
          </ClientLayoutWrapper>
          <UpgradeModal />
        </AuthProvider>
      </body>
    </html>
  );
}