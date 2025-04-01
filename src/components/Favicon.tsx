import React from 'react';

interface FaviconProps {
  url: string;
  size?: number;
}

/**
 * Extracts domain from a URL string
 */
export const extractDomain = (url: string): string => {
  try {
    // Handle URLs without protocol by prepending https://
    const urlWithProtocol = url.startsWith('http') ? url : `https://${url}`;
    const domain = new URL(urlWithProtocol).hostname;
    return domain;
  } catch (error) {
    console.error('Error extracting domain:', error);
    return '';
  }
};

/**
 * Reusable Favicon component that displays a website's favicon
 * Uses Google's favicon service
 */
const Favicon: React.FC<FaviconProps> = ({ url, size = 16 }) => {
  const domain = extractDomain(url);
  
  if (!domain) return null;
  
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
  
  return (
    <img 
      src={faviconUrl}
      alt=""
      className="favicon"
      width={size}
      height={size}
      style={{ 
        marginRight: '8px',
        verticalAlign: 'middle',
        flexShrink: 0
      }}
      // Handle image loading errors with a blank transparent pixel
      onError={(e) => {
        // Set to a transparent pixel on error
        e.currentTarget.style.opacity = '0.4';
      }}
    />
  );
};

export default Favicon; 