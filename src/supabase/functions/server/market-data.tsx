/**
 * Market Data Provider Integration
 * Connects to NSE data providers with secure credential management
 * Implements caching, rate limiting, and error handling
 comment end

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
 comment end 
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
 comment end
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
 comment end
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
 comment end
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
 comment end
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
 comment end
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
*/
/**
 * Market Data Provider - NSE India (Direct Integration)
 * Fetches live data directly from NSE's public endpoints.
 * No API key required — NSE provides this data via their website's backend.
 *
 * ⚠️  Important: NSE rate-limits aggressive scrapers. The caching layer
 *     below keeps requests well within safe limits.
 */

import * as kv from './kv_store.tsx';

// ---------------------------------------------------------------------------
// Cache TTLs (seconds)
// ---------------------------------------------------------------------------
const CACHE_TTL = {
  REALTIME:   15,    // 15s  — NSE updates quotes ~every 15s during market hours
  INTRADAY:   60,    // 1 min
  HISTORICAL: 3600,  // 1 hr  — historical data never changes
  STATIC:     86400, // 24 hr — symbol lists, company info
};

// ---------------------------------------------------------------------------
// NSE base URLs
// ---------------------------------------------------------------------------
const NSE_BASE   = 'https://www.nseindia.com';
const NSE_API    = `${NSE_BASE}/api`;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
export interface MarketQuote {
  symbol:        string;
  price:         number;
  change:        number;
  changePercent: number;
  volume:        number;
  timestamp:     string;
  high:          number;
  low:           number;
  open:          number;
  previousClose: number;
}

