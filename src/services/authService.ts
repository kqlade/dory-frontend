/**
 * @file authService.ts
 * Background-only authentication service for the Dory extension.
 */

import { API_BASE_URL, AUTH_ENDPOINTS, GOOGLE_CLIENT_ID, STORAGE_KEYS } from '../config';
import { AuthState, TokenResponse, User } from '../types';

export class AuthService {
  private authState: AuthState = {
    isAuthenticated: false,
    user: null,
    accessToken: null,
    refreshToken: null,
  };
  private stateChangeListeners: Array<(newState: AuthState) => void> = [];
  private isInitialized = false;

  constructor() {
    console.log('[AuthService] Instance created.');
  }

  /**
   * Initializes auth state from storage. Optionally verifies token.
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    await this.loadStateFromStorage();
    if (this.authState.accessToken) await this.verifyToken();
    this.isInitialized = true;
  }

  /**
   * Starts the Google OAuth flow (ID Token retrieval).
   */
  public async login(): Promise<void> {
    try {
      const redirectUrl = chrome.identity.getRedirectURL('oauth2');
      if (!redirectUrl) throw new Error('OAuth Redirect URL not found.');
      
      const scopes = ['email', 'profile', 'openid'];
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', redirectUrl);
      authUrl.searchParams.set('response_type', 'id_token');
      authUrl.searchParams.set('scope', scopes.join(' '));
      authUrl.searchParams.set('nonce', Math.random().toString(36).slice(2));
      authUrl.searchParams.set('prompt', 'consent select_account');

      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive: true,
      });
      if (!responseUrl) throw new Error('Authentication flow cancelled or failed.');

      const urlFragment = responseUrl.split('#')[1] || '';
      const params = new URLSearchParams(urlFragment);
      const idToken = params.get('id_token');
      if (!idToken) throw new Error(`OAuth failed: ${params.get('error') || 'No token'}`);

      await this.exchangeGoogleIdToken(idToken);
    } catch (err) {
      console.error('[AuthService] Login flow failed:', err);
    }
  }

  /**
   * Logs the user out and calls the backend logout endpoint if possible.
   */
  public async logout(): Promise<void> {
    const token = this.authState.accessToken;
    this.updateAuthState({
      isAuthenticated: false,
      user: null,
      accessToken: null,
      refreshToken: null,
    });
    await this.saveStateToStorage();
    if (token) {
      try {
        // Directly call logout endpoint with the old token
        await fetch(`${API_BASE_URL}${AUTH_ENDPOINTS.LOGOUT}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.warn('[AuthService] Backend logout error:', err);
      }
    }
  }

  public getAuthState(): AuthState {
    return { ...this.authState };
  }

  public onStateChange(listener: (newState: AuthState) => void): () => void {
    this.stateChangeListeners.push(listener);
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter(l => l !== listener);
    };
  }

  /**
   * Verifies the token by calling /me. Refreshes if necessary.
   */
  public async verifyToken(): Promise<boolean> {
    if (!this.authState.accessToken) return false;
    try {
      const user = await this.makeRequest<User>(AUTH_ENDPOINTS.ME, { method: 'GET' });
      if (user?.id) {
        this.updateAuthState({ user });
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[AuthService] Token verification failed:', (err as Error).message);
      return false;
    }
  }

  // --- Private Methods ---

  private notifyListeners(): void {
    const stateCopy = { ...this.authState };
    this.stateChangeListeners.forEach(listener => listener(stateCopy));
  }

  private updateAuthState(newState: Partial<AuthState>): void {
    this.authState = { ...this.authState, ...newState };
    this.notifyListeners();
  }

  private async loadStateFromStorage(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.AUTH_STATE);
      const loaded = result[STORAGE_KEYS.AUTH_STATE];
      if (loaded && typeof loaded === 'object') {
        this.updateAuthState({
          ...loaded,
          isAuthenticated: !!loaded.isAuthenticated,
        });
      }
    } catch (err) {
      console.error('[AuthService] Failed to load state:', err);
    }
  }

  private async saveStateToStorage(): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.AUTH_STATE]: this.authState });
    } catch (err) {
      console.error('[AuthService] Failed to save state:', err);
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    needsAuth = true
  ): Promise<T> {
    let { accessToken, refreshToken } = this.authState;

    if (needsAuth && !accessToken) {
      throw new Error('Authentication required, but no access token is set.');
    }
    options.headers = {
      ...(options.headers || {}),
      'Content-Type': 'application/json',
      ...(needsAuth ? { Authorization: `Bearer ${accessToken}` } : {}),
    };
    options.credentials = 'include';

    let response = await fetch(`${API_BASE_URL}${endpoint}`, options);

    // Attempt refresh if 401
    if (needsAuth && response.status === 401 && refreshToken) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        accessToken = this.authState.accessToken;
        options.headers = {
          ...options.headers,
          Authorization: `Bearer ${accessToken}`,
        };
        response = await fetch(`${API_BASE_URL}${endpoint}`, options);
      } else {
        await this.logout();
        throw new Error('Authentication failed: Unable to refresh token.');
      }
    }

    if (!response.ok) {
      const errorData = await response.text();
      const error = new Error(`API Error: ${response.statusText}`);
      (error as any).status = response.status;
      (error as any).data = errorData;
      throw error;
    }

    return response.status === 204 ? null as T : (response.json() as Promise<T>);
  }

  private async exchangeGoogleIdToken(idToken: string): Promise<void> {
    const tokenResponse = await this.makeRequest<TokenResponse>(
      AUTH_ENDPOINTS.TOKEN,
      {
        method: 'POST',
        body: JSON.stringify({ id_token: idToken }),
      },
      false
    );
    if (!tokenResponse.access_token || !tokenResponse.user) {
      throw new Error('Invalid token exchange response.');
    }
    this.updateAuthState({
      isAuthenticated: true,
      user: tokenResponse.user,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || null,
    });
    await this.saveStateToStorage();
  }

  private async refreshToken(): Promise<boolean> {
    const { refreshToken } = this.authState;
    if (!refreshToken) return false;

    try {
      const tokenResponse = await this.makeRequest<TokenResponse>(
        AUTH_ENDPOINTS.REFRESH,
        {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
        },
        false
      );
      if (!tokenResponse.access_token || !tokenResponse.user) {
        throw new Error('Invalid refresh response.');
      }
      this.updateAuthState({
        isAuthenticated: true,
        user: tokenResponse.user,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || refreshToken,
      });
      await this.saveStateToStorage();
      return true;
    } catch (err: any) {
      console.warn('[AuthService] Refresh failed:', err.message || err);
      if (err.status === 401 || `${err}`.includes('Invalid')) await this.logout();
      return false;
    }
  }
}

export const authService = new AuthService();