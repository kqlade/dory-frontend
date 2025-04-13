/**
 * @file SearchOverlay.tsx
 * React component for the global search overlay.
 * 
 * This component serves as a wrapper for the NewTabSearchBar,
 * adapting it for use in the content script overlay context.
 */

import React, { useEffect, useState } from 'react';
import NewTabSearchBar from '../../components/NewTabSearchBar';

interface SearchOverlayProps {
  onClose: () => void;
}

/**
 * SearchOverlay component that adapts the NewTabSearchBar for use in the
 * global search overlay context.
 */
export default function SearchOverlay({ onClose }: SearchOverlayProps) {
  const [isSearchActive, setIsSearchActive] = useState(false);
  
  // Add keyboard listener for ESC to close
  useEffect(() => {
    console.log('[DORY] SearchOverlay component mounted');
    
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Render NewTabSearchBar directly, pass down the state setter
  return (
    <NewTabSearchBar onSearchStateChange={setIsSearchActive} />
  );
} 