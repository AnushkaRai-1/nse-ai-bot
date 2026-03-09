import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, Brain, Info, Loader2 } from 'lucide-react';
import { getQuote, getAIPrediction, getHistoricalData, getStockSignals, type MarketQuote, type AIPrediction, type StockSignals } from '../services/api';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ComposedChart, Line, Bar, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// priceData is now fetched from /market/historical/{symbol} in useEffect

export default function StockDetail() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const [quote, setQuote] = useState<MarketQuote | null>(null);
  const [prediction, setPrediction] = useState<AIPrediction | null>(null);
  const [signals, setSignals] = useState<StockSignals | null>(null);
  const [priceData, setPriceData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!symbol) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [q, p, h, s] = await Promise.all([
          getQuote(symbol).catch(() => null),
          getAIPrediction(symbol).catch(() => null),
          getHistoricalData(symbol, 90).catch(() => null),
          getStockSignals(symbol).catch(() => null),
        ]);
        setQuote(q);
        setPrediction(p);
        setSignals(s);
        if (h && h.data.length > 0) {
          setPriceData(h.data.map(d => ({
            date: new Date(d.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
            price: d.close,
            rsi: 50, // Placeholder — RSI is per-symbol not per-day in our API
            macd: 0,
            volume: d.volume / 100000, // to lakhs
            ma20: d.close, // Placeholder
            ma50: d.close, // Placeholder
          })));
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [symbol]);

  const currentPrice = quote?.price ?? 2845;
  const priceChange = quote?.change ?? 68.50;
  const priceChangePercent = quote?.changePercent ?? 2.46;
  const aiSignal = prediction?.prediction ?? 'BUY';
  const aiConfidence = prediction?.confidence ?? 87;
  const aiTarget = prediction?.targetPrice ?? 3120;

  const fundamentalData = {
    rsi: signals?.technical.rsi_14 ?? 0,
    macd: signals?.technical.macd_signal ?? 0,
    adx: signals?.technical.adx_value ?? 0,
    atr: signals?.technical.atr_14 ?? 0,
    pe: signals?.fundamental.pe_zscore ?? 0,
    debtToEquity: signals?.fundamental.de_ratio ?? 0,
    fcfYield: signals?.fundamental.fcf_yield ?? 0,
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="hover:bg-white/5"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl mb-1">{symbol?.toUpperCase()}</h1>
          <p className="text-muted-foreground">{loading ? 'Loading...' : symbol?.toUpperCase()}</p>
        </div>
        <div className="text-right">
          <div className="text-3xl mb-1">₹{currentPrice.toLocaleString('en-IN')}</div>
          <div className={`flex items-center gap-1 ${priceChange >= 0 ? 'text-success' : 'text-destructive'}`}>
            {priceChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>{priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChange >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)</span>
          </div>
        </div>
      </div>

      {/* AI Insight Panel */}
      <div className="glass-card rounded-xl p-6 border border-accent/30 glow-accent relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl"></div>
        <div className="relative">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-primary flex items-center justify-center flex-shrink-0">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <h3>AI Analysis</h3>
                <Badge className={
                  aiSignal === 'BUY' ? 'bg-success/20 text-success border-success/30' :
                  aiSignal === 'SELL' ? 'bg-destructive/20 text-destructive border-destructive/30' :
                  'bg-warning/20 text-warning border-warning/30'
                }>{aiSignal}</Badge>
              </div>
              <p className="text-muted-foreground mb-4">
                Based on technical momentum, fundamental strength, and sentiment analysis, {symbol?.toUpperCase()} shows
                {aiSignal === 'BUY' ? ' strong bullish' : aiSignal === 'SELL' ? ' bearish' : ' neutral'} signals.
                AI models have analyzed price action, volume patterns, and market regime to generate this recommendation
                with {aiConfidence}% confidence for the short to medium term.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">AI Confidence Score</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-accent to-primary" style={{ width: `${aiConfidence}%` }}></div>
                    </div>
                    <span className="text-lg text-accent">{aiConfidence}%</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Target Price (30d)</div>
                  <div className="text-lg text-success">₹{aiTarget.toLocaleString('en-IN')}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Stop Loss</div>
                  <div className="text-lg text-destructive">₹{Math.round(currentPrice * 0.93).toLocaleString('en-IN')}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chart Tabs */}
      <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
        <Tabs defaultValue="price" className="w-full">
          <TabsList className="w-full justify-start border-b border-white/10 rounded-none bg-transparent p-0">
            <TabsTrigger value="price" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Price Chart
            </TabsTrigger>
            <TabsTrigger value="indicators" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Technical Indicators
            </TabsTrigger>
            <TabsTrigger value="volume" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Volume Analysis
            </TabsTrigger>
          </TabsList>

          <TabsContent value="price" className="p-6 mt-0">
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={priceData}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                    border: '1px solid rgba(148, 163, 184, 0.1)',
                    borderRadius: '8px'
                  }}
                />
                <Area type="monotone" dataKey="price" stroke="#06b6d4" fill="url(#colorPrice)" strokeWidth={2} />
                <Line type="monotone" dataKey="ma20" stroke="#8b5cf6" strokeWidth={2} dot={false} name="MA 20" />
                <Line type="monotone" dataKey="ma50" stroke="#f59e0b" strokeWidth={2} dot={false} name="MA 50" />
              </ComposedChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="indicators" className="p-6 mt-0">
            <div className="space-y-6">
              <div>
                <h4 className="mb-3">RSI (Relative Strength Index)</h4>
                <ResponsiveContainer width="100%" height={150}>
                  <ComposedChart data={priceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                    <XAxis dataKey="date" stroke="#94a3b8" />
                    <YAxis domain={[0, 100]} stroke="#94a3b8" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                        border: '1px solid rgba(148, 163, 184, 0.1)',
                        borderRadius: '8px'
                      }}
                    />
                    <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" label="Overbought" />
                    <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" label="Oversold" />
                    <Line type="monotone" dataKey="rsi" stroke="#8b5cf6" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div>
                <h4 className="mb-3">MACD</h4>
                <ResponsiveContainer width="100%" height={150}>
                  <ComposedChart data={priceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                    <XAxis dataKey="date" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                        border: '1px solid rgba(148, 163, 184, 0.1)',
                        borderRadius: '8px'
                      }}
                    />
                    <ReferenceLine y={0} stroke="#94a3b8" />
                    <Bar dataKey="macd" fill="#06b6d4" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="volume" className="p-6 mt-0">
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={priceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                    border: '1px solid rgba(148, 163, 184, 0.1)',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="volume" fill="#8b5cf6" name="Volume (Cr)" />
              </ComposedChart>
            </ResponsiveContainer>
          </TabsContent>
        </Tabs>
      </div>

      {/* Fundamental Snapshot */}
      <div className="glass-card rounded-xl p-6 border border-white/10">
        <div className="flex items-center gap-2 mb-6">
          <Info className="w-5 h-5 text-primary" />
          <h3>Fundamental Snapshot</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <div className="text-sm text-muted-foreground mb-1">RSI (14)</div>
            <div className="text-xl">{fundamentalData.rsi?.toFixed(1) || 'N/A'}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">MACD Signal</div>
            <div className="text-xl">{fundamentalData.macd?.toFixed(2) || 'N/A'}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">ADX</div>
            <div className="text-xl">{fundamentalData.adx?.toFixed(1) || 'N/A'}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">ATR (14)</div>
            <div className="text-xl">{fundamentalData.atr?.toFixed(2) || 'N/A'}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">P/E Z-Score</div>
            <div className="text-xl">{fundamentalData.pe?.toFixed(2) || 'N/A'}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">D/E Ratio</div>
            <div className="text-xl">{fundamentalData.debtToEquity?.toFixed(2) || 'N/A'}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">FCF Yield</div>
            <div className="text-xl text-success">{fundamentalData.fcfYield ? `${(fundamentalData.fcfYield * 100).toFixed(1)}%` : 'N/A'}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Sentiment</div>
            <div className="text-xl">{signals?.sentiment.sentiment_24h?.toFixed(2) || 'N/A'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}