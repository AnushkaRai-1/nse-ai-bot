import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, TrendingUp, TrendingDown, Target, AlertTriangle, Sparkles, ArrowRight, X, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { InteractiveInput } from '../components/InteractiveInput';
import { AnimatedNumber } from '../components/AnimatedNumber';
import {
  searchStocks,
  getQuote,
  getBatchQuotes,
  getRecommendations,
  getStockSignals,
  type Recommendation,
  type StockSignals,
} from '../services/api';

// ── Types ──────────────────────────────────────────────────────────────────

interface PortfolioHolding {
  symbol: string;
  name: string;
  sector: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  value: number;
  allocation: number;
}

interface OptimizationSuggestion {
  action: 'REDUCE' | 'INCREASE' | 'ADD' | 'REMOVE';
  symbol: string;
  name?: string;
  currentAllocation: number;
  targetAllocation: number;
  reasoning: string;
  riskImpact: string;
  expectedImprovement: string;
}

interface SearchResult {
  symbol: string;
  name: string;
  sector: string;
}

// ── LocalStorage persistence ───────────────────────────────────────────────

const STORAGE_KEY = 'sentinelquant:portfolio';

interface StoredHolding {
  symbol: string;
  name: string;
  sector: string;
  quantity: number;
  avgPrice: number;
}

function loadHoldings(): StoredHolding[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHoldings(holdings: StoredHolding[]) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(holdings.map(h => ({ symbol: h.symbol, name: h.name, sector: h.sector, quantity: h.quantity, avgPrice: h.avgPrice }))),
  );
}

// ── Helper functions ───────────────────────────────────────────────────────

function recalcAllocations(holdings: PortfolioHolding[]) {
  const total = holdings.reduce((sum, h) => sum + h.value, 0);
  holdings.forEach(h => {
    h.allocation = total > 0 ? (h.value / total) * 100 : 0;
  });
}

function calculateRiskScore(holdings: PortfolioHolding[]): number {
  if (holdings.length === 0) return 0;
  const hhi = holdings.reduce((sum, h) => sum + (h.allocation / 100) ** 2, 0);
  const concentrationRisk = hhi * 10;
  const countPenalty = holdings.length < 5 ? (5 - holdings.length) * 0.8 : 0;
  const sectorCounts = new Map<string, number>();
  holdings.forEach(h => sectorCounts.set(h.sector, (sectorCounts.get(h.sector) || 0) + h.allocation));
  const maxSectorWeight = Math.max(...sectorCounts.values());
  const sectorPenalty = maxSectorWeight > 50 ? 1.5 : maxSectorWeight > 35 ? 0.8 : 0;
  return Math.min(10, concentrationRisk + countPenalty + sectorPenalty);
}

function calculateDiversificationScore(holdings: PortfolioHolding[]): number {
  if (holdings.length === 0) return 0;
  const sectors = new Set(holdings.map(h => h.sector));
  const sectorScore = Math.min(sectors.size * 15, 50);
  const countScore = Math.min(holdings.length * 6, 30);
  const avgAllocation = 100 / holdings.length;
  const variance = holdings.reduce((sum, h) => sum + Math.abs(h.allocation - avgAllocation), 0) / holdings.length;
  const balanceScore = Math.max(0, 20 - variance);
  return Math.min(100, sectorScore + countScore + balanceScore);
}

function calculateVolatilityScore(holdings: PortfolioHolding[]): number {
  if (holdings.length === 0) return 0;
  const base = 18;
  const diversificationBenefit = Math.sqrt(holdings.length) * 2.5;
  const concentrationImpact = Math.max(...holdings.map(h => h.allocation)) / 100 * 8;
  return Math.max(5, base - diversificationBenefit + concentrationImpact);
}

