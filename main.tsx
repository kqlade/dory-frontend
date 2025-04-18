import React from 'react';
import ReactDOM from 'react-dom/client';
// Use HashRouter for extension contexts
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'; 

import './src/styles/index.css';
// darkmode.css is no longer needed as it's consolidated into theme.css, which is imported in global.css

// Import Layout Components
import AppLayout from './src/components/AppLayout';

// Import app components
import AppHome from './src/pages/home/Home'; 

// Import utility and auth components
import { AuthProvider, useAuth } from './src/services/AuthContext';
import LoginPage from './src/components/LoginPage'; 
import LoadingSpinner from './src/components/LoadingSpinner';
import { STORAGE_KEYS } from './src/config';
import { DragProvider } from './src/context/DragContext';

// Initialize dark mode before React renders
// This ensures the loading spinner respects the user's theme preference
try {
  const storedTheme = localStorage.getItem(STORAGE_KEYS.PREFERRED_THEME_KEY);
  if (storedTheme === 'dark' || 
      (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark-mode');
  }
} catch (err) {
  console.error('[DORY] Error applying initial theme:', err);
}

// If this is a new tab page and not our redirected normal tab, create a new tab and close this one
// This helps us steal focus from the omnibox when the tab opens
if (
  window.location.href.includes('chrome://newtab') || 
  (window.location.protocol === 'chrome-extension:' && window.location.pathname === '/index.html')
) {
  const urlParams = new URLSearchParams(window.location.search);
  // Only redirect if this isn't already our redirected tab
  if (urlParams.get('redirected') !== 'true') {
    // Get the extension's URL with a query parameter to prevent infinite redirects
    const normalTabUrl = chrome.runtime.getURL('index.html?redirected=true');
    // Create a new "normal" tab with our extension's content
    chrome.tabs.create({ url: normalTabUrl });
    // Close this tab (the original new tab page)
    window.close();
  }
}

// Define an AppInitializer component to handle auth checks
function AppInitializer() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    // Show a loading indicator while checking authentication state
    return <LoadingSpinner />;
  }

  // If authenticated, render the main application routes
  // If not authenticated and trying to access other routes, handle appropriately
  return (
    <Routes>
      {/* Landing Pages Removed - Corresponding components and layout do not exist */}
      {/* <Route path="/" element={<Layout />}> ... </Route> */}

      {/* App Pages */}
      {isAuthenticated ? (
        <Route path="/app" element={<AppLayout />}>
          {/* Redirect root of /app to /app/home */}
          <Route index element={<Navigate to="home" replace />} /> 
          <Route path="home" element={<AppHome />} />
          {/* Add other authenticated app routes here */}
        </Route>
      ) : (
        // Redirect any attempt to access /app/* to root (which might show LoginPage or landing)
        <Route path="/app/*" element={<Navigate to="/" replace />} />
      )}

      {/* Fallback: If not authenticated and not at root, show Login. If authenticated, redirect app root. Otherwise, maybe a 404 or redirect? */}
      {/* Simplified Fallback: Redirect everything else to root. If logged out, LoginPage shows. If logged in, App should redirect internally if needed. */}
      {/* Ensure root path exists for fallback navigation */}
      <Route path="/" element={isAuthenticated ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="*" element={<Navigate to="/" replace />} /> 
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <DragProvider>
        <HashRouter>
          <AppInitializer />
        </HashRouter>
      </DragProvider>
    </AuthProvider>
    {/* <Analytics /> */}
  </React.StrictMode>,
); 