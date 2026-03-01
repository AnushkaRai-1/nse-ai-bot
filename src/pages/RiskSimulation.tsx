import React from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { AlertTriangle, TrendingDown, Activity, Shield } from 'lucide-react';
import { Badge } from '../components/ui/badge';

// Monte Carlo simulation data
const monteCarloData = [
  { month: 0, p5: 3000000, p25: 3200000, p50: 3380000, p75: 3560000, p95: 3800000 },
  { month: 1, p5: 2850000, p25: 3250000, p50: 3480000, p75: 3710000, p95: 4020000 },
  { month: 2, p5: 2720000, p25: 3310000, p50: 3590000, p75: 3870000, p95: 4260000 },
  { month: 3, p5: 2600000, p25: 3380000, p50: 3710000, p75: 4040000, p95: 4520000 },
  { month: 4, p5: 2490000, p25: 3460000, p50: 3840000, p75: 4220000, p95: 4800000 },
  { month: 5, p5: 2390000, p25: 3550000, p50: 3980000, p75: 4410000, p95: 5100000 },
  { month: 6, p5: 2300000, p25: 3650000, p50: 4130000, p75: 4610000, p95: 5420000 },
];

// Drawdown probability
const drawdownData = [
  { threshold: '5%', probability: 28 },
  { threshold: '10%', probability: 15 },
  { threshold: '15%', probability: 8 },
  { threshold: '20%', probability: 4 },
  { threshold: '25%', probability: 2 },
];

// Stress test scenarios
const stressTests = [
  { scenario: 'Market Crash (-30%)', portfolioImpact: -25.4, var95: -856000, recovery: '14 months' },
  { scenario: 'Sector Rotation', portfolioImpact: -12.8, var95: -432000, recovery: '6 months' },
  { scenario: 'Interest Rate Hike', portfolioImpact: -8.5, var95: -287000, recovery: '4 months' },
  { scenario: 'Currency Shock', portfolioImpact: -6.2, var95: -209000, recovery: '3 months' },
];

