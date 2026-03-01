import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Globe, TrendingUp, TrendingDown, Activity, Waves, Sparkles } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AnimatedNumber, LiveValue } from '../components/AnimatedNumber';
import { IntelligenceSignal, AnalysisState } from '../components/IntelligenceSignal';
import { ContextualPreview, HoverGlow } from '../components/ContextualPreview';
import { useScrollAnimation } from '../hooks/useScrollAnimation';

const globalIndices = [
  { name: 'NIFTY 50', value: 21620, change: 0.79, country: 'India' },
  { name: 'SENSEX', value: 71320, change: 0.66, country: 'India' },
  { name: 'S&P 500', value: 4890, change: 0.45, country: 'USA' },
  { name: 'NASDAQ', value: 15432, change: 0.82, country: 'USA' },
  { name: 'FTSE 100', value: 7685, change: -0.23, country: 'UK' },
  { name: 'DAX', value: 16890, change: 0.34, country: 'Germany' },
  { name: 'NIKKEI', value: 36125, change: 1.12, country: 'Japan' },
  { name: 'HANG SENG', value: 16542, change: -0.56, country: 'Hong Kong' },
];

const sectorPerformance = [
  { sector: 'IT', ytd: 12.4, mtd: 2.8, wtd: 0.9 },
  { sector: 'Banking', ytd: 8.2, mtd: -0.8, wtd: -0.3 },
  { sector: 'Auto', ytd: 18.7, mtd: 3.2, wtd: 1.2 },
  { sector: 'Pharma', ytd: 6.5, mtd: 1.5, wtd: 0.4 },
  { sector: 'FMCG', ytd: 4.2, mtd: -0.3, wtd: 0.1 },
  { sector: 'Energy', ytd: 22.1, mtd: 4.1, wtd: 1.8 },
  { sector: 'Metals', ytd: -3.4, mtd: -1.2, wtd: -0.5 },
  { sector: 'Realty', ytd: 15.8, mtd: 2.3, wtd: 0.7 },
];

const marketBreadth = [
  { date: 'Mon', advances: 1245, declines: 856 },
  { date: 'Tue', advances: 1342, declines: 759 },
  { date: 'Wed', advances: 1156, declines: 945 },
  { date: 'Thu', advances: 1478, declines: 623 },
  { date: 'Fri', advances: 1523, declines: 578 },
];

const volumeData = [
  { time: '9:30', volume: 1.2 },
  { time: '10:00', volume: 2.4 },
  { time: '10:30', volume: 3.1 },
  { time: '11:00', volume: 2.8 },
  { time: '11:30', volume: 3.5 },
  { time: '12:00', volume: 2.9 },
  { time: '12:30', volume: 2.2 },
  { time: '1:00', volume: 3.8 },
  { time: '1:30', volume: 4.2 },
];

const topGainers = [
  { symbol: 'ADANIENT', change: 12.4, price: 2845 },
  { symbol: 'TATAMOTORS', change: 8.7, price: 892 },
  { symbol: 'BAJFINANCE', change: 7.9, price: 6720 },
  { symbol: 'TITAN', change: 6.5, price: 3215 },
  { symbol: 'MARUTI', change: 5.8, price: 12456 },
];