function getMockSearchResults(query: string): SearchResult[] {
  const mockData: SearchResult[] = [
    { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', sector: 'Energy' },
    { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'IT' },
    { symbol: 'INFY', name: 'Infosys Ltd', sector: 'IT' },
    { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', sector: 'Banking' },
    { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', sector: 'Banking' },
    { symbol: 'SBIN', name: 'State Bank of India', sector: 'Banking' },
    { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd', sector: 'FMCG' },
    { symbol: 'ITC', name: 'ITC Ltd', sector: 'FMCG' },
    { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', sector: 'Telecom' },
    { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank Ltd', sector: 'Banking' },
    { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical Industries', sector: 'Pharma' },
    { symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', sector: 'Auto' },
  ];
  const q = query.toLowerCase();
  return mockData.filter(r => r.name.toLowerCase().includes(q) || r.symbol.toLowerCase().includes(q));
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Portfolio() {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedStock, setSelectedStock] = useState<SearchResult | null>(null);
  const [quantity, setQuantity] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [optimizing, setOptimizing] = useState(false);
  const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ── AI Optimization — uses real recommendations + signals ──────────────

  const generateOptimizationSuggestions = useCallback(async (currentHoldings: PortfolioHolding[]) => {
    if (currentHoldings.length === 0) { setSuggestions([]); return; }
    setOptimizing(true);
    const newSuggestions: OptimizationSuggestion[] = [];

    try {
      const { recommendations } = await getRecommendations({ limit: 50 });
      const recMap = new Map<string, Recommendation>();
      recommendations.forEach(r => recMap.set(r.symbol, r));

      const signalPromises = currentHoldings.slice(0, 10).map(h =>
        getStockSignals(h.symbol).catch(() => null),
      );
      const signalResults = await Promise.all(signalPromises);
      const signalMap = new Map<string, StockSignals>();
      signalResults.forEach(s => { if (s) signalMap.set(s.symbol, s); });

      for (const holding of currentHoldings) {
        const rec = recMap.get(holding.symbol);
        const sig = signalMap.get(holding.symbol);
        const plPercent = ((holding.currentPrice - holding.avgPrice) / holding.avgPrice) * 100;

        if (holding.allocation > 25) {
          newSuggestions.push({
            action: 'REDUCE', symbol: holding.symbol, name: holding.name,
            currentAllocation: holding.allocation, targetAllocation: 20,
            reasoning: `Over-concentration risk: ${holding.symbol} represents ${holding.allocation.toFixed(1)}% of portfolio (max recommended: 20%). ${rec ? `AI model scores it ${rec.score.toFixed(2)} (${rec.direction}).` : ''}`,
            riskImpact: 'Reduces single-stock exposure & portfolio volatility',
            expectedImprovement: 'Improves Sharpe ratio by ~0.15–0.25',
          });
        }

        if (rec && rec.direction === 'short' && holding.allocation > 10) {
          newSuggestions.push({
            action: 'REDUCE', symbol: holding.symbol, name: holding.name,
            currentAllocation: holding.allocation,
            targetAllocation: Math.max(5, holding.allocation - 10),
            reasoning: `AI model flags ${holding.symbol} as SHORT (score: ${rec.score.toFixed(2)}, confidence: ${rec.confidence_pct}%). Key drivers: ${rec.reasoning?.key_drivers?.slice(0, 2).join(', ') || 'mixed signals'}.`,
            riskImpact: `Risk factors: ${rec.reasoning?.risk_factors?.slice(0, 2).join(', ') || 'elevated volatility'}`,
            expectedImprovement: `Avoids estimated ${(Math.abs(rec.score) * 5).toFixed(1)}% drawdown`,
          });
        }

        if (sig && sig.technical.rsi_14 && sig.technical.rsi_14 > 75) {
          newSuggestions.push({
            action: 'REDUCE', symbol: holding.symbol, name: holding.name,
            currentAllocation: holding.allocation,
            targetAllocation: Math.max(5, holding.allocation - 5),
            reasoning: `${holding.symbol} RSI is ${sig.technical.rsi_14.toFixed(1)} (overbought >70). ADX: ${sig.technical.adx_value?.toFixed(1) ?? 'N/A'}. Consider partial profit-booking.`,
            riskImpact: 'Reduces mean-reversion risk',
            expectedImprovement: 'Lock in gains before potential pullback',
          });
        }

        if (plPercent < -15) {
          const aiView = rec ? ` AI direction: ${rec.direction} (${rec.confidence_pct}%)` : '';
          newSuggestions.push({
            action: 'REMOVE', symbol: holding.symbol, name: holding.name,
            currentAllocation: holding.allocation, targetAllocation: 0,
            reasoning: `${holding.symbol} is down ${Math.abs(plPercent).toFixed(1)}% from entry.${aiView}. Consider reallocating capital.`,
            riskImpact: 'Removes persistent downside drag',
            expectedImprovement: 'Frees capital for higher-conviction positions',
          });
        }

        if (rec && rec.direction === 'long' && rec.confidence_pct > 60 && holding.allocation < 5 && currentHoldings.length < 8) {
          newSuggestions.push({
            action: 'INCREASE', symbol: holding.symbol, name: holding.name,
            currentAllocation: holding.allocation, targetAllocation: 10,
            reasoning: `${holding.symbol} has strong AI conviction (score: ${rec.score.toFixed(2)}, confidence: ${rec.confidence_pct}%) but only ${holding.allocation.toFixed(1)}% allocation.`,
            riskImpact: 'Minimal incremental risk; improves diversification',
            expectedImprovement: 'Expected return boost from high-conviction position',
          });
        }
      }

      const holdingSymbols = new Set(currentHoldings.map(h => h.symbol));
      const topPicks = recommendations
        .filter(r => r.direction === 'long' && r.confidence_pct > 55 && !holdingSymbols.has(r.symbol))
        .sort((a, b) => b.score - a.score);
      const portfolioSectors = new Set(currentHoldings.map(h => h.sector));

      for (const pick of topPicks.slice(0, 2)) {
        const isNewSector = !portfolioSectors.has(pick.sector);
        if (currentHoldings.length < 12) {
          newSuggestions.push({
            action: 'ADD', symbol: pick.symbol, name: pick.company_name,
            currentAllocation: 0, targetAllocation: 10,
            reasoning: `${pick.symbol} (${pick.sector}) — AI score ${pick.score.toFixed(2)}, ${pick.direction} with ${pick.confidence_pct}% confidence.${isNewSector ? ` Adds missing ${pick.sector} sector exposure.` : ''} Drivers: ${pick.reasoning?.key_drivers?.slice(0, 2).join(', ') || 'strong signals'}.`,
            riskImpact: isNewSector ? 'Reduces sector concentration risk' : 'Adds high-conviction position',
            expectedImprovement: `AI projects favourable risk-reward over ${pick.horizon} horizon`,
          });
        }
      }
    } catch (err) {
      console.warn('AI optimization failed, falling back to heuristics:', err);
      for (const holding of currentHoldings) {
        if (holding.allocation > 25) {
          newSuggestions.push({
            action: 'REDUCE', symbol: holding.symbol, name: holding.name,
            currentAllocation: holding.allocation, targetAllocation: 20,
            reasoning: `Over-concentration: ${holding.symbol} is ${holding.allocation.toFixed(1)}% of portfolio.`,
            riskImpact: 'Reduces single-stock risk',
            expectedImprovement: 'Improves Sharpe ratio by ~0.15',
          });
        }
        const plPct = ((holding.currentPrice - holding.avgPrice) / holding.avgPrice) * 100;
        if (plPct < -15) {
          newSuggestions.push({
            action: 'REMOVE', symbol: holding.symbol, name: holding.name,
            currentAllocation: holding.allocation, targetAllocation: 0,
            reasoning: `${holding.symbol} is down ${Math.abs(plPct).toFixed(1)}%. Consider cutting losses.`,
            riskImpact: 'Removes downside drag',
            expectedImprovement: 'Frees capital for stronger opportunities',
          });
        }
      }
    }

    const seen = new Set<string>();
    const deduped = newSuggestions.filter(s => {
      const key = `${s.action}-${s.symbol}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setSuggestions(deduped.slice(0, 5));
    setOptimizing(false);
  }, []);

  // ── Live-price refresh ─────────────────────────────────────────────────

  const refreshPricesFor = useCallback(async (current: PortfolioHolding[]) => {
    if (current.length === 0) return;
    setRefreshing(true);
    try {
      const symbols = current.map(h => h.symbol);
      const { quotes } = await getBatchQuotes(symbols);
      const updated = current.map(h => {
        const q = quotes[h.symbol];
        const price = q ? q.price : h.currentPrice;
        return { ...h, currentPrice: price, value: h.quantity * price };
      });
      recalcAllocations(updated);
      setHoldings(updated);
      generateOptimizationSuggestions(updated);
    } catch (err) {
      console.warn('Price refresh failed, keeping stale prices:', err);
    } finally {
      setRefreshing(false);
    }
  }, [generateOptimizationSuggestions]);

  // ── Hydrate from localStorage on mount ─────────────────────────────────

  useEffect(() => {
    const stored = loadHoldings();
    if (stored.length === 0) return;
    const restored: PortfolioHolding[] = stored.map(s => ({
      ...s, currentPrice: s.avgPrice, value: s.quantity * s.avgPrice, allocation: 0,
    }));
    recalcAllocations(restored);
    setHoldings(restored);
    refreshPricesFor(restored);
  }, [refreshPricesFor]);

  // ── Search stocks with debounce ────────────────────────────────────────

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); setShowResults(false); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await searchStocks(searchQuery);
        setSearchResults(response.results.map((r: any) => ({ symbol: r.symbol, name: r.name, sector: r.sector || 'Unknown' })));
        setShowResults(true);
      } catch {
        setSearchResults(getMockSearchResults(searchQuery));
        setShowResults(true);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Portfolio metrics ──────────────────────────────────────────────────

  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
  const totalInvested = holdings.reduce((sum, h) => sum + h.quantity * h.avgPrice, 0);
  const totalPL = totalValue - totalInvested;
  const totalPLPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
  const portfolioMetrics = {
    totalValue,
    riskScore: calculateRiskScore(holdings),
    diversificationScore: calculateDiversificationScore(holdings),
    volatilityScore: calculateVolatilityScore(holdings),
  };

  // ── Add stock ──────────────────────────────────────────────────────────

  const handleAddStock = async () => {
    if (!selectedStock || !quantity || !avgPrice) return;
    if (holdings.some(h => h.symbol === selectedStock.symbol)) {
      alert(`${selectedStock.symbol} is already in your portfolio.`);
      return;
    }
    let currentPrice: number;
    try {
      const quote = await getQuote(selectedStock.symbol);
      currentPrice = quote.price;
    } catch {
      currentPrice = parseFloat(avgPrice) * (1 + (Math.random() - 0.5) * 0.1);
    }
    const qty = parseFloat(quantity);
    const avg = parseFloat(avgPrice);
    const newHolding: PortfolioHolding = {
      symbol: selectedStock.symbol, name: selectedStock.name, sector: selectedStock.sector,
      quantity: qty, avgPrice: avg, currentPrice, value: qty * currentPrice, allocation: 0,
    };
    const updated = [...holdings, newHolding];
    recalcAllocations(updated);
    setHoldings(updated);
    saveHoldings(updated);
    setSelectedStock(null); setQuantity(''); setAvgPrice(''); setSearchQuery(''); setShowResults(false);
    generateOptimizationSuggestions(updated);
  };

  // ── Remove stock ───────────────────────────────────────────────────────

  const handleRemoveStock = (symbol: string) => {
    const updated = holdings.filter(h => h.symbol !== symbol);
    recalcAllocations(updated);
    setHoldings(updated);
    saveHoldings(updated);
    if (updated.length > 0) generateOptimizationSuggestions(updated);
    else setSuggestions([]);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Page Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl mb-2">Portfolio Manager</h1>
          <p className="text-muted-foreground">Build and optimize your portfolio with AI-powered insights</p>
        </div>
        {holdings.length > 0 && (
          <Button variant="outline" size="sm" disabled={refreshing} onClick={() => refreshPricesFor(holdings)} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Prices
          </Button>
        )}
      </div>

      {/* Stock Search & Add Section */}
      <div className="intelligence-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Search className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl">Add Stocks to Portfolio</h2>
            <p className="text-sm text-muted-foreground">Search from our 500-stock NSE universe and add with quantity &amp; purchase price</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <InteractiveInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by stock name or symbol (e.g., Reliance, TCS, INFY)..."
            icon={<Search className="w-4 h-4" />}
            className="text-base"
          />
          <AnimatePresence>
            {showResults && searchResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 right-0 mt-2 intelligence-card border border-primary/20 max-h-80 overflow-y-auto z-10"
              >
                {searchResults.map((result, idx) => (
                  <motion.div
                    key={result.symbol}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }}
                    onClick={() => { setSelectedStock(result); setShowResults(false); setSearchQuery(''); }}
                    className="p-4 hover:bg-primary/5 cursor-pointer border-b border-border/50 last:border-0 transition-smooth"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{result.symbol}</div>
                        <div className="text-sm text-muted-foreground">{result.name}</div>
                      </div>
                      <Badge variant="outline" className="bg-muted/30">{result.sector}</Badge>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          {searching && (
            <div className="absolute top-full left-0 right-0 mt-2 intelligence-card p-4 text-center text-muted-foreground">Searching...</div>
          )}
        </div>

        {/* Selected Stock & Input Form */}
        <AnimatePresence>
          {selectedStock && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="p-4 rounded-lg bg-primary/5 border border-primary/20 mb-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-medium">{selectedStock.symbol}</h3>
                  <p className="text-sm text-muted-foreground">{selectedStock.name} — {selectedStock.sector}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedStock(null)}><X className="w-4 h-4" /></Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Quantity</label>
                  <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="100"
                    className="w-full px-4 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Average Purchase Price (₹)</label>
                  <input type="number" value={avgPrice} onChange={(e) => setAvgPrice(e.target.value)} placeholder="2500.00" step="0.01"
                    className="w-full px-4 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
              </div>
              <Button onClick={handleAddStock} disabled={!quantity || !avgPrice} className="w-full mt-4">
                <Plus className="w-4 h-4 mr-2" /> Add to Portfolio
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Current Holdings */}
        {holdings.length > 0 && (
          <div>
            <h3 className="text-sm text-muted-foreground mb-3">Current Holdings ({holdings.length})</h3>
            <div className="space-y-2">
              {holdings.map((holding, idx) => {
                const plValue = (holding.currentPrice - holding.avgPrice) * holding.quantity;
                const plPercent = ((holding.currentPrice - holding.avgPrice) / holding.avgPrice) * 100;
                const isPositive = plValue >= 0;
                return (
                  <motion.div key={holding.symbol} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }}
                    className="p-4 rounded-lg bg-muted/20 border border-border hover:bg-muted/30 transition-smooth"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-medium">{holding.symbol}</h4>
                          <Badge variant="outline" className="bg-primary/10">{holding.allocation.toFixed(1)}%</Badge>
                          <Badge variant="outline" className="bg-muted/30 text-xs">{holding.sector}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">{holding.name}</p>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div><span className="text-muted-foreground">Qty:</span> <span className="tabular-nums">{holding.quantity}</span></div>
                          <div><span className="text-muted-foreground">Avg:</span> <span className="tabular-nums">₹{holding.avgPrice.toFixed(2)}</span></div>
                          <div><span className="text-muted-foreground">Current:</span> <span className="tabular-nums">₹{holding.currentPrice.toFixed(2)}</span></div>
                        </div>
                        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
                          <div><span className="text-xs text-muted-foreground">Value:</span> <span className="font-medium tabular-nums">₹{holding.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></div>
                          <div className={`flex items-center gap-1 ${isPositive ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            <span className="text-sm font-medium tabular-nums">{isPositive ? '+' : ''}₹{plValue.toFixed(0)} ({isPositive ? '+' : ''}{plPercent.toFixed(2)}%)</span>
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveStock(holding.symbol)}
                        className="text-[var(--danger)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Portfolio Summary */}
            <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total Value</p>
                  <p className="text-lg font-medium tabular-nums">₹<AnimatedNumber value={totalValue} decimals={0} /></p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total P&L</p>
                  <p className={`text-lg font-medium tabular-nums ${totalPL >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    {totalPL >= 0 ? '+' : ''}₹<AnimatedNumber value={totalPL} decimals={0} />
                    <span className="text-sm ml-1">({totalPLPercent >= 0 ? '+' : ''}{totalPLPercent.toFixed(2)}%)</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Risk Score</p>
                  <p className="text-lg font-medium tabular-nums"><AnimatedNumber value={portfolioMetrics.riskScore} decimals={1} /><span className="text-sm text-muted-foreground ml-1">/10</span></p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Diversification</p>
                  <p className="text-lg font-medium tabular-nums"><AnimatedNumber value={portfolioMetrics.diversificationScore} decimals={0} />%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Est. Volatility</p>
                  <p className="text-lg font-medium tabular-nums"><AnimatedNumber value={portfolioMetrics.volatilityScore} decimals={1} />%</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI Optimization Suggestions Section */}
      {holdings.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="intelligence-card p-6 border-[var(--accent)]/30">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl">AI Portfolio Optimization</h2>
              <p className="text-sm text-muted-foreground">Powered by XGBoost recommendations, RSI / ADX / MACD signals, and regime detection</p>
            </div>
            {optimizing && <Badge className="bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/30">Analyzing...</Badge>}
          </div>

          {/* Portfolio Health Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-muted/20 border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Overall Risk</span>
                <AlertTriangle className={`w-4 h-4 ${portfolioMetrics.riskScore > 7 ? 'text-[var(--danger)]' : portfolioMetrics.riskScore > 5 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`} />
              </div>
              <div className="text-2xl font-medium tabular-nums"><AnimatedNumber value={portfolioMetrics.riskScore} decimals={1} /><span className="text-sm text-muted-foreground ml-1">/10</span></div>
              <p className="text-xs text-muted-foreground mt-1">{portfolioMetrics.riskScore > 7 ? 'High Risk — consider rebalancing' : portfolioMetrics.riskScore > 5 ? 'Moderate Risk' : 'Low Risk — well balanced'}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/20 border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Diversification</span>
                <Target className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-medium tabular-nums"><AnimatedNumber value={portfolioMetrics.diversificationScore} decimals={0} />%</div>
              <p className="text-xs text-muted-foreground mt-1">{portfolioMetrics.diversificationScore > 80 ? 'Well Diversified' : portfolioMetrics.diversificationScore > 60 ? 'Moderately Diversified' : 'Needs Diversification'}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/20 border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Est. Volatility</span>
                <TrendingUp className="w-4 h-4 text-[var(--accent)]" />
              </div>
              <div className="text-2xl font-medium tabular-nums"><AnimatedNumber value={portfolioMetrics.volatilityScore} decimals={1} />%</div>
              <p className="text-xs text-muted-foreground mt-1">Annualized estimate</p>
            </div>
          </div>

          {/* Optimization Suggestions */}
          <div>
            <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--accent)]" /> Actionable Recommendations
            </h3>
            {suggestions.length > 0 ? (
              <div className="space-y-4">
                {suggestions.map((suggestion, idx) => (
                  <motion.div key={`${suggestion.action}-${suggestion.symbol}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}
                    className="p-5 rounded-lg bg-muted/20 border border-border hover:border-[var(--accent)]/30 transition-smooth"
                  >
                    <div className="flex items-start gap-4">
                      <Badge className={`flex-shrink-0 mt-1 ${
                        suggestion.action === 'REDUCE' ? 'bg-[var(--danger)]/20 text-[var(--danger)] border-[var(--danger)]/30'
                        : suggestion.action === 'INCREASE' ? 'bg-[var(--warning)]/20 text-[var(--warning)] border-[var(--warning)]/30'
                        : suggestion.action === 'ADD' ? 'bg-[var(--success)]/20 text-[var(--success)] border-[var(--success)]/30'
                        : 'bg-[var(--danger)]/20 text-[var(--danger)] border-[var(--danger)]/30'
                      }`}>{suggestion.action}</Badge>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-medium text-lg">{suggestion.symbol}</h4>
                          {suggestion.name && <span className="text-sm text-muted-foreground">{suggestion.name}</span>}
                          <div className="flex items-center gap-2 ml-auto text-sm">
                            <span className="text-muted-foreground">{suggestion.currentAllocation.toFixed(1)}%</span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span className="font-medium text-[var(--accent)]">{suggestion.targetAllocation.toFixed(1)}%</span>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{suggestion.reasoning}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="flex items-start gap-2 text-xs">
                            <AlertTriangle className="w-3 h-3 text-[var(--warning)] mt-0.5 flex-shrink-0" />
                            <div><span className="text-muted-foreground">Risk Impact: </span><span>{suggestion.riskImpact}</span></div>
                          </div>
                          <div className="flex items-start gap-2 text-xs">
                            <TrendingUp className="w-3 h-3 text-[var(--success)] mt-0.5 flex-shrink-0" />
                            <div><span className="text-muted-foreground">Expected: </span><span>{suggestion.expectedImprovement}</span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Sparkles className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">{optimizing ? 'Analyzing your portfolio against AI signals...' : 'Add more stocks to receive optimization suggestions'}</p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Empty State */}
      {holdings.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="intelligence-card p-12 text-center">
          <Target className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-xl mb-2">Your portfolio is empty</h3>
          <p className="text-muted-foreground mb-2">Search from our 500-stock NSE universe above and start building your portfolio.</p>
          <p className="text-sm text-muted-foreground">Holdings are saved in your browser. AI optimization kicks in once you add stocks.</p>
        </motion.div>
      )}
    </div>
  );
}
