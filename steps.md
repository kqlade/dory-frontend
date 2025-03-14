<think>Let me create a focused, KISS (Keep It Simple, Stupid) and DRY (Don't Repeat Yourself) plan for implementing cookie-based authentication in the Dory extension. I'll keep it targeted on the essential changes needed without overcomplicating things.</think># KISS & DRY Plan for Cookie-Based Authentication

## 1. Ensure Backend Compatibility (Verify First)

**Goal:** Confirm backend is ready for cookie-based authentication with the extension

- [x] Update host permissions in manifest.json to `http://localhost:8000/*`
- [x] Verify backend has CORS headers configured for the extension:
  ```
  Access-Control-Allow-Origin: chrome-extension://YOUR_EXTENSION_ID
  Access-Control-Allow-Credentials: true
  ```
- [x] Test a simple authenticated endpoint call with credentials to validate setup

## 2. Centralize Authentication Logic (Single Responsibility)

**Goal:** Create one simple auth service that all components use

- [x] Create a minimal `authService.ts` focused on cookie-based auth:
  ```typescript
  // Key methods only:
  async function loginWithGoogle(): Promise<boolean>
  async function isAuthenticated(): Promise<boolean>
  async function logout(): Promise<void>
  ```
- [x] Use the existing chrome.identity API to get Google token
- [x] Exchange Google token for authenticated session via backend's `/auth/extension/verify-google-token`

## 3. Standardize API Requests (DRY)

**Goal:** Ensure all API calls consistently include credentials for cookies

- [x] Update `apiRequest` in `src/api/client.ts` to always include credentials:
  ```typescript
  const config: RequestInit = {
    ...init,
    headers,
    credentials: 'include',  // Add this line
    signal: controller.signal,
  };
  ```
- [x] Fix `semanticSearch()` to use the centralized `apiRequest` instead of direct fetch
- [x] Remove any duplicate auth logic from individual API calls

## 4. Update Authentication Flow (Simplify)

**Goal:** Streamline authentication process

- [x] Keep using Chrome's identity API for initial Google auth
- [x] After getting Google token, exchange it with backend using a simple fetch with credentials
- [x] Let cookies handle the authenticated state rather than storing tokens ourselves
- [x] Update `isAuthenticated()` to check against a simple backend endpoint

> **Note:** Following the KISS principle, we're directly updating imports to use the new authService instead of creating migration utilities or compatibility layers.

## 5. Remove Unnecessary Complexity (Minimize)

**Goal:** Eliminate code that's no longer needed

- [x] Remove any token storage, encryption, and refresh logic
- [x] Remove manual auth header management
- [x] Keep minimal user info storage for UI purposes only

## 6. Testing Plan (Verify)

**Goal:** Ensure auth works reliably before full implementation

- [x] Test simple auth flow first before updating all API calls
- [x] Create a test script to verify authenticated endpoints work
- [ ] Test in both background service worker and content script contexts

## Implementation Sequence (Ordered Steps)

1. ✅ Update manifest and verify CORS configuration
2. ✅ Create minimal authService with Google login
3. ✅ Update apiRequest to include credentials
4. ✅ Test authentication flow end-to-end
5. ✅ Refactor API calls to use centralized client
6. ✅ Remove unnecessary token handling code
7. Add explicit error handling for auth failures

### Files Removed:
- `src/auth/googleAuth.ts` - Old Google auth implementation
- `src/auth/dexieAuth.ts` - Token storage logic

This plan follows KISS and DRY principles by:
- Centralizing auth logic in one simple service
- Letting the browser handle cookie management
- Minimizing custom code by leveraging existing APIs
- Standardizing API requests to avoid repetition
- Removing unnecessary complexity around token storage
