import React from 'react';
import { motion } from 'motion/react';
import { Button } from './ui/button';

interface InteractiveButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'primary';
  size?: 'default' | 'sm' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function InteractiveButton({
  variant = 'default',
  size = 'default',
  loading = false,
  icon,
  children,
  className,
  ...props
}: InteractiveButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
    >
      <Button
        variant={variant === 'primary' ? 'default' : variant}
        size={size}
        disabled={loading}
        className={`relative overflow-hidden group ${isPrimary ? 'bg-primary hover:bg-primary/90' : ''} ${className}`}
        {...props}
      >
        {/* Shimmer effect on hover */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          initial={{ x: '-100%' }}
          whileHover={{ x: '100%' }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
        />
        
        <span className="relative z-10 flex items-center justify-center gap-2">
          {loading ? (
            <motion.div
              className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
          ) : icon ? (
            <motion.div
              whileHover={{ rotate: [0, -10, 10, 0] }}
              transition={{ duration: 0.5 }}
            >
              {icon}
            </motion.div>
          ) : null}
          {children}
        </span>
      </Button>
    </motion.div>
  );
}

export function DataButton({
  value,
  label,
  trend,
  onClick,
}: {
  value: string | number;
  label: string;
  trend?: 'up' | 'down' | 'neutral';
  onClick?: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      className="elevated-card rounded-lg p-4 text-left w-full group"
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
    >
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="flex items-end justify-between">
          <div className="text-2xl tabular-nums">{value}</div>
          {trend && (
            <motion.div
              className={`text-xs ${
                trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground'
              }`}
              animate={{ y: trend === 'up' ? [-2, 0] : trend === 'down' ? [2, 0] : [0] }}
              transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
            >
              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '—'}
            </motion.div>
          )}
        </div>
      </div>
      
      {/* Hover gradient */}
      <motion.div
        className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 0%, rgba(6, 182, 212, 0.1), transparent 70%)',
        }}
      />
    </motion.button>
  );
}
