import React, { useState, forwardRef } from 'react';
import { motion } from 'motion/react';
import { Input } from './ui/input';

interface InteractiveInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  success?: boolean;
  icon?: React.ReactNode;
}

export const InteractiveInput = forwardRef<HTMLInputElement, InteractiveInputProps>(
  ({ label, error, success, icon, className, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const [hasValue, setHasValue] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setHasValue(e.target.value.length > 0);
      props.onChange?.(e);
    };

    return (
      <div className="space-y-2">
        {label && (
          <motion.label
            className="text-sm block"
            animate={{
              color: isFocused ? 'rgb(6, 182, 212)' : 'rgb(148, 163, 184)',
            }}
            transition={{ duration: 0.2 }}
          >
            {label}
          </motion.label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <motion.div
                animate={{
                  color: isFocused ? 'rgb(6, 182, 212)' : 'rgb(148, 163, 184)',
                }}
                transition={{ duration: 0.2 }}
              >
                {icon}
              </motion.div>
            </div>
          )}
          <Input
            ref={ref}
            className={`${icon ? 'pl-10' : ''} ${className} transition-all duration-200`}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onChange={handleChange}
            {...props}
          />
          {/* Focus indicator */}
          <AnimatePresence>
            {isFocused && (
              <motion.div
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                exit={{ scaleX: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
          </AnimatePresence>
          {/* Success indicator */}
          {success && hasValue && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-success/20 flex items-center justify-center"
            >
              <svg className="w-3 h-3 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>
          )}
          {/* Error indicator */}
          {error && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-destructive/20 flex items-center justify-center"
            >
              <svg className="w-3 h-3 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </motion.div>
          )}
        </div>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-destructive"
          >
            {error}
          </motion.p>
        )}
      </div>
    );
  }
);

InteractiveInput.displayName = 'InteractiveInput';

// Import fix for AnimatePresence
import { AnimatePresence } from 'motion/react';
