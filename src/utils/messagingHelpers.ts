/**
 * @file messagingHelpers.ts
 * Utility for content scripts to send messages with a timeout.
 */

import { MessageType, ApiProxyRequestData, ApiProxyResponseData, createMessage } from './messageSystem';

export async function sendMessageWithTimeout(
  requestData: ApiProxyRequestData,
  timeoutMs = 5000
): Promise<ApiProxyResponseData> {
  return new Promise((resolve, reject) => {
    const message = createMessage(MessageType.API_PROXY_REQUEST, requestData, 'content');

    const timer = setTimeout(() => {
      reject(new Error(`Message response timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timer);

      if (chrome.runtime.lastError) {
        return reject(new Error(`Chrome runtime error: ${chrome.runtime.lastError.message}`));
      }
      if (!response) {
        return reject(new Error('Empty response from background script'));
      }
      if (response.type !== MessageType.API_PROXY_RESPONSE) {
        return reject(new Error(`Invalid response type: ${response.type}`));
      }

      const data = response.data as ApiProxyResponseData;
      resolve(data);
    });
  });
}

export function enableMessageDebug(enable = true): void {
  if (!enable) return;
  console.log('[DORY] Message debugging enabled');
  // Add any custom debug logging you want here
}