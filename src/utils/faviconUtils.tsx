import React, { useState, useMemo, useCallback } from 'react';

interface FaviconProps {
  url: string;
  size?: number;
}

/**
 * Attempts to handle multi-level TLDs (e.g. co.uk).
 * For a domain like: "www.sub.example.co.uk"
 * - The root domain would be "example.co.uk"
 * - The full domain would be "sub.example.co.uk"
 * 
 * NOTE: This is a heuristic and may not be exhaustive for every possible TLD.
 */
function extractRootDomain(domain: string): string {
  // Remove leading 'www.'
  const cleanDomain = domain.replace(/^www\./, '');
  const domainParts = cleanDomain.split('.');
  
  // Heuristic for multi-level TLDs: 
  // If the TLD is short (com, net, org, etc.), we keep the last 2 parts.
  // If it's recognized as a multi-level TLD (co.uk, co.in, etc.), we keep the last 3 parts. 
  // Adjust or refine this logic based on your project's needs.
  const multiLevelTlds = ['co.uk', 'co.in', 'co.jp', 'ac.uk', 'gov.uk'];
  const lastTwo = domainParts.slice(-2).join('.');
  const lastThree = domainParts.slice(-3).join('.');
  
  if (multiLevelTlds.includes(lastThree)) {
    return lastThree;
  }
  return lastTwo;
}

/**
 * Extracts both the full domain and root domain from a URL string
 * This gives us multiple options for favicon retrieval.
 */
export function extractDomains(url: string): { fullDomain: string; rootDomain: string } {
  try {
    // Handle URLs without protocol by prepending https://
    const urlWithProtocol = url.startsWith('http') ? url : `https://${url}`;
    const { hostname } = new URL(urlWithProtocol);
    
    // Remove any leading 'www.' for consistency
    const normalized = hostname.replace(/^www\./, '');
    
    // Extract the root domain (domain.com or domain.co.uk from sub.domain.co.uk)
    const rootDomain = extractRootDomain(normalized);

    return { fullDomain: normalized, rootDomain };
  } catch (error) {
    console.error('Error extracting domains:', error);
    return { fullDomain: '', rootDomain: '' };
  }
}

const Favicon: React.FC<FaviconProps> = ({ url, size = 16 }) => {
  const [serviceIndex, setServiceIndex] = useState(0);
  const { fullDomain, rootDomain } = extractDomains(url);

  // If we fail to parse the domain, don’t bother rendering
  if (!fullDomain) {
    return null;
  }

  // Memoize the list of services so we don’t recalculate it on every render
  const services = useMemo(() => {
    return [
      // Google with full domain
      `https://www.google.com/s2/favicons?domain=${fullDomain}&sz=${size}`,
      // Google with root domain
      `https://www.google.com/s2/favicons?domain=${rootDomain}&sz=${size}`,
      // DuckDuckGo
      `https://external-content.duckduckgo.com/ip3/${fullDomain}.ico`,
      // Direct favicon from full domain
      `https://${fullDomain}/favicon.ico`,
      // Direct favicon from root domain
      `https://${rootDomain}/favicon.ico`
    ];
  }, [fullDomain, rootDomain, size]);

  // We try the current service (based on serviceIndex). If that fails, we try the next one.
  const currentSrc = services[serviceIndex] || services[0];

  // Optional: If you prefer an actual fallback image if all fail, specify it here.
  const fallbackIcon = '/images/fallback-favicon.png';

  const handleImageError = useCallback<React.ReactEventHandler<HTMLImageElement>>(
    (e) => {
      // If we have more services to try, increment the index
      if (serviceIndex < services.length - 1) {
        setServiceIndex(serviceIndex + 1);
      } else {
        // If all services are exhausted, either reduce opacity or switch to fallback icon
        // e.currentTarget.style.opacity = '0.4';
        
        // Example: use a fallback icon so the user sees *some* icon
        e.currentTarget.src = fallbackIcon;
        e.currentTarget.onerror = null; // prevent infinite loop if fallback fails
      }
    },
    [serviceIndex, services, fallbackIcon]
  );

  return (
    <img
      src={currentSrc}
      alt={`Favicon for ${fullDomain}`}
      className="favicon"
      width={size}
      height={size}
      style={{
        marginRight: '8px',
        verticalAlign: 'middle',
        flexShrink: 0
      }}
      onError={handleImageError}
    />
  );
};

export default Favicon;