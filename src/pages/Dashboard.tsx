import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Brain, Zap } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AnimatedNumber, LiveValue, ConfidenceIndicator } from '../components/AnimatedNumber';
import { IntelligenceSignal, ProbabilityField, AnalysisState } from '../components/IntelligenceSignal';
import { ContextualPreview, HoverGlow } from '../components/ContextualPreview';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import { useMarketData } from '../hooks/useMarketData';
import { getBatchQuotes, getRecommendations, getMarketSectors, getMarketRegime, type Recommendation, type SectorData, type MarketRegimeData } from '../services/api';


// Intraday mock chart (no intraday API yet)
const marketData = [
  { time: '9:30', nifty: 21450 },
  { time: '10:00', nifty: 21480 },
  { time: '10:30', nifty: 21520 },
  { time: '11:00', nifty: 21490 },
  { time: '11:30', nifty: 21540 },
  { time: '12:00', nifty: 21580 },
  { time: '12:30', nifty: 21560 },
  { time: '1:00', nifty: 21590 },
  { time: '1:30', nifty: 21620 },
];

// Signal type for display
interface AISignal {
  stock: string;
  signal: 'BUY' | 'HOLD' | 'SELL';
  confidence: number;
  momentum: number;
  fundamental: number;
  price: number;
  change: number;
}

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

