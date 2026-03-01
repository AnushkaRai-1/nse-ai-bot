/**
 * WebSocket Service for Real-time Market Data
 * Manages WebSocket connection with automatic reconnection
 */

import { projectId } from '../utils/supabase/info';
import { getAuthToken } from './api';

type MessageHandler = (data: any) => void;
type ConnectionHandler = (connected: boolean) => void;

export class MarketDataWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private subscriptions = new Set<string>();
  private messageHandlers = new Map<string, Set<MessageHandler>>();
  private connectionHandlers = new Set<ConnectionHandler>();
  private isManualClose = false;
  private heartbeatInterval: number | null = null;

  constructor() {
    this.connect();
  }

  /**
   * Establish WebSocket connection
   */
  private connect() {
    const token = getAuthToken();
    
    if (!token) {
      console.warn('Cannot connect WebSocket: No auth token available');
      return;
    }

    const wsUrl = `wss://${projectId}.supabase.co/functions/v1/make-server-b2a156fa/ws?token=${token}`;
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.reconnectAttempts = 0;
        this.notifyConnectionHandlers(true);
        
        // Re-subscribe to all symbols
        if (this.subscriptions.size > 0) {
          this.send({
            type: 'subscribe',
            symbols: Array.from(this.subscriptions)
          });
        }

        // Start heartbeat
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.stopHeartbeat();
        this.notifyConnectionHandlers(false);
        
        // Attempt to reconnect unless manually closed
        if (!this.isManualClose && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnect();
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.reconnect();
    }
  }

  /**
   * Reconnect with exponential backoff
   */
  private reconnect() {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Send message to server
   */
  private send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: any) {
    const { type, data } = message;
    
    switch (type) {
      case 'connected':
        console.log('WebSocket connection confirmed:', message);
        break;
        
      case 'quote':
        this.notifyMessageHandlers('quote', data);
        this.notifyMessageHandlers(`quote:${data.symbol}`, data);
        break;
        
      case 'subscribed':
        console.log('Subscribed to symbols:', message.symbols);
        break;
        
      case 'unsubscribed':
        console.log('Unsubscribed from symbols:', message.symbols);
        break;
        
      case 'error':
        console.error('WebSocket error message:', message.message);
        this.notifyMessageHandlers('error', message);
        break;
        
      case 'heartbeat':
        // Server heartbeat received
        break;
        
      case 'pong':
        // Response to client ping
        break;
        
      default:
        console.log('Unknown message type:', type, message);
    }
  }

  /**
   * Notify connection status handlers
   */
  private notifyConnectionHandlers(connected: boolean) {
    this.connectionHandlers.forEach(handler => {
      try {
        handler(connected);
      } catch (error) {
        console.error('Error in connection handler:', error);
      }
    });
  }

  /**
   * Notify message handlers
   */
  private notifyMessageHandlers(type: string, data: any) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error('Error in message handler:', error);
        }
      });
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat() {
    this.heartbeatInterval = window.setInterval(() => {
      this.send({ type: 'ping' });
    }, 25000); // Send ping every 25 seconds
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat() {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Subscribe to symbol updates
   */
  subscribe(symbols: string | string[]) {
    const symbolArray = Array.isArray(symbols) ? symbols : [symbols];
    
    symbolArray.forEach(symbol => {
      this.subscriptions.add(symbol.toUpperCase());
    });
    
    this.send({
      type: 'subscribe',
      symbols: symbolArray.map(s => s.toUpperCase())
    });
  }

  /**
   * Unsubscribe from symbol updates
   */
  unsubscribe(symbols: string | string[]) {
    const symbolArray = Array.isArray(symbols) ? symbols : [symbols];
    
    symbolArray.forEach(symbol => {
      this.subscriptions.delete(symbol.toUpperCase());
    });
    
    this.send({
      type: 'unsubscribe',
      symbols: symbolArray.map(s => s.toUpperCase())
    });
  }

  /**
   * Register handler for specific message type
   */
  on(type: string, handler: MessageHandler) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);
  }

  /**
   * Unregister handler
   */
  off(type: string, handler: MessageHandler) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Register connection status handler
   */
  onConnectionChange(handler: ConnectionHandler) {
    this.connectionHandlers.add(handler);
  }

  /**
   * Unregister connection status handler
   */
  offConnectionChange(handler: ConnectionHandler) {
    this.connectionHandlers.delete(handler);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get current subscriptions
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }

  /**
   * Close connection
   */
  close() {
    this.isManualClose = true;
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.subscriptions.clear();
    this.messageHandlers.clear();
    this.connectionHandlers.clear();
  }
}

// Singleton instance
let wsInstance: MarketDataWebSocket | null = null;

/**
 * Get WebSocket instance (singleton)
 */
export function getWebSocketInstance(): MarketDataWebSocket {
  if (!wsInstance) {
    wsInstance = new MarketDataWebSocket();
  }
  return wsInstance;
}

/**
 * Close WebSocket instance
 */
export function closeWebSocket() {
  if (wsInstance) {
    wsInstance.close();
    wsInstance = null;
  }
}
