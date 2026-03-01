/**
 * React Hook for Real-time Market Data
 * Provides easy integration with WebSocket service
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getWebSocketInstance } from '../services/websocket';
import { getQuote, type MarketQuote } from '../services/api';

interface UseMarketDataOptions {
  symbols?: string[];
  realtime?: boolean;
  pollInterval?: number; // For fallback polling if WebSocket unavailable
}

interface UseMarketDataReturn {
  quotes: Map<string, MarketQuote>;
  loading: boolean;
  error: string | null;
  connected: boolean;
  subscribe: (symbols: string | string[]) => void;
  unsubscribe: (symbols: string | string[]) => void;
  refresh: () => Promise<void>;
}

export function useMarketData(options: UseMarketDataOptions = {}): UseMarketDataReturn {
  const { symbols = [], realtime = true, pollInterval } = options;
  
  const [quotes, setQuotes] = useState<Map<string, MarketQuote>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  
  const wsRef = useRef(getWebSocketInstance());
  const subscribedSymbols = useRef(new Set<string>());

  /**
   * Handle quote updates from WebSocket
   */
  const handleQuoteUpdate = useCallback((quote: MarketQuote) => {
    setQuotes(prev => {
      const updated = new Map(prev);
      updated.set(quote.symbol, quote);
      return updated;
    });
  }, []);

  /**
   * Handle connection status changes
   */
  const handleConnectionChange = useCallback((isConnected: boolean) => {
    setConnected(isConnected);
    if (!isConnected) {
      setError('WebSocket disconnected - attempting to reconnect...');
    } else {
      setError(null);
    }
  }, []);

  /**
   * Subscribe to symbols
   */
  const subscribe = useCallback((newSymbols: string | string[]) => {
    const symbolArray = Array.isArray(newSymbols) ? newSymbols : [newSymbols];
    
    if (realtime && wsRef.current) {
      wsRef.current.subscribe(symbolArray);
    }
    
    symbolArray.forEach(symbol => {
      subscribedSymbols.current.add(symbol.toUpperCase());
    });
    
    // Fetch initial data
    symbolArray.forEach(async (symbol) => {
      try {
        const quote = await getQuote(symbol);
        handleQuoteUpdate(quote);
      } catch (err) {
        console.error(`Error fetching quote for ${symbol}:`, err);
      }
    });
  }, [realtime, handleQuoteUpdate]);

  /**
   * Unsubscribe from symbols
   */
  const unsubscribe = useCallback((symbolsToRemove: string | string[]) => {
    const symbolArray = Array.isArray(symbolsToRemove) ? symbolsToRemove : [symbolsToRemove];
    
    if (realtime && wsRef.current) {
      wsRef.current.unsubscribe(symbolArray);
    }
    
    symbolArray.forEach(symbol => {
      subscribedSymbols.current.delete(symbol.toUpperCase());
    });
    
    // Remove from quotes
    setQuotes(prev => {
      const updated = new Map(prev);
      symbolArray.forEach(symbol => {
        updated.delete(symbol.toUpperCase());
      });
      return updated;
    });
  }, [realtime]);

  /**
   * Manually refresh all quotes
   */
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const symbolsArray = Array.from(subscribedSymbols.current);
      
      await Promise.all(
        symbolsArray.map(async (symbol) => {
          try {
            const quote = await getQuote(symbol);
            handleQuoteUpdate(quote);
          } catch (err) {
            console.error(`Error refreshing ${symbol}:`, err);
          }
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error refreshing data');
    } finally {
      setLoading(false);
    }
  }, [handleQuoteUpdate]);

  /**
   * Initialize WebSocket listeners
   */
  useEffect(() => {
    if (!realtime) return;

    const ws = wsRef.current;
    
    ws.on('quote', handleQuoteUpdate);
    ws.onConnectionChange(handleConnectionChange);
    
    return () => {
      ws.off('quote', handleQuoteUpdate);
      ws.offConnectionChange(handleConnectionChange);
    };
  }, [realtime, handleQuoteUpdate, handleConnectionChange]);

  /**
   * Subscribe to initial symbols
   */
  useEffect(() => {
    if (symbols.length > 0) {
      subscribe(symbols);
    }
    
    return () => {
      if (symbols.length > 0) {
        unsubscribe(symbols);
      }
    };
  }, [symbols.join(',')]); // Re-subscribe only if symbols change

  /**
   * Fallback polling if WebSocket not available
   */
  useEffect(() => {
    if (!realtime || !pollInterval) return;

    const interval = setInterval(() => {
      if (!connected && subscribedSymbols.current.size > 0) {
        refresh();
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [realtime, pollInterval, connected, refresh]);

  return {
    quotes,
    loading,
    error,
    connected,
    subscribe,
    unsubscribe,
    refresh
  };
}

/**
 * Simplified hook for a single symbol
 */
export function useQuote(symbol: string, realtime = true): {
  quote: MarketQuote | null;
  loading: boolean;
  error: string | null;
  connected: boolean;
  refresh: () => Promise<void>;
} {
  const { quotes, loading, error, connected, refresh } = useMarketData({
    symbols: [symbol],
    realtime
  });

  return {
    quote: quotes.get(symbol.toUpperCase()) || null,
    loading,
    error,
    connected,
    refresh
  };
}

/**
 * Hook for index data (NIFTY, SENSEX, etc.)
 */
export function useIndexData(indices: string[], realtime = true) {
  return useMarketData({
    symbols: indices,
    realtime
  });
}
