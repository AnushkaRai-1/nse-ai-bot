import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, Lock, TrendingUp, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

interface LoginPageProps {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      onLogin();
    }, 1200);
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4 bg-background atmospheric-overlay">
      {/* Soft pastel ambient lights */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, var(--primary), transparent)' }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.15, 0.25, 0.15],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, var(--signal), transparent)' }}
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.15, 0.2],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>

      {/* Minimal grid overlay */}
      <div className="absolute inset-0 opacity-[0.015]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(var(--border) 1px, transparent 1px),
              linear-gradient(90deg, var(--border) 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      {/* Login container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="intelligence-card p-8">
          {/* Logo and header */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="mb-8"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="relative">
                <motion.div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: 'rgba(125, 211, 252, 0.1)',
                    border: '1px solid rgba(125, 211, 252, 0.3)',
                  }}
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                >
                  <TrendingUp className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                </motion.div>
                {/* Soft pulse */}
                <motion.div
                  className="absolute -inset-1 rounded-xl opacity-50"
                  style={{ border: '1px solid var(--primary)' }}
                  animate={{
                    opacity: [0.3, 0.5, 0.3],
                    scale: [0.95, 1.05, 0.95],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              </div>
              <div>
                <h1 className="text-xl tracking-tight">SentinelQuant</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Market Intelligence Platform</p>
              </div>
            </div>
            <div className="space-y-1">
              <h2 className="text-lg">Welcome back</h2>
              <p className="text-sm text-muted-foreground">
                Sign in to access real-time market analytics
              </p>
            </div>
          </motion.div>

          {/* Login form */}
          <motion.form
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            {/* Email field */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm">
                Email address
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Mail
                    className={`w-4 h-4 transition-colors duration-200 ${
                      emailFocused ? 'text-[var(--primary)]' : 'text-muted-foreground'
                    }`}
                  />
                </div>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  className="pl-10 h-11 precision-input"
                  required
                />
              </div>
            </div>

            {/* Password field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm">
                  Password
                </Label>
                <motion.a
                  href="#"
                  className="text-xs hover:text-[var(--primary)] transition-colors"
                  style={{ color: 'var(--primary)' }}
                  whileHover={{ x: 2 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                >
                  Forgot password?
                </motion.a>
              </div>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Lock
                    className={`w-4 h-4 transition-colors duration-200 ${
                      passwordFocused ? 'text-[var(--primary)]' : 'text-muted-foreground'
                    }`}
                  />
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  className="pl-10 h-11 precision-input"
                  required
                />
              </div>
            </div>

            {/* Submit button */}
            <motion.div
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 relative overflow-hidden group"
                style={{
                  backgroundColor: 'var(--primary)',
                  color: 'var(--background)',
                }}
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {isLoading ? (
                    <>
                      <motion.div
                        className="w-4 h-4 border-2 rounded-full"
                        style={{
                          borderColor: 'var(--background)',
                          borderTopColor: 'transparent',
                        }}
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      />
                      Authenticating
                    </>
                  ) : (
                    <>
                      Sign in
                      <motion.div
                        animate={{ x: [0, 4, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <ArrowRight className="w-4 h-4" />
                      </motion.div>
                    </>
                  )}
                </span>
                {/* Shimmer effect */}
                <motion.div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                  }}
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '100%' }}
                  transition={{ duration: 0.6, ease: 'easeInOut' }}
                />
              </Button>
            </motion.div>

            {/* Divider */}
            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-[var(--card)] px-2 text-muted-foreground">
                  or continue with
                </span>
              </div>
            </div>

            {/* Request access button */}
            <motion.div
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 border-border hover:border-[var(--primary)] transition-all duration-200"
              >
                Request institutional access
              </Button>
            </motion.div>
          </motion.form>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="mt-8 pt-6 border-t border-border"
          >
            <p className="text-xs text-center text-muted-foreground">
              Enterprise-grade security • End-to-end encryption • SOC 2 Type II certified
            </p>
          </motion.div>
        </div>

        {/* Bottom tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="text-center text-xs text-muted-foreground mt-6"
        >
          Trusted by quantitative traders and institutional investors worldwide
        </motion.p>
      </motion.div>
    </div>
  );
}