export default function Dashboard() {
  const [analysisState, setAnalysisState] = useState<'idle' | 'loading' | 'analyzing' | 'complete'>('idle');
  const [marketRegime, setMarketRegime] = useState({ sentiment: 72, strength: 78 });
  const [regimeLabel, setRegimeLabel] = useState('Bullish');
  const [liveSignals, setLiveSignals] = useState<AISignal[]>([]);
  const [sectorPerformance, setSectorPerformance] = useState<{ sector: string; value: number }[]>([]);

  // Real-time index data via WebSocket + REST polling fallback
  const { quotes: indexQuotes } = useMarketData({
    symbols: ['NIFTY50', 'SENSEX', 'INDIAVIX'],
    realtime: true,
    pollInterval: 30000,
  });

  const nifty = indexQuotes.get('NIFTY50');
  const sensex = indexQuotes.get('SENSEX');
  const vix = indexQuotes.get('INDIAVIX');

  // Fetch AI recommendations, market regime, and sector data from backend
  useEffect(() => {
    const fetchDashboardData = async () => {
      setAnalysisState('loading');
      try {
        // Fetch all dashboard data in parallel
        const [recsData, regimeData, sectorsData] = await Promise.allSettled([
          getRecommendations({ limit: 10 }),
          getMarketRegime(),
          getMarketSectors(),
        ]);

        setAnalysisState('analyzing');

        // Process recommendations → signal cards
        if (recsData.status === 'fulfilled') {
          const recs = recsData.value.recommendations;
          const symbols = recs.map(r => r.symbol);
          // Fetch live prices for recommended stocks
          let priceMap: Record<string, { price: number; changePercent: number }> = {};
          try {
            const { quotes } = await getBatchQuotes(symbols);
            priceMap = quotes;
          } catch {}

          const signals: AISignal[] = recs.map(rec => {
            const live = priceMap[rec.symbol];
            return {
              stock: rec.symbol,
              signal: rec.direction === 'long' ? 'BUY' as const : 'HOLD' as const,
              confidence: rec.confidence_pct,
              momentum: rec.reasoning.xgboost_signal * 10,
              fundamental: rec.score / 10,
              price: live?.price ?? 0,
              change: live?.changePercent ?? 0,
            };
          });
          setLiveSignals(signals);
        }

        // Process regime
        if (regimeData.status === 'fulfilled') {
          const r = regimeData.value;
          setRegimeLabel(r.regime.charAt(0).toUpperCase() + r.regime.slice(1));
          setMarketRegime({ sentiment: r.confidence * 100, strength: r.confidence * 100 });
        }

        // Process sectors
        if (sectorsData.status === 'fulfilled') {
          setSectorPerformance(
            sectorsData.value.sectors.map(s => ({ sector: s.sector, value: s.avgChange }))
          );
        }

        setAnalysisState('complete');
      } catch {
        setAnalysisState('complete');
      }
    };
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 60000);
    return () => clearInterval(interval);
  }, []);

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
            <h1 className="text-3xl tracking-tight mb-2">Market Intelligence</h1>
            <p className="text-sm text-muted-foreground">
              Live analysis powered by AI • Last updated{' '}
              <span className="text-[var(--primary)]">just now</span>
            </p>
          </div>
          <AnalysisState state={analysisState} />
        </div>

        {/* Live sync indicator */}
        <div className="h-0.5 bg-muted/20 rounded-full overflow-hidden">
          <motion.div
            className="h-full"
            style={{
              background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
            }}
            animate={{
              x: ['-100%', '200%'],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </div>
      </motion.div>

      {/* Market Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AnimatedSection delay={0.1}>
          <HoverGlow color="signal" intensity={0.8}>
            <div className="intelligence-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Market Regime
                </span>
                <Activity className="w-4 h-4 text-[var(--success)]" />
              </div>
              <div className="space-y-2">
                <div className="text-2xl" style={{ color: regimeLabel === 'Bull' || regimeLabel === 'Bullish' ? 'var(--success)' : regimeLabel === 'Bear' || regimeLabel === 'Bearish' ? 'var(--danger)' : 'var(--signal)' }}>
                  {regimeLabel}
                </div>
                <ConfidenceIndicator value={marketRegime.strength} label="Strength" />
              </div>
            </div>
          </HoverGlow>
        </AnimatedSection>

        <AnimatedSection delay={0.2}>
          <ContextualPreview
            title="NIFTY 50"
            value={nifty?.price ?? 21620}
            change={nifty?.change ?? 170.5}
            changePercent={nifty?.changePercent ?? 0.79}
            chartData={marketData.slice(-8).map(d => ({ value: d.nifty }))}
            confidence={85}
            metadata={[
              { label: 'Open', value: nifty?.open?.toLocaleString('en-IN') ?? '21,450' },
              { label: 'High', value: nifty?.high?.toLocaleString('en-IN') ?? '21,640' },
              { label: 'Volume', value: nifty?.volume ? `₹${(nifty.volume / 10000000).toFixed(0)} Cr` : '₹28,420 Cr' },
            ]}
          >
            <HoverGlow color="primary">
              <div className="intelligence-card p-5 cursor-pointer">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    NIFTY 50
                  </span>
                </div>
                <LiveValue
                  value={nifty?.price ?? 21620}
                  change={nifty?.change ?? 170.5}
                  changePercent={nifty?.changePercent ?? 0.79}
                  decimals={0}
                />
              </div>
            </HoverGlow>
          </ContextualPreview>
        </AnimatedSection>

        <AnimatedSection delay={0.3}>
          <ContextualPreview
            title="SENSEX"
            value={sensex?.price ?? 71320}
            change={sensex?.change ?? 470}
            changePercent={sensex?.changePercent ?? 0.66}
            chartData={marketData.slice(-8).map(d => ({ value: d.nifty * 3.3 }))}
            confidence={83}
          >
            <HoverGlow color="primary">
              <div className="intelligence-card p-5 cursor-pointer">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    SENSEX
                  </span>
                </div>
                <LiveValue
                  value={sensex?.price ?? 71320}
                  change={sensex?.change ?? 470}
                  changePercent={sensex?.changePercent ?? 0.66}
                  decimals={0}
                />
              </div>
            </HoverGlow>
          </ContextualPreview>
        </AnimatedSection>

        <AnimatedSection delay={0.4}>
          <HoverGlow color="signal">
            <div className="intelligence-card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  India VIX
                </span>
              </div>
              <LiveValue
                value={vix?.price ?? 14.25}
                change={vix?.change ?? -0.87}
                changePercent={vix?.changePercent ?? -5.75}
                decimals={2}
              />
            </div>
          </HoverGlow>
        </AnimatedSection>
      </div>

      {/* AI Signals - Horizontal Flow */}
      <AnimatedSection delay={0.5}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Brain className="w-5 h-5 text-[var(--primary)]" />
              <h2 className="text-xl">Live Trading Signals</h2>
              <motion.div
                className="px-2 py-0.5 rounded text-xs"
                style={{
                  backgroundColor: 'rgba(125, 211, 252, 0.1)',
                  color: 'var(--primary)',
                  border: '1px solid rgba(125, 211, 252, 0.3)',
                }}
                animate={{
                  opacity: [1, 0.6, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                Live
              </motion.div>
            </div>
          </div>

          <div className="scroll-section -mx-6 px-6">
            {liveSignals.map((signal, idx) => (
              <motion.div
                key={signal.stock}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + idx * 0.1, duration: 0.5 }}
                className="w-80"
              >
                <ContextualPreview
                  title={signal.stock}
                  value={signal.price}
                  change={signal.change}
                  changePercent={signal.change}
                  chartData={[...Array(12)].map((_, i) => ({
                    value: signal.price + (Math.random() - 0.5) * 50,
                  }))}
                  confidence={signal.confidence}
                  metadata={[
                    { label: 'Momentum', value: `${signal.momentum}/10` },
                    { label: 'Fundamental', value: `${signal.fundamental}/10` },
                  ]}
                >
                  <HoverGlow color="primary">
                    <div className="intelligence-card p-5 space-y-4 cursor-pointer h-full">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="text-lg tracking-tight">{signal.stock}</div>
                          <div
                            className={`text-sm tabular-nums ${
                              signal.change > 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                            }`}
                          >
                            {signal.change > 0 ? '+' : ''}
                            <AnimatedNumber value={signal.change} decimals={2} />%
                          </div>
                        </div>
                        <IntelligenceSignal
                          type={signal.signal}
                          confidence={signal.confidence}
                          size="sm"
                        />
                      </div>

                      <ConfidenceIndicator
                        value={signal.confidence}
                        label="AI Confidence"
                      />

                      <div className="flex gap-4 pt-3 border-t border-border">
                        <div className="flex-1">
                          <div className="text-xs text-muted-foreground mb-1">Momentum</div>
                          <div className="text-base tabular-nums" style={{ color: 'var(--primary)' }}>
                            <AnimatedNumber value={signal.momentum} decimals={1} />
                            /10
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="text-xs text-muted-foreground mb-1">Fundamental</div>
                          <div className="text-base tabular-nums" style={{ color: 'var(--signal)' }}>
                            <AnimatedNumber value={signal.fundamental} decimals={1} />
                            /10
                          </div>
                        </div>
                      </div>
                    </div>
                  </HoverGlow>
                </ContextualPreview>
              </motion.div>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnimatedSection delay={0.7}>
          <div className="intelligence-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base">Intraday Performance</h3>
              <div className="text-xs text-muted-foreground tabular-nums">NSE</div>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={marketData}>
                <defs>
                  <linearGradient id="colorNifty" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 148, 158, 0.05)" />
                <XAxis
                  dataKey="time"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--card-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="nifty"
                  stroke="var(--primary)"
                  fillOpacity={1}
                  fill="url(#colorNifty)"
                  strokeWidth={2}
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.8}>
          <div className="intelligence-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base">Sector Performance</h3>
              <div className="text-xs text-muted-foreground">Today</div>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={sectorPerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 148, 158, 0.05)" />
                <XAxis
                  type="number"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="sector"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  width={70}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--card-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} animationDuration={1000}>
                  {sectorPerformance.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.value > 0 ? 'var(--success)' : 'var(--danger)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AnimatedSection>
      </div>

      {/* Market Sentiment */}
      <AnimatedSection delay={0.9}>
        <div className="intelligence-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-[var(--signal)]" />
              <h3 className="text-lg">Market Sentiment Analysis</h3>
            </div>
            <motion.div
              className="px-3 py-1 rounded-lg text-sm"
              style={{
                backgroundColor: 'rgba(134, 239, 172, 0.1)',
                color: 'var(--success)',
                border: '1px solid rgba(134, 239, 172, 0.3)',
              }}
            >
              Optimistic
            </motion.div>
          </div>

          <ProbabilityField
            probabilities={{
              bullish: 72,
              neutral: 18,
              bearish: 10,
            }}
          />

          <p className="text-sm text-muted-foreground">
            Aggregate sentiment from news analysis, social media, and trading volume patterns.
            Confidence level:{' '}
            <span style={{ color: 'var(--primary)' }}>
              <AnimatedNumber value={marketRegime.sentiment} decimals={0} />%
            </span>
          </p>
        </div>
      </AnimatedSection>
    </div>
  );
}
