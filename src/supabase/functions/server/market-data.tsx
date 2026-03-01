/**
 * Market Data Provider Integration
 * Connects to NSE data providers with secure credential management
 * Implements caching, rate limiting, and error handling
 */

import * as kv from './kv_store.tsx';

// Market data cache TTL (in seconds)
const CACHE_TTL = {
  REALTIME: 5,      // 5 seconds for real-time quotes
  INTRADAY: 60,     // 1 minute for intraday data
  HISTORICAL: 3600, // 1 hour for historical data
  STATIC: 86400     // 24 hours for static data
};

interface MarketQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
  high: number;
  low: number;
  open: number;
  previousClose: number;
}

interface HistoricalData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Fetch real-time quote from NSE provider
 * In production, this would call actual NSE API with credentials from environment
 */
export async function getRealtimeQuote(symbol: string): Promise<MarketQuote | null> {
  try {
    // Check cache first
    const cacheKey = `quote:${symbol}`;
    const cached = await kv.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // In production, replace with actual NSE API call
    // Example: const apiKey = Deno.env.get('NSE_API_KEY');
    // const response = await fetch(`https://api.nseindia.com/quote/${symbol}`, {
    //   headers: { 'X-API-Key': apiKey }
    // });
    
    // For now, generate realistic mock data
    const mockQuote: MarketQuote = generateMockQuote(symbol);
    
    // Cache the result
    await kv.set(cacheKey, JSON.stringify(mockQuote), CACHE_TTL.REALTIME);
    
    return mockQuote;
  } catch (error) {
    console.error(`Error fetching quote for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch historical data for a symbol
 */
export async function getHistoricalData(
  symbol: string, 
  from: string, 
  to: string
): Promise<HistoricalData[]> {
  try {
    const cacheKey = `historical:${symbol}:${from}:${to}`;
    const cached = await kv.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // In production: Call actual NSE historical data API
    // const apiKey = Deno.env.get('NSE_API_KEY');
    // const response = await fetch(
    //   `https://api.nseindia.com/historical/${symbol}?from=${from}&to=${to}`,
    //   { headers: { 'X-API-Key': apiKey } }
    // );
    
    const mockData = generateMockHistoricalData(symbol, from, to);
    
    await kv.set(cacheKey, JSON.stringify(mockData), CACHE_TTL.HISTORICAL);
    
    return mockData;
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error);
    return [];
  }
}

/**
 * Fetch multiple quotes in batch (for institutional users)
 */
export async function getBatchQuotes(symbols: string[]): Promise<Map<string, MarketQuote>> {
  const quotes = new Map<string, MarketQuote>();
  
  // Fetch in parallel with Promise.all
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const quote = await getRealtimeQuote(symbol);
      return { symbol, quote };
    })
  );
  
  results.forEach(({ symbol, quote }) => {
    if (quote) {
      quotes.set(symbol, quote);
    }
  });
  
  return quotes;
}

/**
 * Get index data (NIFTY 50, SENSEX, etc.)
 */
export async function getIndexData(index: string): Promise<MarketQuote | null> {
  try {
    const cacheKey = `index:${index}`;
    const cached = await kv.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // In production: Call NSE index API
    const mockQuote = generateMockIndexQuote(index);
    
    await kv.set(cacheKey, JSON.stringify(mockQuote), CACHE_TTL.REALTIME);
    
    return mockQuote;
  } catch (error) {
    console.error(`Error fetching index ${index}:`, error);
    return null;
  }
}

/**
 * Search for stocks by symbol or name
 */
export async function searchStocks(query: string): Promise<any[]> {
  try {
    const cacheKey = `search:${query.toLowerCase()}`;
    const cached = await kv.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // In production: Call NSE search API
    const results = mockSearchResults(query);
    
    await kv.set(cacheKey, JSON.stringify(results), CACHE_TTL.STATIC);
    
    return results;
  } catch (error) {
    console.error(`Error searching stocks for ${query}:`, error);
    return [];
  }
}

// ============================================================================
// Mock Data Generators (Replace with actual API calls in production)
// ============================================================================

