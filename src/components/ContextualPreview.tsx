import React, { useState } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { AnimatedNumber } from './AnimatedNumber';

interface MiniChartData {
  value: number;
}

interface ContextualPreviewProps {
  children: React.ReactNode;
  title: string;
  value: number;
  change?: number;
  changePercent?: number;
  chartData?: MiniChartData[];
  metadata?: { label: string; value: string | number }[];
  confidence?: number;
}

export function ContextualPreview({
  children,
  title,
  value,
  change,
  changePercent,
  chartData,
  metadata,
  confidence,
}: ContextualPreviewProps) {
  const [isHovered, setIsHovered] = useState(false);

  const isPositive = (change ?? 0) >= 0;

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}

      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-2 w-64 pointer-events-none"
          >
            <div className="intelligence-card p-4 space-y-3 shadow-2xl">
              {/* Header */}
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">
                  {title}
                </div>
                <div className="flex items-baseline gap-2">
                  <AnimatedNumber
                    value={value}
                    decimals={2}
                    className="text-xl"
                  />
                  {change !== undefined && (
                    <span
                      className={`text-sm tabular-nums ${
                        isPositive ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                      }`}
                    >
                      {isPositive ? '+' : ''}
                      <AnimatedNumber value={change} decimals={2} />
                      {changePercent !== undefined && (
                        <>
                          {' '}({isPositive ? '+' : ''}
                          <AnimatedNumber value={changePercent} decimals={2} />
                          %)
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>

              {/* Mini chart */}
              {chartData && chartData.length > 0 && (
                <div className="h-16 -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="var(--primary)"
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={true}
                        animationDuration={500}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Confidence */}
              {confidence !== undefined && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">AI Confidence</span>
                    <AnimatedNumber
                      value={confidence}
                      decimals={0}
                      suffix="%"
                      className="text-[var(--primary)]"
                    />
                  </div>
                  <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full"
                      style={{
                        background: 'linear-gradient(90deg, var(--primary), var(--signal))',
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${confidence}%` }}
                      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                </div>
              )}

              {/* Metadata */}
              {metadata && metadata.length > 0 && (
                <div className="pt-2 border-t border-border space-y-1">
                  {metadata.map((item, index) => (
                    <div key={index} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="tabular-nums">{item.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Pulse indicator */}
              <motion.div
                className="absolute top-2 right-2 w-2 h-2 rounded-full"
                style={{ backgroundColor: 'var(--primary)' }}
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [1, 0.5, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            </div>

            {/* Arrow */}
            <div
              className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
              style={{
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                borderBottom: 'none',
                borderRight: 'none',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface HoverGlowProps {
  children: React.ReactNode;
  color?: 'primary' | 'signal' | 'success';
  intensity?: number;
}

export function HoverGlow({
  children,
  color = 'primary',
  intensity = 1,
}: HoverGlowProps) {
  const [isHovered, setIsHovered] = useState(false);

  const colorMap = {
    primary: 'var(--primary-glow)',
    signal: 'var(--signal-glow)',
    success: 'rgba(134, 239, 172, 0.2)',
  };

  return (
    <motion.div
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
    >
      {children}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            className="absolute inset-0 rounded-lg pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: intensity }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              boxShadow: `0 0 30px ${colorMap[color]}`,
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
