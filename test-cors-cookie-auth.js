/**
 * Chrome Extension Authentication API Test Script
 * 
 * This script tests if your backend is properly configured for:
 * 1. CORS with the Chrome extension
 * 2. Extension-specific Google OAuth authentication endpoints
 * 
 * How to use:
 * 1. Load your extension in Chrome
 * 2. Open the extension's background page DevTools
 * 3. Copy-paste this script and run it
 */

(async function testExtensionAuthAPI() {
  const BACKEND_URL = 'http://localhost:8000/api';
  
  // Ensure proper extension origin format with trailing slash
  const EXTENSION_ORIGIN = chrome.runtime.getURL('').replace(/\/?$/, '/'); // Ensure trailing slash
  
  console.log('🔍 Testing Extension Authentication API with backend...');
  console.log('Extension Origin:', EXTENSION_ORIGIN, '(should end with /)');
  
  // Step 1: Check if the health endpoint is accessible
  try {
    console.log('Step 1: Testing basic connectivity (GET /health)');
    const healthResponse = await fetch(`${BACKEND_URL}/health`, {
      method: 'GET',
      credentials: 'include',
    });
    
    if (!healthResponse.ok) {
      throw new Error(`Health endpoint returned ${healthResponse.status}: ${healthResponse.statusText}`);
    }
    
    const healthData = await healthResponse.json();
    console.log('✅ Health endpoint accessible:', healthData);
  } catch (error) {
    console.error('❌ Health endpoint test failed:', error);
    console.log('Possible issues:');
    console.log('- Backend not running at', BACKEND_URL);
    console.log('- CORS not configured for extension');
    console.log('- Network error');
    return;
  }
  
  // Step 2: Test Extension Auth API endpoints
  console.log('\nStep 2: Testing Extension Auth API endpoints');
  
  // Test the verify-google-token endpoint (POST)
  try {
    console.log('Testing verify-google-token endpoint (POST)...');
    const corsResponse = await fetch(`${BACKEND_URL}/auth/extension/verify-google-token`, {
      method: 'OPTIONS',
      credentials: 'include',
      headers: {
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
        'Origin': EXTENSION_ORIGIN
      }
    });
    
    const allowOrigin = corsResponse.headers.get('Access-Control-Allow-Origin');
    const allowCredentials = corsResponse.headers.get('Access-Control-Allow-Credentials');
    const allowMethods = corsResponse.headers.get('Access-Control-Allow-Methods');
    
    console.log(`Status: ${corsResponse.status} ${corsResponse.statusText}`);
    
    if (corsResponse.ok && allowOrigin && allowCredentials === 'true' && allowMethods?.includes('POST')) {
      console.log('✅ CORS properly configured for verify-google-token endpoint');
      console.log('   Allow-Origin:', allowOrigin);
      console.log('   Allow-Credentials:', allowCredentials);
      console.log('   Allow-Methods:', allowMethods);
    } else {
      console.warn('⚠️ CORS not properly configured for verify-google-token endpoint:');
      console.log('   Status:', corsResponse.status, corsResponse.statusText);
      console.log('   Allow-Origin:', allowOrigin || 'missing');
      console.log('   Origin Format Correct:', allowOrigin === EXTENSION_ORIGIN ? 'Yes ✓' : 'No ✗');
      if (allowOrigin && allowOrigin !== EXTENSION_ORIGIN) {
        console.log('   Expected:', EXTENSION_ORIGIN);
        console.log('   Received:', allowOrigin);
      }
      console.log('   Allow-Credentials:', allowCredentials || 'missing');
      console.log('   Allow-Methods:', allowMethods || 'missing, should include POST');
    }
  } catch (error) {
    console.error('❌ verify-google-token endpoint test failed:', error);
  }
  
  // Test the whoami endpoint (GET)
  try {
    console.log('\nTesting whoami endpoint (GET)...');
    const corsResponse = await fetch(`${BACKEND_URL}/auth/extension/whoami`, {
      method: 'OPTIONS',
      credentials: 'include',
      headers: {
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'content-type',
        'Origin': EXTENSION_ORIGIN
      }
    });
    
    const allowOrigin = corsResponse.headers.get('Access-Control-Allow-Origin');
    const allowCredentials = corsResponse.headers.get('Access-Control-Allow-Credentials');
    const allowMethods = corsResponse.headers.get('Access-Control-Allow-Methods');
    
    console.log(`Status: ${corsResponse.status} ${corsResponse.statusText}`);
    
    if (corsResponse.ok && allowOrigin && allowCredentials === 'true' && allowMethods?.includes('GET')) {
      console.log('✅ CORS properly configured for whoami endpoint');
      console.log('   Allow-Origin:', allowOrigin);
      console.log('   Allow-Credentials:', allowCredentials);
      console.log('   Allow-Methods:', allowMethods);
    } else {
      console.warn('⚠️ CORS not properly configured for whoami endpoint:');
      console.log('   Status:', corsResponse.status, corsResponse.statusText);
      console.log('   Allow-Origin:', allowOrigin || 'missing');
      console.log('   Origin Format Correct:', allowOrigin === EXTENSION_ORIGIN ? 'Yes ✓' : 'No ✗');
      if (allowOrigin && allowOrigin !== EXTENSION_ORIGIN) {
        console.log('   Expected:', EXTENSION_ORIGIN);
        console.log('   Received:', allowOrigin);
      }
      console.log('   Allow-Credentials:', allowCredentials || 'missing');
      console.log('   Allow-Methods:', allowMethods || 'missing, should include GET');
    }
  } catch (error) {
    console.error('❌ whoami endpoint test failed:', error);
  }
  
  // Step 3: Test Chrome Identity API integration
  console.log('\nStep 3: Testing Chrome Identity API availability');
  try {
    if (typeof chrome !== 'undefined' && chrome.identity) {
      console.log('✅ Chrome Identity API is available');
      
      // Check if the extension has identity permission
      if (chrome.runtime.getManifest().permissions.includes('identity')) {
        console.log('✅ Extension has identity permission');
      } else {
        console.warn('⚠️ Extension missing identity permission in manifest.json');
      }
      
      // Check if oauth2 is configured in manifest
      const manifest = chrome.runtime.getManifest();
      if (manifest.oauth2 && manifest.oauth2.client_id) {
        console.log('✅ OAuth2 client_id configured in manifest.json');
      } else {
        console.warn('⚠️ OAuth2 client_id missing in manifest.json');
      }
    } else {
      console.error('❌ Chrome Identity API not available');
    }
  } catch (error) {
    console.error('❌ Chrome Identity API test failed:', error);
  }
  
  console.log('\n📋 Next steps:');
  console.log('1. Ensure backend is configured with CORS headers:');
  console.log('   - Extension ID:', chrome.runtime.id);
  console.log('   - Correct Extension Origin (with trailing slash):', EXTENSION_ORIGIN);
  console.log('   - Backend should include headers for all API endpoints:');
  console.log('     Access-Control-Allow-Origin: ' + EXTENSION_ORIGIN);
  console.log('     Access-Control-Allow-Credentials: true');
  console.log('     Access-Control-Allow-Methods: GET, POST, OPTIONS');
  
  console.log('\n2. Authentication Implementation:');
  console.log('   a. Get Google token: chrome.identity.getAuthToken({interactive: true})');
  console.log('   b. Send token to /api/auth/extension/verify-google-token');
  console.log('   c. Check auth status with /api/auth/extension/whoami');
  console.log('   d. All subsequent requests will include authentication cookies automatically with {credentials: "include"}');
})(); 