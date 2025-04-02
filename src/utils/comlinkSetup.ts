/**
 * @file comlinkSetup.ts
 * 
 * Setup for Comlink RPC communication between different extension contexts
 * (background, content scripts, popup).
 */

import * as Comlink from 'comlink';

// Helper to bridge Chrome's MessagePort to Comlink's Endpoint
function wrapPort(port: chrome.runtime.Port): Comlink.Endpoint {
  return {
    postMessage: port.postMessage.bind(port),
    addEventListener: (type, listener) => {
      if (type === 'message') {
        const handler = (msg: any) => {
          const event = { data: msg } as MessageEvent;
          if (typeof listener === 'function') {
            listener(event);
          } else if (listener && typeof listener === 'object' && 'handleEvent' in listener) {
            listener.handleEvent(event);
          }
        };
        // Save a reference to remove later
        (listener as any)._handler = handler;
        port.onMessage.addListener(handler);
      }
    },
    removeEventListener: (type, listener) => {
      if (type === 'message' && (listener as any)._handler) {
        port.onMessage.removeListener((listener as any)._handler);
      }
    },
    start: () => {}, // No-op for compatibility
  };
}

/**
 * Creates a wrapper for chrome.runtime.onConnect to expose your API via Comlink.
 * Call this in your background script to expose your API.
 * 
 * @param api The API object to expose to other contexts
 */
export function exposeBackgroundAPI<T extends object>(api: T): void {
  // Listen for connection attempts from content scripts
  chrome.runtime.onConnect.addListener((port) => {
    // For each connection, create a Comlink endpoint
    Comlink.expose(api, wrapPort(port));
  });
}

/**
 * Gets a proxied connection to the background API.
 * Call this in content scripts to access the background API.
 * 
 * @returns A proxy object that represents the API exposed by the background
 */
export function getBackgroundAPI<T>(): Promise<T> {
  // Connect to the background script
  const port = chrome.runtime.connect({ name: 'comlink-port' });
  
  // Create a Comlink proxy to the background API
  return Promise.resolve(Comlink.wrap<T>(wrapPort(port)) as unknown as T);
}