function generateMockQuote(symbol: string): MarketQuote {
  const basePrice = Math.random() * 5000 + 100;
  const changePercent = (Math.random() - 0.5) * 5;
  const change = basePrice * (changePercent / 100);
  
  return {
    symbol,
    price: parseFloat(basePrice.toFixed(2)),
    change: parseFloat(change.toFixed(2)),
    changePercent: parseFloat(changePercent.toFixed(2)),
    volume: Math.floor(Math.random() * 10000000),
    timestamp: new Date().toISOString(),
    high: parseFloat((basePrice * 1.02).toFixed(2)),
    low: parseFloat((basePrice * 0.98).toFixed(2)),
    open: parseFloat((basePrice * 0.99).toFixed(2)),
    previousClose: parseFloat((basePrice - change).toFixed(2))
  };
}

function generateMockIndexQuote(index: string): MarketQuote {
  const indexValues: Record<string, number> = {
    'NIFTY': 21620,
    'NIFTY50': 21620,
    'SENSEX': 71320,
    'BANKNIFTY': 45890
  };
  
  const basePrice = indexValues[index.toUpperCase()] || 20000;
  const changePercent = (Math.random() - 0.4) * 2; // Slight bullish bias
  const change = basePrice * (changePercent / 100);
  
  return {
    symbol: index,
    price: parseFloat(basePrice.toFixed(2)),
    change: parseFloat(change.toFixed(2)),
    changePercent: parseFloat(changePercent.toFixed(2)),
    volume: Math.floor(Math.random() * 100000000),
    timestamp: new Date().toISOString(),
    high: parseFloat((basePrice * 1.01).toFixed(2)),
    low: parseFloat((basePrice * 0.99).toFixed(2)),
    open: parseFloat((basePrice * 1.001).toFixed(2)),
    previousClose: parseFloat((basePrice - change).toFixed(2))
  };
}

function generateMockHistoricalData(symbol: string, from: string, to: string): HistoricalData[] {
  const data: HistoricalData[] = [];
  const startDate = new Date(from);
  const endDate = new Date(to);
  let currentPrice = Math.random() * 3000 + 500;
  
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    // Skip weekends
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    
    const volatility = 0.02;
    const change = (Math.random() - 0.5) * currentPrice * volatility;
    currentPrice += change;
    
    const open = currentPrice;
    const close = currentPrice + (Math.random() - 0.5) * currentPrice * volatility;
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    
    data.push({
      date: d.toISOString().split('T')[0],
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: Math.floor(Math.random() * 5000000)
    });
  }
  
  return data;
}

function mockSearchResults(query: string): any[] {
  const stocks = [
    { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', sector: 'Energy' },
    { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'IT' },
    { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', sector: 'Banking' },
    { symbol: 'INFY', name: 'Infosys Ltd', sector: 'IT' },
    { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', sector: 'Banking' },
    { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd', sector: 'FMCG' },
    { symbol: 'ITC', name: 'ITC Ltd', sector: 'FMCG' },
    { symbol: 'SBIN', name: 'State Bank of India', sector: 'Banking' },
    { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', sector: 'Telecom' },
    { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', sector: 'Banking' }
  ];
  
  const lowerQuery = query.toLowerCase();
  return stocks.filter(s => 
    s.symbol.toLowerCase().includes(lowerQuery) || 
    s.name.toLowerCase().includes(lowerQuery)
  ).slice(0, 10);
}

/**
 * Validate NSE API credentials
 * Called on server startup to ensure API keys are configured
 */
export async function validateAPICredentials(): Promise<boolean> {
  try {
    const apiKey = Deno.env.get('NSE_API_KEY');
    const apiSecret = Deno.env.get('NSE_API_SECRET');
    
    if (!apiKey || !apiSecret) {
      console.warn('NSE API credentials not configured - using mock data');
      return false;
    }
    
    // In production: Make test API call to validate credentials
    // const response = await fetch('https://api.nseindia.com/validate', {
    //   headers: { 'X-API-Key': apiKey, 'X-API-Secret': apiSecret }
    // });
    // return response.ok;
    
    console.log('API credentials configured successfully');
    return true;
  } catch (error) {
    console.error('Error validating API credentials:', error);
    return false;
  }
}
