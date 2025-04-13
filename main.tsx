import React from 'react';
import ReactDOM from 'react-dom/client';
// Use HashRouter for extension contexts
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'; 

import './src/pages/styles/app.css';
import './src/pages/styles/darkmode.css';

// Import Layout Components
import AppLayout from './src/components/AppLayout';

// Import app components
import AppHome from './src/pages/home/Home'; 

// Import utility and auth components
import { useAuth } from './src/hooks/useBackgroundAuth'; 
import LoginPage from './src/components/LoginPage'; 
import LoadingSpinner from './src/components/LoadingSpinner';

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
    {/* No AuthProvider needed based on useAuth implementation */}
    <HashRouter> 
      <AppInitializer />
    </HashRouter>
    {/* <Analytics /> */}
  </React.StrictMode>,
); 