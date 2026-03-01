import React from 'react';
import { PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Percent, Target, AlertTriangle } from 'lucide-react';
import { Badge } from '../components/ui/badge';

const portfolioValue = [
  { date: 'Jan', value: 2500000 },
  { date: 'Feb', value: 2680000 },
  { date: 'Mar', value: 2850000 },
  { date: 'Apr', value: 2920000 },
  { date: 'May', value: 3150000 },
  { date: 'Jun', value: 3380000 },
];

const allocation = [
  { name: 'Equities', value: 65, color: '#06b6d4' },
  { name: 'Bonds', value: 20, color: '#8b5cf6' },
  { name: 'Gold', value: 10, color: '#f59e0b' },
  { name: 'Cash', value: 5, color: '#10b981' },
];

const holdings = [
  { symbol: 'RELIANCE', allocation: 18.5, value: 625300, cost: 580000, pl: 45300, plPercent: 7.8, riskContribution: 22 },
  { symbol: 'TCS', allocation: 15.2, value: 513760, cost: 490000, pl: 23760, plPercent: 4.8, riskContribution: 18 },
  { symbol: 'HDFCBANK', allocation: 12.8, value: 432640, cost: 420000, pl: 12640, plPercent: 3.0, riskContribution: 15 },
  { symbol: 'INFY', allocation: 10.5, value: 354900, cost: 360000, pl: -5100, plPercent: -1.4, riskContribution: 12 },
  { symbol: 'ICICIBANK', allocation: 8.0, value: 270400, cost: 255000, pl: 15400, plPercent: 6.0, riskContribution: 10 },
];

const rebalanceSuggestions = [
  { action: 'REDUCE', symbol: 'RELIANCE', current: 18.5, target: 15.0, reason: 'High concentration risk' },
  { action: 'INCREASE', symbol: 'HDFCBANK', current: 12.8, target: 15.0, reason: 'Underweight banking sector' },
  { action: 'ADD', symbol: 'BHARTIARTL', current: 0, target: 8.0, reason: 'Telecom sector exposure' },
];

export default function Portfolio() {
  const totalValue = 3380000;
  const totalCost = 3105000;
  const totalPL = totalValue - totalCost;
  const totalPLPercent = ((totalPL / totalCost) * 100).toFixed(2);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl mb-2">Portfolio</h1>
        <p className="text-muted-foreground">Track and optimize your investment portfolio</p>
      </div>

      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-xl p-6 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Total Value</span>
            <DollarSign className="w-5 h-5 text-primary" />
          </div>
          <div className="text-2xl mb-1">₹{(totalValue / 100000).toFixed(2)}L</div>
          <div className="text-xs text-muted-foreground">Invested: ₹{(totalCost / 100000).toFixed(2)}L</div>
        </div>

        <div className="glass-card rounded-xl p-6 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Total P&L</span>
            <TrendingUp className="w-5 h-5 text-success" />
          </div>
          <div className="text-2xl mb-1 text-success">₹{(totalPL / 1000).toFixed(0)}K</div>
          <div className="text-xs text-success">+{totalPLPercent}%</div>
        </div>

        <div className="glass-card rounded-xl p-6 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Risk Score</span>
            <AlertTriangle className="w-5 h-5 text-warning" />
          </div>
          <div className="text-2xl mb-1 text-warning">6.8</div>
          <div className="text-xs text-muted-foreground">Moderate</div>
        </div>

        <div className="glass-card rounded-xl p-6 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Sharpe Ratio</span>
            <Percent className="w-5 h-5 text-accent" />
          </div>
          <div className="text-2xl mb-1 text-accent">1.84</div>
          <div className="text-xs text-muted-foreground">Risk-adjusted return</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Portfolio Value Growth */}
        <div className="glass-card rounded-xl p-6 border border-white/10">
          <h3 className="mb-4">Portfolio Value</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={portfolioValue}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                  border: '1px solid rgba(148, 163, 184, 0.1)',
                  borderRadius: '8px'
                }}
                formatter={(value: number) => `₹${(value / 100000).toFixed(2)}L`}
              />
              <Area type="monotone" dataKey="value" stroke="#06b6d4" fillOpacity={1} fill="url(#colorValue)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Asset Allocation */}
        <div className="glass-card rounded-xl p-6 border border-white/10">
          <h3 className="mb-4">Asset Allocation</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={allocation}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {allocation.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                  border: '1px solid rgba(148, 163, 184, 0.1)',
                  borderRadius: '8px'
                }}
                formatter={(value: number) => `${value}%`}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-3 mt-4">
            {allocation.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                <span className="text-sm">{item.name}: {item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <h3>Individual Holdings</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 bg-muted/30">
                <th className="text-left p-4 text-sm">Symbol</th>
                <th className="text-right p-4 text-sm">Allocation</th>
                <th className="text-right p-4 text-sm">Current Value</th>
                <th className="text-right p-4 text-sm">Cost Basis</th>
                <th className="text-right p-4 text-sm">Unrealized P&L</th>
                <th className="text-right p-4 text-sm">Risk Contribution</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding) => (
                <tr key={holding.symbol} className="border-b border-white/5 hover:bg-white/5 transition-smooth">
                  <td className="p-4">{holding.symbol}</td>
                  <td className="p-4 text-right">{holding.allocation}%</td>
                  <td className="p-4 text-right">₹{(holding.value / 1000).toFixed(0)}K</td>
                  <td className="p-4 text-right">₹{(holding.cost / 1000).toFixed(0)}K</td>
                  <td className="p-4 text-right">
                    <div className={holding.pl > 0 ? 'text-success' : 'text-destructive'}>
                      <div className="flex items-center justify-end gap-1">
                        {holding.pl > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        <span>₹{Math.abs(holding.pl / 1000).toFixed(0)}K</span>
                      </div>
                      <div className="text-xs">{holding.pl > 0 ? '+' : ''}{holding.plPercent}%</div>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-warning/20">
                      <span className="text-warning">{holding.riskContribution}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Optimization Panel */}
      <div className="glass-card rounded-xl p-6 border border-accent/30 glow-accent">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-accent" />
          <h3>AI Optimization Suggestions</h3>
          <Badge className="bg-accent/20 text-accent border-accent/30 ml-auto">New</Badge>
        </div>
        <div className="space-y-3">
          {rebalanceSuggestions.map((suggestion, idx) => (
            <div key={idx} className="flex items-start gap-4 p-4 rounded-lg bg-muted/30">
              <Badge 
                className={`${
                  suggestion.action === 'REDUCE' 
                    ? 'bg-destructive/20 text-destructive border-destructive/30'
                    : suggestion.action === 'INCREASE'
                    ? 'bg-warning/20 text-warning border-warning/30'
                    : 'bg-success/20 text-success border-success/30'
                } flex-shrink-0 mt-1`}
              >
                {suggestion.action}
              </Badge>
              <div className="flex-1">
                <div className="mb-1">
                  <span className="mr-2">{suggestion.symbol}</span>
                  <span className="text-sm text-muted-foreground">
                    {suggestion.current}% → {suggestion.target}%
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 p-4 rounded-lg bg-primary/10 border border-primary/30">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Expected Risk-Adjusted Return After Rebalancing</div>
              <div className="text-xl text-primary mt-1">+3.2% improvement</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Sharpe Ratio</div>
              <div className="text-xl text-success mt-1">1.84 → 2.12</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
