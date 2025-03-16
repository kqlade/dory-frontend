// src/pages/newtab/index.tsx

import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../background/queryClient';
import NewTab from './NewTab';
import './newtab.css';

// Dexie imports
import { initializeDexieDB } from '../../db/dexieDB';
/**
 * Initialize Dexie in the new-tab context.
 */
async function initDexieForNewTab() {
  try {
    // Initialize Dexie without authentication dependency
    await initializeDexieDB();
    console.log('[NewTab] Dexie DB initialized');
  } catch (err) {
    console.error('[NewTab] Error initializing Dexie =>', err);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await initDexieForNewTab();

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