/**
 * Frontend API Service
 * Handles all backend communication with FastAPI backend at localhost:8000
 */

const BASE_URL = 'http://localhost:8000/api/v1';

// Store auth token in memory + localStorage
let authToken: string | null = null;

// Custom event for auth state changes — App.tsx listens for this
const AUTH_CHANGE_EVENT = 'sentinelquant:auth-change';

function dispatchAuthChange(isAuthenticated: boolean) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: { isAuthenticated } }));
  }
}

export function onAuthChange(callback: (isAuthenticated: boolean) => void): () => void {
  const handler = (e: Event) => callback((e as CustomEvent).detail.isAuthenticated);
  window.addEventListener(AUTH_CHANGE_EVENT, handler);
  return () => window.removeEventListener(AUTH_CHANGE_EVENT, handler);
}

export function setAuthToken(token: string) {
  authToken = token;
  if (typeof window !== 'undefined') {
    localStorage.setItem('sentinelquant_token', token);
  }
  dispatchAuthChange(true);
}

/**
 * Decode JWT payload and check expiry (without external libs)
 */
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload.exp) return false;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

export function getAuthToken(): string | null {
  if (!authToken && typeof window !== 'undefined') {
    authToken = localStorage.getItem('sentinelquant_token');
  }
  if (authToken && isTokenExpired(authToken)) {
    clearAuthToken();
    return null;
  }
  return authToken;
}

export function clearAuthToken() {
  authToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('sentinelquant_token');
  }
  dispatchAuthChange(false);
}

/**
 * Make authenticated API request to FastAPI backend
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

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${getAuthToken()}`;
      const retryResponse = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include',
      });
      if (!retryResponse.ok) {
        const error = await retryResponse.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(error.detail || `HTTP ${retryResponse.status}`);
      }
      return await retryResponse.json();
    }
    clearAuthToken();
    throw new Error('Session expired. Please log in again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || error.error || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return await response.json();
}

/**
 * Try to refresh access token using HttpOnly cookie
 */
async function tryRefreshToken(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return false;
    const data = await response.json();
    setAuthToken(data.access_token);
    return true;
  } catch {
    return false;
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
  token_type: string;
  expires_in: number;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

export async function signup(data: SignupData): Promise<UserProfile> {
  return await apiRequest<UserProfile>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: data.email, password: data.password, name: data.name }),
  });
}

export async function login(data: LoginData): Promise<AuthResponse> {
  const response = await apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  setAuthToken(response.access_token);
  return response;
}

export async function getCurrentUser(): Promise<UserProfile> {
  return await apiRequest<UserProfile>('/auth/me');
}

export function logout() {
  apiRequest('/auth/logout', { method: 'POST' }).catch(() => {});
  clearAuthToken();
}

