/**
 * @file index.tsx
 * Entry point for the DORY side panel
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../background/queryClient';
import SidePanel from './SidePanel';
import './sidepanel.css';

console.log('[DORY] Side panel initializing...');

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('app-container');
  if (!container) {
    console.error('[DORY] No #app-container found in side panel');
    return;
  }

  // Apply dark mode if preferred
  try {
    const storedTheme = localStorage.getItem('preferredTheme');
    if (storedTheme === 'dark' || 
        (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.body.classList.add('dark-mode');
    }
  } catch (err) {
    console.error('[DORY] Error checking theme preference:', err);
  }

  // Render the React app
  try {
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
          <SidePanel />
        </QueryClientProvider>
      </React.StrictMode>
    );
    console.log('[DORY] Side panel rendered successfully');
  } catch (err) {
    console.error('[DORY] Error rendering side panel:', err);
    container.innerHTML = '<div class="sidepanel-container"><p>Error loading side panel</p></div>';
  }
}); 