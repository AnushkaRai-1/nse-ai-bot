import React from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, TrendingUp, TrendingDown, Brain, Info } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ComposedChart, Line, Bar, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// Mock candlestick data
const priceData = [
  { date: 'Jan 1', price: 2650, rsi: 52, macd: 12, volume: 2.1, ma20: 2620, ma50: 2590 },
  { date: 'Jan 8', price: 2680, rsi: 58, macd: 18, volume: 2.8, ma20: 2635, ma50: 2595 },
  { date: 'Jan 15', price: 2720, rsi: 64, macd: 24, volume: 3.2, ma20: 2655, ma50: 2605 },
  { date: 'Jan 22', price: 2710, rsi: 62, macd: 20, volume: 2.4, ma20: 2670, ma50: 2615 },
  { date: 'Jan 29', price: 2760, rsi: 68, macd: 28, volume: 3.6, ma20: 2690, ma50: 2630 },
  { date: 'Feb 5', price: 2790, rsi: 72, macd: 32, volume: 3.9, ma20: 2715, ma50: 2645 },
  { date: 'Feb 12', price: 2825, rsi: 74, macd: 35, volume: 4.2, ma20: 2740, ma50: 2665 },
  { date: 'Feb 19', price: 2845, rsi: 68, macd: 30, volume: 3.5, ma20: 2765, ma50: 2685 },
];

const fundamentalData = {
  marketCap: '19.2T',
  pe: 24.5,
  eps: 116.2,
  roe: 12.8,
  roce: 14.2,
  debtToEquity: 0.42,
  dividendYield: 0.35,
  bookValue: 1856,
};

export default function StockDetail() {
  const { symbol } = useParams();
  const navigate = useNavigate();

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
          <h1 className="text-3xl mb-1">{symbol}</h1>
          <p className="text-muted-foreground">Reliance Industries Limited</p>
        </div>
        <div className="text-right">
          <div className="text-3xl mb-1">₹2,845</div>
          <div className="flex items-center gap-1 text-success">
            <TrendingUp className="w-4 h-4" />
            <span>+68.50 (+2.46%)</span>
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
                <Badge className="bg-success/20 text-success border-success/30">BUY</Badge>
              </div>
              <p className="text-muted-foreground mb-4">
                Based on technical momentum, fundamental strength, and sentiment analysis, RELIANCE shows strong bullish signals. 
                The stock has broken above key resistance levels with increasing volume, while maintaining healthy fundamentals with 
                ROE of 12.8% and manageable debt levels. AI confidence stands at 87% for continued upward movement in the short to medium term.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">AI Confidence Score</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-accent to-primary" style={{ width: '87%' }}></div>
                    </div>
                    <span className="text-lg text-accent">87%</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Target Price (30d)</div>
                  <div className="text-lg text-success">₹3,120</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Stop Loss</div>
                  <div className="text-lg text-destructive">₹2,650</div>
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
            <div className="text-sm text-muted-foreground mb-1">Market Cap</div>
            <div className="text-xl">₹{fundamentalData.marketCap}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">P/E Ratio</div>
            <div className="text-xl">{fundamentalData.pe}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">EPS</div>
            <div className="text-xl">₹{fundamentalData.eps}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">ROE</div>
            <div className="text-xl text-success">{fundamentalData.roe}%</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">ROCE</div>
            <div className="text-xl text-success">{fundamentalData.roce}%</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Debt/Equity</div>
            <div className="text-xl">{fundamentalData.debtToEquity}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Dividend Yield</div>
            <div className="text-xl">{fundamentalData.dividendYield}%</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Book Value</div>
            <div className="text-xl">₹{fundamentalData.bookValue}</div>
          </div>
        </div>
      </div>
    </div>
  );
}