import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Search, 
  SlidersHorizontal, 
  ArrowUpRight, 
  ArrowDownRight,
  Filter,
  Sparkles,
  TrendingUp,
  Brain
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { IntelligenceSignal, AnalysisState } from '../components/IntelligenceSignal';
import { HoverGlow } from '../components/ContextualPreview';
import { InteractiveInput } from '../components/InteractiveInput';
import { useScrollAnimation } from '../hooks/useScrollAnimation';

// Comprehensive stock data with AI scores
const mockStocks = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', price: 2845, change: 2.4, marketCap: 19.2, sector: 'Energy', rsi: 68, pe: 24.5, momentum: 8.2, fundamental: 7.8, signal: 'BUY' as const, aiScore: 87, volume: 2.4, volatility: 1.8 },
  { symbol: 'TCS', name: 'Tata Consultancy Services', price: 3620, change: 1.2, marketCap: 13.2, sector: 'IT', rsi: 55, pe: 28.3, momentum: 6.5, fundamental: 8.1, signal: 'HOLD' as const, aiScore: 72, volume: 1.8, volatility: 1.2 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', price: 1542, change: 0.8, marketCap: 11.8, sector: 'Banking', rsi: 62, pe: 18.7, momentum: 7.8, fundamental: 8.5, signal: 'BUY' as const, aiScore: 84, volume: 3.1, volatility: 1.5 },
  { symbol: 'INFY', name: 'Infosys', price: 1478, change: -0.5, marketCap: 6.1, sector: 'IT', rsi: 48, pe: 25.6, momentum: 6.2, fundamental: 7.9, signal: 'HOLD' as const, aiScore: 68, volume: 1.5, volatility: 1.3 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', price: 1024, change: -1.2, marketCap: 7.2, sector: 'Banking', rsi: 42, pe: 17.2, momentum: 4.3, fundamental: 6.8, signal: 'SELL' as const, aiScore: 58, volume: 2.2, volatility: 2.1 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', price: 1156, change: 3.1, marketCap: 6.7, sector: 'Telecom', rsi: 72, pe: 32.4, momentum: 8.5, fundamental: 7.2, signal: 'BUY' as const, aiScore: 81, volume: 1.9, volatility: 1.7 },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', price: 2384, change: 0.4, marketCap: 5.6, sector: 'FMCG', rsi: 58, pe: 58.7, momentum: 6.8, fundamental: 8.3, signal: 'HOLD' as const, aiScore: 75, volume: 0.9, volatility: 0.8 },
  { symbol: 'ITC', name: 'ITC Limited', price: 442, change: 1.8, marketCap: 5.5, sector: 'FMCG', rsi: 64, pe: 26.3, momentum: 7.4, fundamental: 7.6, signal: 'BUY' as const, aiScore: 79, volume: 1.2, volatility: 1.0 },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', price: 892, change: 8.7, marketCap: 3.2, sector: 'Auto', rsi: 78, pe: 14.2, momentum: 9.1, fundamental: 6.5, signal: 'BUY' as const, aiScore: 82, volume: 4.5, volatility: 3.2 },
  { symbol: 'ADANIENT', name: 'Adani Enterprises', price: 2845, change: 12.4, marketCap: 3.8, sector: 'Conglomerate', rsi: 85, pe: 92.1, momentum: 9.5, fundamental: 5.2, signal: 'HOLD' as const, aiScore: 65, volume: 5.2, volatility: 4.8 },
  { symbol: 'ASIANPAINT', name: 'Asian Paints', price: 3215, change: -0.3, marketCap: 3.1, sector: 'Materials', rsi: 52, pe: 68.4, momentum: 5.8, fundamental: 8.7, signal: 'HOLD' as const, aiScore: 71, volume: 0.7, volatility: 0.9 },
  { symbol: 'MARUTI', name: 'Maruti Suzuki', price: 12456, change: 5.8, marketCap: 3.8, sector: 'Auto', rsi: 69, pe: 28.9, momentum: 8.3, fundamental: 7.9, signal: 'BUY' as const, aiScore: 80, volume: 1.6, volatility: 1.9 },
];

const AnimatedSection = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1, triggerOnce: true });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
};

