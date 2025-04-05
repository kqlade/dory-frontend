/**
 * @file contentService.ts
 * 
 * Service for handling content-related operations,
 * including sending extracted content to the backend.
 */

import { API_BASE_URL, CONTENT_ENDPOINTS } from '../config';
import { authService } from './authService';
import { ContentData } from '../types';

class ContentService {
  /**
   * Sends extracted content directly to the backend API
   * @param content The extracted content data to send
   * @returns A promise that resolves when the content is sent successfully
   */
  async sendContent(content: ContentData): Promise<boolean> {
    try {
      // Get auth state to include access token
      const authState = await authService.getAuthState();
      
      if (!authState.isAuthenticated) {
        console.log('[ContentService] User not authenticated, skipping content sync');
        return false;
      }

      const endpoint = `${API_BASE_URL}${CONTENT_ENDPOINTS.CONTENT}`;
      
      // Format the request payload to match the old eventService.ts structure exactly
      const payload = {
        contentId: `content_${content.pageId}_${content.visitId}_${Date.now()}`,
        sessionId: String(content.sessionId),
        userId: authState.user?.id,
        timestamp: Date.now(),
        data: {
          pageId: content.pageId,
          visitId: content.visitId,
          userId: authState.user?.id,
          url: content.url,
          content: {
            title: content.title,
            markdown: content.markdown,
            metadata: content.metadata || { language: 'en' }
          }
        }
      };

      console.log(`[ContentService] Sending content to backend: ${endpoint}`);
      
      // Send the content to the backend
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authState.accessToken}`
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}: ${await response.text()}`);
      }

      console.log('[ContentService] Content sent successfully');
      return true;
    } catch (error) {
      console.error('[ContentService] Error sending content to backend:', error);
      return false;
    }
  }
}

// Create and export a singleton instance
export const contentService = new ContentService();

// Default export for convenience
export default ContentService;
