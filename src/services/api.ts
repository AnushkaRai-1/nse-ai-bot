/**
 * Frontend API Service
 * Handles all backend communication with authentication
 */

import { projectId, publicAnonKey } from '../utils/supabase/info';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-b2a156fa`;

// Store auth token in memory (in production, use secure storage)
let authToken: string | null = null;

export function setAuthToken(token: string) {
  authToken = token;
  if (typeof window !== 'undefined') {
    localStorage.setItem('sentinelquant_token', token);
  }
}

export function getAuthToken(): string | null {
  if (authToken) return authToken;
  
  if (typeof window !== 'undefined') {
    authToken = localStorage.getItem('sentinelquant_token');
  }
  
  return authToken;
}

export function clearAuthToken() {
  authToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('sentinelquant_token');
  }
}

/**
 * Make authenticated API request
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add auth token if available
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    // Use public anon key for unauthenticated requests
    headers['Authorization'] = `Bearer ${publicAnonKey}`;
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`API request failed for ${endpoint}:`, error);
    throw error;
  }
}

// ============================================================================
// Authentication API
// ============================================================================

export interface SignupData {
  email: string;
  password: string;
  name: string;
  role?: 'admin' | 'institutional' | 'retail' | 'trial';
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

export async function signup(data: SignupData): Promise<any> {
  const response = await apiRequest<any>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response;
}

export async function login(data: LoginData): Promise<AuthResponse> {
  const response = await apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  
  // Store token
  setAuthToken(response.access_token);
  
  return response;
}

export async function getCurrentUser(): Promise<any> {
  return await apiRequest('/auth/me');
}

export function logout() {
  clearAuthToken();
}

// ============================================================================
// Market Data API
// ============================================================================

export interface MarketQuote {
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

export async function getQuote(symbol: string): Promise<MarketQuote> {
  return await apiRequest<MarketQuote>(`/market/quote/${symbol}`);
}

export async function getBatchQuotes(symbols: string[]): Promise<{ quotes: Record<string, MarketQuote>; count: number }> {
  return await apiRequest('/market/quotes/batch', {
    method: 'POST',
    body: JSON.stringify({ symbols }),
  });
}

export interface HistoricalDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function getHistoricalData(
  symbol: string,
  from: string,
  to: string
): Promise<{ symbol: string; from: string; to: string; data: HistoricalDataPoint[]; count: number }> {
  return await apiRequest(`/market/historical/${symbol}?from=${from}&to=${to}`);
}

export async function getIndexData(index: string): Promise<MarketQuote> {
  return await apiRequest<MarketQuote>(`/market/index/${index}`);
}

export async function searchStocks(query: string): Promise<{ query: string; results: any[]; count: number }> {
  return await apiRequest(`/market/search?q=${encodeURIComponent(query)}`);
}

// ============================================================================
// Portfolio API
// ============================================================================

export async function getPortfolio(): Promise<any> {
  return await apiRequest('/portfolio');
}

export async function updatePortfolio(portfolio: any): Promise<any> {
  return await apiRequest('/portfolio', {
    method: 'POST',
    body: JSON.stringify(portfolio),
  });
}

export async function getWatchlist(): Promise<{ symbols: string[] }> {
  return await apiRequest('/watchlist');
}

export async function addToWatchlist(symbol: string): Promise<any> {
  return await apiRequest('/watchlist', {
    method: 'POST',
    body: JSON.stringify({ symbol }),
  });
}

// ============================================================================
// AI Predictions API
// ============================================================================

export interface AIPrediction {
  symbol: string;
  prediction: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  targetPrice: number;
  timeHorizon: string;
  model: string;
  timestamp: string;
}

export async function getAIPrediction(symbol: string): Promise<AIPrediction> {
  return await apiRequest<AIPrediction>(`/ai/predict/${symbol}`);
}

// ============================================================================
// Admin API
// ============================================================================

export async function getServerStats(): Promise<any> {
  return await apiRequest('/admin/stats');
}
