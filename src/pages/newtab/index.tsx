import React from 'react';
import { createRoot } from 'react-dom/client';
import NewTab from './NewTab';
import './newtab.css';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('app-container');
  
  if (!container) {
    console.error('Container element not found');
    return;
  }
  
  // Render the component
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <NewTab />
    </React.StrictMode>
  );
});