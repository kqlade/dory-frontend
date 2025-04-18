import React from 'react';

interface SpinnerProps {
  /** Optional custom message. If omitted, defaults to "Loading..." */
  message?: string;
  /** Whether to show the text message under the spinner */
  showText?: boolean;
  /** Render as full‑screen centered (default) or inline‑embedded */
  fullScreen?: boolean;
  /** Extra className(s) for the outer container */
  className?: string;
}

const LoadingSpinner: React.FC<SpinnerProps> = ({
  message = 'Loading...',
  showText = true,
  fullScreen = true,
  className = '',
}) => {
  const baseClass = fullScreen ? 'loading-container' : 'loading-inline-container';
  return (
    <div className={`${baseClass} ${className}`.trim()}>
      <div className="loading-spinner" />
      {showText && <p className="loading-text">{message}</p>}
    </div>
  );
};

export default LoadingSpinner;
