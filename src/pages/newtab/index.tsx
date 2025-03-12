// src/pages/newtab/index.tsx

import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../background/queryClient';
import NewTab from './NewTab';
import './newtab.css';

// IMPORTANT imports for Dexie init
import { initializeDexieDB, setCurrentUser } from '../../db/dexieDB';
import { getUserInfo } from '../../auth/googleAuth';

/**
 * Try to init Dexie in the new-tab context.
 * If user is signed in, set that user and call initializeDexieDB().
 */
async function initDexieForNewTab() {
  try {
    // Attempt a non-interactive getUserInfo
    const user = await getUserInfo(false);
    if (user && user.id) {
      // Tell Dexie which user ID to use
      setCurrentUser(user.id);
      // Initialize Dexie for this user
      await initializeDexieDB();
      console.log('[NewTab] Dexie DB initialized for user =>', user.email);
    } else {
      // If no user, local searching won't work
      console.warn('[NewTab] No user => local Dexie search might fail.');
    }
  } catch (err) {
    console.error('[NewTab] Error initializing Dexie =>', err);
  }
}

// We wait for DOMContentLoaded, then init Dexie, then render
document.addEventListener('DOMContentLoaded', async () => {
  // 1) Dexie init
  await initDexieForNewTab();

  // 2) Now render our React app
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