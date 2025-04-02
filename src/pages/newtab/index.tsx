/**
 * @file index.tsx
 * Entry point for the New Tab page
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../background/queryClient';
import NewTab from './NewTab';
import './newtab.css';

document.addEventListener('DOMContentLoaded', () => {
  console.log('[NewTab] Initializing New Tab page');

  const container = document.getElementById('app-container');
  if (!container) {
    console.error('[NewTab] No #app-container found');
    return;
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <NewTab />
      </QueryClientProvider>
    </React.StrictMode>
  );
});