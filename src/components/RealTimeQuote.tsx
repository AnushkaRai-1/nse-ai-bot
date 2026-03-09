import React from 'react';
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useQuote } from '../hooks/useMarketData';
import { AnimatedNumber } from './AnimatedNumber';
import { Button } from './ui/button';

interface RealTimeQuoteProps {
  symbol: string;
  showHeader?: boolean;
  className?: string;
}

export function RealTimeQuote({ symbol, showHeader = true, className = '' }: RealTimeQuoteProps) {
  const { quote, loading, error, connected, refresh } = useQuote(symbol, true);

  if (loading && !quote) {
    return (
      <div className={`intelligence-card p-6 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            <RefreshCw className="w-6 h-6 text-primary" />
          </motion.div>
          <span className="ml-3 text-muted-foreground">Loading quote...</span>
        </div>
      </div>
    );
  }

  if (error && !quote) {
    return (
      <div className={`intelligence-card p-6 ${className}`}>
        <div className="text-center py-8">
          <p className="text-danger mb-4">{error}</p>
          <Button onClick={refresh} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!quote) return null;

  const isPositive = quote.change >= 0;

  return (
    <div className={`intelligence-card p-6 ${className}`}>
      {showHeader && (
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-medium">{quote.symbol}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Last updated: {new Date(quote.timestamp).toLocaleTimeString()}
            </p>
          </div>
          <motion.div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{
              backgroundColor: connected ? 'rgba(134, 239, 172, 0.1)' : 'rgba(252, 165, 165, 0.1)',
              border: `1px solid ${connected ? 'rgba(134, 239, 172, 0.3)' : 'rgba(252, 165, 165, 0.3)'}`
            }}
            animate={{
              opacity: connected ? [1, 0.7, 1] : 1
            }}
            transition={{
              duration: 2,
              repeat: connected ? Infinity : 0
            }}
          >
            {connected ? (
              <Wifi className="w-3 h-3 text-success" />
            ) : (
              <WifiOff className="w-3 h-3 text-danger" />
            )}
            <span className="text-xs" style={{ color: connected ? 'var(--success)' : 'var(--danger)' }}>
              {connected ? 'LIVE' : 'Offline'}
            </span>
          </motion.div>
        </div>
      )}

      {/* Price Display */}
      <div className="space-y-4">
        <div className="flex items-baseline gap-3">
          <div className="text-4xl tabular-nums">
            ₹<AnimatedNumber value={quote.price} decimals={2} />
          </div>
          <motion.div
            className={`flex items-center gap-1 px-2 py-1 rounded-md ${
              isPositive ? 'bg-success/10' : 'bg-danger/10'
            }`}
            animate={{
              scale: [1, 1.05, 1]
            }}
            transition={{
              duration: 0.3
            }}
            key={quote.timestamp} // Re-trigger animation on update
          >
            {isPositive ? (
              <TrendingUp className="w-4 h-4 text-success" />
            ) : (
              <TrendingDown className="w-4 h-4 text-danger" />
            )}
            <span className={`text-sm font-medium ${isPositive ? 'text-success' : 'text-danger'}`}>
              <AnimatedNumber 
                value={Math.abs(quote.change)} 
                decimals={2}
                prefix={isPositive ? '+' : '-'}
              />
              {' '}
              (<AnimatedNumber 
                value={Math.abs(quote.changePercent)} 
                decimals={2}
                suffix="%"
              />)
            </span>
          </motion.div>
        </div>

        {/* OHLC Data */}
        <div className="grid grid-cols-4 gap-4 pt-4 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Open</p>
            <p className="text-sm tabular-nums">
              ₹<AnimatedNumber value={quote.open} decimals={2} />
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">High</p>
            <p className="text-sm tabular-nums text-success">
              ₹<AnimatedNumber value={quote.high} decimals={2} />
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Low</p>
            <p className="text-sm tabular-nums text-danger">
              ₹<AnimatedNumber value={quote.low} decimals={2} />
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Volume</p>
            <p className="text-sm tabular-nums">
              <AnimatedNumber 
                value={quote.volume / 1000000} 
                decimals={2}
                suffix="M"
              />
            </p>
          </div>
        </div>

        {/* Prev Close */}
        <div className="pt-3 border-t border-border/50">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Previous Close</span>
            <span className="text-sm tabular-nums">
              ₹<AnimatedNumber value={quote.previousClose} decimals={2} />
            </span>
          </div>
        </div>
      </div>

      {/* Refresh Button */}
      <div className="mt-6 pt-4 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          className="w-full"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh Quote
        </Button>
      </div>
    </div>
  );
}

interface MultiQuoteGridProps {
  symbols: string[];
  columns?: number;
}

export function MultiQuoteGrid({ symbols, columns = 3 }: MultiQuoteGridProps) {
  return (
    <div 
      className="grid gap-4"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
      }}
    >
      {symbols.map((symbol) => (
        <RealTimeQuote 
          key={symbol} 
          symbol={symbol}
          showHeader={true}
        />
      ))}
    </div>
  );
}