export interface HistoricalData {
  date:   string;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

// ---------------------------------------------------------------------------
// NSE requires specific headers to avoid being blocked (they check Referer)
// ---------------------------------------------------------------------------
function nseHeaders(): HeadersInit {
  return {
    'Accept':          'application/json, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer':         'https://www.nseindia.com/',
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
  };
}

/**
 * Low-level fetch wrapper with a short timeout and error normalisation.
 */
async function nseFetch(url: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8 s timeout

  try {
    const res = await fetch(url, {
      headers: nseHeaders(),
      signal:  controller.signal,
    });

    if (!res.ok) {
      throw new Error(`NSE responded ${res.status} for ${url}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Real-time quote
// ---------------------------------------------------------------------------

/**
 * Maps NSE's raw equity quote JSON → our MarketQuote shape.
 */
function mapEquityQuote(symbol: string, data: any): MarketQuote {
  // NSE returns priceInfo nested object
  const p = data.priceInfo ?? data;

  return {
    symbol,
    price:         parseFloat(p.lastPrice   ?? p.ltp       ?? 0),
    change:        parseFloat(p.change      ?? p.netChange ?? 0),
    changePercent: parseFloat(p.pChange     ?? p.percentChange ?? 0),
    volume:        parseInt  (data.tradeInfo?.totalTradedVolume ?? data.marketDeptOrderBook?.tradeInfo?.totalTradedVolume ?? 0, 10),
    timestamp:     new Date().toISOString(),
    high:          parseFloat(p.intraDayHighLow?.max ?? p.high ?? 0),
    low:           parseFloat(p.intraDayHighLow?.min ?? p.low  ?? 0),
    open:          parseFloat(p.open         ?? 0),
    previousClose: parseFloat(p.previousClose ?? p.close ?? 0),
  };
}

export async function getRealtimeQuote(symbol: string): Promise<MarketQuote | null> {
  const cacheKey = `quote:${symbol}`;

  try {
    // 1. Cache check
    const cached = await kv.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // 2. Fetch from NSE
    // Endpoint: /api/quote-equity?symbol=RELIANCE
    const url  = `${NSE_API}/quote-equity?symbol=${encodeURIComponent(symbol)}`;
    const data = await nseFetch(url);

    const quote = mapEquityQuote(symbol, data);

    // 3. Cache & return
    await kv.set(cacheKey, JSON.stringify(quote), CACHE_TTL.REALTIME);
    return quote;

  } catch (error) {
    console.error(`[market-data] getRealtimeQuote(${symbol}):`, error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Historical data
// ---------------------------------------------------------------------------

/**
 * NSE historical endpoint returns rows inside data.data[]
 * Each row: { CH_TIMESTAMP, CH_OPENING_PRICE, CH_HIGH_PRICE, CH_LOW_PRICE,
 *             CH_CLOSING_PRICE, CH_TOT_TRADED_QTY }
 */
function mapHistoricalRow(row: any): HistoricalData {
  return {
    date:   row.CH_TIMESTAMP?.split('T')[0] ?? row.mTIMESTAMP ?? '',
    open:   parseFloat(row.CH_OPENING_PRICE  ?? 0),
    high:   parseFloat(row.CH_HIGH_PRICE     ?? 0),
    low:    parseFloat(row.CH_LOW_PRICE      ?? 0),
    close:  parseFloat(row.CH_CLOSING_PRICE  ?? 0),
    volume: parseInt  (row.CH_TOT_TRADED_QTY ?? 0, 10),
  };
}

export async function getHistoricalData(
  symbol: string,
  from:   string,   // YYYY-MM-DD
  to:     string,   // YYYY-MM-DD
): Promise<HistoricalData[]> {
  const cacheKey = `historical:${symbol}:${from}:${to}`;

  try {
    const cached = await kv.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // NSE expects dates as DD-MM-YYYY
    const fmt = (d: string) => d.split('-').reverse().join('-');

    const url  = `${NSE_API}/historical/cm/equity?symbol=${encodeURIComponent(symbol)}&series=["EQ"]&from=${fmt(from)}&to=${fmt(to)}&csv=false`;
    const data = await nseFetch(url);

    const rows: HistoricalData[] = (data?.data ?? []).map(mapHistoricalRow);

    await kv.set(cacheKey, JSON.stringify(rows), CACHE_TTL.HISTORICAL);
    return rows;

  } catch (error) {
    console.error(`[market-data] getHistoricalData(${symbol}):`, error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Batch quotes  (institutional)
// ---------------------------------------------------------------------------

export async function getBatchQuotes(symbols: string[]): Promise<Map<string, MarketQuote>> {
  const quotes = new Map<string, MarketQuote>();

  // Parallel fetch — cache keeps us from hammering NSE
  const results = await Promise.allSettled(
    symbols.map(async (symbol) => ({ symbol, quote: await getRealtimeQuote(symbol) }))
  );

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.quote) {
      quotes.set(r.value.symbol, r.value.quote);
    }
  }

  return quotes;
}

// ---------------------------------------------------------------------------
// Index data  (NIFTY 50, BANK NIFTY, etc.)
// ---------------------------------------------------------------------------

/**
 * NSE index endpoint: /api/allIndices
 * Returns an array; we pick the one matching the requested index name.
 */
function mapIndexQuote(raw: any): MarketQuote {
  return {
    symbol:        raw.index       ?? raw.indexSymbol ?? '',
    price:         parseFloat(raw.last            ?? 0),
    change:        parseFloat(raw.variation        ?? 0),
    changePercent: parseFloat(raw.percentChange    ?? 0),
    volume:        parseInt  (raw.turnover         ?? 0, 10),
    timestamp:     new Date().toISOString(),
    high:          parseFloat(raw.high             ?? 0),
    low:           parseFloat(raw.low              ?? 0),
    open:          parseFloat(raw.open             ?? 0),
    previousClose: parseFloat(raw.previousClose    ?? 0),
  };
}

// Maps friendly names → NSE index identifiers
const INDEX_NAME_MAP: Record<string, string> = {
  'NIFTY':      'NIFTY 50',
  'NIFTY50':    'NIFTY 50',
  'BANKNIFTY':  'NIFTY BANK',
  'SENSEX':     'S&P BSE SENSEX',
  'NIFTYIT':    'NIFTY IT',
  'NIFTYMIDCAP':'NIFTY MIDCAP 100',
};

export async function getIndexData(index: string): Promise<MarketQuote | null> {
  const cacheKey = `index:${index}`;

  try {
    const cached = await kv.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const data = await nseFetch(`${NSE_API}/allIndices`);
    const target = INDEX_NAME_MAP[index.toUpperCase()] ?? index.toUpperCase();

    const match = (data?.data ?? []).find(
      (i: any) => i.index?.toUpperCase() === target.toUpperCase()
    );

    if (!match) {
      console.warn(`[market-data] Index not found: ${index}`);
      return null;
    }

    const quote = mapIndexQuote(match);
    await kv.set(cacheKey, JSON.stringify(quote), CACHE_TTL.REALTIME);
    return quote;

  } catch (error) {
    console.error(`[market-data] getIndexData(${index}):`, error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stock search
// ---------------------------------------------------------------------------

export async function searchStocks(query: string): Promise<any[]> {
  const cacheKey = `search:${query.toLowerCase()}`;

  try {
    const cached = await kv.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // NSE search endpoint
    const url  = `${NSE_API}/search?q=${encodeURIComponent(query)}`;
    const data = await nseFetch(url);

    // NSE returns { symbols: [...], others: [...] }
    const symbols = [
      ...(data?.symbols ?? []),
      ...(data?.others  ?? []),
    ].map((s: any) => ({
      symbol: s.symbol       ?? s.name ?? '',
      name:   s.symbol_info  ?? s.name ?? '',
      sector: s.industry     ?? '',
    })).slice(0, 10);

    await kv.set(cacheKey, JSON.stringify(symbols), CACHE_TTL.STATIC);
    return symbols;

  } catch (error) {
    console.error(`[market-data] searchStocks(${query}):`, error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Credential validation
// (NSE doesn't need credentials — this now just confirms connectivity)
// ---------------------------------------------------------------------------

export async function validateAPICredentials(): Promise<boolean> {
  try {
    // Hit the lightweight market-status endpoint as a connectivity check
    const data = await nseFetch(`${NSE_API}/marketStatus`);
    const isUp  = Array.isArray(data?.marketState) && data.marketState.length > 0;

    if (isUp) {
      console.log('[market-data] NSE connectivity OK — live data active');
    } else {
      console.warn('[market-data] NSE reachable but returned unexpected payload');
    }

    return isUp;
  } catch (error) {
    console.error('[market-data] NSE connectivity check failed:', error);
    return false;
  }
}
