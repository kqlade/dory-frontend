/**
 * @file popup.tsx
 * Content script that, when triggered, shows a floating popup with React.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import InPagePopup from '../pages/popup/InPagePopup';
import '../pages/popup/popup.css';

console.log('[DORY] popup.tsx loaded and waiting...');

let popupContainer: HTMLDivElement | null = null;
let styleSheet: HTMLStyleElement | null = null;

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'PING') {
    console.log('[DORY] Received PING');
    return true;
  }
  if (message.type === 'SHOW_POPUP') {
    console.log('[DORY] SHOW_POPUP => rendering popup');
    showPopup();
    return true;
  }
  return false;
});

function showPopup(): void {
  removeExistingPopup();

  // Container
  popupContainer = document.createElement('div');
  popupContainer.id = 'dory-extension-popup';

  // Style
  styleSheet = document.createElement('style');
  styleSheet.textContent = `
    #dory-extension-popup {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      width: 300px;
      background-color: #fff;
      border-radius: 12px;
      border: 2px solid #000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-family: 'Cabinet Grotesk', sans-serif;
      overflow: hidden;
    }
    @media (prefers-color-scheme: dark) {
      #dory-extension-popup {
        background-color: #1e1e1e;
        color: #fff;
        border-color: #fff;
      }
    }
  `;
  document.head.appendChild(styleSheet);

  // React content
  const contentDiv = document.createElement('div');
  contentDiv.id = 'dory-popup-content';
  popupContainer.appendChild(contentDiv);

  // Close button
  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    border: none;
    background: none;
    font-size: 24px;
    cursor: pointer;
    color: inherit;
  `;
  closeButton.addEventListener('click', hidePopup);
  popupContainer.appendChild(closeButton);

  document.body.appendChild(popupContainer);
  renderReactApp(contentDiv);

  // Notify the background that popup is ready
  chrome.runtime.sendMessage({ type: 'POPUP_READY' });
}

function removeExistingPopup() {
  const existing = document.getElementById('dory-extension-popup');
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }
}

function hidePopup(): void {
  if (popupContainer) {
    popupContainer.remove();
    popupContainer = null;
  }
  if (styleSheet) {
    styleSheet.remove();
    styleSheet = null;
  }
}

function renderReactApp(container: HTMLElement): void {
  try {
    const root = createRoot(container);
    root.render(<InPagePopup />);
    console.log('[DORY] InPagePopup rendered');
  } catch (err) {
    console.error('[DORY] Error rendering React:', err);
    container.innerHTML = '<div class="popup-container"><p>Error loading popup</p></div>';
  }
}