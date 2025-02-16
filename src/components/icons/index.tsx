import React from 'react';

export const DoryIcon: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <img 
    src="/icons/dory_logo_base.svg" 
    alt="Dory"
    width={size}
    height={size}
    style={{ display: 'block' }}
  />
);

export const ExternalLinkIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M2.5 2.5V9.5H9.5V6M9.5 2.5H6M9.5 2.5L5.5 6.5"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const ChevronIcon: React.FC<{ direction?: 'up' | 'down' }> = ({ direction = 'down' }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ transform: direction === 'up' ? 'rotate(180deg)' : undefined }}
  >
    <path
      d="M4.94 5.72668L8 8.78002L11.06 5.72668L12 6.66668L8 10.6667L4 6.66668L4.94 5.72668Z"
      fill="currentColor"
    />
  </svg>
);

export const RefinementIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M6 6V18H18M18 18L14 14M18 18L14 22"
      stroke="white"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
); 