export async function updateProfile(data: { name?: string }): Promise<UserProfile> {
  return await apiRequest<UserProfile>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
  return await apiRequest<{ message: string }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

// ============================================================================
// Admin / Platform Data API
// ============================================================================

export interface DataFreshness {
  ohlcv_latest: string | null;
  stock_count: number;
  recommendations_latest: string | null;
  latest_signal_count: number;
  model_versions: Record<string, string>;
  training_info: Record<string, {
    sharpe: number | null;
    win_rate: number | null;
    accuracy: number | null;
    passes_gates: boolean;
    model_version: string;
  }> | null;
  staleness_days: number;
  needs_refresh: boolean;
  pipeline_status: any;
  pipeline_history: any[];
}

export async function getDataFreshness(): Promise<DataFreshness> {
  return await apiRequest<DataFreshness>('/admin/data-freshness');
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
  return await apiRequest<MarketQuote>(`/market/quote/${symbol.toUpperCase()}`);
}

export async function getBatchQuotes(symbols: string[]): Promise<{ quotes: Record<string, MarketQuote>; count: number }> {
  return await apiRequest('/market/quotes/batch', {
    method: 'POST',
    body: JSON.stringify({ symbols: symbols.map(s => s.toUpperCase()) }),
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
  days: number = 90
): Promise<{ symbol: string; days: number; data: HistoricalDataPoint[]; count: number }> {
  return await apiRequest(`/market/historical/${symbol.toUpperCase()}?days=${days}`);
}

// ============================================================================
// Stock List & Screener API
// ============================================================================

export interface StockListItem {
  symbol: string;
  name: string;
  sector: string;
  marketCap: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  rsi: number | null;
  macd: number | null;
  adx: number | null;
  atr: number | null;
  bbWidth: number | null;
  ma200Regime: boolean | null;
  volumeZ: number | null;
  pe: number | null;
  fcfYield: number | null;
  deRatio: number | null;
  sentiment24h: number | null;
  aiScore: number | null;
  aiDirection: string | null;
  confidence: number | null;
}

export async function getStocksList(params?: {
  bucket?: string;
  sector?: string;
  search?: string;
  limit?: number;
}): Promise<{ stocks: StockListItem[]; count: number }> {
  const query = new URLSearchParams();
  if (params?.bucket) query.set('bucket', params.bucket);
  if (params?.sector) query.set('sector', params.sector);
  if (params?.search) query.set('search', params.search);
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return await apiRequest(`/market/stocks${qs ? '?' + qs : ''}`);
}

export async function getScreener(params?: {
  bucket?: string;
  sector?: string;
  direction?: string;
  min_score?: number;
  min_rsi?: number;
  max_rsi?: number;
  limit?: number;
}): Promise<{ results: any[]; count: number }> {
  const query = new URLSearchParams();
  if (params?.bucket) query.set('bucket', params.bucket);
  if (params?.sector) query.set('sector', params.sector);
  if (params?.direction) query.set('direction', params.direction);
  if (params?.min_score) query.set('min_score', String(params.min_score));
  if (params?.min_rsi) query.set('min_rsi', String(params.min_rsi));
  if (params?.max_rsi) query.set('max_rsi', String(params.max_rsi));
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return await apiRequest(`/market/screener${qs ? '?' + qs : ''}`);
}

// ============================================================================
// Sector & Market Overview API
// ============================================================================

export interface SectorData {
  sector: string;
  stockCount: number;
  avgChange: number;
}

export async function getMarketSectors(): Promise<{ sectors: SectorData[]; as_of: string | null }> {
  return await apiRequest('/market/sectors');
}

export interface MarketOverviewData {
  advances: number;
  declines: number;
  unchanged: number;
  totalStocks: number;
  gainers: Array<{ symbol: string; name: string; sector: string; price: number; changePercent: number; volume: number }>;
  losers: Array<{ symbol: string; name: string; sector: string; price: number; changePercent: number; volume: number }>;
  as_of: string | null;
}

export async function getMarketOverview(): Promise<MarketOverviewData> {
  return await apiRequest('/market/overview');
}

// ============================================================================
// AI Recommendations API
// ============================================================================

export interface SignalBreakdown {
  xgboost_signal: number;
  lstm_signal: number | null;
  garch_confidence: number | null;
  regime: string | null;
  key_drivers: string[];
  risk_factors: string[];
}

export interface Recommendation {
  id: string;
  generated_at: string;
  symbol: string;
  company_name: string;
  market_cap_bucket: string;
  sector: string;
  score: number;
  horizon: string;
  direction: string;
  confidence_pct: number;
  reasoning: SignalBreakdown;
  model_version: string;
}

export interface RecommendationList {
  recommendations: Recommendation[];
  generated_at: string;
  regime: string | null;
  total_count: number;
  disclaimer: string;
}

export async function getRecommendations(params?: {
  bucket?: string;
  limit?: number;
  horizon?: string;
}): Promise<RecommendationList> {
  const query = new URLSearchParams();
  if (params?.bucket) query.set('bucket', params.bucket);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.horizon) query.set('horizon', params.horizon);
  const qs = query.toString();
  return await apiRequest(`/recommendations${qs ? '?' + qs : ''}`);
}

export async function getRecommendation(symbol: string): Promise<Recommendation> {
  return await apiRequest<Recommendation>(`/recommendations/${symbol.toUpperCase()}`);
}

// ============================================================================
// AI Prediction (backward compat wrapper for StockDetail)
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
  const rec = await getRecommendation(symbol);
  return {
    symbol: rec.symbol,
    prediction: rec.direction === 'long' ? 'BUY' : 'HOLD',
    confidence: rec.confidence_pct,
    targetPrice: 0,
    timeHorizon: rec.horizon === 'short' ? '1-5 days' : '15-30 days',
    model: `XGBoost ${rec.model_version}`,
    timestamp: rec.generated_at,
  };
}

// ============================================================================
// Market Regime API
// ============================================================================

export interface MarketRegimeData {
  regime: string;
  confidence: number;
  nifty50_vs_200dma: number;
  india_vix: number | null;
  reasoning: string;
  as_of: string;
}

export async function getMarketRegime(): Promise<MarketRegimeData> {
  return await apiRequest<MarketRegimeData>('/market/regime');
}

// ============================================================================
// Stock Signals API
// ============================================================================

export interface StockSignals {
  symbol: string;
  as_of: string;
  technical: {
    rsi_14: number | null;
    macd_signal: number | null;
    adx_value: number | null;
    bb_bandwidth: number | null;
    ma200_regime: boolean | null;
    atr_14: number | null;
  };
  fundamental: {
    fcf_yield: number | null;
    pe_zscore: number | null;
    de_ratio: number | null;
  };
  sentiment: {
    sentiment_24h: number | null;
    sentiment_72h: number | null;
  };
  regime: string;
}

export async function getStockSignals(symbol: string): Promise<StockSignals> {
  return await apiRequest<StockSignals>(`/stocks/${symbol.toUpperCase()}/signals`);
}

// ============================================================================
// Admin API
// ============================================================================

export async function getServerStats(): Promise<any> {
  return await apiRequest('/admin/health');
}

// ============================================================================
// Portfolio & Watchlist (stubs — no backend support yet)
// ============================================================================

export async function getPortfolio(): Promise<any> {
  return { holdings: [], totalValue: 0 };
}

export async function updatePortfolio(_portfolio: any): Promise<any> {
  return { success: true };
}

export async function getWatchlist(): Promise<{ symbols: string[] }> {
  return { symbols: [] };
}

export async function addToWatchlist(_symbol: string): Promise<any> {
  return { success: true };
}

// ============================================================================
// Backward compat
// ============================================================================

export async function getIndexData(index: string): Promise<MarketQuote> {
  return await getQuote(index);
}

export async function searchStocks(query: string): Promise<{ query: string; results: any[]; count: number }> {
  const { stocks } = await getStocksList({ search: query, limit: 20 });
  return { query, results: stocks, count: stocks.length };
}
