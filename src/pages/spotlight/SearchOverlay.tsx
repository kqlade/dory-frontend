/**
 * @file SearchOverlay.tsx
 * React component for the global search overlay.
 */

import React, { useEffect } from 'react';
import OverlaySearchBar from './OverlaySearchBar';

interface SearchOverlayProps {
  onClose: () => void;
}

export default function SearchOverlay({ onClose }: SearchOverlayProps) {
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

  return (
    <div className="spotlight-search">
      <OverlaySearchBar onClose={onClose} />
    </div>
  );
} 