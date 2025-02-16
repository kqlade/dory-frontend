import React, { useState } from 'react';
import { ChevronIcon } from './icons';
import type { ExpandableSectionProps } from '../types/search';

const ExpandableSection: React.FC<ExpandableSectionProps> = ({
  title,
  children,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div style={{
      marginBottom: '8px',
      minWidth: 0,
    }}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'transparent',
          border: 'none',
          padding: '0 0 8px 0',
          color: 'white',
          opacity: isExpanded || isHovered ? 0.9 : 0.7,
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          fontFamily: 'Cabinet Grotesk, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          fontSize: '13px',
          fontWeight: 400,
          transition: 'opacity 0.1s ease',
        }}
      >
        <ChevronIcon direction={isExpanded ? 'up' : 'down'} />
        {title}
      </button>
      {isExpanded && (
        <div style={{
          marginTop: '8px',
          paddingLeft: '24px',
        }}>
          {children}
        </div>
      )}
    </div>
  );
};

export default ExpandableSection; 