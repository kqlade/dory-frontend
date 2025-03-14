// src/pages/newtab/index.tsx

import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../background/queryClient';
import NewTab from './NewTab';
import './newtab.css';

// Dexie imports
import { initializeDexieDB, setCurrentUser } from '../../db/dexieDB';
import { getCurrentUser } from '../../services/authService';

/**
 * Try to init Dexie in the new-tab context.
 */
async function initDexieForNewTab() {
  try {
    // Attempt a non-interactive getCurrentUser
    const user = await getCurrentUser();
    if (user && user.id) {
      setCurrentUser(user.id);
      await initializeDexieDB();
      console.log('[NewTab] Dexie DB initialized for user =>', user.email);
    } else {
      console.warn('[NewTab] No user => local Dexie search might fail.');
    }
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