const topLosers = [
  { symbol: 'HINDALCO', change: -4.2, price: 645 },
  { symbol: 'TATASTEEL', change: -3.8, price: 142 },
  { symbol: 'COALINDIA', change: -3.5, price: 412 },
  { symbol: 'JSWSTEEL', change: -2.9, price: 878 },
  { symbol: 'VEDL', change: -2.4, price: 267 },
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

export default function MarketOverview() {
  const [liveData, setLiveData] = useState(globalIndices);
  const [marketSentiment, setMarketSentiment] = useState<'bullish' | 'neutral' | 'bearish'>('bullish');

  useEffect(() => {
    // Simulate live market updates
    const interval = setInterval(() => {
      setLiveData(prev => prev.map(index => ({
        ...index,
        value: index.value + (Math.random() - 0.5) * 10,
        change: index.change + (Math.random() - 0.5) * 0.1,
      })));
    }, 3000);

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
            <h1 className="text-3xl tracking-tight mb-2">Market Overview</h1>
            <p className="text-sm text-muted-foreground">
              Real-time global markets powered by AI • Last updated{' '}
              <span className="text-[var(--primary)]">just now</span>
            </p>
          </div>
          <AnalysisState state="complete" message="Live monitoring active" />
        </div>

        {/* Market Regime Indicator */}
        <motion.div
          className="intelligence-card p-4"
          whileHover={{ scale: 1.01 }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{
                  rotate: [0, 360],
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              >
                <Sparkles className="w-5 h-5 text-[var(--primary)]" />
              </motion.div>
              <div>
                <div className="text-sm text-muted-foreground">Market Regime</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-lg capitalize" style={{ color: 'var(--success)' }}>
                    {marketSentiment}
                  </span>
                  <IntelligenceSignal type="BUY" confidence={78} size="sm" />
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">AI Confidence</div>
              <AnimatedNumber value={78} suffix="%" className="text-xl text-[var(--primary)]" />
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Global Indices with Live Updates */}
      <AnimatedSection delay={0.1}>
        <div className="intelligence-card p-6">
          <div className="flex items-center gap-2 mb-6">
            <Globe className="w-5 h-5 text-[var(--primary)]" />
            <h3>Global Indices</h3>
            <motion.div
              className="w-2 h-2 rounded-full ml-auto"
              style={{ backgroundColor: 'var(--success)' }}
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-xs text-muted-foreground">LIVE</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {liveData.map((index, idx) => (
              <HoverGlow key={index.name}>
                <motion.div
                  className="intelligence-card p-4 cursor-pointer"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  whileHover={{ y: -4 }}
                >
                  <ContextualPreview
                    title={index.name}
                    value={index.value}
                    change={index.change * index.value / 100}
                    changePercent={index.change}
                    metadata={[
                      { label: '24h Range', value: `${(index.value * 0.98).toFixed(0)} - ${(index.value * 1.02).toFixed(0)}` },
                      { label: 'Momentum', value: 'Strong' }
                    ]}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="text-xs text-muted-foreground">{index.country}</div>
                          <div className="mt-1 font-medium">{index.name}</div>
                        </div>
                        {index.change > 0 ? (
                          <TrendingUp className="w-4 h-4 text-[var(--success)]" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-[var(--danger)]" />
                        )}
                      </div>
                      <LiveValue
                        value={index.value}
                        change={index.change * index.value / 100}
                        changePercent={index.change}
                        decimals={0}
                        showChange={true}
                      />
                    </div>
                  </ContextualPreview>
                </motion.div>
              </HoverGlow>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* Market Breadth & Volume */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Market Breadth */}
        <AnimatedSection delay={0.2}>
          <div className="intelligence-card p-6">
            <h3 className="mb-6">Market Breadth</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={marketBreadth}>
                <defs>
                  <linearGradient id="advancesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--success)" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="var(--success)" stopOpacity={0.3} />
                  </linearGradient>
                  <linearGradient id="declinesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--danger)" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="var(--danger)" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--card-elevated)', 
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    backdropFilter: 'blur(20px)',
                  }}
                />
                <Bar dataKey="advances" fill="url(#advancesGradient)" name="Advances" radius={[4, 4, 0, 0]} />
                <Bar dataKey="declines" fill="url(#declinesGradient)" name="Declines" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-8 mt-6">
              <motion.div 
                className="flex items-center gap-2"
                whileHover={{ scale: 1.05 }}
              >
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--success)' }} />
                <span className="text-sm">Advances</span>
                <AnimatedNumber value={1523} className="text-sm text-[var(--success)]" />
              </motion.div>
              <motion.div 
                className="flex items-center gap-2"
                whileHover={{ scale: 1.05 }}
              >
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--danger)' }} />
                <span className="text-sm">Declines</span>
                <AnimatedNumber value={578} className="text-sm text-[var(--danger)]" />
              </motion.div>
            </div>
          </div>
        </AnimatedSection>

        {/* Trading Volume */}
        <AnimatedSection delay={0.25}>
          <div className="intelligence-card p-6">
            <div className="flex items-center gap-2 mb-6">
              <Waves className="w-5 h-5 text-[var(--accent-lavender)]" />
              <h3>Intraday Volume</h3>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={volumeData}>
                <defs>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-lavender)" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="var(--accent-lavender)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="time" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--card-elevated)', 
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    backdropFilter: 'blur(20px)',
                  }}
                  formatter={(value: number) => `${value} Cr`}
                />
                <Area 
                  type="monotone" 
                  dataKey="volume" 
                  stroke="var(--accent-lavender)" 
                  fillOpacity={1} 
                  fill="url(#colorVolume)" 
                  strokeWidth={2}
                  animationDuration={1500}
                />
              </AreaChart>
            </ResponsiveContainer>
            <motion.div 
              className="mt-6 intelligence-card p-4"
              style={{ 
                backgroundColor: 'rgba(221, 214, 254, 0.05)',
                borderColor: 'rgba(221, 214, 254, 0.2)',
              }}
              whileHover={{ scale: 1.02 }}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Total Volume</div>
                <AnimatedNumber 
                  value={25420} 
                  prefix="₹" 
                  suffix=" Cr" 
                  className="text-xl"
                  style={{ color: 'var(--accent-lavender)' }}
                />
              </div>
            </motion.div>
          </div>
        </AnimatedSection>
      </div>

      {/* Sector Performance Table */}
      <AnimatedSection delay={0.3}>
        <div className="intelligence-card overflow-hidden">
          <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
            <h3>Sector Performance</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30" style={{ borderColor: 'var(--border)' }}>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Sector</th>
                  <th className="text-right p-4 text-sm font-medium text-muted-foreground">YTD</th>
                  <th className="text-right p-4 text-sm font-medium text-muted-foreground">MTD</th>
                  <th className="text-right p-4 text-sm font-medium text-muted-foreground">WTD</th>
                  <th className="text-right p-4 text-sm font-medium text-muted-foreground">AI Signal</th>
                </tr>
              </thead>
              <tbody>
                {sectorPerformance.map((sector, idx) => (
                  <motion.tr 
                    key={sector.sector} 
                    className="border-b transition-all hover:bg-white/5"
                    style={{ borderColor: 'var(--border)' }}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    whileHover={{ x: 4 }}
                  >
                    <td className="p-4 font-medium">{sector.sector}</td>
                    <td className="p-4 text-right">
                      <AnimatedNumber
                        value={sector.ytd}
                        decimals={1}
                        prefix={sector.ytd > 0 ? '+' : ''}
                        suffix="%"
                        trend={sector.ytd > 0 ? 'up' : 'down'}
                      />
                    </td>
                    <td className="p-4 text-right">
                      <AnimatedNumber
                        value={sector.mtd}
                        decimals={1}
                        prefix={sector.mtd > 0 ? '+' : ''}
                        suffix="%"
                        trend={sector.mtd > 0 ? 'up' : 'down'}
                      />
                    </td>
                    <td className="p-4 text-right">
                      <AnimatedNumber
                        value={sector.wtd}
                        decimals={1}
                        prefix={sector.wtd > 0 ? '+' : ''}
                        suffix="%"
                        trend={sector.wtd > 0 ? 'up' : 'down'}
                      />
                    </td>
                    <td className="p-4 text-right">
                      <IntelligenceSignal
                        type={sector.ytd > 10 ? 'BUY' : sector.ytd < 0 ? 'SELL' : 'HOLD'}
                        confidence={Math.abs(sector.ytd * 5)}
                        size="sm"
                        showIcon={false}
                      />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AnimatedSection>

      {/* Top Gainers & Losers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Gainers */}
        <AnimatedSection delay={0.35}>
          <div className="intelligence-card p-6">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="w-5 h-5 text-[var(--success)]" />
              <h3>Top Gainers</h3>
            </div>
            <div className="space-y-3">
              {topGainers.map((stock, idx) => (
                <motion.div 
                  key={stock.symbol} 
                  className="intelligence-card p-4 cursor-pointer"
                  style={{
                    backgroundColor: 'rgba(134, 239, 172, 0.05)',
                    borderColor: 'rgba(134, 239, 172, 0.2)',
                  }}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  whileHover={{ x: 4, borderColor: 'rgba(134, 239, 172, 0.4)' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium"
                        style={{ 
                          backgroundColor: 'rgba(134, 239, 172, 0.2)',
                          color: 'var(--success)',
                        }}
                        whileHover={{ scale: 1.1, rotate: 5 }}
                      >
                        {idx + 1}
                      </motion.div>
                      <div>
                        <div className="font-medium">{stock.symbol}</div>
                        <div className="text-sm text-muted-foreground">
                          ₹<AnimatedNumber value={stock.price} decimals={0} />
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <AnimatedNumber
                        value={stock.change}
                        decimals={1}
                        prefix="+"
                        suffix="%"
                        className="font-medium"
                        style={{ color: 'var(--success)' }}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </AnimatedSection>

        {/* Top Losers */}
        <AnimatedSection delay={0.4}>
          <div className="intelligence-card p-6">
            <div className="flex items-center gap-2 mb-6">
              <TrendingDown className="w-5 h-5 text-[var(--danger)]" />
              <h3>Top Losers</h3>
            </div>
            <div className="space-y-3">
              {topLosers.map((stock, idx) => (
                <motion.div 
                  key={stock.symbol} 
                  className="intelligence-card p-4 cursor-pointer"
                  style={{
                    backgroundColor: 'rgba(252, 165, 165, 0.05)',
                    borderColor: 'rgba(252, 165, 165, 0.2)',
                  }}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  whileHover={{ x: 4, borderColor: 'rgba(252, 165, 165, 0.4)' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium"
                        style={{ 
                          backgroundColor: 'rgba(252, 165, 165, 0.2)',
                          color: 'var(--danger)',
                        }}
                        whileHover={{ scale: 1.1, rotate: -5 }}
                      >
                        {idx + 1}
                      </motion.div>
                      <div>
                        <div className="font-medium">{stock.symbol}</div>
                        <div className="text-sm text-muted-foreground">
                          ₹<AnimatedNumber value={stock.price} decimals={0} />
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <AnimatedNumber
                        value={stock.change}
                        decimals={1}
                        suffix="%"
                        className="font-medium"
                        style={{ color: 'var(--danger)' }}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </AnimatedSection>
      </div>

      {/* Market Summary */}
      <AnimatedSection delay={0.45}>
        <div className="intelligence-card p-6">
          <div className="flex items-center gap-2 mb-6">
            <Activity className="w-5 h-5 text-[var(--primary)]" />
            <h3>Market Summary</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <motion.div whileHover={{ y: -4 }}>
              <div className="text-sm text-muted-foreground mb-2">52-Week High</div>
              <AnimatedNumber value={21890} className="text-2xl" />
            </motion.div>
            <motion.div whileHover={{ y: -4 }}>
              <div className="text-sm text-muted-foreground mb-2">52-Week Low</div>
              <AnimatedNumber value={18245} className="text-2xl" />
            </motion.div>
            <motion.div whileHover={{ y: -4 }}>
              <div className="text-sm text-muted-foreground mb-2">Avg Volume (50d)</div>
              <div className="text-2xl">
                <AnimatedNumber value={18520} suffix=" Cr" />
              </div>
            </motion.div>
            <motion.div whileHover={{ y: -4 }}>
              <div className="text-sm text-muted-foreground mb-2">Market Cap</div>
              <div className="text-2xl">
                ₹<AnimatedNumber value={325.6} decimals={1} suffix="T" />
              </div>
            </motion.div>
          </div>
        </div>
      </AnimatedSection>
    </div>
  );
}