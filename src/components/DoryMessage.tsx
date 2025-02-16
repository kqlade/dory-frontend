import React from 'react';
import { DoryIcon } from './icons';
import type { DoryMessageProps } from '../types/search';

const DoryMessage: React.FC<DoryMessageProps> = ({ type, children }) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '8px',
    }}>
      <DoryIcon size={17} />
      <span style={{
        color: 'white',
        fontSize: '14px',
        fontWeight: 400,
        opacity: 0.9,
        fontFamily: 'Cabinet Grotesk, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}>
        {children}
      </span>
    </div>
  );
};

export default DoryMessage; 