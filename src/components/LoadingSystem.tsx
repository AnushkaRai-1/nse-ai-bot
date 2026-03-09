import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from "framer-motion";

interface LoadingSystemProps {
  isLoading: boolean;
  message?: string;
}

export function LoadingSystem({ isLoading, message = 'Analyzing market signals' }: LoadingSystemProps) {
  const [dots, setDots] = useState(0);

  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setDots((prev) => (prev + 1) % 4);
      }, 500);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm"
        >
          <div className="relative">
            {/* AI Signal Pulse */}
            <div className="relative w-32 h-32">
              {/* Outer rings */}
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="absolute inset-0 border border-primary/30 rounded-full"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{
                    scale: [0.8, 1.5],
                    opacity: [0.6, 0],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: i * 0.4,
                    ease: 'easeOut',
                  }}
                />
              ))}

              {/* Center node */}
              <motion.div
                className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent"
                animate={{
                  scale: [1, 1.1, 1],
                  boxShadow: [
                    '0 0 20px rgba(6, 182, 212, 0.4)',
                    '0 0 40px rgba(6, 182, 212, 0.6)',
                    '0 0 20px rgba(6, 182, 212, 0.4)',
                  ],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />

              {/* Data flow lines */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
                <motion.div
                  key={angle}
                  className="absolute top-1/2 left-1/2 w-20 h-0.5 origin-left"
                  style={{
                    transform: `rotate(${angle}deg)`,
                  }}
                >
                  <motion.div
                    className="h-full bg-gradient-to-r from-primary to-transparent"
                    initial={{ scaleX: 0 }}
                    animate={{
                      scaleX: [0, 1, 0],
                      opacity: [0, 1, 0],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: i * 0.1,
                      ease: 'easeInOut',
                    }}
                  />
                </motion.div>
              ))}
            </div>

            {/* Message */}
            <motion.div
              className="mt-8 text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <p className="text-sm text-foreground">
                {message}
                <span className="inline-block w-8 text-left">
                  {'.'.repeat(dots)}
                </span>
              </p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <motion.div
      className={`bg-muted/30 rounded ${className}`}
      animate={{
        opacity: [0.5, 0.8, 0.5],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

export function DataStreamLoader() {
  return (
    <div className="relative w-full h-1 bg-muted/20 overflow-hidden rounded-full">
      <motion.div
        className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent"
        animate={{
          x: ['-100%', '300%'],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  );
}
