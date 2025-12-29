import { Helmet } from 'react-helmet-async';

interface SEOProps {
    title?: string;
    description?: string;
    keywords?: string;
    canonicalUrl?: string;
    ogImage?: string;
    ogType?: 'website' | 'article';
    noIndex?: boolean;
    structuredData?: object;
}

const SITE_NAME = 'Dividends & Total Returns';
const DEFAULT_DESCRIPTION = 'Maximize investment value through dividend income and price change with advanced ETF and CEF screening and custom rankings.';
const DEFAULT_KEYWORDS = 'ETF, CEF, covered call ETF, closed-end funds, dividend yield, total return, investment analysis, dividend investing, income investing';

/**
 * SEO Component for managing page-level meta tags
 * Uses react-helmet-async for dynamic head management in React SPA
 */
export const SEO = ({
    title,
    description = DEFAULT_DESCRIPTION,
    keywords = DEFAULT_KEYWORDS,
    canonicalUrl,
    ogImage = '/favicon.svg',
    ogType = 'website',
    noIndex = false,
    structuredData,
}: SEOProps) => {
    const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;

    return (
        <Helmet>
            {/* Primary Meta Tags */}
            <title>{fullTitle}</title>
            <meta name="description" content={description} />
            <meta name="keywords" content={keywords} />
            <meta name="author" content="D&TR" />

            {/* Robots */}
            {noIndex ? (
                <meta name="robots" content="noindex, nofollow" />
            ) : (
                <meta name="robots" content="index, follow" />
            )}

            {/* Canonical URL */}
            {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

            {/* Open Graph / Facebook */}
            <meta property="og:type" content={ogType} />
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={description} />
            <meta property="og:site_name" content={SITE_NAME} />
            {ogImage && <meta property="og:image" content={ogImage} />}
            {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}

            {/* Twitter */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={fullTitle} />
            <meta name="twitter:description" content={description} />
            {ogImage && <meta name="twitter:image" content={ogImage} />}

            {/* GEO Targeting - US Financial Markets */}
            <meta name="geo.region" content="US" />
            <meta name="geo.placename" content="United States" />
            <meta name="language" content="en-US" />
            <link rel="alternate" hrefLang="en-US" href={canonicalUrl || ''} />
            <link rel="alternate" hrefLang="x-default" href={canonicalUrl || ''} />

            {/* Structured Data (JSON-LD) */}
            {structuredData && (
                <script type="application/ld+json">
                    {JSON.stringify(structuredData)}
                </script>
            )}
        </Helmet>
    );
};

// Pre-defined structured data schemas for reuse
export const getWebApplicationSchema = () => ({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Dividends & Total Returns",
    "description": "Advanced ETF and CEF screening platform with custom rankings, dividend analysis, and total return tracking.",
    "applicationCategory": "FinanceApplication",
    "operatingSystem": "Web Browser",
    "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
    }
});

export const getFinancialProductSchema = (symbol: string, name: string, type: 'ETF' | 'CEF') => ({
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    "name": `${symbol} - ${name}`,
    "description": `${type === 'ETF' ? 'Covered Call ETF' : 'Closed End Fund'} analysis including dividend history, yield, and total returns.`,
    "provider": {
        "@type": "Organization",
        "name": "D&TR - Dividends & Total Returns"
    },
    "category": type === 'ETF' ? 'Exchange Traded Fund' : 'Closed End Fund'
});

export const getBreadcrumbSchema = (items: { name: string; url: string }[]) => ({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "name": item.name,
        "item": item.url
    }))
});

export default SEO;
