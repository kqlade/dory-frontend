// src/background/messageSystem.ts

export enum MessageType {
  ACTIVITY_EVENT = 'ACTIVITY_EVENT',
  EXTRACTION_COMPLETE = 'EXTRACTION_COMPLETE',
  EXTRACTION_ERROR = 'EXTRACTION_ERROR',
  TRIGGER_EXTRACTION = 'TRIGGER_EXTRACTION',
  SET_EXTRACTION_CONTEXT = 'SET_EXTRACTION_CONTEXT',
  CONTENT_DATA = 'CONTENT_DATA',
}

export interface Message<T = any> {
  type: MessageType;
  timestamp: number;
  source: 'content' | 'background';
  data: T;
}

export interface ActivityEventData {
  isActive: boolean;
  pageUrl: string;
  duration: number;
}

export interface ExtractionData {
  title: string;
  url: string;
  timestamp: number;
  metadata?: any;
}

// Interface for content data message
export interface ContentDataMessage {
  pageId: string;
  visitId: string;
  sessionId: string | null;
  url: string;
  title: string;
  markdown: string;
  metadata?: Record<string, any>;
}

/**
 * Create a Message object with the given type & data.
 */
export function createMessage<T>(
  type: MessageType,
  data: T,
  source: 'content' | 'background' = 'content'
): Message<T> {
  return {
    type,
    timestamp: Date.now(),
    source,
    data
  };
}

export type MessageHandler = (
  message: Message<any>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (resp?: any) => void
) => void | boolean | Promise<void | boolean>;

export class MessageRouter {
  private handlers = new Map<MessageType, MessageHandler[]>();
  private defaultHandler: MessageHandler | null = null;

  /**
   * Register a handler for a specific MessageType.
   */
  public registerHandler(type: MessageType, handler: MessageHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  /**
   * If a message type is not recognized, the default handler runs.
   */
  public setDefaultHandler(handler: MessageHandler) {
    this.defaultHandler = handler;
  }

  /**
   * Initialize the router by adding a chrome.runtime.onMessage listener.
   */
  public initialize() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const { type } = message;
      const typedHandlers = this.handlers.get(type);

      let asyncResp = false;

      if (typedHandlers && typedHandlers.length > 0) {
        for (const h of typedHandlers) {
          const result = h(message, sender, sendResponse);
          if (result === true) {
            asyncResp = true;
          }
        }
        return asyncResp;
      } else if (this.defaultHandler) {
        const result = this.defaultHandler(message, sender, sendResponse);
        if (result === true) {
          asyncResp = true;
        }
        return asyncResp;
      }

      return false;
    });

    console.log('[MessageRouter] Initialized');
  }
}

// Export a singleton instance
export const messageRouter = new MessageRouter();