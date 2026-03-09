/**
 * WebSocket Service for Real-time Market Data
 * Points at FastAPI backend — WebSocket not yet implemented server-side.
 * Falls back gracefully; REST polling in useMarketData.ts handles updates.
 */

import { getAuthToken } from './api';

type MessageHandler = (data: any) => void;
type ConnectionHandler = (connected: boolean) => void;

const WS_URL = 'ws://localhost:8000/ws';

export class MarketDataWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 2000;
  private subscriptions = new Set<string>();
  private messageHandlers = new Map<string, Set<MessageHandler>>();
  private connectionHandlers = new Set<ConnectionHandler>();
  private isManualClose = false;
  private heartbeatInterval: number | null = null;

  constructor() {
    // Delay initial connection to avoid blocking page load
    setTimeout(() => this.connect(), 2000);
  }

  private connect() {
    const token = getAuthToken();
    if (!token) {
      console.warn('[WS] No auth token — skipping WebSocket connection');
      return;
    }

    try {
      this.ws = new WebSocket(`${WS_URL}?token=${token}`);

      this.ws.onopen = () => {
        console.log('[WS] Connected');
        this.reconnectAttempts = 0;
        this.notifyConnectionHandlers(true);
        if (this.subscriptions.size > 0) {
          this.send({ type: 'subscribe', symbols: Array.from(this.subscriptions) });
        }
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[WS] Parse error:', error);
        }
      };

      this.ws.onerror = () => {
        // Silently fail — REST polling is the fallback
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.notifyConnectionHandlers(false);
        if (!this.isManualClose && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnect();
        }
      };
    } catch {
      // WebSocket endpoint not available — this is expected
      console.warn('[WS] Connection failed — using REST polling fallback');
    }
  }

  private reconnect() {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    setTimeout(() => this.connect(), delay);
  }

  private send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(message: any) {
    const { type, data } = message;
    switch (type) {
      case 'quote':
        this.notifyMessageHandlers('quote', data);
        this.notifyMessageHandlers(`quote:${data.symbol}`, data);
        break;
      case 'error':
        this.notifyMessageHandlers('error', message);
        break;
    }
  }

  private notifyConnectionHandlers(connected: boolean) {
    this.connectionHandlers.forEach(handler => {
      try { handler(connected); } catch {}
    });
  }

  private notifyMessageHandlers(type: string, data: any) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.forEach(handler => {
        try { handler(data); } catch {}
      });
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = window.setInterval(() => {
      this.send({ type: 'ping' });
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  subscribe(symbols: string | string[]) {
    const arr = Array.isArray(symbols) ? symbols : [symbols];
    arr.forEach(s => this.subscriptions.add(s.toUpperCase()));
    this.send({ type: 'subscribe', symbols: arr.map(s => s.toUpperCase()) });
  }

  unsubscribe(symbols: string | string[]) {
    const arr = Array.isArray(symbols) ? symbols : [symbols];
    arr.forEach(s => this.subscriptions.delete(s.toUpperCase()));
    this.send({ type: 'unsubscribe', symbols: arr.map(s => s.toUpperCase()) });
  }

  on(type: string, handler: MessageHandler) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);
  }

  off(type: string, handler: MessageHandler) {
    this.messageHandlers.get(type)?.delete(handler);
  }

  onConnectionChange(handler: ConnectionHandler) {
    this.connectionHandlers.add(handler);
  }

  offConnectionChange(handler: ConnectionHandler) {
    this.connectionHandlers.delete(handler);
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }

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

export function getWebSocketInstance(): MarketDataWebSocket {
  if (!wsInstance) {
    wsInstance = new MarketDataWebSocket();
  }
  return wsInstance;
}

export function closeWebSocket() {
  if (wsInstance) {
    wsInstance.close();
    wsInstance = null;
  }
}