export default function StockScreener() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState({
    sector: 'all',
    signal: 'all',
    minAiScore: 0,
    minMomentum: 0,
    minFundamental: 0,
  });

  // Input validation - prevent injection attacks
  const sanitizeInput = (input: string): string => {
    return input.replace(/[<>]/g, '').trim();
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeInput(e.target.value);
    setSearchQuery(sanitized);
  };

  const filteredStocks = mockStocks.filter(stock => {
    const search = sanitizeInput(searchQuery.toLowerCase());
    if (search && !stock.name.toLowerCase().includes(search) && !stock.symbol.toLowerCase().includes(search)) {
      return false;
    }
    if (filters.sector !== 'all' && stock.sector !== filters.sector) {
      return false;
    }
    if (filters.signal !== 'all' && stock.signal !== filters.signal) {
      return false;
    }
    if (stock.aiScore < filters.minAiScore) {
      return false;
    }
    if (stock.momentum < filters.minMomentum) {
      return false;
    }
    if (stock.fundamental < filters.minFundamental) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto atmospheric-overlay">
      {/* Command Center Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="space-y-4"
      >
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl tracking-tight mb-2">Stock Screener</h1>
            <p className="text-sm text-muted-foreground">
              AI-powered filtering • Real-time signals • NSE-compatible data
            </p>
          </div>
          <AnalysisState state="complete" message="Scanning markets" />
        </div>
      </motion.div>

      {/* Search and Filter Controls */}
      <AnimatedSection delay={0.1}>
        <div className="intelligence-card p-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
              <InteractiveInput
                placeholder="Search stocks by name or symbol..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="pl-12 h-12 precision-input w-full"
                maxLength={50}
              />
            </div>
            <motion.button
              className="intelligence-card px-6 h-12 flex items-center justify-center gap-2 min-w-fit"
              onClick={() => setShowFilters(!showFilters)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <SlidersHorizontal className="w-4 h-4" />
              {showFilters ? 'Hide' : 'Show'} Filters
            </motion.button>
          </div>

          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 pt-6 border-t"
              style={{ borderColor: 'var(--border)' }}
            >
              {/* Sector Filter */}
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Sector</label>
                <select
                  value={filters.sector}
                  onChange={(e) => setFilters({...filters, sector: e.target.value})}
                  className="precision-input w-full h-10"
                >
                  <option value="all">All Sectors</option>
                  <option value="IT">IT</option>
                  <option value="Banking">Banking</option>
                  <option value="Energy">Energy</option>
                  <option value="FMCG">FMCG</option>
                  <option value="Telecom">Telecom</option>
                  <option value="Auto">Auto</option>
                </select>
              </div>

              {/* Signal Filter */}
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">AI Signal</label>
                <select
                  value={filters.signal}
                  onChange={(e) => setFilters({...filters, signal: e.target.value})}
                  className="precision-input w-full h-10"
                >
                  <option value="all">All Signals</option>
                  <option value="BUY">Buy</option>
                  <option value="HOLD">Hold</option>
                  <option value="SELL">Sell</option>
                </select>
              </div>

              {/* AI Score Filter */}
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  Min AI Score: <AnimatedNumber value={filters.minAiScore} />
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={filters.minAiScore}
                  onChange={(e) => setFilters({...filters, minAiScore: Number(e.target.value)})}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${filters.minAiScore}%, var(--muted) ${filters.minAiScore}%, var(--muted) 100%)`
                  }}
                />
              </div>

              {/* Momentum Filter */}
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  Min Momentum: <AnimatedNumber value={filters.minMomentum} decimals={0} />
                </label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={filters.minMomentum}
                  onChange={(e) => setFilters({...filters, minMomentum: Number(e.target.value)})}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, var(--signal) 0%, var(--signal) ${filters.minMomentum * 10}%, var(--muted) ${filters.minMomentum * 10}%, var(--muted) 100%)`
                  }}
                />
              </div>

              {/* Fundamental Filter */}
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  Min Fundamental: <AnimatedNumber value={filters.minFundamental} decimals={0} />
                </label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={filters.minFundamental}
                  onChange={(e) => setFilters({...filters, minFundamental: Number(e.target.value)})}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, var(--accent-mint) 0%, var(--accent-mint) ${filters.minFundamental * 10}%, var(--muted) ${filters.minFundamental * 10}%, var(--muted) 100%)`
                  }}
                />
              </div>
            </motion.div>
          )}
        </div>
      </AnimatedSection>

      {/* Results Summary */}
      <AnimatedSection delay={0.15}>
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground">
            Showing <AnimatedNumber value={filteredStocks.length} /> of{' '}
            <AnimatedNumber value={mockStocks.length} /> stocks
          </p>
          <div className="flex gap-2">
            <motion.div 
              className="intelligence-card px-3 py-1.5 flex items-center gap-2"
              style={{ backgroundColor: 'rgba(134, 239, 172, 0.1)', borderColor: 'rgba(134, 239, 172, 0.3)' }}
              whileHover={{ scale: 1.05 }}
            >
              <TrendingUp className="w-3 h-3" style={{ color: 'var(--success)' }} />
              <AnimatedNumber value={filteredStocks.filter(s => s.signal === 'BUY').length} />
              <span className="text-xs" style={{ color: 'var(--success)' }}>Buy</span>
            </motion.div>
            <motion.div 
              className="intelligence-card px-3 py-1.5 flex items-center gap-2"
              style={{ backgroundColor: 'rgba(254, 240, 138, 0.1)', borderColor: 'rgba(254, 240, 138, 0.3)' }}
              whileHover={{ scale: 1.05 }}
            >
              <Sparkles className="w-3 h-3" style={{ color: 'var(--signal)' }} />
              <AnimatedNumber value={filteredStocks.filter(s => s.signal === 'HOLD').length} />
              <span className="text-xs" style={{ color: 'var(--signal)' }}>Hold</span>
            </motion.div>
            <motion.div 
              className="intelligence-card px-3 py-1.5 flex items-center gap-2"
              style={{ backgroundColor: 'rgba(252, 165, 165, 0.1)', borderColor: 'rgba(252, 165, 165, 0.3)' }}
              whileHover={{ scale: 1.05 }}
            >
              <ArrowDownRight className="w-3 h-3" style={{ color: 'var(--danger)' }} />
              <AnimatedNumber value={filteredStocks.filter(s => s.signal === 'SELL').length} />
              <span className="text-xs" style={{ color: 'var(--danger)' }}>Sell</span>
            </motion.div>
          </div>
        </div>
      </AnimatedSection>

      {/* Results Table */}
      <AnimatedSection delay={0.2}>
        <div className="intelligence-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30" style={{ borderColor: 'var(--border)' }}>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Stock</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Sector</th>
                  <th className="text-right p-4 text-sm font-medium text-muted-foreground">Price</th>
                  <th className="text-right p-4 text-sm font-medium text-muted-foreground">Change</th>
                  <th className="text-right p-4 text-sm font-medium text-muted-foreground">RSI</th>
                  <th className="text-center p-4 text-sm font-medium text-muted-foreground">Momentum</th>
                  <th className="text-center p-4 text-sm font-medium text-muted-foreground">Fundamental</th>
                  <th className="text-center p-4 text-sm font-medium text-muted-foreground">AI Score</th>
                  <th className="text-center p-4 text-sm font-medium text-muted-foreground">Signal</th>
                </tr>
              </thead>
              <tbody>
                {filteredStocks.map((stock, idx) => (
                  <motion.tr 
                    key={stock.symbol} 
                    className="border-b transition-all hover:bg-white/5 cursor-pointer"
                    style={{ borderColor: 'var(--border)' }}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    whileHover={{ x: 4 }}
                    onClick={() => navigate(`/stock/${stock.symbol}`)}
                  >
                    <td className="p-4">
                      <div>
                        <div className="font-medium">{stock.symbol}</div>
                        <div className="text-xs text-muted-foreground">{stock.name}</div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-xs px-2 py-1 rounded" style={{ 
                        backgroundColor: 'var(--muted)', 
                        color: 'var(--foreground)' 
                      }}>
                        {stock.sector}
                      </span>
                    </td>
                    <td className="p-4 text-right tabular-nums">
                      ₹<AnimatedNumber value={stock.price} />
                    </td>
                    <td className="p-4 text-right">
                      <div className={`flex items-center justify-end gap-1`}>
                        {stock.change > 0 ? (
                          <ArrowUpRight className="w-3 h-3" style={{ color: 'var(--success)' }} />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" style={{ color: 'var(--danger)' }} />
                        )}
                        <AnimatedNumber 
                          value={stock.change} 
                          decimals={1}
                          prefix={stock.change > 0 ? '+' : ''}
                          suffix="%"
                          trend={stock.change > 0 ? 'up' : 'down'}
                        />
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <span style={{ 
                        color: stock.rsi > 70 ? 'var(--danger)' : stock.rsi < 30 ? 'var(--success)' : 'inherit' 
                      }}>
                        <AnimatedNumber value={stock.rsi} />
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <motion.div 
                        className="inline-flex items-center justify-center w-12 h-12 rounded-lg"
                        style={{ backgroundColor: 'rgba(254, 240, 138, 0.15)' }}
                        whileHover={{ scale: 1.1, rotate: 5 }}
                      >
                        <span style={{ color: 'var(--signal)' }}>
                          <AnimatedNumber value={stock.momentum} decimals={1} />
                        </span>
                      </motion.div>
                    </td>
                    <td className="p-4 text-center">
                      <motion.div 
                        className="inline-flex items-center justify-center w-12 h-12 rounded-lg"
                        style={{ backgroundColor: 'rgba(167, 243, 208, 0.15)' }}
                        whileHover={{ scale: 1.1, rotate: -5 }}
                      >
                        <span style={{ color: 'var(--accent-mint)' }}>
                          <AnimatedNumber value={stock.fundamental} decimals={1} />
                        </span>
                      </motion.div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Brain className="w-3 h-3 text-[var(--primary)]" />
                        <AnimatedNumber value={stock.aiScore} className="text-[var(--primary)]" />
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <IntelligenceSignal 
                        type={stock.signal} 
                        confidence={stock.aiScore} 
                        size="sm" 
                        showIcon={false}
                      />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredStocks.length === 0 && (
            <motion.div
              className="p-12 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Filter className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No stocks match your criteria</p>
              <p className="text-sm text-muted-foreground mt-2">Try adjusting your filters</p>
            </motion.div>
          )}
        </div>
      </AnimatedSection>
    </div>
  );
}
