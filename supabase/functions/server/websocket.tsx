/**
 * WebSocket Handler for Real-time Market Data Streaming
 * Implements authenticated WebSocket connections with subscription management
 */

import { authenticateRequest, AuthenticatedUser, UserRole } from './auth.tsx';
import { getRealtimeQuote } from './market-data.tsx';

interface WebSocketClient {
  socket: WebSocket;
  user: AuthenticatedUser;
  subscriptions: Set<string>;
  lastActivity: number;
}

interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'auth';
  symbols?: string[];
  token?: string;
}

// Active WebSocket connections
const clients = new Map<string, WebSocketClient>();

// Subscription tracking (symbol -> Set of client IDs)
const subscriptions = new Map<string, Set<string>>();

// Constants
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const CLIENT_TIMEOUT = 60000; // 60 seconds
const MAX_SUBSCRIPTIONS = {
  [UserRole.ADMIN]: 1000,
  [UserRole.INSTITUTIONAL]: 500,
  [UserRole.RETAIL]: 100,
  [UserRole.TRIAL]: 10
};

/**
 * Handle WebSocket upgrade request
 */
export async function handleWebSocket(req: Request): Promise<Response> {
  try {
    // Extract token from query params for WebSocket auth
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    
    if (!token) {
      return new Response('Unauthorized - Missing token', { status: 401 });
    }

    // Verify token before upgrading connection
    const mockContext = {
      req: {
        header: () => `Bearer ${token}`
      }
    } as any;
    
    const user = await authenticateRequest(mockContext);
    
    if (!user) {
      return new Response('Unauthorized - Invalid token', { status: 401 });
    }

    // Check if user has real-time permission
    if (!user.permissions.includes('realtime')) {
      return new Response('Forbidden - Real-time access not available for your plan', { status: 403 });
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    
    const clientId = crypto.randomUUID();
    
    socket.onopen = () => {
      console.log(`WebSocket opened for user ${user.email} (${clientId})`);
      
      clients.set(clientId, {
        socket,
        user,
        subscriptions: new Set(),
        lastActivity: Date.now()
      });
      
      // Send welcome message
      socket.send(JSON.stringify({
        type: 'connected',
        clientId,
        user: {
          id: user.id,
          role: user.role,
          maxSubscriptions: MAX_SUBSCRIPTIONS[user.role]
        },
        timestamp: new Date().toISOString()
      }));
    };
    
    socket.onmessage = async (event) => {
      const client = clients.get(clientId);
      if (!client) return;
      
      client.lastActivity = Date.now();
      
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        
        switch (message.type) {
          case 'subscribe':
            await handleSubscribe(clientId, message.symbols || []);
            break;
            
          case 'unsubscribe':
            handleUnsubscribe(clientId, message.symbols || []);
            break;
            
          case 'ping':
            socket.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
            break;
            
          default:
            socket.send(JSON.stringify({ 
              type: 'error', 
              message: 'Unknown message type' 
            }));
        }
      } catch (error) {
        console.error(`Error processing message from ${clientId}:`, error);
        socket.send(JSON.stringify({ 
          type: 'error', 
          message: 'Invalid message format' 
        }));
      }
    };
    
    socket.onerror = (error) => {
      console.error(`WebSocket error for ${clientId}:`, error);
    };
    
    socket.onclose = () => {
      console.log(`WebSocket closed for ${clientId}`);
      cleanupClient(clientId);
    };
    
    return response;
  } catch (error) {
    console.error('WebSocket upgrade error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}

/**
 * Handle subscription request
 */
async function handleSubscribe(clientId: string, symbols: string[]) {
  const client = clients.get(clientId);
  if (!client) return;
  
  // Check subscription limit
  const maxSubs = MAX_SUBSCRIPTIONS[client.user.role];
  const currentSubs = client.subscriptions.size;
  const newSubs = symbols.filter(s => !client.subscriptions.has(s));
  
  if (currentSubs + newSubs.length > maxSubs) {
    client.socket.send(JSON.stringify({
      type: 'error',
      message: `Subscription limit exceeded. Max: ${maxSubs}, Current: ${currentSubs}`,
      code: 'SUBSCRIPTION_LIMIT_EXCEEDED'
    }));
    return;
  }
  
  // Add subscriptions
  for (const symbol of newSubs) {
    client.subscriptions.add(symbol);
    
    if (!subscriptions.has(symbol)) {
      subscriptions.set(symbol, new Set());
    }
    subscriptions.get(symbol)!.add(clientId);
  }
  
  client.socket.send(JSON.stringify({
    type: 'subscribed',
    symbols: newSubs,
    totalSubscriptions: client.subscriptions.size,
    timestamp: new Date().toISOString()
  }));
  
  // Send initial data for new subscriptions
  for (const symbol of newSubs) {
    const quote = await getRealtimeQuote(symbol);
    if (quote) {
      client.socket.send(JSON.stringify({
        type: 'quote',
        data: quote
      }));
    }
  }
}

/**
 * Handle unsubscription request
 */
function handleUnsubscribe(clientId: string, symbols: string[]) {
  const client = clients.get(clientId);
  if (!client) return;
  
  for (const symbol of symbols) {
    client.subscriptions.delete(symbol);
    
    const symbolSubs = subscriptions.get(symbol);
    if (symbolSubs) {
      symbolSubs.delete(clientId);
      if (symbolSubs.size === 0) {
        subscriptions.delete(symbol);
      }
    }
  }
  
  client.socket.send(JSON.stringify({
    type: 'unsubscribed',
    symbols,
    totalSubscriptions: client.subscriptions.size,
    timestamp: new Date().toISOString()
  }));
}

/**
 * Cleanup client on disconnect
 */
function cleanupClient(clientId: string) {
  const client = clients.get(clientId);
  if (!client) return;
  
  // Remove all subscriptions
  for (const symbol of client.subscriptions) {
    const symbolSubs = subscriptions.get(symbol);
    if (symbolSubs) {
      symbolSubs.delete(clientId);
      if (symbolSubs.size === 0) {
        subscriptions.delete(symbol);
      }
    }
  }
  
  clients.delete(clientId);
}

/**
 * Broadcast quote update to all subscribers
 */
export function broadcastQuoteUpdate(symbol: string, quote: any) {
  const clientIds = subscriptions.get(symbol);
  if (!clientIds || clientIds.size === 0) return;
  
  const message = JSON.stringify({
    type: 'quote',
    data: quote
  });
  
  for (const clientId of clientIds) {
    const client = clients.get(clientId);
    if (client && client.socket.readyState === WebSocket.OPEN) {
      try {
        client.socket.send(message);
      } catch (error) {
        console.error(`Error sending to client ${clientId}:`, error);
      }
    }
  }
}

/**
 * Start market data streaming
 * Fetches and broadcasts updates for all subscribed symbols
 */
export function startMarketDataStream() {
  setInterval(async () => {
    // Get all subscribed symbols
    const symbols = Array.from(subscriptions.keys());
    
    if (symbols.length === 0) return;
    
    // Fetch quotes for all symbols
    for (const symbol of symbols) {
      try {
        const quote = await getRealtimeQuote(symbol);
        if (quote) {
          broadcastQuoteUpdate(symbol, quote);
        }
      } catch (error) {
        console.error(`Error fetching quote for ${symbol}:`, error);
      }
    }
  }, 5000); // Update every 5 seconds
}

/**
 * Heartbeat to keep connections alive and cleanup stale clients
 */
export function startHeartbeat() {
  setInterval(() => {
    const now = Date.now();
    
    for (const [clientId, client] of clients.entries()) {
      // Check for inactive clients
      if (now - client.lastActivity > CLIENT_TIMEOUT) {
        console.log(`Closing inactive client ${clientId}`);
        try {
          client.socket.close();
        } catch (error) {
          console.error(`Error closing client ${clientId}:`, error);
        }
        cleanupClient(clientId);
        continue;
      }
      
      // Send heartbeat
      if (client.socket.readyState === WebSocket.OPEN) {
        try {
          client.socket.send(JSON.stringify({ 
            type: 'heartbeat', 
            timestamp: new Date().toISOString() 
          }));
        } catch (error) {
          console.error(`Error sending heartbeat to ${clientId}:`, error);
        }
      }
    }
  }, HEARTBEAT_INTERVAL);
}

/**
 * Get WebSocket statistics
 */
export function getWebSocketStats() {
  return {
    totalConnections: clients.size,
    totalSubscriptions: subscriptions.size,
    connectionsByRole: Array.from(clients.values()).reduce((acc, client) => {
      acc[client.user.role] = (acc[client.user.role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    topSymbols: Array.from(subscriptions.entries())
      .map(([symbol, clients]) => ({ symbol, subscribers: clients.size }))
      .sort((a, b) => b.subscribers - a.subscribers)
      .slice(0, 10)
  };
}
