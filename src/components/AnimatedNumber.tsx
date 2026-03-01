import React, { useEffect, useState, useRef } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  duration?: number;
  trend?: 'up' | 'down' | 'neutral';
}

export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
  duration = 1,
  trend,
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value ?? 0);
  const springValue = useSpring(value ?? 0, {
    stiffness: 100,
    damping: 30,
    duration: duration * 1000,
  });

  useEffect(() => {
    springValue.set(value ?? 0);
  }, [value, springValue]);

  useEffect(() => {
    const unsubscribe = springValue.on('change', (latest) => {
      setDisplayValue(latest);
    });
    return unsubscribe;
  }, [springValue]);

  const formattedValue = (displayValue ?? 0).toFixed(decimals);
  
  const trendColor = trend === 'up' 
    ? 'text-[var(--success)]' 
    : trend === 'down' 
    ? 'text-[var(--danger)]' 
    : '';

  return (
    <motion.span
      className={`tabular-nums ${trendColor} ${className}`}
      layout
    >
      {prefix}{formattedValue}{suffix}
    </motion.span>
  );
}

interface TickerNumberProps {
  value: number;
  className?: string;
}

export function TickerNumber({ value, className = '' }: TickerNumberProps) {
  const [digits, setDigits] = useState<string[]>([]);
  const prevValue = useRef(value);

  useEffect(() => {
    const valueStr = Math.abs(value).toString();
    setDigits(valueStr.split(''));
  }, [value]);

  const isIncreasing = value > prevValue.current;
  useEffect(() => {
    prevValue.current = value;
  }, [value]);

  return (
    <div className={`inline-flex tabular-nums ${className}`}>
      {value < 0 && <span>-</span>}
      {digits.map((digit, index) => (
        <motion.span
          key={index}
          className="inline-block"
          initial={{ y: isIncreasing ? 20 : -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 20,
            delay: index * 0.02,
          }}
        >
          {digit}
        </motion.span>
      ))}
    </div>
  );
}

interface LiveValueProps {
  value: number;
  change?: number;
  changePercent?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  showChange?: boolean;
}

export function LiveValue({
  value,
  change,
  changePercent,
  decimals = 2,
  prefix = '',
  suffix = '',
  showChange = true,
}: LiveValueProps) {
  const isPositive = (change ?? 0) >= 0;
  const trend = isPositive ? 'up' : 'down';

  return (
    <div className="space-y-1">
      <AnimatedNumber
        value={value}
        decimals={decimals}
        prefix={prefix}
        suffix={suffix}
        className="text-2xl"
      />
      {showChange && change !== undefined && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className={`text-sm tabular-nums flex items-center gap-1 ${
            isPositive ? 'text-[var(--success)]' : 'text-[var(--danger)]'
          }`}
        >
          <motion.span
            animate={{ y: isPositive ? [-1, 1] : [1, -1] }}
            transition={{ duration: 1, repeat: Infinity, repeatType: 'reverse' }}
          >
            {isPositive ? '↑' : '↓'}
          </motion.span>
          <AnimatedNumber
            value={Math.abs(change)}
            decimals={decimals}
            prefix={isPositive ? '+' : '-'}
            trend={trend}
          />
          {changePercent !== undefined && (
            <>
              <span>•</span>
              <AnimatedNumber
                value={Math.abs(changePercent)}
                decimals={2}
                prefix={isPositive ? '+' : '-'}
                suffix="%"
                trend={trend}
              />
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}

interface ConfidenceIndicatorProps {
  value: number;
  label?: string;
  showValue?: boolean;
}

export function ConfidenceIndicator({
  value,
  label = 'Confidence',
  showValue = true,
}: ConfidenceIndicatorProps) {
  const clampedValue = Math.min(Math.max(value, 0), 100);

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          {showValue && (
            <AnimatedNumber
              value={clampedValue}
              decimals={0}
              suffix="%"
              className="text-[var(--primary)]"
            />
          )}
        </div>
      )}
      <div className="confidence-bar">
        <motion.div
          className="confidence-fill"
          initial={{ width: 0 }}
          animate={{ width: `${clampedValue}%` }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}