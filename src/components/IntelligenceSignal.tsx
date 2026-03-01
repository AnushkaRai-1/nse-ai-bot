import React from 'react';
import { motion } from 'motion/react';
import { Brain, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface SignalProps {
  type: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  animated?: boolean;
}

export function IntelligenceSignal({
  type,
  confidence,
  size = 'md',
  showIcon = true,
  animated = true,
}: SignalProps) {
  const config = {
    BUY: {
      color: 'var(--success)',
      bg: 'rgba(134, 239, 172, 0.1)',
      border: 'rgba(134, 239, 172, 0.3)',
      icon: TrendingUp,
    },
    SELL: {
      color: 'var(--danger)',
      bg: 'rgba(252, 165, 165, 0.1)',
      border: 'rgba(252, 165, 165, 0.3)',
      icon: TrendingDown,
    },
    HOLD: {
      color: 'var(--signal)',
      bg: 'rgba(254, 240, 138, 0.1)',
      border: 'rgba(254, 240, 138, 0.3)',
      icon: Minus,
    },
  };

  const { color, bg, border, icon: Icon } = config[type];
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
    lg: 'text-base px-4 py-2',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <motion.div
      className={`inline-flex items-center gap-1.5 rounded-lg ${sizeClasses[size]}`}
      style={{
        backgroundColor: bg,
        border: `1px solid ${border}`,
        color,
      }}
      initial={animated ? { scale: 0.9, opacity: 0 } : undefined}
      animate={animated ? { scale: 1, opacity: 1 } : undefined}
      whileHover={{ scale: 1.05 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      <span className="font-medium">{type}</span>
      {confidence > 0 && (
        <motion.div
          className="ml-1 opacity-70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 0.2 }}
        >
          •{confidence}%
        </motion.div>
      )}
    </motion.div>
  );
}

interface ProbabilityFieldProps {
  probabilities: {
    bullish: number;
    neutral: number;
    bearish: number;
  };
}

export function ProbabilityField({ probabilities }: ProbabilityFieldProps) {
  const total = probabilities.bullish + probabilities.neutral + probabilities.bearish;
  const bullishPercent = (probabilities.bullish / total) * 100;
  const neutralPercent = (probabilities.neutral / total) * 100;
  const bearishPercent = (probabilities.bearish / total) * 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Probability Distribution</span>
      </div>
      
      <div className="h-2 bg-muted/30 rounded-full overflow-hidden flex">
        <motion.div
          className="h-full"
          style={{ backgroundColor: 'var(--success)' }}
          initial={{ width: 0 }}
          animate={{ width: `${bullishPercent}%` }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.div
          className="h-full"
          style={{ backgroundColor: 'var(--signal)' }}
          initial={{ width: 0 }}
          animate={{ width: `${neutralPercent}%` }}
          transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.div
          className="h-full"
          style={{ backgroundColor: 'var(--danger)' }}
          initial={{ width: 0 }}
          animate={{ width: `${bearishPercent}%` }}
          transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="text-center">
          <div style={{ color: 'var(--success)' }} className="tabular-nums font-medium">
            {bullishPercent.toFixed(0)}%
          </div>
          <div className="text-muted-foreground">Bullish</div>
        </div>
        <div className="text-center">
          <div style={{ color: 'var(--signal)' }} className="tabular-nums font-medium">
            {neutralPercent.toFixed(0)}%
          </div>
          <div className="text-muted-foreground">Neutral</div>
        </div>
        <div className="text-center">
          <div style={{ color: 'var(--danger)' }} className="tabular-nums font-medium">
            {bearishPercent.toFixed(0)}%
          </div>
          <div className="text-muted-foreground">Bearish</div>
        </div>
      </div>
    </div>
  );
}

interface AnalysisStateProps {
  state: 'idle' | 'loading' | 'analyzing' | 'complete';
  message?: string;
}

export function AnalysisState({ state, message }: AnalysisStateProps) {
  const stateConfig = {
    idle: { color: 'var(--muted-foreground)', text: 'Ready' },
    loading: { color: 'var(--primary)', text: 'Loading data...' },
    analyzing: { color: 'var(--signal)', text: 'Analyzing patterns...' },
    complete: { color: 'var(--success)', text: 'Analysis complete' },
  };

  const config = stateConfig[state];

  return (
    <motion.div
      className="flex items-center gap-2 text-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: config.color }}
        animate={{
          scale: state === 'analyzing' ? [1, 1.3, 1] : 1,
          opacity: state === 'analyzing' ? [1, 0.5, 1] : 1,
        }}
        transition={{
          duration: 1.5,
          repeat: state === 'analyzing' ? Infinity : 0,
          ease: 'easeInOut',
        }}
      />
      <span style={{ color: config.color }}>
        {message || config.text}
      </span>
    </motion.div>
  );
}

interface IntelligenceNodeProps {
  active?: boolean;
  intensity?: number;
}

export function IntelligenceNode({ active = true, intensity = 1 }: IntelligenceNodeProps) {
  return (
    <div className="relative w-12 h-12">
      {/* Outer pulse rings */}
      {active && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute inset-0 rounded-full border"
              style={{ borderColor: 'var(--primary)' }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{
                scale: [0.8, 1.8],
                opacity: [0.6 * intensity, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.4,
                ease: 'easeOut',
              }}
            />
          ))}
        </>
      )}

      {/* Center core */}
      <motion.div
        className="absolute inset-0 m-auto w-6 h-6 rounded-full flex items-center justify-center"
        style={{
          backgroundColor: 'var(--primary)',
          boxShadow: `0 0 20px var(--primary-glow)`,
        }}
        animate={
          active
            ? {
                scale: [1, 1.1, 1],
                boxShadow: [
                  '0 0 20px var(--primary-glow)',
                  '0 0 30px var(--primary-glow)',
                  '0 0 20px var(--primary-glow)',
                ],
              }
            : {}
        }
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <Brain className="w-3 h-3 text-background" />
      </motion.div>
    </div>
  );
}