export default function RiskSimulation() {
  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl mb-2">Risk & Simulation</h1>
        <p className="text-muted-foreground">Monte Carlo simulations and risk analysis</p>
      </div>

      {/* Risk Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-xl p-6 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Portfolio VaR (95%)</span>
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div className="text-2xl mb-1 text-destructive">₹4.25L</div>
          <div className="text-xs text-muted-foreground">1-month horizon</div>
        </div>

        <div className="glass-card rounded-xl p-6 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Max Drawdown</span>
            <TrendingDown className="w-5 h-5 text-warning" />
          </div>
          <div className="text-2xl mb-1 text-warning">-18.3%</div>
          <div className="text-xs text-muted-foreground">Historical peak to trough</div>
        </div>

        <div className="glass-card rounded-xl p-6 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Beta</span>
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div className="text-2xl mb-1 text-primary">1.12</div>
          <div className="text-xs text-muted-foreground">vs. NIFTY 50</div>
        </div>

        <div className="glass-card rounded-xl p-6 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Downside Risk</span>
            <Shield className="w-5 h-5 text-success" />
          </div>
          <div className="text-2xl mb-1 text-success">6.8%</div>
          <div className="text-xs text-muted-foreground">Semi-deviation</div>
        </div>
      </div>

      {/* Monte Carlo Simulation */}
      <div className="glass-card rounded-xl p-6 border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="mb-1">Monte Carlo Simulation</h3>
            <p className="text-sm text-muted-foreground">10,000 simulations · 6-month projection</p>
          </div>
          <Badge className="bg-accent/20 text-accent border-accent/30">Updated</Badge>
        </div>
        <ResponsiveContainer width="100%" height={400}>
          <AreaChart data={monteCarloData}>
            <defs>
              <linearGradient id="confidence95" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.1}/>
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.05}/>
              </linearGradient>
              <linearGradient id="confidence75" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.1}/>
              </linearGradient>
              <linearGradient id="confidence50" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.15}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
            <XAxis 
              dataKey="month" 
              stroke="#94a3b8" 
              fontSize={12}
              label={{ value: 'Months', position: 'insideBottom', offset: -5, fill: '#94a3b8' }}
            />
            <YAxis 
              stroke="#94a3b8" 
              fontSize={12}
              tickFormatter={(value) => `₹${(value / 100000).toFixed(1)}L`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                border: '1px solid rgba(148, 163, 184, 0.1)',
                borderRadius: '8px'
              }}
              formatter={(value: number) => `₹${(value / 100000).toFixed(2)}L`}
            />
            <Area type="monotone" dataKey="p95" stroke="transparent" fill="url(#confidence95)" fillOpacity={1} />
            <Area type="monotone" dataKey="p75" stroke="transparent" fill="url(#confidence75)" fillOpacity={1} />
            <Area type="monotone" dataKey="p50" stroke="#06b6d4" fill="url(#confidence50)" fillOpacity={1} strokeWidth={2} />
            <Area type="monotone" dataKey="p25" stroke="transparent" fill="url(#confidence75)" fillOpacity={1} />
            <Area type="monotone" dataKey="p5" stroke="transparent" fill="url(#confidence95)" fillOpacity={1} />
            <ReferenceLine y={3380000} stroke="#8b5cf6" strokeDasharray="3 3" label="Current Value" />
          </AreaChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6">
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">5th Percentile</div>
            <div className="text-sm">₹{(monteCarloData[6].p5 / 100000).toFixed(2)}L</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">25th Percentile</div>
            <div className="text-sm">₹{(monteCarloData[6].p25 / 100000).toFixed(2)}L</div>
          </div>
          <div className="p-3 rounded-lg bg-primary/20 border border-primary/30">
            <div className="text-xs text-muted-foreground mb-1">Median</div>
            <div className="text-sm text-primary">₹{(monteCarloData[6].p50 / 100000).toFixed(2)}L</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">75th Percentile</div>
            <div className="text-sm">₹{(monteCarloData[6].p75 / 100000).toFixed(2)}L</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">95th Percentile</div>
            <div className="text-sm">₹{(monteCarloData[6].p95 / 100000).toFixed(2)}L</div>
          </div>
        </div>
      </div>

      {/* Drawdown Probability */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-xl p-6 border border-white/10">
          <h3 className="mb-4">Drawdown Probability</h3>
          <div className="space-y-4">
            {drawdownData.map((item) => (
              <div key={item.threshold}>
                <div className="flex justify-between text-sm mb-2">
                  <span>{item.threshold} Drawdown</span>
                  <span className="text-muted-foreground">{item.probability}% probability</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-warning to-destructive rounded-full"
                    style={{ width: `${item.probability * 3}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Value at Risk */}
        <div className="glass-card rounded-xl p-6 border border-white/10">
          <h3 className="mb-4">Value at Risk (VaR)</h3>
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm">95% Confidence (1-month)</span>
                <Badge className="bg-destructive/20 text-destructive border-destructive/30">High Risk</Badge>
              </div>
              <div className="text-2xl text-destructive">₹4.25L</div>
              <p className="text-xs text-muted-foreground mt-2">
                95% probability that losses won't exceed this amount
              </p>
            </div>

            <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm">99% Confidence (1-month)</span>
                <Badge className="bg-warning/20 text-warning border-warning/30">Very High Risk</Badge>
              </div>
              <div className="text-2xl text-warning">₹6.82L</div>
              <p className="text-xs text-muted-foreground mt-2">
                99% probability that losses won't exceed this amount
              </p>
            </div>

            <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
              <div className="text-sm text-muted-foreground mb-1">Expected Shortfall (CVaR)</div>
              <div className="text-xl text-primary">₹5.67L</div>
              <p className="text-xs text-muted-foreground mt-2">
                Average loss beyond VaR threshold
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stress Test Scenarios */}
      <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <h3>Stress Test Scenarios</h3>
          <p className="text-sm text-muted-foreground mt-1">Portfolio resilience under adverse market conditions</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 bg-muted/30">
                <th className="text-left p-4 text-sm">Scenario</th>
                <th className="text-right p-4 text-sm">Portfolio Impact</th>
                <th className="text-right p-4 text-sm">VaR (95%)</th>
                <th className="text-right p-4 text-sm">Expected Recovery</th>
              </tr>
            </thead>
            <tbody>
              {stressTests.map((test) => (
                <tr key={test.scenario} className="border-b border-white/5 hover:bg-white/5 transition-smooth">
                  <td className="p-4">{test.scenario}</td>
                  <td className="p-4 text-right">
                    <span className="text-destructive">{test.portfolioImpact}%</span>
                  </td>
                  <td className="p-4 text-right text-destructive">₹{Math.abs(test.var95 / 1000).toFixed(0)}K</td>
                  <td className="p-4 text-right text-muted-foreground">{test.recovery}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Risk Insights */}
      <div className="glass-card rounded-xl p-6 border border-accent/30 glow-accent">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-accent" />
          <h3>AI Risk Insights</h3>
        </div>
        <div className="space-y-3">
          <div className="p-4 rounded-lg bg-muted/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-1" />
              <div>
                <div className="mb-1">High Concentration Risk</div>
                <p className="text-sm text-muted-foreground">
                  Your portfolio has 18.5% allocation to RELIANCE, exceeding recommended 15% threshold. 
                  Consider rebalancing to reduce single-stock risk.
                </p>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-lg bg-muted/30">
            <div className="flex items-start gap-3">
              <Activity className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
              <div>
                <div className="mb-1">Moderate Volatility Exposure</div>
                <p className="text-sm text-muted-foreground">
                  Portfolio beta of 1.12 indicates slightly higher volatility than market. 
                  Current allocation is appropriate for moderate risk tolerance.
                </p>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-lg bg-muted/30">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-success flex-shrink-0 mt-1" />
              <div>
                <div className="mb-1">Good Downside Protection</div>
                <p className="text-sm text-muted-foreground">
                  Semi-deviation of 6.8% suggests portfolio has better downside protection than typical equity portfolios. 
                  Quality stock selection is working effectively.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
