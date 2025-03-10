// src/services/messageSystem.ts

export enum MessageType {
  ACTIVITY_EVENT = 'ACTIVITY_EVENT',
  EXTRACTION_COMPLETE = 'EXTRACTION_COMPLETE',
  EXTRACTION_ERROR = 'EXTRACTION_ERROR',
  TRIGGER_EXTRACTION = 'TRIGGER_EXTRACTION',
  SET_EXTRACTION_CONTEXT = 'SET_EXTRACTION_CONTEXT',
  // add others as needed
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

export function createMessage<T>(
  type: MessageType,
  data: T,
  source: 'content' | 'background' = 'content'
): Message<T> {
  return {
    type,
    timestamp: Math.floor(Date.now()),
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

  public registerHandler(type: MessageType, handler: MessageHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  public setDefaultHandler(handler: MessageHandler) {
    this.defaultHandler = handler;
  }

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
        if (result === true) asyncResp = true;
        return asyncResp;
      }
      return false;
    });
    console.log('[MessageRouter] Initialized');
  }
}

export const messageRouter = new MessageRouter();