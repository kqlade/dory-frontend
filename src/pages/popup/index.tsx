import React from 'react';
import { createRoot } from 'react-dom/client';
import Popup from './Popup';
import '../../styles/popup.css';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('app-container');
  if (!container) {
    console.error('[DORY] Popup container not found');
    return;
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>
  );
}); 