import React from 'react';
import { createRoot } from 'react-dom/client';
import Landing from './Landing';

// Find the root element
const rootElement = document.getElementById('root');

if (rootElement) {
  // Create a root
  const root = createRoot(rootElement);
  
  // Render the Landing component
  root.render(
    <React.StrictMode>
      <Landing />
    </React.StrictMode>
  );
} 